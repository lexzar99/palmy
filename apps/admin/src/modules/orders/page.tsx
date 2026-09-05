"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowRight, CalendarClock, CheckCircle2, ChevronDown, MapPin, Phone, ReceiptText, RefreshCw, Search, SlidersHorizontal, UserRound } from "lucide-react";
import { getOrder, getOrders, orderDetailQueryKey, ordersQueryKey, refundOrder, REFUND_REASONS, updateOrderStatus, ORDERS_PAGE_SIZE, type AdminOrder } from "@/modules/orders/api";
import { CustomerModal } from "@/modules/customers/page";
import { NotesPanel } from "@/shared/components/notes-panel";
import { LiveMap } from "@/shared/components/live-map";
import { Badge, Button, ConfirmDialog, DurationInput, EmptyState, ErrorPanel, Field, Input, Modal, MoneyInput, PageHeader, Select, Surface, Textarea } from "@/shared/components/ui";
import { formatCurrency, formatDateTime, formatNumber, orderStatusLabel, orderStatusTone, orderTypeLabel, paymentStatusLabel, refundBadge } from "@/shared/utils/format";

const DELIVERY_STEPS = ["PENDING", "PREPARING", "DELIVERING", "DELIVERED"] as const;
const PICKUP_STEPS = ["PENDING", "PREPARING", "READY", "DELIVERED"] as const;
const CANCEL_STATUSES = ["CANCELLED", "REJECTED", "DELIVERY_FAILED"];
const REFUND_PROVIDER_LABELS: Record<string, string> = {
  swish: "Swish",
  stripe: "Stripe",
  mollie: "Mollie",
  adyen: "Adyen",
};

