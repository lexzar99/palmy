"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Loader2, ReceiptText, RefreshCw, Search, ShieldCheck, Trash2, UserRound, Wallet } from "lucide-react";
import { bulkRefundOrders, deleteOrder, getOrder, getOrders, orderDetailQueryKey, ordersQueryKey, refundOrder, REFUND_REASONS, updateOrderStatus, ORDERS_PAGE_SIZE, type AdminOrder } from "@/modules/orders/api";
import { CustomerModal } from "@/modules/customers/page";
import { Badge, Button, EmptyState, ErrorPanel, Field, Input, Modal, PageHeader, Surface, Tabs, Textarea } from "@/shared/components/ui";
import { formatCurrency, formatDateTime, formatNumber, orderStatusLabel, orderStatusTone } from "@/shared/utils/format";

const statusOptions = ["ALL", "PENDING", "ACCEPTED", "PREPARING", "READY", "DELIVERED", "CANCELLED"] as const;

// "Time in current status" — picks the most relevant timestamp on the order
// based on its current status. Falls back to updatedAt then createdAt.
function statusTimestamp(order: AdminOrder): string | null {
  switch (order.status) {
    case "PREPARING":
      return order.preparingAt ?? order.updatedAt ?? order.createdAt;
    case "READY":
    case "DELIVERING":
      return order.deliveringAt ?? order.updatedAt ?? order.createdAt;
    case "CANCELLED":
      return order.refundedAt ?? order.updatedAt ?? order.createdAt;
    case "PENDING":
      return order.createdAt;
    default:
      return order.updatedAt ?? order.createdAt;
  }
}

function formatTimeInStatus(order: AdminOrder, nowMs: number): { label: string; tone: "neutral" | "warning" | "danger" | "info" } {
  const ts = statusTimestamp(order);
  if (!ts) return { label: "—", tone: "neutral" };
  const diffMin = Math.floor((nowMs - new Date(ts).getTime()) / 60_000);
  if (diffMin < 0) return { label: "snart", tone: "neutral" };
  const isLive = ["PENDING", "ACCEPTED", "PREPARING", "READY", "DELIVERING"].includes(order.status);
  // SLA thresholds for warning/danger tone on live orders
  let tone: "neutral" | "warning" | "danger" | "info" = isLive ? "info" : "neutral";
  if (isLive) {
    if (diffMin >= 40) tone = "danger";
    else if (diffMin >= 25) tone = "warning";
  }
  if (diffMin < 1) return { label: "<1m", tone };
  if (diffMin < 60) return { label: `${diffMin}m`, tone };
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return { label: m === 0 ? `${h}h` : `${h}h ${m}m`, tone };
}

// Customer context badge — distills lifetime stats into a single chip
function customerContextBadge(stats: AdminOrder["customerStats"]): { label: string; tone: "neutral" | "success" | "warning" | "danger" | "info" } | null {
  if (!stats) return null;
  if (stats.orderCount <= 1) return { label: "Första order", tone: "info" };
  // High refund rate is a fraud / dissatisfaction signal
  if (stats.orderCount >= 3 && stats.refundRate >= 0.5) return { label: `${stats.refundCount}/${stats.orderCount} refunds`, tone: "danger" };
  if (stats.refundCount >= 5) return { label: `${stats.refundCount} refunds`, tone: "danger" };
  if (stats.refundCount >= 2) return { label: `${stats.orderCount} ordrar · ${stats.refundCount} refunds`, tone: "warning" };
  return { label: `${stats.orderCount} ordrar, 0 refunds`, tone: "success" };
}

function parseExtras(value: AdminOrder["items"][number]["selectedExtras"]) {
  if (!value) return [] as Array<{ extraName?: string; name?: string }>;
  if (Array.isArray(value)) return value;
  try {
    return JSON.parse(value) as Array<{ extraName?: string; name?: string }>;
  } catch {
    return [];
  }
}

