"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bike, Car, Download } from "lucide-react";
import {
  courierDeliveriesQueryKey,
  courierDetailQueryKey,
  getCourierDeliveries,
  getCourierDetail,
  revokeCourier,
  type CourierDeliveryExportRow,
} from "@/modules/couriers/api";
import { OrderDetailsModal } from "@/modules/orders/page";
import { Badge, Button, EmptyState, ErrorPanel, Input, LoadingPanel, MetricCard, PageHeader, Surface, Tabs } from "@/shared/components/ui";
import { formatCurrency, formatDateTime } from "@/shared/utils/format";

type Tab = "info" | "orders" | "login" | "stats";

type PeriodKey = "all" | "today" | "7d" | "30d" | "custom";

const PERIODS: { value: PeriodKey; label: string }[] = [
  { value: "all", label: "Alla" },
  { value: "today", label: "Idag" },
  { value: "7d", label: "7 dagar" },
  { value: "30d", label: "30 dagar" },
  { value: "custom", label: "Eget" },
];

// {from,to} (ISO) för vald period. Presets snäpps till midnatt så query-nyckeln
// är stabil inom dygnet (annars refetch-loop varje render). Öppet uppåt = nu.
function rangeFor(period: PeriodKey, customFrom: string, customTo: string): { from?: string; to?: string } {
  if (period === "custom") {
    return {
      from: customFrom ? new Date(customFrom).toISOString() : undefined,
      to: customTo ? new Date(customTo).toISOString() : undefined,
    };
  }
  if (period === "all") return {};
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysBack = period === "today" ? 0 : period === "7d" ? 6 : 29;
  return { from: new Date(midnight.getTime() - daysBack * 864e5).toISOString() };
}

// CSV för Excel: semikolon-separerat, UTF-8 BOM, CRLF, svenskt decimalkomma.
function exportDeliveriesCsv(rows: CourierDeliveryExportRow[], courierName: string) {
  const esc = (v: string | number | null | undefined) => `"${(v == null ? "" : String(v)).replace(/"/g, '""')}"`;
  const kr = (n: number) => n.toFixed(2).replace(".", ",");
  const dt = (s: string | null) => (s ? new Date(s).toLocaleString("sv-SE") : "");
  const header = ["Ordernr", "Restaurang", "Status", "Distans (km)", "km-pris (kr)", "Utbetalning (kr)", "Dricks (kr)", "Accepterad", "Hämtad", "Levererad"];
  const lines = rows.map((d) => [
    d.orderNumber ?? "",
    d.restaurantName ?? "",
    d.status,
    kr(d.distanceKm),
    kr(d.ratePerKm),
    kr(d.payout),
    kr(d.tip),
    dt(d.acceptedAt),
    dt(d.pickedUpAt),
    dt(d.deliveredAt),
  ]);
  const csv = [header, ...lines].map((r) => r.map(esc).join(";")).join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `kurir-${courierName.replace(/\s+/g, "-").toLowerCase()}-leveranser.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const fmtMin = (m: number | null | undefined) =>
  m == null ? "–" : m < 60 ? `${Math.round(m)} min` : `${Math.floor(m / 60)}h ${Math.round(m % 60)}m`;

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
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  // Vald order → öppnar order-modalen (samma som på order-sidan).
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);

  const q = useQuery({ queryKey: courierDetailQueryKey(id), queryFn: () => getCourierDetail(id) });
  const revoke = useMutation({
    mutationFn: () => revokeCourier(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: courierDetailQueryKey(id) }),
  });

  // Utbetalningsunderlag: levererade ordrar i valt intervall (ingen 50-tak).
  const range = rangeFor(period, customFrom, customTo);
  const deliveriesQ = useQuery({
    queryKey: courierDeliveriesQueryKey(id, range.from ?? "", range.to ?? "", "DELIVERED"),
    queryFn: () => getCourierDeliveries(id, { ...range, status: "DELIVERED" }),
    enabled: tab === "orders",
  });

  if (q.isLoading) return <LoadingPanel label="Laddar kurir…" />;
  if (q.isError || !q.data)
    return <ErrorPanel title="Kunde inte ladda kurir" action={<Button onClick={() => router.push("/couriers")}>Till kurirer</Button>} />;

  const { profile, session, stats, deliveries } = q.data;
  const Vehicle = profile.vehicle === "CAR" ? Car : Bike;
  // Stats-fliken visar all-time-prestanda från detaljvyns inbäddade lista.
  const completed = deliveries.filter((d) => d.status === "DELIVERED");
  // Order-fliken: levererade i valt intervall (från det dedikerade endpointet).
  const rows = deliveriesQ.data?.deliveries ?? [];

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
          {/* Utbetalningsunderlag: välj period (eller eget intervall) → exportera. */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
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
            <Button
              variant="secondary"
              disabled={rows.length === 0}
              onClick={() => exportDeliveriesCsv(rows, profile.name)}
            >
              <Download size={14} /> Exportera (Excel)
            </Button>
          </div>

          {period === "custom" && (
            <div className="mb-4 flex flex-wrap items-end gap-3">
              <label className="text-xs font-bold text-[var(--text-muted)]">
                Från
                <Input type="datetime-local" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="mt-1" />
              </label>
              <label className="text-xs font-bold text-[var(--text-muted)]">
                Till
                <Input type="datetime-local" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="mt-1" />
              </label>
            </div>
          )}

          {/* Summering för urvalet — direkt utbetalningsbelopp. */}
          <p className="mb-4 text-sm text-[var(--text-secondary)]">
            <span className="font-bold text-[var(--text-primary)]">{deliveriesQ.data?.total ?? 0}</span> levererade ·{" "}
            <span className="font-bold text-[var(--text-primary)]">{formatCurrency(deliveriesQ.data?.payoutSum ?? 0)}</span> att betala ut
          </p>

          {deliveriesQ.isLoading ? (
            <LoadingPanel label="Laddar leveranser…" />
          ) : rows.length === 0 ? (
            <EmptyState title="Inga levererade ordrar i vald period" />
          ) : (
            <div className="table-shell">
              <table className="data-table">
                <thead>
                  <tr><th>Order</th><th>Restaurang</th><th>Distans</th><th>km-pris</th><th>Utbetalt</th><th>Levererad</th></tr>
                </thead>
                <tbody>
                  {rows.map((d) => (
                    <tr
                      key={d.id}
                      onClick={() => d.orderId && setActiveOrderId(d.orderId)}
                      className={d.orderId ? "cursor-pointer transition-colors hover:bg-[var(--surface-hover,rgba(17,17,19,0.03))]" : ""}
                      title={d.orderId ? "Öppna order" : undefined}
                    >
                      <td className="font-bold">{d.orderNumber ? `#${d.orderNumber}` : "–"}</td>
                      <td>{d.restaurantName || "–"}</td>
                      <td className="tabular-nums">{d.distanceKm.toFixed(1)} km</td>
                      <td className="tabular-nums">{formatCurrency(d.ratePerKm)}/km</td>
                      <td className="tabular-nums">{formatCurrency(d.payout)}</td>
                      <td className="text-[var(--text-muted)]">{d.deliveredAt ? formatDateTime(d.deliveredAt) : "–"}</td>
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
