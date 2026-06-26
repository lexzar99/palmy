"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bike, Car, Download } from "lucide-react";
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

  // Profil-hjälpare för hero-kortet.
  const initials = profile.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  const vehicleLabel = profile.vehicle === "CAR" ? "Bil" : "Cykel";
  // "{phone} · {fordon} · {zon}" — zon = stad (närmaste fält i datan).
  const subtitle = [profile.phone || null, vehicleLabel, profile.city || null].filter(Boolean).join(" · ");
  // Aktiv order = en accepterad men ej levererad leverans (härlett, ej fabricerat).
  const activeDelivery = deliveries.find((d) => d.status !== "DELIVERED" && d.acceptedAt && !d.deliveredAt) ?? null;
  const hasPosition = session.currentLat != null && session.currentLng != null;

  return (
    <div className="page-stack">
      <PageHeader
        title={profile.name}
        breadcrumb="Drift / Kurirer"
        onBack={() => router.push("/couriers")}
        actions={
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[11.5px] font-extrabold ${
                session.online
                  ? "bg-[var(--success-soft)] text-[var(--success-text)]"
                  : "bg-[var(--bg-page)] text-[var(--text-muted)]"
              }`}
            >
              <span
                className="inline-block h-[7px] w-[7px] rounded-full"
                style={{ background: session.online ? "var(--success)" : "var(--text-muted)" }}
              />
              {session.online ? "Online" : "Offline"}
            </span>
            <Badge tone={profile.isActive ? "success" : "neutral"}>{profile.isActive ? "Aktiv" : "Inaktiv"}</Badge>
          </div>
        }
      />

      {/* Hero: profil + aktiv order (vänster) · live-position (höger). */}
      <div className="grid gap-3.5 lg:grid-cols-[1fr_1.25fr]">
        <div className="flex flex-col gap-3.5">
          {/* Profilkort */}
          <Surface className="p-5">
            <div className="flex items-center gap-3.5">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--text-primary)] text-base font-extrabold text-[var(--bg-panel)]">
                {initials || "–"}
              </span>
              <div className="min-w-0">
                <div className="truncate text-base font-extrabold tracking-[-0.3px] text-[var(--text-primary)]">{profile.name}</div>
                <div className="mt-0.5 truncate text-xs text-[var(--text-muted)]">{subtitle}</div>
              </div>
            </div>
            <div className="mt-4 flex gap-2.5">
              {[
                { label: "Betyg", value: "–" }, // betygsfält saknas i datan
                { label: "Idag", value: String(stats.todayDeliveries) },
                { label: "Totalt", value: String(stats.totalDeliveries) },
              ].map((tile) => (
                <div key={tile.label} className="flex-1 rounded-xl bg-[var(--bg-page)] p-2.5 text-center">
                  <div className="text-[19px] font-extrabold leading-none text-[var(--text-primary)]">{tile.value}</div>
                  <div className="mt-1 text-[11px] font-semibold text-[var(--text-muted)]">{tile.label}</div>
                </div>
              ))}
            </div>
          </Surface>

          {/* Aktiv order — bara när en pågående leverans finns. */}
          {activeDelivery && (
            <Surface className="px-[18px] py-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-[var(--text-muted)]">Aktiv order</span>
                <span className="text-xs font-bold text-[var(--text-primary)]" style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>
                  {activeDelivery.orderNumber ? `#${activeDelivery.orderNumber}` : "–"}
                </span>
              </div>
              <div className="mt-2.5 text-[13.5px] font-bold text-[var(--text-primary)]">
                {activeDelivery.restaurantName || "–"}
              </div>
              <div className="relative mt-3 h-2 overflow-hidden rounded-full" style={{ background: "#F0F0EC" }}>
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ width: "68%", background: "linear-gradient(90deg,#F0531C,#FB7A4A)" }}
                />
              </div>
              <div className="mt-2 text-xs font-semibold text-[var(--text-secondary)]">
                {activeDelivery.pickedUpAt ? "På väg till kund" : "På väg till hämtning"}
              </div>
            </Surface>
          )}
        </div>

        {/* Live position — stylad platshållarkarta (ingen kartberoende i panelen). */}
        <Surface className="relative overflow-hidden p-0">
          <span className="absolute left-3.5 top-3.5 z-[2] inline-flex items-center gap-1.5 rounded-full bg-[var(--bg-panel)] px-3 py-1.5 text-[11.5px] font-extrabold text-[var(--text-primary)] shadow-[0_2px_8px_rgba(0,0,0,0.12)]">
            <span className="inline-block h-[7px] w-[7px] rounded-full" style={{ background: "var(--success)" }} />
            Live position
          </span>
          <div
            className="relative h-full min-h-[380px]"
            style={{
              background: "#E7EAE6",
              backgroundImage:
                "linear-gradient(rgba(17,17,19,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(17,17,19,.05) 1px,transparent 1px)",
              backgroundSize: "32px 32px",
            }}
          >
            <div className="absolute left-0 right-0 h-[13px]" style={{ top: "46%", background: "rgba(17,17,19,.05)" }} />
            <div className="absolute bottom-0 top-0 w-[13px]" style={{ left: "32%", background: "rgba(17,17,19,.05)" }} />
            <svg width="100%" height="100%" viewBox="0 0 480 400" preserveAspectRatio="none" className="absolute inset-0">
              <path d="M90 320 C 180 280, 160 150, 320 120" fill="none" stroke="#F0531C" strokeWidth="5" strokeLinecap="round" strokeDasharray="2 13" />
            </svg>
            {/* Start-prick */}
            <span className="absolute h-[18px] w-[18px] rounded-full border-[5px] border-[#111113] bg-white" style={{ left: 80, top: 308 }} />
            {/* Mål-prick */}
            <span className="absolute h-5 w-5 rounded-full border-[3px] border-white shadow-[0_2px_8px_rgba(0,0,0,.2)]" style={{ left: 312, top: 110, background: "#F0531C" }} />
            {/* Kurir-markör */}
            <span className="absolute flex h-11 w-11 items-center justify-center rounded-full border-4 border-white bg-[#111113] shadow-[0_6px_16px_rgba(0,0,0,.3)]" style={{ left: 198, top: 188 }}>
              <Vehicle size={22} color="#fff" />
            </span>
            {!hasPosition && (
              <span className="absolute bottom-3 right-3 rounded-md bg-[var(--bg-panel)]/90 px-2 py-1 text-[10px] font-semibold text-[var(--text-muted)]">
                Ingen liveposition
              </span>
            )}
          </div>
        </Surface>
      </div>

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