function OrderDetailsModal({
  orderId,
  open,
  onClose,
  onViewCustomer,
}: {
  orderId: string | null;
  open: boolean;
  onClose: () => void;
  onViewCustomer?: (customerId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [estimatedTime, setEstimatedTime] = useState<number | "">("");
  const [refundAmount, setRefundAmount] = useState<number | "">("");
  const [refundReasonKey, setRefundReasonKey] = useState<string>("");
  const [refundReasonExtra, setRefundReasonExtra] = useState("");

  const orderQuery = useQuery({
    queryKey: orderDetailQueryKey(orderId),
    queryFn: () => getOrder(orderId!),
    enabled: open && Boolean(orderId),
  });

  // Compose final refund reason from canned key + free-text extra.
  const refundReason = useMemo(() => {
    const cannedLabel = REFUND_REASONS.find((r) => r.value === refundReasonKey)?.label;
    if (refundReasonKey === "other") return refundReasonExtra.trim();
    if (!cannedLabel) return refundReasonExtra.trim();
    const extra = refundReasonExtra.trim();
    return extra ? `${cannedLabel} — ${extra}` : cannedLabel;
  }, [refundReasonKey, refundReasonExtra]);

  // Fältet lämnas TOMT som default — "Återbetala hela beloppet"-knappen gör
  // en full refund med ett klick utan att admin behöver skriva en siffra.
  // Fyll bara i fältet för en DELVIS återbetalning.

  const statusMutation = useMutation({
    mutationFn: ({ status, nextEstimatedTime }: { status: string; nextEstimatedTime?: number | null }) =>
      updateOrderStatus(orderId!, status, nextEstimatedTime),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      if (orderId) {
        await queryClient.invalidateQueries({ queryKey: orderDetailQueryKey(orderId) });
      }
    },
  });

  const [refundSuccess, setRefundSuccess] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);
  // Stripe-refund returnerar status `pending` eller `succeeded` (Klarna är
  // ofta `pending` först → blir `succeeded` inom 1-3 bankdagar). Vi visar
  // status:n så admin förstår om pengarna är på väg eller redan framme.
  const [refundStatus, setRefundStatus] = useState<string | null>(null);

  // Reset all transient state när admin byter order. Annars hängde
  // refund-success-bannern kvar från föregående order och visades på
  // en helt orelaterad/orefunderad order. Samma för error + form-inputs.
  useEffect(() => {
    setRefundSuccess(false);
    setRefundError(null);
    setRefundStatus(null);
    setRefundAmount("");
    setRefundReasonKey("");
    setRefundReasonExtra("");
    setEstimatedTime("");
  }, [orderId]);

  const refundMutation = useMutation({
    // amountKr = null → full återbetalning (backend använder order.total).
    mutationFn: (amountKr: number | null) => refundOrder(orderId!, amountKr, refundReason),
    onSuccess: async (data: any) => {
      setRefundSuccess(true);
      setRefundError(null);
      setRefundStatus(data?.refundStatus || null);
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
      await queryClient.invalidateQueries({ queryKey: ["finance"] });
      if (orderId) {
        await queryClient.invalidateQueries({ queryKey: orderDetailQueryKey(orderId) });
      }
    },
    onError: (e: any) => {
      setRefundError(e?.response?.data?.error || "Återbetalning misslyckades");
      setRefundStatus(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteOrder(orderId!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    },
  });

  const order = orderQuery.data;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={order ? `Order ${order.orderNumber}` : "Order details"}
      description={order ? `${order.restaurantName || "Unknown restaurant"} • ${formatDateTime(order.createdAt)}` : undefined}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="danger"
            onClick={() => {
              if (!order) return;
              const msg = `Radera order ${order.orderNumber} permanent?\n\nDetta kan INTE ångras. Order-historik försvinner från systemet.`;
              if (window.confirm(msg)) deleteMutation.mutate();
            }}
            disabled={deleteMutation.isPending || !order}
          >
            <Trash2 size={16} /> Delete
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={onClose}>Close</Button>
          </div>
        </div>
      }
    >
      {orderQuery.isLoading || !order ? (
        <div className="surface-muted px-5 py-5 text-sm text-[var(--text-secondary)]">Laddar orderdetaljer…</div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-4">
              <div className="surface-muted px-5 py-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={orderStatusTone(order.status) as "success" | "danger" | "warning" | "info" | "neutral"}>{orderStatusLabel(order.status)}</Badge>
                  <Badge tone="neutral">{order.type}</Badge>
                  {order.refundedAt ? <Badge tone="danger">Refunded {formatCurrency(order.refundAmount || 0)}</Badge> : null}
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Customer</p>
                    <div className="mt-2 flex items-center gap-2">
                      <p className="text-lg font-black">{order.customerName}</p>
                      {order.userId && onViewCustomer ? (
                        <button
                          type="button"
                          onClick={() => onViewCustomer(order.userId!)}
                          className="flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--accent-strong)] hover:bg-[var(--bg-hover)] transition-colors"
                        >
                          <UserRound size={11} /> Profil
                        </button>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">{order.customerPhone}</p>
                    {order.customerEmail ? <p className="mt-1 text-sm text-[var(--text-secondary)]">{order.customerEmail}</p> : null}
                  </div>
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Delivery / pickup</p>
                    <p className="mt-2 text-sm leading-7 text-[var(--text-secondary)]">
                      {order.type === "DELIVERY"
                        ? `${order.deliveryStreet || "Address missing"}${order.deliveryZip || order.deliveryCity ? `, ${order.deliveryZip || ""} ${order.deliveryCity || ""}` : ""}`
                        : "Customer pickup"}
                    </p>
                    {order.deliveryInstructions ? <p className="mt-2 text-sm text-[var(--text-secondary)]">{order.deliveryInstructions}</p> : null}
                  </div>
                </div>
              </div>

              <div className="surface-muted px-5 py-5">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Items</p>
                <div className="mt-4 grid gap-3">
                  {order.items.map((item) => {
                    const extras = parseExtras(item.selectedExtras);
                    return (
                      <div key={item.id} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel-muted)] px-4 py-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-black">{item.quantity}x {item.productName}</p>
                            {item.note ? <p className="mt-2 text-sm text-[var(--text-secondary)]">{item.note}</p> : null}
                            {extras.length > 0 ? (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {extras.map((extra, index) => (
                                  <Badge key={`${item.id}-${index}`} tone="neutral">+ {extra.extraName || extra.name}</Badge>
                                ))}
                              </div>
                            ) : null}
                          </div>
                          <p className="font-black">{formatCurrency(item.subtotal)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="surface-muted px-5 py-5">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Statusåtgärder</p>
                <Field label="Estimated time minutes">
                  <Input type="number" value={estimatedTime} onChange={(event) => setEstimatedTime(event.target.value ? Number(event.target.value) : "")} placeholder={order.estimatedTime ? String(order.estimatedTime) : "Optional"} />
                </Field>
                <div className="mt-4 grid gap-2">
                  {[
                    ["ACCEPTED", "Accept"],
                    ["PREPARING", "Preparing"],
                    ["READY", "Ready"],
                    ["DELIVERING", "Delivering"],
                    ["DELIVERED", "Delivered"],
                    ["CANCELLED", "Cancel"],
                  ].map(([status, label]) => (
                    <Button
                      key={status}
                      variant={status === "CANCELLED" ? "danger" : "secondary"}
                      onClick={() => statusMutation.mutate({ status, nextEstimatedTime: estimatedTime === "" ? null : Number(estimatedTime) })}
                      disabled={statusMutation.isPending}
                    >
                      {statusMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />} {label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="surface-muted px-5 py-5">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Ekonomisk översikt</p>
                <div className="mt-4 space-y-3 text-sm text-[var(--text-secondary)]">
                  <div className="flex items-center justify-between"><span>Total</span><span className="font-black text-[var(--text-primary)]">{formatCurrency(order.total)}</span></div>
                  <div className="flex items-center justify-between"><span>Delivery fee</span><span>{formatCurrency(order.deliveryFee || 0)}</span></div>
                  <div className="flex items-center justify-between"><span>Discount</span><span>{formatCurrency(order.discountAmount || 0)}</span></div>
                  <div className="flex items-center justify-between"><span>Payment method</span><span>{order.paymentMethod || "-"}</span></div>
                </div>
              </div>

              <div className="surface-muted px-5 py-5">
                <div className="flex items-center gap-2 text-[var(--accent-strong)]">
                  <Wallet size={16} />
                  <p className="text-[11px] font-black uppercase tracking-[0.18em]">Refund</p>
                </div>
                {(order.pointsEarned || order.pointsSpent) ? (
                  <div className="mt-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-4 py-3 text-[13px]">
                    <p className="font-semibold text-[var(--text-primary)]">Dpoints på denna order</p>
                    <div className="mt-1.5 space-y-0.5 text-[var(--text-secondary)]">
                      {!!order.pointsEarned && (
                        <p>Kund tjänade <strong>{order.pointsEarned} p</strong> {order.pointsReverted ? "(återtagna)" : "→ återtas vid återbetalning"}</p>
                      )}
                      {!!order.pointsSpent && (
                        <p>Kund löste in <strong>{order.pointsSpent} p</strong> {order.pointsReverted ? "(återförda)" : "→ återförs vid återbetalning"}</p>
                      )}
                    </div>
                  </div>
                ) : null}
                {order.refundedAt ? (
                  <div className="mt-4 rounded-2xl border border-[rgba(48,199,143,0.2)] bg-[rgba(48,199,143,0.08)] px-4 py-3">
                    <div className="flex items-center gap-2 text-sm text-[#c4ffeb]">
                      <CheckCircle2 size={14} /> Återbetald {formatCurrency(order.refundAmount || 0)}
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 grid gap-4">
                    <Field label="Belopp för DELVIS återbetalning (kr)">
                      <Input
                        type="number"
                        value={refundAmount}
                        onChange={(event) => setRefundAmount(event.target.value ? Number(event.target.value) : "")}
                        placeholder={`Hela: ${order.total} kr`}
                      />
                      <p className="mt-1.5 text-[10px] text-[var(--text-muted)]">
                        Lämna tomt för full återbetalning — fyll bara i för delvis refund.
                      </p>
                    </Field>
                    <Field label="Reason">
                      <select
                        value={refundReasonKey}
                        onChange={(event) => setRefundReasonKey(event.target.value)}
                        className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-strong)]"
                      >
                        <option value="">Välj orsak…</option>
                        {REFUND_REASONS.map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                      {(refundReasonKey === "other" || refundReasonKey) && (
                        <div className="mt-2">
                          <Textarea
                            value={refundReasonExtra}
                            onChange={(event) => setRefundReasonExtra(event.target.value)}
                            placeholder={refundReasonKey === "other" ? "Beskriv anledningen" : "Tillägg (valfritt)"}
                          />
                        </div>
                      )}
                    </Field>
                    {refundSuccess && (
                      <div className="rounded-2xl border border-[rgba(48,199,143,0.2)] bg-[rgba(48,199,143,0.08)] px-4 py-3 text-sm text-[#c4ffeb] flex items-start gap-2">
                        <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
                        <div className="space-y-1">
                          <p className="font-bold">
                            Återbetalning skickad till Stripe
                            {refundStatus && (
                              <span className="ml-2 text-xs uppercase tracking-wider opacity-70">
                                · {refundStatus}
                              </span>
                            )}
                          </p>
                          <p className="text-xs opacity-80">
                            {refundStatus === "succeeded"
                              ? "Pengarna är redan tillbaka hos betalleverantören. Klarna/kort kan ändå ta 1-3 bankdagar att visa det för kunden."
                              : "Stripe behandlar återbetalningen. Pengarna syns i kundens bank/Klarna inom 1-3 bankdagar. Verifiera i Stripe Dashboard om du vill bekräfta direkt."}
                          </p>
                        </div>
                      </div>
                    )}
                    {refundError && (
                      <div className="rounded-2xl border border-[rgba(239,68,68,0.2)] bg-[rgba(239,68,68,0.08)] px-4 py-3 text-sm text-rose-400 flex items-center gap-2">
                        <AlertCircle size={14} /> {refundError}
                      </div>
                    )}
                    <div className="grid gap-2.5">
                      {/* Full återbetalning — ett klick, inget belopp behöver anges. */}
                      <Button
                        variant="primary"
                        onClick={() => {
                          const msg = `Återbetala HELA beloppet ${order.total} kr för order ${order.orderNumber}?\n\nPengarna går tillbaka till kundens Stripe-betalning. Detta kan inte ångras direkt — manuell justering krävs annars.`;
                          if (!window.confirm(msg)) return;
                          setRefundSuccess(false);
                          setRefundError(null);
                          refundMutation.mutate(null);
                        }}
                        disabled={refundMutation.isPending}
                      >
                        {refundMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <ReceiptText size={16} />}
                        {refundMutation.isPending ? "Återbetalar…" : `Återbetala hela beloppet (${order.total} kr)`}
                      </Button>
                      {/* Delvis återbetalning — bara när ett belopp angetts ovan. */}
                      {refundAmount !== "" && Number(refundAmount) > 0 && Number(refundAmount) < order.total && (
                        <Button
                          variant="secondary"
                          onClick={() => {
                            const amount = Number(refundAmount);
                            const msg = `Återbetala ${amount} kr (delvis) för order ${order.orderNumber}?\n\nPengarna går tillbaka till kundens Stripe-betalning. Detta kan inte ångras direkt — manuell justering krävs annars.`;
                            if (!window.confirm(msg)) return;
                            setRefundSuccess(false);
                            setRefundError(null);
                            refundMutation.mutate(amount);
                          }}
                          disabled={refundMutation.isPending}
                        >
                          {refundMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <ReceiptText size={16} />}
                          {refundMutation.isPending ? "Återbetalar…" : `Återbetala ${Number(refundAmount)} kr (delvis)`}
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {order.note ? (
                <div className="surface-muted px-5 py-5">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Kundnotering</p>
                  <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">{order.note}</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function OrdersPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<(typeof statusOptions)[number]>("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [activeCustomerId, setActiveCustomerId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkResult, setBulkResult] = useState<string | null>(null);

  // Tick `nowMs` every 30s so the "time in status" badge updates without
  // refetching. Cheap — just a state bump.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Återställ till första sidan när status-filter byts
  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
  }, [status]);

  const orders = useQuery({
    queryKey: ordersQueryKey(status, page, ORDERS_PAGE_SIZE),
    queryFn: () => getOrders(status, page, ORDERS_PAGE_SIZE),
    refetchInterval: 10_000,
  });

  const bulkRefundMutation = useMutation({
    mutationFn: (orderIds: string[]) => bulkRefundOrders(orderIds, "Massåterbetalning från admin"),
    onSuccess: async (data) => {
      setBulkResult(
        `Refunderade ${data.refunded} av ${data.total} ordrar` +
        (data.skipped ? ` · ${data.skipped} redan refunderade` : "") +
        (data.failed ? ` · ${data.failed} misslyckades` : "") +
        ` · totalt ${data.totalRefundedKr.toFixed(2)} kr`
      );
      setSelectedIds(new Set());
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
      await queryClient.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: (e: any) => {
      setBulkResult(e?.response?.data?.error || "Massåterbetalning misslyckades");
    },
  });

  const totalPages = orders.data ? Math.max(1, Math.ceil(orders.data.total / ORDERS_PAGE_SIZE)) : 1;

  const filteredOrders = useMemo(() => {
    const list = orders.data?.orders || [];
    const query = search.trim().toLowerCase();
    if (!query) return list;

    return list.filter((order) =>
      [order.orderNumber, order.customerName, order.customerPhone, order.restaurantName || ""]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [orders.data?.orders, search]);

  if (orders.isLoading) {
    return <Surface className="px-6 py-12 text-sm text-[var(--text-secondary)]">Laddar live-orderflöde…</Surface>;
  }

  if (orders.isError || !orders.data) {
    return <ErrorPanel title="Kunde inte ladda ordrar" description="Order-flödet returnerade ingen giltig data." action={<Button onClick={() => void orders.refetch()}><RefreshCw size={14} /> Försök igen</Button>} />;
  }

  const liveCount = orders.data.orders.filter((order) => ["PENDING", "ACCEPTED", "PREPARING", "READY", "DELIVERING"].includes(order.status)).length;

  return (
    <div className="page-stack">
      <PageHeader
        title="Ordrar"
        actions={
          <>
            <Badge tone="success">{formatNumber(liveCount)} live</Badge>
            <Button variant="secondary" onClick={() => void orders.refetch()}>
              <RefreshCw size={14} /> Uppdatera
            </Button>
          </>
        }
      />

      <Surface className="px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-xl">
            <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input className="pl-11" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Sök på order, kund, telefon eller restaurang" />
          </div>
          <Tabs value={status} onChange={(value) => setStatus(value)} options={statusOptions.map((item) => ({ value: item, label: item === "ALL" ? "Alla" : orderStatusLabel(item) }))} />
        </div>

        {/* Bulk action bar — only refundable orders are eligible; the API
            silently skips already-refunded ones, so we keep this UX permissive. */}
        {selectedIds.size > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--accent-strong)]/40 bg-[var(--accent-strong)]/10 px-4 py-3">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 size={14} className="text-[var(--accent-strong)]" />
              <span className="font-bold">{selectedIds.size} valda</span>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                Rensa val
              </button>
            </div>
            <Button
              variant="secondary"
              disabled={bulkRefundMutation.isPending}
              onClick={() => {
                const ids = Array.from(selectedIds);
                const msg = `Massåterbetala ${ids.length} ordrar?\n\nVarje order refunderas till sin totalsumma via Stripe. Redan refunderade ordrar hoppas över.`;
                if (!window.confirm(msg)) return;
                setBulkResult(null);
                bulkRefundMutation.mutate(ids);
              }}
            >
              {bulkRefundMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <ReceiptText size={16} />}
              {bulkRefundMutation.isPending ? "Refunderar…" : `Refundera ${selectedIds.size} valda`}
            </Button>
          </div>
        )}
        {bulkResult && (
          <div className="mt-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-4 py-2.5 text-xs flex items-start justify-between gap-3">
            <span>{bulkResult}</span>
            <button onClick={() => setBulkResult(null)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">×</button>
          </div>
        )}

        {filteredOrders.length === 0 ? (
          <div className="mt-6"><EmptyState title="Inga ordrar i den här vyn" /></div>
        ) : (
          <>
          <div className="mt-6 grid gap-3">
            {filteredOrders.map((order) => {
              const isSelected = selectedIds.has(order.id);
              const tis = formatTimeInStatus(order, nowMs);
              const ctxBadge = customerContextBadge(order.customerStats);
              const isRefundable = !order.refundedAt && Boolean(order.stripePaymentIntentId) && order.stripePaymentIntentId !== "TEST_PAYMENT" && order.stripePaymentIntentId !== "FREE_PROMO";
              const isLive = ["PENDING", "ACCEPTED", "PREPARING", "READY", "DELIVERING"].includes(order.status);
              return (
                <div
                  key={order.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setActiveOrderId(order.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setActiveOrderId(order.id); } }}
                  className="surface-muted flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--bg-hover)]"
                >
                  {/* Checkbox — bara för återbetalningsbara ordrar */}
                  {isRefundable ? (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        e.stopPropagation();
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(order.id); else next.delete(order.id);
                          return next;
                        });
                      }}
                      className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--accent-strong)]"
                      aria-label={`Välj order ${order.orderNumber}`}
                    />
                  ) : (
                    <span className="inline-block h-4 w-4 shrink-0" aria-hidden />
                  )}

                  <div className="min-w-0 flex-1">
                    {/* Rad 1: ordernr · status · (tid om live) · risk-flagga · restaurang */}
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-bold tracking-[-0.01em] text-[var(--text-primary)]">{order.orderNumber}</span>
                      <Badge tone={orderStatusTone(order.status) as "success" | "danger" | "warning" | "info" | "neutral"}>{orderStatusLabel(order.status)}</Badge>
                      {isLive && <Badge tone={tis.tone}>{tis.label}</Badge>}
                      {ctxBadge && (ctxBadge.tone === "danger" || ctxBadge.tone === "warning") ? <Badge tone={ctxBadge.tone}>{ctxBadge.label}</Badge> : null}
                      {order.restaurantName ? <span className="truncate text-[13px] text-[var(--text-muted)]">{order.restaurantName}</span> : null}
                    </div>
                    {/* Rad 2: kund · telefon · artiklar · typ */}
                    <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] text-[var(--text-secondary)]">
                      {order.userId ? (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setActiveCustomerId(order.userId!); }}
                          className="font-medium transition-colors hover:text-[var(--accent-strong)]"
                        >
                          {order.customerName}
                        </button>
                      ) : (
                        <span className="font-medium">{order.customerName}</span>
                      )}
                      <span className="text-[var(--text-muted)]">·</span>
                      <span className="text-[var(--text-muted)]">{order.customerPhone}</span>
                      <span className="text-[var(--text-muted)]">·</span>
                      <span className="text-[var(--text-muted)]">{order.items.length} art.</span>
                      <span className="text-[var(--text-muted)]">·</span>
                      <span className="text-[var(--text-muted)]">{order.type === "DELIVERY" ? "Leverans" : "Avhämtning"}</span>
                    </div>
                  </div>

                  {/* Höger: total + tidpunkt */}
                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                    <span className="text-[15px] font-bold text-[var(--text-primary)]">{formatCurrency(order.total)}</span>
                    <span className="text-[12px] text-[var(--text-muted)]">{formatDateTime(order.createdAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination — bara om mer än en sida */}
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-[var(--text-secondary)]">
                Sida <strong>{page}</strong> av <strong>{totalPages}</strong> ({orders.data.total} ordrar totalt)
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || orders.isFetching}
                >
                  Föregående
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || orders.isFetching}
                >
                  Nästa
                </Button>
              </div>
            </div>
          )}
          </>
        )}
      </Surface>

      <OrderDetailsModal
        orderId={activeOrderId}
        open={Boolean(activeOrderId)}
        onClose={() => setActiveOrderId(null)}
        onViewCustomer={(customerId) => { setActiveOrderId(null); setActiveCustomerId(customerId); }}
      />

      <CustomerModal
        customerId={activeCustomerId}
        open={Boolean(activeCustomerId)}
        onClose={() => setActiveCustomerId(null)}
      />
    </div>
  );
}
