"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bike, Car } from "lucide-react";
import { courierDetailQueryKey, getCourierDetail, revokeCourier, type CourierDeliveryRow } from "@/modules/couriers/api";
import { OrderDetailsModal } from "@/modules/orders/page";
import { Badge, Button, EmptyState, ErrorPanel, LoadingPanel, MetricCard, PageHeader, Surface, Tabs } from "@/shared/components/ui";
import { formatCurrency, formatDateTime } from "@/shared/utils/format";

type Tab = "info" | "orders" | "login" | "stats";

type PeriodKey = "all" | "today" | "7d" | "30d";

const PERIODS: { value: PeriodKey; label: string }[] = [
  { value: "all", label: "Alla" },
  { value: "today", label: "Idag" },
  { value: "7d", label: "7 dagar" },
  { value: "30d", label: "30 dagar" },
];

// Tidsstämpel att filtrera/sortera leveransen på: levererad om den finns, annars
// accepterad (pågående). Returnerar ms, eller null om inget datum.
const deliveryTime = (d: CourierDeliveryRow): number | null => {
  const raw = d.deliveredAt ?? d.acceptedAt;
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? null : t;
};

// Nedre gräns (ms) för vald period. null = ingen gräns (Alla).
const periodCutoff = (p: PeriodKey): number | null => {
  if (p === "all") return null;
  const now = new Date();
  if (p === "today") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return start.getTime();
  }
  const days = p === "7d" ? 7 : 30;
  return now.getTime() - days * 864e5;
};

const fmtMin = (m: number | null | undefined) =>
  m == null ? "–" : m < 60 ? `${Math.round(m)} min` : `${Math.floor(m / 60)}h ${Math.round(m % 60)}m`;

const deliveryLabel = (s: string) =>
  s === "DELIVERED" ? "Levererad" : s === "PICKED_UP" ? "Hämtad" : s === "EN_ROUTE_PICKUP" ? "På väg" : s === "FAILED" ? "Misslyckad" : s;

const deliveryTone = (s: string): "success" | "info" | "warning" | "danger" | "neutral" =>
  s === "DELIVERED" ? "success" : s === "PICKED_UP" ? "info" : s === "FAILED" ? "danger" : "warning";

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</p>
      <div className="mt-1 text-sm font-medium text-[var(--text-primary)]">{value}</div>
    </div>
  );
}

