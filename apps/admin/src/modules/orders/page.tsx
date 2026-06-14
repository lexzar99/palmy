"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowRight, CheckCircle2, ChevronDown, Loader2, Plus, ReceiptText, RefreshCw, Search, SlidersHorizontal, Trash2, UserRound } from "lucide-react";
import { bulkRefundOrders, deleteOrder, getOrder, getOrders, orderDetailQueryKey, ordersQueryKey, refundOrder, REFUND_REASONS, updateOrderStatus, ORDERS_PAGE_SIZE, type AdminOrder } from "@/modules/orders/api";
import { CustomerModal } from "@/modules/customers/page";
import { Badge, Button, EmptyState, ErrorPanel, Field, Input, Modal, PageHeader, Surface, Tabs, Textarea } from "@/shared/components/ui";
import { formatCurrency, formatDateTime, formatNumber, orderStatusLabel, orderStatusTone, orderTypeLabel } from "@/shared/utils/format";

// Order-resans steg i ordning. Leverans har ett extra "Levereras"-steg;
// avhämtning hoppar direkt från Redo till klar.
const DELIVERY_STEPS = ["PENDING", "ACCEPTED", "PREPARING", "READY", "DELIVERING", "DELIVERED"] as const;
const PICKUP_STEPS = ["PENDING", "ACCEPTED", "PREPARING", "READY", "DELIVERED"] as const;
const CANCEL_STATUSES = ["CANCELLED", "REJECTED", "DELIVERY_FAILED"];

function stepLabel(status: string, isDelivery: boolean): string {
  switch (status) {
    case "PENDING": return "Mottagen";
    case "ACCEPTED": return "Accepterad";
    case "PREPARING": return "Tillagas";
    case "READY": return "Redo";
    case "DELIVERING": return "Levereras";
    case "DELIVERED": return isDelivery ? "Levererad" : "Upphämtad";
    default: return status;
  }
}

// Nästa logiska steg + en handlingsvänlig etikett — driver den enda
// primära knappen så admin slipper gissa bland sex likadana knappar.
function nextAction(status: string, isDelivery: boolean): { status: string; label: string } | null {
  switch (status) {
    case "PENDING": return { status: "ACCEPTED", label: "Acceptera order" };
    case "ACCEPTED": return { status: "PREPARING", label: "Markera som tillagas" };
    case "PREPARING": return { status: "READY", label: "Markera som redo" };
    case "READY": return isDelivery ? { status: "DELIVERING", label: "Skicka iväg" } : { status: "DELIVERED", label: "Markera upphämtad" };
    case "DELIVERING": return { status: "DELIVERED", label: "Markera levererad" };
    default: return null;
  }
}

const ALL_STATUS_ACTIONS: Array<[string, string]> = [
  ["ACCEPTED", "Accepterad"],
  ["PREPARING", "Tillagas"],
  ["READY", "Redo"],
  ["DELIVERING", "Levereras"],
  ["DELIVERED", "Levererad"],
  ["CANCELLED", "Avbruten"],
];

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

