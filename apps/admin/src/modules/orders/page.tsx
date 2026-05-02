"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Clock3, Loader2, ReceiptText, RefreshCw, Search, ShieldCheck, Trash2, UserRound, Wallet } from "lucide-react";
import { deleteOrder, getOrder, getOrders, orderDetailQueryKey, ordersQueryKey, refundOrder, updateOrderStatus, type AdminOrder } from "@/modules/orders/api";
import { CustomerModal } from "@/modules/customers/page";
import { Badge, Button, EmptyState, ErrorPanel, Field, Input, Modal, SectionHeader, Surface, Tabs, Textarea } from "@/shared/components/ui";
import { formatCurrency, formatDateTime, formatNumber, orderStatusLabel, orderStatusTone } from "@/shared/utils/format";

const statusOptions = ["ALL", "PENDING", "ACCEPTED", "PREPARING", "READY", "DELIVERED", "CANCELLED"] as const;

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
  const [refundReason, setRefundReason] = useState("");

  const orderQuery = useQuery({
    queryKey: orderDetailQueryKey(orderId),
    queryFn: () => getOrder(orderId!),
    enabled: open && Boolean(orderId),
  });

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

  const refundMutation = useMutation({
    mutationFn: () => refundOrder(orderId!, refundAmount === "" ? null : Number(refundAmount), refundReason),
    onSuccess: async (data) => {
      setRefundSuccess(true);
      setRefundError(null);
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
      await queryClient.invalidateQueries({ queryKey: ["finance"] });
      if (orderId) {
        await queryClient.invalidateQueries({ queryKey: orderDetailQueryKey(orderId) });
      }
    },
    onError: (e: any) => {
      setRefundError(e?.response?.data?.error || "Återbetalning misslyckades");
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
          <Button variant="danger" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending || !order}>
            <Trash2 size={16} /> Delete
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={onClose}>Close</Button>
          </div>
        </div>
      }
    >
      {orderQuery.isLoading || !order ? (
        <div className="surface-muted px-5 py-5 text-sm text-[var(--text-secondary)]">Loading order details...</div>
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
                          className="flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--accent-strong)] hover:bg-[rgba(255,255,255,0.05)] transition-colors"
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
                      <div key={item.id} className="rounded-2xl border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-4 py-4">
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
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Status actions</p>
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
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Financial summary</p>
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
                {order.refundedAt ? (
                  <div className="mt-4 rounded-2xl border border-[rgba(48,199,143,0.2)] bg-[rgba(48,199,143,0.08)] px-4 py-3">
                    <div className="flex items-center gap-2 text-sm text-[#c4ffeb]">
                      <CheckCircle2 size={14} /> Återbetald {formatCurrency(order.refundAmount || 0)}
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 grid gap-4">
                    <Field label="Refund amount (kr)">
                      <Input type="number" value={refundAmount} onChange={(event) => setRefundAmount(event.target.value ? Number(event.target.value) : "")} placeholder={String(order.total)} />
                    </Field>
                    <Field label="Reason">
                      <Textarea value={refundReason} onChange={(event) => setRefundReason(event.target.value)} placeholder="Reason for refund" />
                    </Field>
                    {refundSuccess && (
                      <div className="rounded-2xl border border-[rgba(48,199,143,0.2)] bg-[rgba(48,199,143,0.08)] px-4 py-3 text-sm text-[#c4ffeb] flex items-center gap-2">
                        <CheckCircle2 size={14} /> Återbetalning genomförd
                      </div>
                    )}
                    {refundError && (
                      <div className="rounded-2xl border border-[rgba(239,68,68,0.2)] bg-[rgba(239,68,68,0.08)] px-4 py-3 text-sm text-rose-400 flex items-center gap-2">
                        <AlertCircle size={14} /> {refundError}
                      </div>
                    )}
                    <Button
                      variant="secondary"
                      onClick={() => { setRefundSuccess(false); setRefundError(null); refundMutation.mutate(); }}
                      disabled={refundMutation.isPending}
                    >
                      {refundMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <ReceiptText size={16} />}
                      {refundMutation.isPending ? "Återbetalar…" : "Genomför återbetalning"}
                    </Button>
                  </div>
                )}
              </div>

              {order.note ? (
                <div className="surface-muted px-5 py-5">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Customer note</p>
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
  const [status, setStatus] = useState<(typeof statusOptions)[number]>("ALL");
  const [search, setSearch] = useState("");
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [activeCustomerId, setActiveCustomerId] = useState<string | null>(null);

  const orders = useQuery({
    queryKey: ordersQueryKey(status),
    queryFn: () => getOrders(status),
    refetchInterval: 10_000,
  });

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
    return <Surface className="px-6 py-12 text-sm text-[var(--text-secondary)]">Loading live order stream...</Surface>;
  }

  if (orders.isError || !orders.data) {
    return <ErrorPanel title="Orders could not be loaded" description="The order stream endpoint did not return valid data." action={<Button onClick={() => void orders.refetch()}>Retry</Button>} />;
  }

  const liveCount = orders.data.orders.filter((order) => ["PENDING", "ACCEPTED", "PREPARING", "READY", "DELIVERING"].includes(order.status)).length;

  return (
    <div className="page-stack">
      <Surface className="px-6 py-6">
        <SectionHeader
          eyebrow="Orders"
          title="Live order stream"
          description="Realtime updates are backed by socket invalidation and a polling fallback every ten seconds."
          actions={
            <>
              <Badge tone="success">{formatNumber(liveCount)} live</Badge>
              <Button variant="secondary" onClick={() => void orders.refetch()}>
                <RefreshCw size={16} /> Refresh
              </Button>
            </>
          }
        />
      </Surface>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Surface className="px-5 py-5"><p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Total loaded</p><p className="mt-3 text-3xl font-black tracking-[-0.04em]">{formatNumber(orders.data.total)}</p></Surface>
        <Surface className="px-5 py-5"><p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Pending</p><p className="mt-3 text-3xl font-black tracking-[-0.04em]">{formatNumber(orders.data.orders.filter((order) => order.status === "PENDING").length)}</p></Surface>
        <Surface className="px-5 py-5"><p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Preparing</p><p className="mt-3 text-3xl font-black tracking-[-0.04em]">{formatNumber(orders.data.orders.filter((order) => order.status === "PREPARING").length)}</p></Surface>
        <Surface className="px-5 py-5"><p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Delivered</p><p className="mt-3 text-3xl font-black tracking-[-0.04em]">{formatNumber(orders.data.orders.filter((order) => order.status === "DELIVERED").length)}</p></Surface>
      </div>

      <Surface className="px-6 py-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-xl">
            <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input className="pl-11" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by order, customer, phone or restaurant" />
          </div>
          <Tabs value={status} onChange={(value) => setStatus(value)} options={statusOptions.map((item) => ({ value: item, label: item }))} />
        </div>

        {filteredOrders.length === 0 ? (
          <div className="mt-6"><EmptyState title="No orders in this view" /></div>
        ) : (
          <div className="mt-6 grid gap-3">
            {filteredOrders.map((order) => (
              <button
                key={order.id}
                type="button"
                onClick={() => setActiveOrderId(order.id)}
                className="surface-muted w-full px-5 py-5 text-left"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-black tracking-[-0.02em]">{order.orderNumber}</p>
                      <Badge tone={orderStatusTone(order.status) as "success" | "danger" | "warning" | "info" | "neutral"}>{orderStatusLabel(order.status)}</Badge>
                      <Badge tone="neutral">{order.type}</Badge>
                      {order.restaurantName ? <Badge tone="info">{order.restaurantName}</Badge> : null}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-[var(--text-secondary)]">
                      {order.userId ? (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setActiveCustomerId(order.userId!); }}
                          className="flex items-center gap-1 hover:text-[var(--accent-strong)] transition-colors font-semibold"
                        >
                          <UserRound size={13} /> {order.customerName}
                        </button>
                      ) : (
                        <span>{order.customerName}</span>
                      )}
                      <span>{order.customerPhone}</span>
                      <span>{order.items.length} items</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-sm text-[var(--text-secondary)]">
                    <span className="inline-flex items-center gap-2"><Clock3 size={14} /> {formatDateTime(order.createdAt)}</span>
                    <span className="font-black text-[var(--text-primary)]">{formatCurrency(order.total)}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
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
