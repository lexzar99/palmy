"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowRight, CheckCircle2, ChevronDown, Loader2, MapPin, Phone, ReceiptText, RefreshCw, Search, SlidersHorizontal, Trash2, UserRound } from "lucide-react";
import { bulkRefundOrders, deleteOrder, getOrder, getOrders, orderDetailQueryKey, ordersQueryKey, refundOrder, REFUND_REASONS, updateOrderStatus, ORDERS_PAGE_SIZE, type AdminOrder } from "@/modules/orders/api";
import { CustomerModal } from "@/modules/customers/page";
import { NotesPanel } from "@/shared/components/notes-panel";
import { Badge, Button, EmptyState, ErrorPanel, Input, Modal, PageHeader, Surface, Textarea } from "@/shared/components/ui";
import { formatCurrency, formatDateTime, formatNumber, orderStatusLabel, orderStatusTone, orderTypeLabel } from "@/shared/utils/format";

const DELIVERY_STEPS = ["PENDING", "PREPARING", "DELIVERING", "DELIVERED"] as const;
const PICKUP_STEPS = ["PENDING", "PREPARING", "READY"] as const;
const CANCEL_STATUSES = ["CANCELLED", "REJECTED", "DELIVERY_FAILED"];

function stepLabel(status: string, isDelivery: boolean): string {
  switch (status) {
    case "PENDING": return "Väntar";
    case "ACCEPTED": return "Tillagas";
    case "PREPARING": return "Tillagas";
    case "READY": return isDelivery ? "Redo" : "Redo att hämtas";
    case "DELIVERING": return "På väg";
    case "DELIVERED": return "Levererad";
    default: return status;
  }
}

// Nästa logiska steg + en handlingsvänlig etikett — driver den enda
// primära knappen så admin slipper gissa bland sex likadana knappar.
function nextAction(status: string, isDelivery: boolean): { status: string; label: string } | null {
  switch (status) {
    case "PENDING": return { status: "PREPARING", label: "Acceptera och sätt tid" };
    case "ACCEPTED": return { status: "PREPARING", label: "Markera som tillagas" };
    case "PREPARING": return isDelivery ? { status: "DELIVERING", label: "Markera på väg" } : { status: "READY", label: "Redo att hämtas" };
    case "DELIVERING": return { status: "DELIVERED", label: "Markera levererad" };
    default: return null;
  }
}

const DELIVERY_STATUS_ACTIONS: Array<[string, string]> = [
  ["PREPARING", "Accepterad / tillagas"],
  ["DELIVERING", "På väg"],
  ["DELIVERED", "Levererad"],
  ["CANCELLED", "Avbruten"],
];

const PICKUP_STATUS_ACTIONS: Array<[string, string]> = [
  ["PREPARING", "Accepterad / tillagas"],
  ["READY", "Redo att hämtas"],
  ["CANCELLED", "Avbruten"],
];

const statusOptions = ["ALL", "PENDING", "PREPARING", "READY", "DELIVERING", "DELIVERED", "CANCELLED"] as const;

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

// Kundens leveransinstruktion: kända enums → svenska, annars råtext (fritext).
function deliveryInstructionLabel(value: string): string {
  const map: Record<string, string> = {
    RING_DOORBELL: "Ring på dörrklockan",
    LEAVE_AT_DOOR: "Lämna utanför dörren",
    MEET_OUTSIDE: "Möt mig utanför",
    ENTER_CODE: "Portkod krävs",
  };
  return map[value] ?? value;
}