function StatusTrack({ status, isDelivery }: { status: string; isDelivery: boolean }) {
  const cancelled = CANCEL_STATUSES.includes(status);
  const steps: readonly string[] = isDelivery ? DELIVERY_STEPS : PICKUP_STEPS;
  const currentIdx = steps.indexOf(status);
  // När en order är avbruten/nekad färgas hela spåret rött med en enda etikett.
  if (cancelled) {
    return (
      <div className="order-track">
        <div className="order-step is-cancelled">
          <span className="order-step-bar" />
          <span className="order-step-label">{orderStatusLabel(status)}</span>
        </div>
      </div>
    );
  }
  return (
    <div className="order-track">
      {steps.map((s, i) => {
        const state = currentIdx >= 0 && i < currentIdx ? "is-done" : i === currentIdx ? "is-now" : "";
        return (
          <div key={s} className={`order-step ${state}`}>
            <span className="order-step-bar" />
            <span className="order-step-label">{stepLabel(s, isDelivery)}</span>
          </div>
        );
      })}
    </div>
  );
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
  // Återbetalning + manuell statusändring är sällan-åtgärder → ihopfällda by default.
  const [showRefund, setShowRefund] = useState(false);
  const [showStatusOverride, setShowStatusOverride] = useState(false);

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
  const [refundStatus, setRefundStatus] = useState<string | null>(null);

  // Reset all transient state när admin byter order.
  useEffect(() => {
    setRefundSuccess(false);
    setRefundError(null);
    setRefundStatus(null);
    setRefundAmount("");
    setRefundReasonKey("");
    setRefundReasonExtra("");
    setEstimatedTime("");
    setShowRefund(false);
    setShowStatusOverride(false);
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
  const isDelivery = order?.type === "DELIVERY";
  const next = order ? nextAction(order.status, isDelivery) : null;
  const isCancelled = order ? CANCEL_STATUSES.includes(order.status) : false;
  const isDone = order?.status === "DELIVERED";
  const isLive = order ? ["PENDING", "ACCEPTED", "PREPARING", "READY", "DELIVERING"].includes(order.status) : false;

  const applyStatus = (status: string) =>
    statusMutation.mutate({ status, nextEstimatedTime: estimatedTime === "" ? null : Number(estimatedTime) });

  return (
    <Modal
      open={open}
      onClose={onClose}
      widthClassName="max-w-[920px]"
      title={order ? `Order ${order.orderNumber}` : "Orderdetaljer"}
      description={order ? `${order.restaurantName || "Okänd restaurang"} · ${formatDateTime(order.createdAt)} · ${orderTypeLabel(order.type)}` : undefined}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="danger"
            onClick={() => {
              if (!order) return;
              if (window.confirm(`Radera order ${order.orderNumber} permanent? Detta kan inte ångras.`)) deleteMutation.mutate();
            }}
            disabled={deleteMutation.isPending || !order}
          >
            <Trash2 size={16} /> Radera
          </Button>
          <Button onClick={onClose}>Stäng</Button>
        </div>
      }
    >
      {orderQuery.isLoading || !order ? (
        <div className="surface-muted px-5 py-8 text-center text-sm text-[var(--text-secondary)]">Laddar order…</div>
      ) : (
        <div className="space-y-5">
          <StatusTrack status={order.status} isDelivery={isDelivery} />

          <div className="grid gap-4 lg:grid-cols-[1.35fr_0.9fr]">
            {/* ── Vänster: kund, artiklar, bud ── */}
            <div className="space-y-4">
              <div className="surface-muted px-5 py-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <p className="card-label">Kund</p>
                    <div className="mt-2 flex items-center gap-2">
                      <p className="text-[15px] font-semibold">{order.customerName}</p>
                      {order.userId && onViewCustomer ? (
                        <button
                          type="button"
                          onClick={() => onViewCustomer(order.userId!)}
                          className="inline-flex items-center gap-1 rounded-md border border-[var(--border-subtle)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
                        >
                          <UserRound size={11} /> Profil
                        </button>
                      ) : null}
                    </div>
                    <p className="mt-1 text-[13px] text-[var(--text-secondary)]">{order.customerPhone}</p>
                    {order.customerEmail ? <p className="text-[13px] text-[var(--text-secondary)]">{order.customerEmail}</p> : null}
                  </div>
                  <div>
                    <p className="card-label">{isDelivery ? "Leverans" : "Avhämtning"}</p>
                    <p className="mt-2 text-[13px] leading-6 text-[var(--text-secondary)]">
                      {isDelivery
                        ? `${order.deliveryStreet || "Adress saknas"}${order.deliveryZip || order.deliveryCity ? `, ${order.deliveryZip || ""} ${order.deliveryCity || ""}` : ""}`
                        : "Avhämtning i restaurang"}
                    </p>
                    {order.deliveryInstructions ? <p className="mt-1.5 text-[13px] text-[var(--text-muted)]">{order.deliveryInstructions}</p> : null}
                  </div>
                </div>
              </div>

              <div className="surface-muted px-5 py-5">
                <p className="card-label mb-1">Artiklar</p>
                <div className="divide-y divide-[var(--border-subtle)]">
                  {order.items.map((item) => {
                    const extras = parseExtras(item.selectedExtras);
                    return (
                      <div key={item.id} className="flex items-start justify-between gap-4 py-3">
                        <div className="min-w-0">
                          <p className="text-[14px] font-semibold">{item.quantity}× {item.productName}</p>
                          {item.note ? <p className="mt-0.5 text-[13px] text-[var(--text-secondary)]">{item.note}</p> : null}
                          {extras.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {extras.map((extra, index) => (
                                <span key={`${item.id}-${index}`} className="rounded-md bg-[var(--bg-hover)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]">
                                  + {extra.extraName || extra.name}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <p className="shrink-0 text-[14px] font-semibold tabular-nums">{formatCurrency(item.subtotal)}</p>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-1 flex items-center justify-between border-t border-[var(--border-strong)] pt-3 text-[15px] font-bold">
                  <span>Summa artiklar</span>
                  <span className="tabular-nums">{formatCurrency(order.total - (order.deliveryFee || 0) + (order.discountAmount || 0))}</span>
                </div>
              </div>

              {order.courier && (
                <div className="surface-muted px-5 py-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="card-label">Bud</p>
                      <p className="mt-2 text-[14px] font-semibold">{order.courier.name || "Ej tilldelad"}</p>
                      <p className="mt-0.5 text-[13px] text-[var(--text-secondary)]">
                        {[order.courier.vehicle === "CAR" ? "Bil" : order.courier.vehicle === "BIKE" ? "Cykel" : null, order.courier.phone].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                    <Badge tone={order.courier.deliveryStatus === "DELIVERED" ? "success" : order.courier.deliveryStatus === "PICKED_UP" ? "info" : order.courier.deliveryStatus === "FAILED" ? "danger" : "warning"}>
                      {order.courier.deliveryStatus === "DELIVERED" ? "Levererad" : order.courier.deliveryStatus === "PICKED_UP" ? "Hämtad" : order.courier.deliveryStatus === "EN_ROUTE_PICKUP" ? "På väg" : order.courier.deliveryStatus === "FAILED" ? "Misslyckad" : order.courier.deliveryStatus}
                    </Badge>
                  </div>
                  {(order.courier.pickupMin != null || order.courier.deliverMin != null || order.courier.totalMin != null) && (
                    <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-[var(--bg-hover)] px-2 py-2">
                        <p className="text-[14px] font-semibold tabular-nums">{order.courier.pickupMin != null ? `${order.courier.pickupMin}m` : "–"}</p>
                        <p className="mt-0.5 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">Till hämtning</p>
                      </div>
                      <div className="rounded-lg bg-[var(--bg-hover)] px-2 py-2">
                        <p className="text-[14px] font-semibold tabular-nums">{order.courier.deliverMin != null ? `${order.courier.deliverMin}m` : "–"}</p>
                        <p className="mt-0.5 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">Hämtad→lev.</p>
                      </div>
                      <div className="rounded-lg bg-[var(--bg-hover)] px-2 py-2">
                        <p className="text-[14px] font-semibold tabular-nums">{order.courier.totalMin != null ? `${order.courier.totalMin}m` : "–"}</p>
                        <p className="mt-0.5 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">Totalt</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Höger: hantera, betalning, återbetalning, notering ── */}
            <div className="space-y-4">
              <div className="surface px-5 py-5">
                <p className="card-label">Hantera order</p>
                {isCancelled ? (
                  <p className="mt-2 text-[13px] text-[var(--text-secondary)]">Ordern är {orderStatusLabel(order.status).toLowerCase()}.</p>
                ) : isDone ? (
                  <p className="mt-2 flex items-center gap-1.5 text-[13px] text-[var(--success)]"><CheckCircle2 size={14} /> Ordern är slutförd.</p>
                ) : (
                  <>
                    <p className="mt-1.5 text-[13px] text-[var(--text-secondary)]">Just nu: {orderStatusLabel(order.status)}</p>
                    {next && (
                      <Button variant="primary" className="mt-3 w-full" onClick={() => applyStatus(next.status)} disabled={statusMutation.isPending}>
                        {statusMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
                        {next.label} <ArrowRight size={16} />
                      </Button>
                    )}
                  </>
                )}

                <button
                  type="button"
                  onClick={() => setShowStatusOverride((v) => !v)}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-[10px] border border-[var(--border-subtle)] py-2.5 text-[13px] font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
                >
                  <SlidersHorizontal size={14} /> Ändra status
                  <ChevronDown size={13} className={showStatusOverride ? "rotate-180 transition-transform" : "transition-transform"} />
                </button>

                {showStatusOverride && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {ALL_STATUS_ACTIONS.map(([status, label]) => (
                      <Button
                        key={status}
                        variant={status === "CANCELLED" ? "danger" : "secondary"}
                        className="text-[13px]"
                        onClick={() => applyStatus(status)}
                        disabled={statusMutation.isPending || status === order.status}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                )}

                {isLive && (
                  <div className="mt-3 flex items-center gap-2">
                    <Input
                      type="number"
                      value={estimatedTime}
                      onChange={(event) => setEstimatedTime(event.target.value ? Number(event.target.value) : "")}
                      placeholder={order.estimatedTime ? `${order.estimatedTime} min` : "Beräknad tid (min)"}
                    />
                    <Button onClick={() => applyStatus(order.status)} disabled={statusMutation.isPending || estimatedTime === ""}>Tid</Button>
                  </div>
                )}
              </div>

              <div className="surface-muted px-5 py-5">
                <p className="card-label mb-2">Betalning</p>
                <div className="space-y-2 text-[13px] text-[var(--text-secondary)]">
                  <div className="flex items-center justify-between"><span>Leveransavgift</span><span className="tabular-nums">{formatCurrency(order.deliveryFee || 0)}</span></div>
                  <div className="flex items-center justify-between"><span>Rabatt</span><span className="tabular-nums">{order.discountAmount ? `−${formatCurrency(order.discountAmount)}` : formatCurrency(0)}</span></div>
                  <div className="flex items-center justify-between border-t border-[var(--border-strong)] pt-2.5 text-[15px] font-bold text-[var(--text-primary)]">
                    <span>Totalt · {order.paymentMethod || "—"}</span>
                    <span className="tabular-nums">{formatCurrency(order.total)}</span>
                  </div>
                </div>
                {(order.pointsEarned || order.pointsSpent) ? (
                  <div className="mt-3 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-panel-muted)] px-3 py-2.5 text-[12.5px] text-[var(--text-secondary)]">
                    {!!order.pointsEarned && (
                      <p>Tjänade <strong className="text-[var(--text-primary)]">{order.pointsEarned} p</strong>{order.pointsReverted ? " (återtagna)" : ""}</p>
                    )}
                    {!!order.pointsSpent && (
                      <p>Löste in <strong className="text-[var(--text-primary)]">{order.pointsSpent} p</strong>{order.pointsReverted ? " (återförda)" : ""}</p>
                    )}
                  </div>
                ) : null}
              </div>

              {/* ── Återbetalning ── */}
              {order.refundedAt ? (
                <div className="surface-muted flex items-center gap-2 px-5 py-4 text-[13px] text-[var(--success)]">
                  <CheckCircle2 size={15} /> Återbetald {formatCurrency(order.refundAmount || 0)}
                </div>
              ) : showRefund ? (
                <div className="surface-muted px-5 py-5">
                  <p className="card-label mb-3">Återbetalning</p>
                  <div className="grid gap-4">
                    <Field label="Belopp (kr) — tomt = hela">
                      <Input
                        type="number"
                        value={refundAmount}
                        onChange={(event) => setRefundAmount(event.target.value ? Number(event.target.value) : "")}
                        placeholder={`Hela: ${order.total} kr`}
                      />
                    </Field>
                    <Field label="Anledning">
                      <select
                        value={refundReasonKey}
                        onChange={(event) => setRefundReasonKey(event.target.value)}
                        className="select"
                      >
                        <option value="">Välj anledning…</option>
                        {REFUND_REASONS.map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                      {refundReasonKey && (
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
                      <div className="flex items-center gap-2 rounded-[10px] border border-[rgba(74,222,128,0.18)] bg-[rgba(74,222,128,0.08)] px-3 py-2.5 text-[13px] text-[var(--success)]">
                        <CheckCircle2 size={14} /> Återbetalning skickad{refundStatus ? ` · ${refundStatus}` : ""}
                      </div>
                    )}
                    {refundError && (
                      <div className="flex items-center gap-2 rounded-[10px] border border-[rgba(251,113,133,0.2)] bg-[rgba(251,113,133,0.08)] px-3 py-2.5 text-[13px] text-[var(--danger)]">
                        <AlertCircle size={14} /> {refundError}
                      </div>
                    )}
                    <div className="grid gap-2">
                      <Button
                        variant="primary"
                        onClick={() => {
                          if (!window.confirm(`Återbetala hela beloppet ${order.total} kr för order ${order.orderNumber}?`)) return;
                          setRefundSuccess(false);
                          setRefundError(null);
                          refundMutation.mutate(null);
                        }}
                        disabled={refundMutation.isPending}
                      >
                        {refundMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <ReceiptText size={16} />}
                        {refundMutation.isPending ? "Återbetalar…" : `Återbetala hela (${order.total} kr)`}
                      </Button>
                      {refundAmount !== "" && Number(refundAmount) > 0 && Number(refundAmount) < order.total && (
                        <Button
                          variant="secondary"
                          onClick={() => {
                            const amount = Number(refundAmount);
                            if (!window.confirm(`Återbetala ${amount} kr (delvis) för order ${order.orderNumber}?`)) return;
                            setRefundSuccess(false);
                            setRefundError(null);
                            refundMutation.mutate(amount);
                          }}
                          disabled={refundMutation.isPending}
                        >
                          {refundMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
                          Återbetala {Number(refundAmount)} kr
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowRefund(true)}
                  className="flex w-full items-center justify-between rounded-[14px] border border-[var(--border-subtle)] px-5 py-4 text-[13px] font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
                >
                  <span>Återbetala order</span>
                  <Plus size={15} />
                </button>
              )}

              {order.note ? (
                <div className="surface-muted px-5 py-5">
                  <p className="card-label">Kundnotering</p>
                  <p className="mt-2 text-[13px] leading-6 text-[var(--text-secondary)]">{order.note}</p>
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
    // Realtid sköts av RealtimeSync (socket: order:new/order:updated → invalidate).
    // Pollen är bara en fallback om en socket-händelse missas → 20s räcker och
    // halverar den redundanta DB-lasten jämfört med 10s.
    refetchInterval: 20_000,
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
    return <Surface className="px-6 py-12 text-sm text-[var(--text-secondary)]">Laddar ordrar…</Surface>;
  }

  if (orders.isError || !orders.data) {
    return <ErrorPanel title="Kunde inte ladda ordrar" action={<Button onClick={() => void orders.refetch()}><RefreshCw size={14} /> Försök igen</Button>} />;
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
            <Input className="pl-11" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Sök order, kund, telefon, restaurang" />
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
                if (!window.confirm(`Massåterbetala ${ids.length} ordrar? Redan refunderade hoppas över.`)) return;
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
                    {/* Rad 2: kund + antal artiklar (resten i modalen) */}
                    <div className="mt-1 flex items-center gap-1.5 text-[13px] text-[var(--text-secondary)]">
                      {order.userId ? (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setActiveCustomerId(order.userId!); }}
                          className="truncate font-medium transition-colors hover:text-[var(--accent-strong)]"
                        >
                          {order.customerName}
                        </button>
                      ) : (
                        <span className="truncate font-medium">{order.customerName}</span>
                      )}
                      <span className="shrink-0 text-[var(--text-muted)]">· {order.items.length} art.</span>
                    </div>
                  </div>

                  {/* Höger: total + tidpunkt */}
                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                    <span className="text-[15px] font-bold text-[var(--text-primary)] tabular-nums">{formatCurrency(order.total)}</span>
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