export function CourierDetailPage({ id }: { id: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("info");
  const [period, setPeriod] = useState<PeriodKey>("all");
  // Vald order → öppnar order-modalen (samma som på order-sidan).
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);

  const q = useQuery({ queryKey: courierDetailQueryKey(id), queryFn: () => getCourierDetail(id) });
  const revoke = useMutation({
    mutationFn: () => revokeCourier(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: courierDetailQueryKey(id) }),
  });

  if (q.isLoading) return <LoadingPanel label="Laddar kurir…" />;
  if (q.isError || !q.data)
    return <ErrorPanel title="Kunde inte ladda kurir" action={<Button onClick={() => router.push("/couriers")}>Till kurirer</Button>} />;

  const { profile, session, stats, deliveries } = q.data;
  const Vehicle = profile.vehicle === "CAR" ? Car : Bike;
  // Stats-fliken visar all-time-prestanda (oberoende av period-filtret).
  const completed = deliveries.filter((d) => d.status === "DELIVERED");
  // Order-fliken: filtrera + sortera efter vald period (senaste först).
  const cutoff = periodCutoff(period);
  const periodDeliveries = deliveries
    .filter((d) => {
      if (cutoff == null) return true;
      const t = deliveryTime(d);
      return t != null && t >= cutoff;
    })
    .sort((a, b) => (deliveryTime(b) ?? 0) - (deliveryTime(a) ?? 0));
  const periodEarnings = periodDeliveries.reduce((s, d) => s + (d.payout || 0), 0);

  return (
    <div className="page-stack">
      <div>
        <Button variant="secondary" onClick={() => router.push("/couriers")}>
          <ArrowLeft size={15} /> Kurirer
        </Button>
      </div>

      <PageHeader
        title={profile.name}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={session.online ? "success" : "neutral"}>{session.online ? "Online" : "Offline"}</Badge>
            <Badge tone={profile.isActive ? "success" : "neutral"}>{profile.isActive ? "Aktiv" : "Inaktiv"}</Badge>
          </div>
        }
      />

      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: "info", label: "Info" },
          { value: "orders", label: `Ordrar (${deliveries.length})` },
          { value: "login", label: "Inloggning" },
          { value: "stats", label: "Prestanda" },
        ]}
      />

      {tab === "info" && (
        <Surface className="px-6 py-6">
          <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            <InfoRow label="E-post" value={profile.email} />
            <InfoRow label="Telefon" value={profile.phone || "–"} />
            <InfoRow label="Stad" value={profile.city} />
            <InfoRow label="Fordon" value={<span className="inline-flex items-center gap-1.5"><Vehicle size={15} /> {profile.vehicle === "CAR" ? "Bil" : "Cykel"}</span>} />
            <InfoRow label="km-pris" value={`${profile.ratePerKm} kr/km`} />
            <InfoRow label="Registrerad" value={formatDateTime(profile.createdAt)} />
            <InfoRow label="Personnummer" value={profile.personalNumber || "–"} />
            <InfoRow label="Adress" value={profile.address || "–"} />
            <InfoRow label="Utbetalningskonto" value={profile.payoutAccount || "–"} />
          </div>
        </Surface>
      )}

      {tab === "orders" && (
        <Surface className="px-6 py-6">
          {/* Period-filter + summering för vald period. */}
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-full border border-[var(--border-subtle)] p-1">
              {PERIODS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPeriod(p.value)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
                    period === p.value
                      ? "bg-[var(--text-primary)] text-[var(--bg-primary)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="text-sm text-[var(--text-secondary)]">
              <span className="font-bold text-[var(--text-primary)]">{periodDeliveries.length}</span> leveranser ·{" "}
              <span className="font-bold text-[var(--text-primary)]">{formatCurrency(periodEarnings)}</span> utbetalt
            </p>
          </div>
          {periodDeliveries.length === 0 ? (
            <EmptyState title={period === "all" ? "Inga leveranser än" : "Inga leveranser i vald period"} />
          ) : (
            <div className="table-shell">
              <table className="data-table">
                <thead>
                  <tr><th>Order</th><th>Restaurang</th><th>Status</th><th>Hämtning</th><th>Leverans</th><th>Utbetalt</th><th>Datum &amp; tid</th></tr>
                </thead>
                <tbody>
                  {periodDeliveries.map((d) => (
                    <tr
                      key={d.id}
                      onClick={() => d.orderId && setActiveOrderId(d.orderId)}
                      className={d.orderId ? "cursor-pointer transition-colors hover:bg-[var(--surface-hover,rgba(17,17,19,0.03))]" : ""}
                      title={d.orderId ? "Öppna order" : undefined}
                    >
                      <td className="font-bold">{d.orderNumber ? `#${d.orderNumber}` : "–"}</td>
                      <td>{d.restaurantName || "–"}</td>
                      <td><Badge tone={deliveryTone(d.status)}>{deliveryLabel(d.status)}</Badge></td>
                      <td className="tabular-nums">{fmtMin(d.pickupMin)}</td>
                      <td className="tabular-nums">{fmtMin(d.deliverMin)}</td>
                      <td className="tabular-nums">{formatCurrency(d.payout)}</td>
                      <td className="text-[var(--text-muted)]">{d.deliveredAt ? formatDateTime(d.deliveredAt) : d.acceptedAt ? formatDateTime(d.acceptedAt) : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Surface>
      )}

      {tab === "login" && (
        <Surface className="px-6 py-6">
          <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            <InfoRow label="Inloggnings-id (e-post)" value={profile.email} />
            <InfoRow label="Session" value={<Badge tone={session.online ? "success" : "neutral"}>{session.online ? "Online" : "Offline"}</Badge>} />
            <InfoRow label="Pass startat" value={session.sessionStartedAt ? formatDateTime(session.sessionStartedAt) : "–"} />
            <InfoRow label="Senast sedd" value={session.lastSeenAt ? formatDateTime(session.lastSeenAt) : "–"} />
            <InfoRow
              label="Senaste position"
              value={session.currentLat != null && session.currentLng != null ? `${session.currentLat.toFixed(4)}, ${session.currentLng.toFixed(4)}` : "–"}
            />
          </div>
          <div className="mt-6 border-t border-[var(--border-subtle)] pt-5">
            <Button
              variant="danger"
              disabled={revoke.isPending}
              onClick={() => {
                if (window.confirm(`Logga ut ${profile.name} från alla enheter?`)) revoke.mutate();
              }}
            >
              Logga ut alla enheter
            </Button>
            <p className="mt-2 text-xs text-[var(--text-muted)]">Återkallar kurirens session — hen måste logga in i appen igen.</p>
          </div>
        </Surface>
      )}

      {tab === "stats" && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <MetricCard label="Snitt accept → hämtad" value={fmtMin(stats.avgPickupMin)} />
            <MetricCard label="Snitt hämtad → levererad" value={fmtMin(stats.avgDeliverMin)} />
            <MetricCard label="Snitt total tid" value={fmtMin(stats.avgTotalMin)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <MetricCard label="Leveranser totalt" value={String(stats.totalDeliveries)} detail={`${formatCurrency(stats.totalEarnings)} utbetalt`} />
            <MetricCard label="Idag" value={String(stats.todayDeliveries)} detail={formatCurrency(stats.todayEarnings)} />
            <MetricCard label="30 dagar" value={String(stats.last30Deliveries)} detail={formatCurrency(stats.last30Earnings)} />
          </div>
          <Surface className="px-6 py-6">
            <h3 className="section-title text-lg">Tider per leverans</h3>
            <p className="mb-4 mt-1 text-sm text-[var(--text-secondary)]">Hur snabbt kuriren hämtar och levererar — låga tider = snabb kurir.</p>
            {completed.length === 0 ? (
              <EmptyState title="Inga slutförda leveranser än" />
            ) : (
              <div className="table-shell">
                <table className="data-table">
                  <thead>
                    <tr><th>Order</th><th>Accept → hämtad</th><th>Hämtad → levererad</th><th>Datum</th></tr>
                  </thead>
                  <tbody>
                    {completed.map((d) => (
                      <tr
                        key={d.id}
                        onClick={() => d.orderId && setActiveOrderId(d.orderId)}
                        className={d.orderId ? "cursor-pointer transition-colors hover:bg-[var(--surface-hover,rgba(17,17,19,0.03))]" : ""}
                        title={d.orderId ? "Öppna order" : undefined}
                      >
                        <td className="font-bold">{d.orderNumber ? `#${d.orderNumber}` : "–"}</td>
                        <td className="tabular-nums">{fmtMin(d.pickupMin)}</td>
                        <td className="tabular-nums">{fmtMin(d.deliverMin)}</td>
                        <td className="text-[var(--text-muted)]">{d.deliveredAt ? formatDateTime(d.deliveredAt) : "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Surface>
        </>
      )}

      {/* Order-modal — öppnas när man klickar på en leverans (samma modal som
          order-sidan: status, items, kund, återbetalning m.m.). */}
      <OrderDetailsModal
        orderId={activeOrderId}
        open={activeOrderId != null}
        onClose={() => setActiveOrderId(null)}
      />
    </div>
  );
}