function stepLabel(status: string, isDelivery: boolean): string {
  switch (status) {
    case "PENDING": return "Väntar";
    case "ACCEPTED": return "Tillagas";
    case "PREPARING": return "Tillagas";
    case "READY": return isDelivery ? "Redo" : "Redo att hämtas";
    case "DELIVERING": return "På väg";
    case "DELIVERED": return isDelivery ? "Levererad" : "Hämtad";
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
    case "READY": return isDelivery ? null : { status: "DELIVERED", label: "Markera hämtad" };
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
  ["DELIVERED", "Hämtad"],
  ["CANCELLED", "Avbruten"],
];

const statusOptions = ["ALL", "PENDING", "PREPARING", "READY", "DELIVERING", "DELIVERED", "CANCELLED"] as const;

function parseDecimalInput(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function orderTipAmount(order: AdminOrder): number {
  const amount = Number(order.tipAmount ?? 0);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

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
// Pågående/klar återbetalning vinner över orderstatusen.
function DetailStatusBadge({ status, isDelivery = true, paymentStatus }: { status: string; isDelivery?: boolean; paymentStatus?: string | null }) {
  const refund = refundBadge(paymentStatus);
  if (refund) return <Badge tone={refund.tone}>{refund.label}</Badge>;
  if (status === "DELIVERING") {
    return <span className="badge badge-accent">{orderStatusLabel(status)}</span>;
  }
  const label = status === "DELIVERED" && !isDelivery ? "Hämtad" : orderStatusLabel(status);
  return <Badge tone={orderStatusTone(status) as "success" | "danger" | "warning" | "info" | "neutral"}>{label}</Badge>;
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

type OrderDetailsModalProps = {
  orderId: string | null;
  open: boolean;
  onClose: () => void;
  onViewCustomer?: (customerId: string) => void;
};

export function OrderDetailsModal(props: OrderDetailsModalProps) {
  return <OrderDetailsModalContent key={props.orderId ?? "closed"} {...props} />;
}

function OrderDetailsModalContent({
  orderId,
  open,
  onClose,
  onViewCustomer,
}: OrderDetailsModalProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [estimatedTime, setEstimatedTime] = useState("");
  const [manualStatus, setManualStatus] = useState("");
  const [refundMode, setRefundMode] = useState<"full" | "partial">("full");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReasonKey, setRefundReasonKey] = useState<string>("");
  const [refundReasonExtra, setRefundReasonExtra] = useState("");
  // Återbetalning + manuell statusändring är sällan-åtgärder → ihopfällda by default.
  const [showRefund, setShowRefund] = useState(false);
  const [showStatusOverride, setShowStatusOverride] = useState(false);
  // Förstora leveransfotot (lightbox).
  const [proofZoom, setProofZoom] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState<
    { kind: "refund"; amountKr: number | null } | null
  >(null);

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
    meta: { successMessage: "Orderstatus uppdaterad", errorMessage: "Kunde inte uppdatera orderstatus" },
    mutationFn: ({ status, nextEstimatedTime }: { status: string; nextEstimatedTime?: number | null }) =>
      updateOrderStatus(orderId!, status, nextEstimatedTime),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      if (orderId) {
        await queryClient.invalidateQueries({ queryKey: orderDetailQueryKey(orderId) });
      }
      setManualStatus("");
    },
  });

  const [refundFeedback, setRefundFeedback] = useState<{
    message: string;
    processing: boolean;
    refundStatus: string | null;
  } | null>(null);
  const [refundError, setRefundError] = useState<string | null>(null);

  const refundMutation = useMutation({
    meta: { successMessage: "Återbetalning skickad", errorMessage: "Återbetalning misslyckades" },
    // amountKr = null → full återbetalning (backend använder order.total).
    mutationFn: (amountKr: number | null) => refundOrder(orderId!, amountKr, refundReason),
    onSuccess: async (data) => {
      setRefundFeedback({
        message: data.message || "Återbetalningen skickades till Mollie.",
        processing: Boolean(data.processing),
        refundStatus: data.refundStatus || null,
      });
      setRefundError(null);
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
      await queryClient.invalidateQueries({ queryKey: ["finance"] });
      if (orderId) {
        await queryClient.invalidateQueries({ queryKey: orderDetailQueryKey(orderId) });
      }
      setPendingConfirmation(null);
    },
    onError: (error: unknown) => {
      const message = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setRefundError(message || "Återbetalning misslyckades");
      setRefundFeedback(null);
    },
  });

  const order = orderQuery.data;
  const isDelivery = order?.type === "DELIVERY";
  const next = order ? nextAction(order.status, isDelivery) : null;
  const isCancelled = order ? CANCEL_STATUSES.includes(order.status) : false;
  const isDone = order ? order.status === "DELIVERED" : false;
  const isLive = order ? ["PENDING", "ACCEPTED", "PREPARING", "READY", "DELIVERING"].includes(order.status) : false;
  const manualStatusActions = isDelivery ? DELIVERY_STATUS_ACTIONS : PICKUP_STATUS_ACTIONS;
  const currentStatusIsSelectable = Boolean(order && manualStatusActions.some(([status]) => status === order.status));
  const selectedManualStatus = manualStatus || (currentStatusIsSelectable ? order?.status : manualStatusActions[0]?.[0]) || "";
  const estimatedMinutes = parseDecimalInput(estimatedTime);
  const estimatedTimeError = estimatedTime && (estimatedMinutes === null || !Number.isInteger(estimatedMinutes) || estimatedMinutes < 1 || estimatedMinutes > 240)
    ? "Ange hela minuter mellan 1 och 240."
    : undefined;
  const refundedAmount = Math.max(0, Number(order?.refundAmount || 0));
  const remainingRefundAmount = Math.max(0, Number(order?.total || 0) - refundedAmount);
  const paymentStatus = String(order?.paymentStatus || "").toUpperCase();
  const refundIsPending = paymentStatus === "REFUNDING";
  const refundIsComplete = paymentStatus === "REFUNDED" || remainingRefundAmount <= 0;
  const refundCanStart = ["PAID", "PARTIALLY_REFUNDED"].includes(paymentStatus) && remainingRefundAmount > 0;
  // Ordern äger sin betalleverantör. Saldokön finns bara hos Mollie — en
  // Swish- eller Stripe-återbetalning får aldrig beskrivas med Mollies text.
  const latestActiveRefund = [...(order?.paymentRefunds || [])]
    .reverse()
    .find((refund) => ["REQUESTED", "QUEUED", "PENDING", "PROCESSING", "UNKNOWN"].includes(refund.status.toUpperCase()));
  const latestActiveRefundStatus = latestActiveRefund?.status.toUpperCase();
  const refundProvider = String(latestActiveRefund?.provider || order?.paymentProvider || "").toLowerCase();
  const refundProviderLabel = REFUND_PROVIDER_LABELS[refundProvider] || "betalleverantören";
  const pendingRefundMessage = latestActiveRefundStatus === "QUEUED" && refundProvider === "mollie"
    ? "Återbetalningen är köad hos Mollie eftersom saldot inte räcker just nu. Fyll på Mollie-saldot eller invänta nya betalningar; därefter genomförs den automatiskt."
    : `Återbetalningen behandlas hos ${refundProviderLabel}. Nytt försök är spärrat tills statusen är slutlig.`;
  const partialRefundAmount = parseDecimalInput(refundAmount);
  const partialRefundError = order && refundMode === "partial"
    ? partialRefundAmount === null || partialRefundAmount <= 0
      ? "Ange ett belopp större än 0 kr."
      : partialRefundAmount >= remainingRefundAmount
        ? "Delbeloppet måste vara lägre än återstående belopp. Välj hela beloppet för resten."
        : undefined
    : undefined;
  const deliveryMapMarkers = order && isDelivery
    ? [
        {
          id: "pickup",
          label: order.restaurantName || "Restaurang",
          subtitle: [order.restaurantAddress, order.restaurantCity].filter(Boolean).join(", "),
          lat: order.restaurantLat,
          lng: order.restaurantLng,
          tone: "pickup" as const,
        },
        {
          id: "dropoff",
          label: order.customerName || "Kund",
          subtitle: [order.deliveryStreet, order.deliveryZip, order.deliveryCity].filter(Boolean).join(", "),
          lat: order.deliveryLatitude,
          lng: order.deliveryLongitude,
          tone: "dropoff" as const,
        },
        {
          id: "courier",
          label: order.courier?.name || "Kurir",
          subtitle: order.courier?.lastSeenAt ? `Senast sedd ${formatDateTime(order.courier.lastSeenAt)}` : "Liveposition",
          lat: order.courier?.currentLat,
          lng: order.courier?.currentLng,
          tone: "courier" as const,
        },
      ]
    : [];

  const applyStatus = (status: string) => {
    if (estimatedTimeError) return;
    statusMutation.mutate({ status, nextEstimatedTime: estimatedMinutes });
  };

  const closeDetails = () => {
    if (pendingConfirmation || proofZoom) return;
    onClose();
  };

  return (
    <>
    <Modal
      open={open}
      onClose={closeDetails}
      size="xl"
      title={order ? `Order ${order.orderNumber}` : "Orderdetaljer"}
      description={order ? `${order.restaurantName || "Okänd restaurang"} · ${formatDateTime(order.createdAt)} · ${orderTypeLabel(order.type)}` : undefined}
      footer={<Button className="w-full sm:w-auto" onClick={onClose}>Stäng</Button>}
    >
      {orderQuery.isLoading || !order ? (
        <div className="surface-muted px-5 py-8 text-center text-sm text-[var(--text-secondary)]">Laddar order…</div>
      ) : (
        <div className="space-y-5">
          <StatusTrack status={order.status} isDelivery={isDelivery} />

          {order.scheduledFor ? (
            <div className="flex flex-col gap-3 rounded-xl border border-[color-mix(in_srgb,var(--warning)_32%,transparent)] bg-[var(--warning-soft)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <CalendarClock size={18} className="mt-0.5 shrink-0 text-[var(--warning-text)]" />
                <div className="min-w-0">
                  <p className="text-[12px] font-extrabold uppercase tracking-[0.08em] text-[var(--warning-text)]">Förbeställning</p>
                  <p className="mt-0.5 text-[13px] text-[var(--text-secondary)]">Kunden har valt en specifik tid, inte ASAP.</p>
                </div>
              </div>
              <time className="shrink-0 text-[14px] font-extrabold tabular-nums text-[var(--text-primary)]" dateTime={order.scheduledFor}>
                {formatDateTime(order.scheduledFor)}
              </time>
            </div>
          ) : null}

          {/* Ett rutnät för hela ordern: orderinnehållet till vänster, kund och
              åtgärder som en smal sidokolumn. Tidigare låg allt som fullbreda
              kort staplade på varandra. */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.85fr)] lg:items-start">
            {/* ── Sidokolumn: kund, leverans, åtgärder, anteckningar ── */}
            <div className="order-1 space-y-4 lg:order-2">
              <div className="space-y-4">
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
                            <DetailStatusBadge status={order.status} isDelivery={isDelivery} paymentStatus={order.paymentStatus} />
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
                </div>

                <div className="space-y-4">
                  {/* Snabbåtgärder per design: kontakta kund (accent) + återbetala (danger-outline). */}
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-1">
                    <a href={`tel:${order.customerPhone}`} className="contents">
                      <Button variant="primary" className="w-full"><Phone size={15} /> Kontakta kund</Button>
                    </a>
                    {refundCanStart ? (
                      <Button variant="danger" className="w-full" onClick={() => setShowRefund((v) => !v)}>
                        <ReceiptText size={15} /> Återbetala {formatCurrency(remainingRefundAmount)}
                      </Button>
                    ) : refundIsPending ? (
                      <Button variant="secondary" className="w-full" disabled>
                        <RefreshCw size={15} className="animate-spin" /> Återbetalning behandlas
                      </Button>
                    ) : refundIsComplete ? (
                      <Button variant="secondary" className="w-full" disabled>
                        <CheckCircle2 size={15} /> Fullt återbetald
                      </Button>
                    ) : (
                      <Button variant="secondary" className="w-full" disabled>
                        <ReceiptText size={15} /> Ej återbetalningsbar
                      </Button>
                    )}
                  </div>

                  <div className="surface px-5 py-5">
                    <p className="card-label">Hantera order</p>
                    {isCancelled ? (
                      <p className="mt-2 text-[13px] text-[var(--text-secondary)]">Ordern är {orderStatusLabel(order.status).toLowerCase()}.</p>
                    ) : isDone ? (
                      <p className="mt-2 flex items-center gap-1.5 text-[13px] text-[var(--success)]"><CheckCircle2 size={14} /> {isDelivery ? "Ordern är slutförd." : "Ordern är hämtad."}</p>
                    ) : (
                      <>
                        <p className="mt-1.5 text-[13px] text-[var(--text-secondary)]">Just nu: {orderStatusLabel(order.status)}</p>
                        {next && (
                          <Button
                            variant="primary"
                            className="mt-3 w-full"
                            loading={statusMutation.isPending}
                            onClick={() => applyStatus(next.status)}
                            disabled={Boolean(estimatedTimeError)}
                          >
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
                      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                        <Field label="Ny status">
                          <Select value={selectedManualStatus} onChange={(event) => setManualStatus(event.target.value)}>
                            {manualStatusActions.map(([status, label]) => (
                              <option key={status} value={status}>{label}</option>
                            ))}
                          </Select>
                        </Field>
                        <Button
                          variant={selectedManualStatus === "CANCELLED" ? "danger" : "secondary"}
                          className="w-full sm:w-auto"
                          loading={statusMutation.isPending}
                          onClick={() => applyStatus(selectedManualStatus)}
                          disabled={selectedManualStatus === order.status || Boolean(estimatedTimeError)}
                        >
                          Uppdatera status
                        </Button>
                      </div>
                    )}

                    {isLive && (
                      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                        <Field label="Beräknad tid" error={estimatedTimeError}>
                          <DurationInput
                            value={estimatedTime}
                            onValueChange={setEstimatedTime}
                            placeholder={order.estimatedTime ? String(order.estimatedTime) : "35"}
                            min={1}
                            max={240}
                          />
                        </Field>
                        <Button
                          className="w-full sm:w-auto"
                          loading={statusMutation.isPending}
                          onClick={() => applyStatus(order.status)}
                          disabled={!estimatedTime || Boolean(estimatedTimeError)}
                        >
                          Spara tid
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {/* Support-anteckningar: på ordern + på kunden (telefon). Super-admin-only. */}
              <NotesPanel target={{ orderId: order.id }} title="Anteckningar på ordern" />
              {order.customerPhone ? (
                <NotesPanel target={{ customerPhone: order.customerPhone }} title="Anteckningar på kunden" />
              ) : null}
            </div>

            {/* ── Huvudspår: artiklar, kvitto, bud och återbetalningar ── */}
            <div className="order-2 space-y-4 lg:order-1">
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
                    <div className="mt-4 grid grid-cols-1 gap-2 text-center sm:grid-cols-3">
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

                  {isDelivery && (
                    <div className="mt-4 border-t border-[var(--border-subtle)] pt-4">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="card-label">Livekarta</p>
                        {order.courier.lastSeenAt && <span className="text-[11px] font-semibold text-[var(--text-muted)]">{formatDateTime(order.courier.lastSeenAt)}</span>}
                      </div>
                      <LiveMap markers={deliveryMapMarkers} height={190} />
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
                      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
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
              {/* ── Återbetalning ── */}
              {refundedAmount > 0 ? (
                <div className="surface flex items-center gap-2.5 px-5 py-4 text-[13px] font-semibold text-[var(--success-text)]">
                  <CheckCircle2 size={16} /> {refundIsComplete ? "Fullt återbetald" : "Delvis återbetald"} {formatCurrency(refundedAmount)}
                  {!refundIsComplete ? <span className="font-normal text-[var(--text-muted)]">· {formatCurrency(remainingRefundAmount)} återstår</span> : null}
                  {order.refundReason ? <span className="font-normal text-[var(--text-muted)]">· {order.refundReason}</span> : null}
                </div>
              ) : null}
              {refundFeedback ? (
                <div className={`surface flex items-start gap-2.5 px-5 py-4 text-[13px] font-semibold ${refundFeedback.processing ? "text-[var(--warning-text)]" : "text-[var(--success-text)]"}`}>
                  {refundFeedback.processing
                    ? <RefreshCw size={16} className="mt-0.5 shrink-0 animate-spin" />
                    : <CheckCircle2 size={16} className="mt-0.5 shrink-0" />}
                  <span>{refundFeedback.message}{refundFeedback.refundStatus ? ` · ${refundFeedback.refundStatus.toUpperCase()}` : ""}</span>
                </div>
              ) : null}
              {refundError ? (
                <div className="surface flex items-start gap-2.5 px-5 py-4 text-[13px] font-semibold text-[var(--danger-text)]">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" /> {refundError}
                </div>
              ) : null}
              {refundIsPending && !refundFeedback ? (
                <div className="surface flex items-center gap-2.5 px-5 py-4 text-[13px] font-semibold text-[var(--warning-text)]">
                  <RefreshCw size={16} className="shrink-0 animate-spin" /> {pendingRefundMessage}
                </div>
              ) : null}
              {order.paymentRefunds?.length ? (
                <div className="surface px-5 py-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="card-label">Refund-ledger</p>
                    <span className="text-[11px] font-semibold text-[var(--text-muted)]">{order.paymentRefunds.length} ekonomisk post</span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {order.paymentRefunds.map((refund) => {
                      const status = refund.status.toUpperCase();
                      const tone = status === "REFUNDED" ? "success" : status === "FAILED" || status === "CANCELED" ? "danger" : "warning";
                      return (
                        <div key={refund.id} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel-muted)] px-3.5 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Badge tone={tone}>{status}</Badge>
                              <span className="text-[13px] font-extrabold tabular-nums">{formatCurrency(refund.amount)}</span>
                              <span className="text-[11px] font-semibold uppercase text-[var(--text-muted)]">{refund.provider}</span>
                            </div>
                            <span className="text-[11px] text-[var(--text-muted)]">{formatDateTime(refund.lastSeenAt)}</span>
                          </div>
                          <p className="mt-2 break-all font-[ui-monospace,Menlo,monospace] text-[10px] text-[var(--text-muted)]">
                            {refund.refundRef || "PSP-referens inväntas"} · {refund.source}
                          </p>
                          {refund.reason ? <p className="mt-1 text-[12px] text-[var(--text-secondary)]">{refund.reason}</p> : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              {order.note ? (
                <div className="surface px-5 py-5">
                  <p className="card-label">Kundnotering</p>
                  <p className="mt-2 text-[13px] leading-6 text-[var(--text-secondary)]">{order.note}</p>
                </div>
              ) : null}

            </div>

              {/* Kvitto / summa */}
                <div className="mt-2 border-t border-[var(--border-strong)] pt-3">
                  <div className="flex items-center justify-between py-1 text-[13px] text-[var(--text-secondary)]">
                    <span>Delsumma</span>
                    <span className="tabular-nums">{formatCurrency(order.total - (order.deliveryFee || 0) - orderTipAmount(order) + (order.discountAmount || 0))}</span>
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
                  <div className={orderTipAmount(order) > 0
                    ? "flex items-center justify-between rounded-lg bg-[var(--success-soft)] px-2.5 py-2 text-[13px] font-semibold text-[var(--success-text)]"
                    : "flex items-center justify-between py-1 text-[13px] text-[var(--text-secondary)]"}
                  >
                    <span>Dricks till budet</span>
                    <span className="tabular-nums">{orderTipAmount(order) > 0 ? "+" : ""}{formatCurrency(orderTipAmount(order))}</span>
                  </div>
                  <div className="mt-1.5 flex items-baseline justify-between">
                    <span className="text-[15px] font-extrabold">Totalt</span>
                    <span className="text-[19px] font-extrabold tracking-[-0.02em] tabular-nums">{formatCurrency(order.total)}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-[var(--text-muted)]">
                    <span>Betalt med {order.paymentMethod || "—"}</span>
                    {order.paymentStatus ? <Badge tone={order.paymentStatus === "PAID" ? "success" : order.paymentStatus === "REFUNDED" ? "danger" : order.paymentStatus === "REFUNDING" || order.paymentStatus === "PARTIALLY_REFUNDED" ? "warning" : "neutral"}>{paymentStatusLabel(order.paymentStatus)}</Badge> : null}
                    <span>· {formatDateTime(order.createdAt)}</span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}
    </Modal>

    {/* Återbetalning är ett eget beslut och får ett eget fönster. Tidigare
        fälldes formuläret ut längst ner i orderfönstret, utanför synfältet, så
        man var tvungen att leta rätt på det genom att skrolla. */}
    <Modal
      open={showRefund && refundCanStart}
      onClose={() => setShowRefund(false)}
      size="sm"
      title="Återbetala order"
      description={order ? `${order.orderNumber} · ${formatCurrency(remainingRefundAmount)} kvar att återbetala` : undefined}
    >
      {order ? (
        <div className="space-y-4">
          <Field label="Beloppstyp">
            <Select
              value={refundMode}
              onChange={(event) => {
                const mode = event.target.value === "partial" ? "partial" : "full";
                setRefundMode(mode);
                if (mode === "full") setRefundAmount("");
              }}
            >
              <option value="full">Hela återstående beloppet · {formatCurrency(remainingRefundAmount)}</option>
              <option value="partial">Delbelopp</option>
            </Select>
          </Field>

          {refundMode === "partial" ? (
            <Field label="Delbelopp" error={partialRefundError}>
              <MoneyInput
                value={refundAmount}
                onValueChange={setRefundAmount}
                placeholder="0"
                min={0}
                max={remainingRefundAmount}
              />
            </Field>
          ) : (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel-muted)] px-4 py-3">
              <p className="card-label">Återbetalas</p>
              <p className="mt-1 text-[17px] font-extrabold tabular-nums">{formatCurrency(remainingRefundAmount)}</p>
            </div>
          )}

          <Field label="Anledning">
            <Select value={refundReasonKey} onChange={(event) => setRefundReasonKey(event.target.value)}>
              <option value="">Välj anledning…</option>
              {REFUND_REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </Select>
          </Field>

          {refundReasonKey ? (
            <Field label={refundReasonKey === "other" ? "Beskriv anledningen" : "Intern notering"} optional={refundReasonKey !== "other"}>
              <Textarea
                value={refundReasonExtra}
                onChange={(event) => setRefundReasonExtra(event.target.value)}
                placeholder={refundReasonKey === "other" ? "Beskriv anledningen" : "Lägg till en intern notering"}
              />
            </Field>
          ) : null}

          <div className="flex flex-col-reverse gap-2.5 pt-1 sm:flex-row">
            <Button variant="secondary" className="w-full flex-1" onClick={() => setShowRefund(false)} disabled={refundMutation.isPending}>
              Avbryt
            </Button>
            <Button
              variant="danger"
              className="w-full flex-[1.4]"
              onClick={() => {
                const amountKr = refundMode === "partial" ? partialRefundAmount : null;
                if (refundMode === "partial" && (amountKr === null || partialRefundError)) return;
                setRefundFeedback(null);
                setRefundError(null);
                setPendingConfirmation({ kind: "refund", amountKr });
              }}
              disabled={refundMutation.isPending || Boolean(partialRefundError)}
            >
              <ReceiptText size={16} />
              {refundMode === "partial" && partialRefundAmount !== null
                ? `Återbetala ${formatCurrency(partialRefundAmount)}`
                : `Återbetala ${formatCurrency(remainingRefundAmount)}`}
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>

    {/* Lightbox: förstorat leveransfoto. */}
    <Modal open={proofZoom} onClose={() => setProofZoom(false)} size="lg" title="Leveransfoto">
      {order?.courier?.proofPhotoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={order.courier.proofPhotoUrl} alt="Leveransfoto" className="max-h-[72vh] w-full rounded-xl object-contain" />
      )}
    </Modal>

    <ConfirmDialog
      open={pendingConfirmation !== null}
      title="Bekräfta återbetalning"
      description={pendingConfirmation && order
        ? `Återbetala ${formatCurrency(pendingConfirmation.amountKr ?? Math.max(0, order.total - Number(order.refundAmount || 0)))} för order ${order.orderNumber}${refundReason ? ` · ${refundReason}` : ""}.`
        : undefined}
      confirmLabel="Skicka återbetalning"
      danger
      loading={refundMutation.isPending}
      onClose={() => {
        if (!refundMutation.isPending) setPendingConfirmation(null);
      }}
      onConfirm={() => {
        if (pendingConfirmation) {
          refundMutation.mutate(pendingConfirmation.amountKr);
        }
      }}
    />
    </>
  );
}

const LIVE_STATUSES = ["PENDING", "ACCEPTED", "PREPARING", "READY", "DELIVERING"];

const MONO = "font-[ui-monospace,Menlo,monospace]";
// Delad kolumnmall för header + rader (Order · Restaurang · Kund · Status · Tid · Åtgärd).
const ORDERS_GRID = "80px 1.3fr 1.1fr 1fr 0.8fr 130px";

// Statusbricka för listan. "På väg" (DELIVERING) använder den orange accent-tonen
// (badge-accent) per designen; övriga går via den semantiska tabellen i orderStatusTone.
function StatusBadge({ status, isPickup = false, paymentStatus }: { status: string; isPickup?: boolean; paymentStatus?: string | null }) {
  const refund = refundBadge(paymentStatus);
  if (refund) return <Badge tone={refund.tone}>{refund.label}</Badge>;
  if (status === "DELIVERING") {
    return <span className="badge badge-accent">{orderStatusLabel(status)}</span>;
  }
  const label = status === "DELIVERED" && isPickup ? "Hämtad" : orderStatusLabel(status);
  return <Badge tone={orderStatusTone(status) as "success" | "danger" | "warning" | "info" | "neutral"}>{label}</Badge>;
}

type OrderRowProps = {
  order: AdminOrder;
  nowMs: number;
  isAdvancing: boolean;
  onOpen: (id: string) => void;
  onOpenCustomer: (userId: string) => void;
  onAdvance: (order: AdminOrder, nextStatus: string) => void;
};

// Memo-iserad orderrad. Vid 70 ordrar var listan trög för att VARJE rad
// renderades om på 30s-ticken (nowMs). Slutförda rader hoppar över ticken
// eftersom tid-i-status bara visas för liveordrar.
function OrderRowBase({ order, nowMs, isAdvancing, onOpen, onOpenCustomer, onAdvance }: OrderRowProps) {
  const isLive = LIVE_STATUSES.includes(order.status);
  const isDelivery = order.type === "DELIVERY";
  const tis = isLive ? formatTimeInStatus(order, nowMs) : null;
  const next = nextAction(order.status, isDelivery);
  const isPending = order.status === "PENDING";
  const isLate = tis?.tone === "danger";
  const channelLabel = order.channel === "PARTNER_EMBED"
    ? "Privat embed"
    : order.channel === "VIAEATS_APP"
      ? "viaeats app"
      : order.channel === "VIAEATS_WEB"
        ? "viaeats webb"
        : null;

  const renderAction = () => {
    if (isPending && next) {
      return (
        <Button
          variant="primary"
          className="h-auto px-3 py-1.5 text-[12px]"
          loading={isAdvancing}
          onClick={(e) => { e.stopPropagation(); onAdvance(order, next.status); }}
        >
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
          loading={isAdvancing}
          onClick={(e) => { e.stopPropagation(); onAdvance(order, next.status); }}
        >
          Klar
        </Button>
      );
    }
    return <span className="text-[12px] font-bold text-[var(--text-secondary)]">Detaljer ›</span>;
  };

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpen(order.id)}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(order.id); }
        }}
        className={`order-card hidden items-center gap-3 px-[18px] py-[13px] text-[13px] lg:grid${isPending ? " is-pending" : ""}`}
        style={{ gridTemplateColumns: ORDERS_GRID }}
      >
        <div className="flex min-w-0 items-center gap-2">
          {isLive ? <span className="live-dot" aria-hidden /> : null}
          <span className={`${MONO} truncate text-[12px] font-bold text-[var(--text-primary)]`}>{order.orderNumber}</span>
        </div>

        <span className="min-w-0">
          <span className="block truncate font-semibold text-[var(--text-primary)]">{order.restaurantName || "—"}</span>
          {channelLabel ? <span className="block truncate text-[10.5px] font-semibold text-[var(--text-muted)]">{channelLabel}</span> : null}
        </span>

        {order.userId ? (
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); onOpenCustomer(order.userId!); }}
            className="truncate text-left text-[var(--text-secondary)] transition-colors hover:text-[var(--accent-strong)]"
          >
            {order.customerName}
          </button>
        ) : (
          <span className="truncate text-[var(--text-secondary)]">{order.customerName}</span>
        )}

        <span className="min-w-0"><StatusBadge status={order.status} isPickup={!isDelivery} paymentStatus={order.paymentStatus} /></span>

        <div className="min-w-0">
          {order.scheduledFor ? (
            <>
              <span className="flex items-center gap-1 text-[11px] font-extrabold text-[var(--warning-text)]"><CalendarClock size={12} /> Förbeställd</span>
              <time className="mt-0.5 block truncate text-[11px] font-semibold text-[var(--text-secondary)]" dateTime={order.scheduledFor}>{formatDateTime(order.scheduledFor)}</time>
              {isLive && tis ? <span className="mt-0.5 block text-[10.5px] text-[var(--text-muted)]">{tis.label} i status</span> : null}
            </>
          ) : (
            <span className="truncate" style={isLate ? { color: "var(--danger)", fontWeight: 700 } : { color: "var(--text-muted)" }}>
              {isLive && tis ? tis.label : formatDateTime(order.createdAt)}
            </span>
          )}
        </div>

        <div className="flex items-center justify-end">{renderAction()}</div>
      </div>

      <article
        role="button"
        tabIndex={0}
        onClick={() => onOpen(order.id)}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(order.id); }
        }}
        className={`order-card px-4 py-3 lg:hidden${isPending ? " is-pending" : ""}`}
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {isLive ? <span className="live-dot" aria-hidden /> : null}
              <span className={`${MONO} text-[11.5px] font-bold text-[var(--text-primary)]`}>{order.orderNumber}</span>
              <span className="text-[11px] text-[var(--text-muted)]">{orderTypeLabel(order.type)}</span>
              {channelLabel ? <Badge tone={order.channel === "PARTNER_EMBED" ? "info" : "neutral"}>{channelLabel}</Badge> : null}
              {order.scheduledFor ? <Badge tone="warning">Förbeställd</Badge> : null}
            </div>
            <div className="mt-1.5 flex min-w-0 items-baseline gap-2">
              <p className="truncate text-[13.5px] font-bold text-[var(--text-primary)]">{order.restaurantName || "Okänd restaurang"}</p>
              <span className="shrink-0 text-[12px] font-extrabold tabular-nums text-[var(--text-primary)]">{formatCurrency(order.total)}</span>
            </div>
              {order.userId ? (
                <button
                  type="button"
                  onClick={(event) => { event.stopPropagation(); onOpenCustomer(order.userId!); }}
                  className="mt-0.5 max-w-full truncate text-left text-[12px] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                >
                  {order.customerName}
                </button>
              ) : (
                <p className="mt-0.5 truncate text-[12px] text-[var(--text-secondary)]">{order.customerName}</p>
              )}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-muted)]">
              <span style={isLate ? { color: "var(--danger)", fontWeight: 700 } : undefined}>
                {isLive && tis ? `${tis.label} i status` : formatDateTime(order.createdAt)}
              </span>
              {orderTipAmount(order) > 0 ? <span>{formatCurrency(orderTipAmount(order))} dricks</span> : null}
            </div>
          </div>
          <div className="flex min-w-[92px] flex-col items-end gap-2">
            <StatusBadge status={order.status} isPickup={!isDelivery} paymentStatus={order.paymentStatus} />
            {renderAction()}
          </div>
        </div>
      </article>
    </>
  );
}

