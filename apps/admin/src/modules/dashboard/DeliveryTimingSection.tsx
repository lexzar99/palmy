"use client";

import { Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Clock3, Flame } from "lucide-react";
import {
  deliveryTimingQueryKey,
  getDeliveryTiming,
  getTimingOverview,
  timingOverviewQueryKey,
  type DeliveryTimingRestaurantRow,
} from "@/modules/dashboard/api";
import { Surface } from "@/shared/components/ui";

// Leveranstider i översikten — internt underlag, visas aldrig för kund.
// Tre sektioner i navy/orange-temat: belastning just nu, lovat vs faktiskt
// per restaurang, och belastningens rytm per dag & timme (heatmap).

const DAY_LABELS = ["Sön", "Mån", "Tis", "Ons", "Tor", "Fre", "Lör"];
// Måndag först i svensk läsordning; index = dayOfWeek (0=söndag).
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function pressureColor(pressure: DeliveryTimingRestaurantRow["pressure"]): string {
  if (pressure === "HIGH") return "var(--danger)";
  if (pressure === "MEDIUM") return "#E1A70D";
  return "var(--success)";
}

function minText(value: number | null | undefined): string {
  return value == null ? "–" : `${Math.round(value)} min`;
}

function LoadNowCard({ rows }: { rows: DeliveryTimingRestaurantRow[] }) {
  const sorted = [...rows].sort((a, b) => b.activeOrders - a.activeOrders);
  const maxActive = Math.max(1, ...sorted.map((r) => r.activeOrders));
  return (
    <section className="hero-card flex flex-col xl:col-span-5" style={{ padding: "20px" }}>
      <div className="mb-4 flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-[10px]" style={{ backgroundColor: "rgba(254,247,240,0.12)" }}>
          <Activity size={15} />
        </span>
        <div>
          <h2 className="text-[15px] font-extrabold tracking-tight">Belastning just nu</h2>
          <p className="text-[11.5px] font-semibold" style={{ color: "var(--text-muted)" }}>
            Aktiva ordrar per restaurang · uppdateras var 5:e minut
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {sorted.map((row) => {
          const color = pressureColor(row.pressure);
          return (
            <div key={row.restaurantId}>
              <div className="mb-1 flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-[13px] font-bold">{row.name}</span>
                <span className="flex flex-none items-center gap-1.5 text-[12px] font-extrabold" style={{ color: row.highLoad ? "var(--brand-orange)" : "#ffffff" }}>
                  {row.highLoad ? <Flame size={12} aria-hidden /> : null}
                  {row.activeOrders} aktiva
                </span>
              </div>
              <div className="h-[6px] overflow-hidden rounded-full" style={{ backgroundColor: "rgba(254,247,240,0.14)" }}>
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${Math.max(4, (row.activeOrders / maxActive) * 100)}%`,
                    backgroundColor: row.highLoad ? "var(--brand-orange)" : color,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-auto pt-4 text-[10.5px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--text-muted)" }}>
        <span className="mr-3 inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: "var(--success)" }} /> Lugnt &lt;3</span>
        <span className="mr-3 inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: "#E1A70D" }} /> Tryck 3–5</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: "var(--brand-orange)" }} /> Hög ≥6</span>
      </p>
    </section>
  );
}

function EtaCard({ rows }: { rows: DeliveryTimingRestaurantRow[] }) {
  const withData = rows.filter((r) => r.actualP50Min != null || r.promisedAvgMin != null);
  const maxMin = Math.max(30, ...withData.flatMap((r) => [r.promisedAvgMin ?? 0, r.actualP50Min ?? 0]));
  return (
    <Surface className="flex flex-col px-5 py-5 xl:col-span-7">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[var(--brand-navy-soft)] text-[var(--brand-navy-ink)]">
          <Clock3 size={15} />
        </span>
        <div>
          <h2 className="section-title">ETA per restaurang</h2>
          <p className="section-subtitle">Lovat snitt vs faktiskt (mottagen → levererad, p50) · grönt = snabbare än lovat</p>
        </div>
      </div>
      {withData.length === 0 ? (
        <p className="section-subtitle">Ingen leveransdata ännu — den byggs order för order.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {withData.map((row) => {
            const diff = row.promisedAvgMin != null && row.actualP50Min != null
              ? Math.round(row.actualP50Min - row.promisedAvgMin)
              : null;
            const faster = diff != null && diff <= 0;
            const thin = row.samples < 30;
            return (
              <div key={row.restaurantId}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-[13px] font-bold text-[var(--text-primary)]">
                    {row.name}
                    {thin ? <span className="ml-1.5 text-[10.5px] font-extrabold text-[var(--text-muted)]">FÖR LITE DATA · {row.samples}</span> : null}
                  </span>
                  {diff != null ? (
                    <span
                      className="flex-none rounded-full px-2 py-0.5 text-[11px] font-extrabold"
                      style={{
                        backgroundColor: faster ? "var(--success-soft)" : "var(--brand-orange-soft)",
                        color: faster ? "var(--success-text)" : "var(--brand-orange-ink)",
                      }}
                    >
                      {faster ? `${diff} min snabbare` : `+${diff} min över löftet`}
                    </span>
                  ) : null}
                </div>
                <div className="grid gap-1">
                  <div className="flex items-center gap-2.5">
                    <span className="w-[64px] flex-none text-[10.5px] font-extrabold uppercase tracking-wide text-[var(--text-muted)]">Lovar</span>
                    <div className="progress-track flex-1">
                      <div className="h-full rounded-full bg-[var(--brand-navy-bar)]" style={{ width: `${Math.max(3, ((row.promisedAvgMin ?? 0) / maxMin) * 100)}%` }} />
                    </div>
                    <span className="w-[58px] flex-none text-right text-[12px] font-bold text-[var(--text-secondary)]">{minText(row.promisedAvgMin)}</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="w-[64px] flex-none text-[10.5px] font-extrabold uppercase tracking-wide text-[var(--text-muted)]">Levererar</span>
                    <div className="progress-track flex-1">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max(3, ((row.actualP50Min ?? 0) / maxMin) * 100)}%`,
                          backgroundColor: faster ? "var(--success)" : "var(--brand-orange)",
                        }}
                      />
                    </div>
                    <span className="w-[58px] flex-none text-right text-[12px] font-bold text-[var(--text-primary)]">{minText(row.actualP50Min)}</span>
                  </div>
                </div>
                <p className="mt-1 text-[11px] font-semibold text-[var(--text-muted)]">
                  p95 {minText(row.actualP95Min)} · accept→på väg {minText(row.acceptToOnWayP50Min)} · på väg→levererad {minText(row.onWayToDeliveredP50Min)}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </Surface>
  );
}

function Heatmap({ buckets, totalRows }: {
  buckets: Array<{ dayOfWeek: number; hourOfDay: number; orders: number; totalMinP50: number | null }>;
  totalRows: number;
}) {
  const hoursWithData = buckets.map((b) => b.hourOfDay);
  const minHour = Math.min(9, ...(hoursWithData.length ? hoursWithData : [9]));
  const maxHour = Math.max(22, ...(hoursWithData.length ? hoursWithData : [22]));
  const hours: number[] = [];
  for (let h = minHour; h <= maxHour; h += 1) hours.push(h);
  const byKey = new Map(buckets.map((b) => [`${b.dayOfWeek}:${b.hourOfDay}`, b]));
  const maxOrders = Math.max(1, ...buckets.map((b) => b.orders));

  return (
    <Surface className="px-5 py-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="section-title">Belastning per dag &amp; tid</h2>
          <p className="section-subtitle">
            Ordervolym (färg) och p50-leveranstid per timme · svensk tid · {totalRows} levererade ordrar i underlaget
          </p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          <div className="grid gap-[3px]" style={{ gridTemplateColumns: `44px repeat(${hours.length}, minmax(0, 1fr))` }}>
            <span aria-hidden />
            {hours.map((hour) => (
              <span key={hour} className="text-center text-[10px] font-extrabold text-[var(--text-muted)]">
                {String(hour).padStart(2, "0")}
              </span>
            ))}
            {DAY_ORDER.map((day) => (
              <Fragment key={day}>
                <span className="flex items-center text-[11px] font-extrabold text-[var(--text-secondary)]">
                  {DAY_LABELS[day]}
                </span>
                {hours.map((hour) => {
                  const bucket = byKey.get(`${day}:${hour}`);
                  const intensity = bucket ? bucket.orders / maxOrders : 0;
                  return (
                    <div
                      key={`${day}-${hour}`}
                      className="h-[26px] rounded-[6px]"
                      title={bucket
                        ? `${DAY_LABELS[day]} ${String(hour).padStart(2, "0")}:00 · ${bucket.orders} ordrar · p50 ${bucket.totalMinP50 != null ? `${Math.round(bucket.totalMinP50)} min` : "–"}`
                        : `${DAY_LABELS[day]} ${String(hour).padStart(2, "0")}:00 · inga ordrar`}
                      style={{
                        backgroundColor: bucket
                          ? `color-mix(in srgb, var(--brand-orange) ${Math.round(12 + intensity * 78)}%, var(--brand-cream))`
                          : "var(--brand-navy-soft)",
                      }}
                    >
                      {bucket && intensity >= 0.55 ? (
                        <span className="grid h-full w-full place-items-center text-[9.5px] font-extrabold text-white">
                          {bucket.orders}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-3 text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
        Ljus = få ordrar · mörk orange = rusning · hovra för p50 per timme
      </p>
    </Surface>
  );
}

export function DeliveryTimingSection() {
  const timing = useQuery({
    queryKey: deliveryTimingQueryKey,
    queryFn: getDeliveryTiming,
    refetchInterval: 300_000,
  });
  const overview = useQuery({
    queryKey: timingOverviewQueryKey,
    queryFn: getTimingOverview,
    refetchInterval: 300_000,
  });

  if (!timing.data) return null;
  const rows = timing.data.restaurants;

  return (
    <div className="page-stack" style={{ gap: 16 }}>
      <div className="grid gap-4 xl:grid-cols-12">
        <LoadNowCard rows={rows} />
        <EtaCard rows={rows} />
      </div>
      {overview.data ? <Heatmap buckets={overview.data.byDayHour} totalRows={overview.data.totalRows} /> : null}
    </div>
  );
}