// Initialer för avatar-platshållare (rund mörk cirkel med 1-2 bokstäver).
function initials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Rund mörk avatar med initialer (image/avatar-platshållare per designen).
function Avatar({ name, size = 38 }: { name?: string | null; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-[#111113] font-extrabold text-white"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

// Statusbricka i orderdetaljen. "På väg" (DELIVERING) → accent; övriga via semantisk ton.
function DetailStatusBadge({ status }: { status: string }) {
  if (status === "DELIVERING") {
    return <span className="badge badge-accent">{orderStatusLabel(status)}</span>;
  }
  return <Badge tone={orderStatusTone(status) as "success" | "danger" | "warning" | "info" | "neutral"}>{orderStatusLabel(status)}</Badge>;
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

export function OrderDetailsModal({
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
  const router = useRouter();
  const [estimatedTime, setEstimatedTime] = useState<number | "">("");
  const [refundAmount, setRefundAmount] = useState<number | "">("");
  const [refundReasonKey, setRefundReasonKey] = useState<string>("");
  const [refundReasonExtra, setRefundReasonExtra] = useState("");
  // Återbetalning + manuell statusändring är sällan-åtgärder → ihopfällda by default.
  const [showRefund, setShowRefund] = useState(false);
  const [showStatusOverride, setShowStatusOverride] = useState(false);
  // Förstora leveransfotot (lightbox).
  const [proofZoom, setProofZoom] = useState(false);

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
  const isDone = order ? (isDelivery ? order.status === "DELIVERED" : order.status === "READY") : false;
  const isLive = order ? ["PENDING", "ACCEPTED", "PREPARING", "READY", "DELIVERING"].includes(order.status) : false;
  const manualStatusActions = isDelivery ? DELIVERY_STATUS_ACTIONS : PICKUP_STATUS_ACTIONS;

  const applyStatus = (status: string) =>
    statusMutation.mutate({ status, nextEstimatedTime: estimatedTime === "" ? null : Number(estimatedTime) });

  return (
    <>
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
            {/* ── Vänster: artiklar + kvitto/summa, bud ── */}
            <div className="space-y-4">
              <div className="surface px-5 py-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[14.5px] font-extrabold tracking-[-0.01em]">
                    Artiklar{order.restaurantName ? ` · ${order.restaurantName}` : ""}
                  </p>
                  <span className="rounded-full bg-[var(--bg-panel-soft)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--text-secondary)] tabular-nums">
                    {formatNumber(order.items.reduce((n, it) => n + it.quantity, 0))} st
                  </span>
                </div>
                <div className="mt-3 divide-y divide-[var(--border-subtle)] border-t border-[var(--border-subtle)]">
                  {order.items.map((item) => {
                    const extras = parseExtras(item.selectedExtras);
                    const extraText = extras.map((e) => e.extraName || e.name).filter(Boolean).join(" · ");
                    return (
                      <div key={item.id} className="flex items-baseline gap-3 py-3">
                        <span className="shrink-0 text-[13.5px] font-extrabold text-[var(--accent)] tabular-nums">{item.quantity}×</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13.5px] font-semibold">{item.productName}</p>
                          {extraText ? <p className="mt-0.5 text-[12px] font-medium text-[var(--text-muted)]">+ {extraText}</p> : null}
                          {item.note ? <p className="mt-0.5 text-[12.5px] text-[var(--text-secondary)]">{item.note}</p> : null}
                        </div>
                        <span className="shrink-0 text-[13.5px] font-bold tabular-nums">{formatCurrency(item.subtotal)}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Kvitto / summa */}
                <div className="mt-2 border-t border-[var(--border-strong)] pt-3">
                  <div className="flex items-center justify-between py-1 text-[13px] text-[var(--text-secondary)]">
                    <span>Delsumma</span>
                    <span className="tabular-nums">{formatCurrency(order.total - (order.deliveryFee || 0) + (order.discountAmount || 0))}</span>
                  </div>
                  <div className="flex items-center justify-between py-1 text-[13px] text-[var(--text-secondary)]">
                    <span>Leverans</span>
                    <span className="tabular-nums">{formatCurrency(order.deliveryFee || 0)}</span>
                  </div>
                  {order.discountAmount ? (
                    <div className="flex items-center justify-between py-1 text-[13px] text-[var(--text-secondary)]">
                      <span>Rabatt</span>
                      <span className="tabular-nums">−{formatCurrency(order.discountAmount)}</span>
                    </div>
                  ) : null}
                  <div className="mt-1.5 flex items-baseline justify-between">
                    <span className="text-[15px] font-extrabold">Totalt</span>
                    <span className="text-[19px] font-extrabold tracking-[-0.02em] tabular-nums">{formatCurrency(order.total)}</span>
                  </div>
                  <p className="mt-1.5 text-[11.5px] text-[var(--text-muted)]">
                    Betalt med {order.paymentMethod || "—"} · {formatDateTime(order.createdAt)}
                  </p>
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
              </div>

              {order.courier && (
                <div className="surface px-5 py-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="card-label">Bud</p>
                      {order.courier.id ? (
                        <button
                          type="button"
                          onClick={() => { const cid = order.courier?.id; if (cid) { onClose(); router.push(`/couriers/${cid}`); } }}
                          className="mt-2 text-left text-[14px] font-semibold text-[var(--accent-strong)] transition-colors hover:underline"
                          title="Visa kurirens profil"
                        >
                          {order.courier.name || "Ej tilldelad"}
                        </button>
                      ) : (
                        <p className="mt-2 text-[14px] font-semibold">{order.courier.name || "Ej tilldelad"}</p>
                      )}
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

                  {/* Leveransbevis: foto (liten vy → förstora), leveranssätt, kundens
                      instruktion och kurirens notering. Allt support behöver vid ett samtal. */}
                  {(order.courier.proofMethod || order.courier.proofPhotoUrl || order.courier.proofMessage) && (
                    <div className="mt-4 border-t border-[var(--border-subtle)] pt-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="card-label">Leveransbevis</p>
                        {order.courier.proofMethod && (
                          <Badge tone={order.courier.proofMethod === "LEFT_AT_DOOR" ? "warning" : "success"}>
                            {order.courier.proofMethod === "LEFT_AT_DOOR" ? "Lämnad vid dörren" : "Lämnad i handen"}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-3 flex gap-3">
                        {order.courier.proofPhotoUrl ? (
                          <button
                            type="button"
                            onClick={() => setProofZoom(true)}
                            className="group relative shrink-0 overflow-hidden rounded-xl border border-[var(--border-subtle)]"
                            title="Förstora foto"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={order.courier.proofPhotoUrl} alt="Leveransfoto" className="h-20 w-20 object-cover transition group-hover:opacity-80" />
                            <span className="absolute bottom-1 right-1 rounded bg-black/55 px-1 py-0.5 text-[9px] text-white">Förstora</span>
                          </button>
                        ) : (
                          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-dashed border-[var(--border-subtle)] text-[10px] text-[var(--text-muted)]">
                            Inget foto
                          </div>
                        )}
                        <div className="min-w-0 flex-1 space-y-2">
                          {order.deliveryInstructions && (
                            <div>
                              <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">Kundens instruktion</p>
                              <p className="text-[13px]">{deliveryInstructionLabel(order.deliveryInstructions)}</p>
                            </div>
                          )}
                          {order.courier.proofMessage && (
                            <div>
                              <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">Kurirens notering</p>
                              <p className="whitespace-pre-wrap text-[13px]">{order.courier.proofMessage}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Höger: kund, leverans, hantera, återbetalning, notering ── */}
            <div className="space-y-4">
              {/* Kund */}
              <div className="surface px-5 py-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="card-label">Kund</p>
                  {customerContextBadge(order.customerStats) ? (
                    <Badge tone={customerContextBadge(order.customerStats)!.tone}>{customerContextBadge(order.customerStats)!.label}</Badge>
                  ) : null}
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <Avatar name={order.customerName} size={38} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-bold">{order.customerName}</p>
                    <p className="truncate text-[12px] text-[var(--text-muted)]">
                      {order.customerPhone}
                      {order.customerStats?.orderCount ? ` · ${formatNumber(order.customerStats.orderCount)} ordrar` : ""}
                    </p>
                  </div>
                  {order.userId && onViewCustomer ? (
                    <button
                      type="button"
                      onClick={() => onViewCustomer(order.userId!)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--border-subtle)] px-2 py-1 text-[11px] font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
                    >
                      <UserRound size={11} /> Profil
                    </button>
                  ) : null}
                </div>
                <div className="mt-3 flex items-start gap-2 border-t border-[var(--border-subtle)] pt-3 text-[12.5px] text-[var(--text-secondary)]">
                  <MapPin size={14} className="mt-0.5 shrink-0 text-[var(--text-muted)]" />
                  <p className="leading-5">
                    {isDelivery
                      ? `${order.deliveryStreet || "Adress saknas"}${order.deliveryZip || order.deliveryCity ? `, ${order.deliveryZip || ""} ${order.deliveryCity || ""}` : ""}`
                      : "Avhämtning i restaurang"}
                    {order.deliveryInstructions ? <span className="text-[var(--text-muted)]"> · &ldquo;{deliveryInstructionLabel(order.deliveryInstructions)}&rdquo;</span> : null}
                  </p>
                </div>
                {order.customerEmail ? <p className="mt-1.5 truncate text-[12px] text-[var(--text-muted)]">{order.customerEmail}</p> : null}
              </div>

              {/* Leverans: ETA + progress + bud-rad. Visas för leveransordrar. */}
              {isDelivery && (() => {
                const steps = DELIVERY_STEPS as readonly string[];
                const idx = steps.indexOf(order.status);
                const pct = isCancelled ? 0 : idx < 0 ? 0 : Math.round(((idx + 1) / steps.length) * 100);
                return (
                  <div className="surface px-5 py-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="card-label">Leverans</p>
                      {isLive && order.estimatedTime ? (
                        <span className="text-[12px] font-extrabold text-[var(--accent)]">{order.estimatedTime} min</span>
                      ) : (
                        <DetailStatusBadge status={order.status} />
                      )}
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#F0F0EC]">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg,#F0531C,#FB7A4A)" }} />
                    </div>
                    {order.courier ? (
                      <div className="mt-3 flex items-center gap-3">
                        <Avatar name={order.courier.name} size={34} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-bold">{order.courier.name || "Ej tilldelad"}</p>
                          <p className="truncate text-[11.5px] text-[var(--text-muted)]">
                            {[order.courier.vehicle === "CAR" ? "Bil" : order.courier.vehicle === "BIKE" ? "Cykel" : null, order.courier.phone].filter(Boolean).join(" · ") || "—"}
                          </p>
                        </div>
                        {order.courier.id ? (
                          <button
                            type="button"
                            onClick={() => { const cid = order.courier?.id; if (cid) { onClose(); router.push(`/couriers/${cid}`); } }}
                            className="shrink-0 text-[12px] font-bold text-[var(--accent-ink)] transition-colors hover:underline"
                          >
                            Spåra ›
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <p className="mt-3 text-[12.5px] text-[var(--text-muted)]">Inget bud tilldelat ännu.</p>
                    )}
                  </div>
                );
              })()}

              {/* Snabbåtgärder per design: kontakta kund (accent) + återbetala (danger-outline). */}
              <div className="grid grid-cols-2 gap-2.5">
                <a href={`tel:${order.customerPhone}`} className="contents">
                  <Button variant="primary" className="w-full"><Phone size={15} /> Kontakta kund</Button>
                </a>
                {!order.refundedAt ? (
                  <Button variant="danger" className="w-full" onClick={() => setShowRefund((v) => !v)}>
                    <ReceiptText size={15} /> Återbetala
                  </Button>
                ) : (
                  <Button variant="secondary" className="w-full" disabled>
                    <CheckCircle2 size={15} /> Återbetald
                  </Button>
                )}
              </div>

              <div className="surface px-5 py-5">
                <p className="card-label">Hantera order</p>
                {isCancelled ? (
                  <p className="mt-2 text-[13px] text-[var(--text-secondary)]">Ordern är {orderStatusLabel(order.status).toLowerCase()}.</p>
                ) : isDone ? (
                  <p className="mt-2 flex items-center gap-1.5 text-[13px] text-[var(--success)]"><CheckCircle2 size={14} /> {isDelivery ? "Ordern är slutförd." : "Ordern är redo att hämtas."}</p>
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
                    {manualStatusActions.map(([status, label]) => (
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

              {/* ── Återbetalning ── */}
              {order.refundedAt ? (
                <div className="surface flex items-center gap-2.5 px-5 py-4 text-[13px] font-semibold text-[var(--success-text)]">
                  <CheckCircle2 size={16} /> Återbetald {formatCurrency(order.refundAmount || 0)}
                  {order.refundReason ? <span className="font-normal text-[var(--text-muted)]">· {order.refundReason}</span> : null}
                </div>
              ) : showRefund ? (
                <div className="surface overflow-hidden border-[color-mix(in_srgb,var(--danger)_28%,transparent)] px-5 py-5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[14px] font-extrabold tracking-[-0.01em] text-[var(--danger-text)]">Återbetala order</p>
                    <span className="font-[ui-monospace,Menlo,monospace] text-[12px] font-bold text-[var(--text-muted)]">{order.orderNumber}</span>
                  </div>

                  {/* Belopp: helt eller delvis. Tomt fält = helt belopp (backend använder order.total). */}
                  <p className="mt-4 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[var(--text-muted)]">Belopp</p>
                  <div className="mt-2 space-y-2">
                    <button
                      type="button"
                      onClick={() => setRefundAmount("")}
                      className="flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors"
                      style={refundAmount === ""
                        ? { borderColor: "var(--accent)", borderWidth: 2, background: "var(--accent-soft)" }
                        : { borderColor: "var(--border-subtle)" }}
                    >
                      <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full border-2" style={{ borderColor: refundAmount === "" ? "var(--accent)" : "var(--border-strong)" }}>
                        {refundAmount === "" ? <span className="h-2 w-2 rounded-full bg-[var(--accent)]" /> : null}
                      </span>
                      <span className="flex-1 text-[13.5px] font-bold">Hela beloppet</span>
                      <span className="text-[13.5px] font-extrabold tabular-nums">{order.total} kr</span>
                    </button>
                    <div
                      className="flex items-center gap-3 rounded-xl border px-4 py-3"
                      style={refundAmount !== ""
                        ? { borderColor: "var(--accent)", borderWidth: 2, background: "var(--accent-soft)" }
                        : { borderColor: "var(--border-subtle)" }}
                    >
                      <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full border-2" style={{ borderColor: refundAmount !== "" ? "var(--accent)" : "var(--border-strong)" }}>
                        {refundAmount !== "" ? <span className="h-2 w-2 rounded-full bg-[var(--accent)]" /> : null}
                      </span>
                      <span className="flex-1 text-[13.5px] font-bold">Delvis belopp</span>
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          className="w-24 text-right"
                          value={refundAmount}
                          onChange={(event) => setRefundAmount(event.target.value ? Number(event.target.value) : "")}
                          placeholder="0"
                        />
                        <span className="text-[13px] font-semibold text-[var(--text-muted)]">kr</span>
                      </div>
                    </div>
                  </div>

                  {/* Anledning: vald kategori + valfri fritext-tillägg. */}
                  <p className="mt-4 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[var(--text-muted)]">Anledning</p>
                  <div className="mt-2">
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
                          placeholder={refundReasonKey === "other" ? "Beskriv anledningen" : "Intern notering (valfri)"}
                        />
                      </div>
                    )}
                  </div>

                  {refundSuccess && (
                    <div className="mt-3 flex items-center gap-2 rounded-[10px] border border-[color-mix(in_srgb,var(--success)_30%,transparent)] bg-[var(--success-soft)] px-3 py-2.5 text-[13px] font-semibold text-[var(--success-text)]">
                      <CheckCircle2 size={14} /> Återbetalning skickad{refundStatus ? ` · ${refundStatus}` : ""}
                    </div>
                  )}
                  {refundError && (
                    <div className="mt-3 flex items-center gap-2 rounded-[10px] border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[var(--danger-soft)] px-3 py-2.5 text-[13px] font-semibold text-[var(--danger-text)]">
                      <AlertCircle size={14} /> {refundError}
                    </div>
                  )}

                  {/* Bekräftelse: avbryt + återbetala. Partial visas bara vid giltigt delbelopp. */}
                  <div className="mt-4 flex items-center gap-2.5">
                    <Button variant="secondary" className="flex-1" onClick={() => setShowRefund(false)} disabled={refundMutation.isPending}>
                      Avbryt
                    </Button>
                    {refundAmount !== "" && Number(refundAmount) > 0 && Number(refundAmount) < order.total ? (
                      <Button
                        variant="danger"
                        className="flex-[1.4]"
                        onClick={() => {
                          const amount = Number(refundAmount);
                          if (!window.confirm(`Återbetala ${amount} kr (delvis) för order ${order.orderNumber}?`)) return;
                          setRefundSuccess(false);
                          setRefundError(null);
                          refundMutation.mutate(amount);
                        }}
                        disabled={refundMutation.isPending}
                      >
                        {refundMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <ReceiptText size={16} />}
                        Återbetala {Number(refundAmount)} kr
                      </Button>
                    ) : (
                      <Button
                        variant="danger"
                        className="flex-[1.4]"
                        onClick={() => {
                          if (!window.confirm(`Återbetala hela beloppet ${order.total} kr för order ${order.orderNumber}?`)) return;
                          setRefundSuccess(false);
                          setRefundError(null);
                          refundMutation.mutate(null);
                        }}
                        disabled={refundMutation.isPending}
                      >
                        {refundMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <ReceiptText size={16} />}
                        {refundMutation.isPending ? "Återbetalar…" : `Återbetala ${order.total} kr`}
                      </Button>
                    )}
                  </div>
                </div>
              ) : null}

              {order.note ? (
                <div className="surface px-5 py-5">
                  <p className="card-label">Kundnotering</p>
                  <p className="mt-2 text-[13px] leading-6 text-[var(--text-secondary)]">{order.note}</p>
                </div>
              ) : null}

              {/* Support-anteckningar: på ordern + på kunden (telefon). Super-admin-only. */}
              <NotesPanel target={{ orderId: order.id }} title="Anteckningar på ordern" />
              {order.customerPhone ? (
                <NotesPanel target={{ customerPhone: order.customerPhone }} title="Anteckningar på kunden" />
              ) : null}
            </div>
          </div>
        </div>
      )}
    </Modal>

    {/* Lightbox: förstorat leveransfoto. */}
    <Modal open={proofZoom} onClose={() => setProofZoom(false)} widthClassName="max-w-[680px]" title="Leveransfoto">
      {order?.courier?.proofPhotoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={order.courier.proofPhotoUrl} alt="Leveransfoto" className="max-h-[72vh] w-full rounded-xl object-contain" />
      )}
    </Modal>
    </>
  );
}

const LIVE_STATUSES = ["PENDING", "ACCEPTED", "PREPARING", "READY", "DELIVERING"];

const MONO = "font-[ui-monospace,Menlo,monospace]";
// Delad kolumnmall för header + rader (Order · Restaurang · Kund · Status · Tid · Åtgärd).
const ORDERS_GRID = "80px 1.3fr 1.1fr 1fr 0.8fr 130px";

// Statusbricka för listan. "På väg" (DELIVERING) använder den orange accent-tonen
// (badge-accent) per designen; övriga går via den semantiska tabellen i orderStatusTone.
function StatusBadge({ status }: { status: string }) {
  if (status === "DELIVERING") {
    return <span className="badge badge-accent">{orderStatusLabel(status)}</span>;
  }
  return <Badge tone={orderStatusTone(status) as "success" | "danger" | "warning" | "info" | "neutral"}>{orderStatusLabel(status)}</Badge>;
}

type OrderRowProps = {
  order: AdminOrder;
  isSelected: boolean;
  nowMs: number;
  isAdvancing: boolean;
  onOpen: (id: string) => void;
  onToggleSelect: (id: string, checked: boolean) => void;
  onOpenCustomer: (userId: string) => void;
  onAdvance: (order: AdminOrder, nextStatus: string) => void;
};

// Memo-iserad orderrad. Vid 70 ordrar var listan trög för att VARJE rad
// renderades om dels på 30s-ticken (nowMs), dels vid varje markering. Nu:
// • slutförda rader hoppar over nowMs-ticken (tid-i-status visas bara live),
// • bara den togglade raden renderas om vid markering (stabila callbacks).
function OrderRowBase({ order, isSelected, nowMs, isAdvancing, onOpen, onToggleSelect, onOpenCustomer, onAdvance }: OrderRowProps) {
  const isLive = LIVE_STATUSES.includes(order.status);
  const isDelivery = order.type === "DELIVERY";
  const tis = isLive ? formatTimeInStatus(order, nowMs) : null;
  const next = nextAction(order.status, isDelivery);
  const isRefundable = !order.refundedAt && Boolean(order.stripePaymentIntentId) && order.stripePaymentIntentId !== "TEST_PAYMENT" && order.stripePaymentIntentId !== "FREE_PROMO";
  const isPending = order.status === "PENDING";
  const isLate = tis?.tone === "danger";

  // Höger-justerad åtgärd. Återanvänder updateOrderStatus via onAdvance; "Spåra"/"Detaljer"
  // öppnar samma orderdetalj-modal (ingen ny endpoint).
  const action = (() => {
    if (isPending && next) {
      return (
        <Button
          variant="primary"
          className="h-auto px-3 py-1.5 text-[12px]"
          disabled={isAdvancing}
          onClick={(e) => { e.stopPropagation(); onAdvance(order, next.status); }}
        >
          {isAdvancing ? <Loader2 size={13} className="animate-spin" /> : null}
          Acceptera
        </Button>
      );
    }
    if (isLive && next) {
      if (order.status === "DELIVERING") {
        return <span className="text-[12px] font-bold text-[var(--text-secondary)]">Spåra ›</span>;
      }
      return (
        <Button
          variant="secondary"
          className="h-auto px-3 py-1.5 text-[12px]"
          disabled={isAdvancing}
          onClick={(e) => { e.stopPropagation(); onAdvance(order, next.status); }}
        >
          {isAdvancing ? <Loader2 size={13} className="animate-spin" /> : null}
          Klar
        </Button>
      );
    }
    return <span className="text-[12px] font-bold text-[var(--text-secondary)]">Detaljer ›</span>;
  })();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(order.id)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(order.id); } }}
      className="grid cursor-pointer items-center gap-3 border-b border-[var(--row-divider)] px-[18px] py-[13px] text-[13px] transition-colors last:border-b-0 hover:bg-[var(--bg-hover)]"
      style={{ gridTemplateColumns: ORDERS_GRID, ...(isPending ? { background: "var(--warning-soft)" } : {}) }}
    >
      {/* Order# (+ valbar checkbox för återbetalningsbara) */}
      <div className="flex min-w-0 items-center gap-2">
        {isRefundable ? (
          <input
            type="checkbox"
            checked={isSelected}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => { e.stopPropagation(); onToggleSelect(order.id, e.target.checked); }}
            className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-[var(--accent-strong)]"
            aria-label={`Välj order ${order.orderNumber}`}
          />
        ) : null}
        <span className={`${MONO} truncate text-[12px] font-bold text-[var(--text-primary)]`}>{order.orderNumber}</span>
      </div>

      {/* Restaurang */}
      <span className="truncate font-semibold text-[var(--text-primary)]">{order.restaurantName || "—"}</span>

      {/* Kund */}
      {order.userId ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onOpenCustomer(order.userId!); }}
          className="truncate text-left text-[var(--text-secondary)] transition-colors hover:text-[var(--accent-strong)]"
        >
          {order.customerName}
        </button>
      ) : (
        <span className="truncate text-[var(--text-secondary)]">{order.customerName}</span>
      )}

      {/* Status */}
      <span className="min-w-0"><StatusBadge status={order.status} /></span>

      {/* Tid i status — röd + fet om sen */}
      <span
        className="truncate"
        style={isLate ? { color: "var(--danger)", fontWeight: 700 } : { color: "var(--text-muted)" }}
      >
        {isLive && tis ? tis.label : formatDateTime(order.createdAt)}
      </span>

      {/* Åtgärd */}
      <div className="flex items-center justify-end">{action}</div>
    </div>
  );
}

const OrderRow = memo(OrderRowBase, (a, b) =>
  a.order === b.order &&
  a.isSelected === b.isSelected &&
  a.isAdvancing === b.isAdvancing &&
  a.onOpen === b.onOpen &&
  a.onToggleSelect === b.onToggleSelect &&
  a.onOpenCustomer === b.onOpenCustomer &&
  a.onAdvance === b.onAdvance &&
  // nowMs påverkar bara live-ordrar (tid-i-status-badgen) → slutförda rader
  // behöver inte renderas om vid varje 30s-tick.
  (LIVE_STATUSES.includes(a.order.status) ? a.nowMs === b.nowMs : true),
);

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

  // Inline statusframflyttning (Acceptera/Klar) — återanvänder updateOrderStatus,
  // samma endpoint som orderdetalj-modalen. Ingen ny logik.
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const advanceMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateOrderStatus(id, status),
    onSettled: async () => {
      setAdvancingId(null);
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  // Stabila callbacks → OrderRow-memon kan hoppa över re-renders.
  const openOrder = useCallback((id: string) => setActiveOrderId(id), []);
  const openCustomer = useCallback((userId: string) => setActiveCustomerId(userId), []);
  const advanceOrder = useCallback((order: AdminOrder, nextStatus: string) => {
    setAdvancingId(order.id);
    advanceMutation.mutate({ id: order.id, status: nextStatus });
  }, [advanceMutation]);
  const toggleSelect = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }, []);

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

  const loadedOrders = orders.data.orders;
  const liveCount = loadedOrders.filter((order) => ["PENDING", "ACCEPTED", "PREPARING", "READY", "DELIVERING"].includes(order.status)).length;

  // Chip-räknare härleds ur den laddade listan. När ett statusfilter är aktivt
  // returnerar API:t bara den statusen, så räknarna visar vad som faktiskt är laddat.
  const statusCount = (s: (typeof statusOptions)[number]) =>
    s === "ALL" ? loadedOrders.length : loadedOrders.filter((o) => o.status === s).length;

  return (
    <div className="page-stack">
      <PageHeader
        breadcrumb="Drift"
        title="Ordrar"
        actions={
          <>
            <div className="chip-row">
              {statusOptions.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setStatus(item)}
                  className={`chip${status === item ? " is-active" : ""}`}
                >
                  {item === "ALL" ? "Alla" : orderStatusLabel(item)} {formatNumber(statusCount(item))}
                </button>
              ))}
            </div>
            <Badge tone="success">{formatNumber(liveCount)} live</Badge>
            <Button variant="secondary" onClick={() => void orders.refetch()}>
              <RefreshCw size={14} /> Uppdatera
            </Button>
          </>
        }
      />

      <Surface className="px-5 py-4">
        <div className="relative w-full max-w-xl">
          <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <Input className="pl-11" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Sök order, kund, telefon, restaurang" />
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
          <div className="mt-6 overflow-hidden rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-panel)]">
            {/* Header-rad */}
            <div
              className="grid gap-3 border-b border-[var(--border-subtle)] px-[18px] py-[11px] text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-[var(--text-muted)]"
              style={{ gridTemplateColumns: ORDERS_GRID }}
            >
              <span>Order</span>
              <span>Restaurang</span>
              <span>Kund</span>
              <span>Status</span>
              <span>Tid</span>
              <span className="text-right">Åtgärd</span>
            </div>
            {filteredOrders.map((order) => (
              <OrderRow
                key={order.id}
                order={order}
                isSelected={selectedIds.has(order.id)}
                nowMs={nowMs}
                isAdvancing={advancingId === order.id}
                onOpen={openOrder}
                onToggleSelect={toggleSelect}
                onOpenCustomer={openCustomer}
                onAdvance={advanceOrder}
              />
            ))}
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