const OrderRow = memo(OrderRowBase, (a, b) =>
  a.order === b.order &&
  a.isAdvancing === b.isAdvancing &&
  a.onOpen === b.onOpen &&
  a.onOpenCustomer === b.onOpenCustomer &&
  a.onAdvance === b.onAdvance &&
  // nowMs påverkar bara live-ordrar (tid-i-status-badgen) → slutförda rader
  // behöver inte renderas om vid varje 30s-tick.
  (LIVE_STATUSES.includes(a.order.status) ? a.nowMs === b.nowMs : true),
);

export function OrdersPage() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<(typeof statusOptions)[number]>("ALL");
  // Djuplänkar från Cmd+K: ?q= förifyller söket, ?order= öppnar ordermodalen.
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [page, setPage] = useState(1);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(searchParams.get("order"));
  const [activeCustomerId, setActiveCustomerId] = useState<string | null>(null);

  // Tick `nowMs` every 30s so the "time in status" badge updates without
  // refetching. Cheap — just a state bump.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const changeStatus = useCallback((nextStatus: (typeof statusOptions)[number]) => {
    setStatus(nextStatus);
    setPage(1);
  }, []);

  const orders = useQuery({
    queryKey: ordersQueryKey(status, page, ORDERS_PAGE_SIZE),
    queryFn: () => getOrders(status, page, ORDERS_PAGE_SIZE),
    // Realtid sköts av RealtimeSync (socket: order:new/order:updated → invalidate).
    // Pollen är bara en fallback om en socket-händelse missas → 20s räcker och
    // halverar den redundanta DB-lasten jämfört med 10s.
    refetchInterval: 20_000,
  });

  const totalPages = orders.data ? Math.max(1, Math.ceil(orders.data.total / ORDERS_PAGE_SIZE)) : 1;

  // Inline statusframflyttning (Acceptera/Klar) — återanvänder updateOrderStatus,
  // samma endpoint som orderdetalj-modalen. Ingen ny logik.
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const advanceMutation = useMutation({
    meta: { successMessage: "Orderstatus uppdaterad", errorMessage: "Kunde inte uppdatera orderstatus" },
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

  // Flikräknare härleds ur den laddade listan. När ett statusfilter är aktivt
  // returnerar API:t bara den statusen, så räknarna visar vad som faktiskt är laddat.
  const statusCount = (s: (typeof statusOptions)[number]) =>
    s === "ALL" ? loadedOrders.length : loadedOrders.filter((o) => o.status === s).length;
  const statusTabs = statusOptions.map((item) => ({
    value: item,
    label: `${item === "ALL" ? "Alla" : orderStatusLabel(item)} ${formatNumber(statusCount(item))}`,
  }));

  return (
    <div className="page-stack">
      <PageHeader
        breadcrumb="Drift"
        title="Ordrar"
        actions={
          <>
            <Badge tone="success">{formatNumber(liveCount)} live</Badge>
            <Button variant="secondary" loading={orders.isFetching} onClick={() => void orders.refetch()}>
              {!orders.isFetching ? <RefreshCw size={14} /> : null} Uppdatera
            </Button>
          </>
        }
      />

      {/* Sök + statusfilter */}
      <div className="grid gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xl">
            <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input className="input-with-leading-icon" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Sök order, kund, telefon, restaurang" />
          </div>
          <span className="shrink-0 text-[12px] font-semibold text-[var(--text-muted)]">{formatNumber(filteredOrders.length)} visade</span>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          {statusTabs.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => changeStatus(item.value)}
              className={`chip shrink-0${status === item.value ? " is-active" : ""}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {filteredOrders.length === 0 ? (
        <Surface className="px-6 py-6"><EmptyState title="Inga ordrar i den här vyn" /></Surface>
      ) : (
        <>
        <div className="grid gap-2">
          {filteredOrders.map((order) => (
            <OrderRow
              key={order.id}
              order={order}
              nowMs={nowMs}
              isAdvancing={advancingId === order.id}
              onOpen={openOrder}
              onOpenCustomer={openCustomer}
              onAdvance={advanceOrder}
            />
          ))}
        </div>

        {/* Pagination — bara om mer än en sida */}
        {totalPages > 1 && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-[var(--text-secondary)]">
              Sida <strong>{page}</strong> av <strong>{totalPages}</strong> ({orders.data.total} ordrar totalt)
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                className="flex-1 sm:flex-none"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || orders.isFetching}
              >
                Föregående
              </Button>
              <Button
                variant="secondary"
                className="flex-1 sm:flex-none"
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
