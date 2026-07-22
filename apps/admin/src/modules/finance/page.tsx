"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCw, Search } from "lucide-react";
import { financeSummaryQueryKey, getFinanceSummary } from "@/modules/finance/api";
import { FinanceSettingsPage } from "@/modules/finance/settings-page";
import { TiersPage } from "@/modules/tiers/page";
import { DeliveryModeBadge, deliveryModeMeta } from "@/shared/components/delivery-mode";
import { Badge, Button, EmptyState, ErrorPanel, Field, Input, MetricCard, PageHeader, Select, Surface, Tabs } from "@/shared/components/ui";
import { formatCurrencyExact as formatCurrency, formatNumber } from "@/shared/utils/format";

type ModeFilter = "all" | "platform" | "self";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function presetRange(kind: "month" | "lastMonth" | "7" | "30"): { from: string; to: string } {
  const now = new Date();
  if (kind === "month") return { from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: isoDate(now) };
  if (kind === "lastMonth") {
    const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const e = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: isoDate(s), to: isoDate(e) };
  }
  const s = new Date(now);
  s.setDate(s.getDate() - (kind === "7" ? 6 : 29));
  return { from: isoDate(s), to: isoDate(now) };
}

const STATUS_LABEL: Record<string, string> = { DRAFT: "Utkast", APPROVED: "Godkänd", PAID: "Betald", HOLD: "Pausad" };
const statusTone = (s: string | null): "neutral" | "info" | "success" | "warning" =>
  s === "PAID" ? "success" : s === "APPROVED" ? "info" : s === "HOLD" ? "warning" : "neutral";
const vatLabel = (value: number | null | undefined) =>
  value == null ? "Blandad moms" : `${Number(value).toLocaleString("sv-SE")}%`;

type FinanceTab = "utbetalningar" | "tiers" | "satser";

export function FinancePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: FinanceTab = tabParam === "tiers" || tabParam === "satser" ? tabParam : "utbetalningar";
  const changeTab = (t: FinanceTab) => {
    router.replace(`/finance?tab=${t}`, { scroll: false });
  };
  const init = presetRange("month");
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<ModeFilter>("all");

  const summary = useQuery({ queryKey: financeSummaryQueryKey(from, to), queryFn: () => getFinanceSummary(from, to) });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (summary.data?.rows || []).filter((r) => {
      if (mode === "self" && !r.selfDelivery) return false;
      if (mode === "platform" && r.selfDelivery) return false;
      if (q && !`${r.name} ${r.city || ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [summary.data, query, mode]);

  const setPreset = (kind: "month" | "lastMonth" | "7" | "30") => {
    const r = presetRange(kind);
    setFrom(r.from);
    setTo(r.to);
  };

  const openPayout = (restaurantId: string) =>
    router.push(`/finance/${restaurantId}?from=${from}&to=${to}`);

  const totals = summary.data?.totals;

  return (
    <div className="page-stack">
      <PageHeader breadcrumb="System" title="Ekonomi" />

      <Tabs<FinanceTab>
        value={tab}
        onChange={changeTab}
        options={[
          { value: "utbetalningar", label: "Utbetalningar" },
          { value: "tiers", label: "Tiers" },
          { value: "satser", label: "Provision & moms" },
        ]}
      />

      {tab === "tiers" && <TiersPage embedded />}
      {tab === "satser" && <FinanceSettingsPage embedded />}

      {tab === "utbetalningar" && (<>
      <Surface className="px-6 py-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            {([["month", "Denna månad"], ["lastMonth", "Förra månaden"], ["7", "7 dagar"], ["30", "30 dagar"]] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setPreset(k)}
                className="rounded-full border border-[var(--border-subtle)] px-3.5 py-1.5 text-sm font-semibold transition hover:bg-[var(--accent-soft)]"
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-3">
            <Field label="Från"><Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="Till"><Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
          </div>
        </div>
      </Surface>

      {summary.isError ? (
        <ErrorPanel
          title="Ekonomi-modulen kunde inte laddas"
          description="Översikten gick inte att hämta."
          action={<Button onClick={() => void summary.refetch()}><RefreshCw size={16} /> Försök igen</Button>}
        />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <MetricCard label="Försäljning" value={totals ? formatCurrency(totals.grossSales) : "—"} detail={totals ? `${formatNumber(totals.orderCount)} ordrar` : undefined} />
            <MetricCard label="Restaurangmoms" value={totals ? formatCurrency(totals.foodVat) : "—"} />
            <MetricCard label="Provision" value={totals ? formatCurrency(totals.commission) : "—"} />
            <MetricCard label="Abonnemang" value={totals ? formatCurrency(totals.subscription) : "—"} />
            <article
              className="metric-card"
              style={{
                background: "#FFF7F3",
                borderColor: "color-mix(in srgb, var(--accent) 25%, transparent)",
              }}
            >
              <p className="kpi-label" style={{ color: "var(--accent-ink)" }}>Att betala ut</p>
              <div className="mt-2.5">
                <p className="kpi-value" style={{ fontSize: 26, letterSpacing: "-0.8px", color: "var(--accent-ink)" }}>
                  {totals ? formatCurrency(totals.payout) : "—"}
                </p>
              </div>
            </article>
            <MetricCard label="Att fakturera" value={totals ? formatCurrency(totals.owed) : "—"} detail="restauranger som är skyldiga oss" />
          </div>

          <Surface className="px-6 py-6">
            <div className="grid gap-4 lg:grid-cols-[1fr_220px] lg:items-end">
              <Field label="Sök">
                <div className="relative">
                  <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                  <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Restaurang eller stad" style={{ paddingLeft: 36 }} />
                </div>
              </Field>
              <Field label="Leveransmodell">
                <Select value={mode} onChange={(e) => setMode(e.target.value as ModeFilter)}>
                  <option value="all">Alla</option>
                  <option value="platform">Vi levererar</option>
                  <option value="self">Levererar själv</option>
                </Select>
              </Field>
            </div>

            {summary.isLoading ? (
              <div className="mt-6 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <Loader2 size={16} className="animate-spin" /> Laddar ekonomi…
              </div>
            ) : rows.length === 0 ? (
              <div className="mt-6"><EmptyState title="Inga restauranger i perioden" /></div>
            ) : (
              <div className="mt-6 table-shell">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Restaurang</th>
                      <th>Modell</th>
                      <th style={{ textAlign: "right" }}>Ordrar</th>
                      <th style={{ textAlign: "right" }}>Brutto</th>
                      <th style={{ textAlign: "right" }}>Moms</th>
                      <th style={{ textAlign: "right" }}>Provision</th>
                      <th style={{ textAlign: "right" }}>Abonnemang</th>
                      <th style={{ textAlign: "right" }}>Netto</th>
                      <th style={{ textAlign: "right" }}>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const accent = deliveryModeMeta(r.selfDelivery).color;
                      const isOwed = r.owed > 0;
                      return (
                        <tr key={r.restaurantId} className="cursor-pointer" onClick={() => openPayout(r.restaurantId)}>
                          <td>
                            <div className="flex items-center gap-3" style={{ borderLeft: `3px solid ${accent}`, paddingLeft: 10 }}>
                              <div>
                                <p className="font-bold">{r.name}</p>
                                <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{r.city || "Ingen stad"} • {r.tierLabel}</p>
                              </div>
                            </div>
                          </td>
                          <td><DeliveryModeBadge selfDelivery={r.selfDelivery} /></td>
                          <td style={{ fontFamily: MONO, textAlign: "right" }}>
                            <div>{formatNumber(r.orderCount)}</div>
                            {r.payoutOrderCount !== r.orderCount ? (
                              <div className="mt-0.5 text-xs font-sans text-[var(--text-muted)]">
                                {formatNumber(r.payoutOrderCount)} avräknas
                              </div>
                            ) : null}
                          </td>
                          <td style={{ fontFamily: MONO, textAlign: "right" }}>{formatCurrency(r.grossSales)}</td>
                          <td style={{ fontFamily: MONO, textAlign: "right" }}>
                            <div>{formatCurrency(r.foodVat)}</div>
                            <div className="mt-0.5 text-xs font-sans text-[var(--text-muted)]">{vatLabel(r.foodVatPct)}</div>
                          </td>
                          <td style={{ fontFamily: MONO, textAlign: "right", color: "var(--text-muted)" }}>
                            −{formatCurrency(r.commission)} <span>({r.commissionPct}%)</span>
                          </td>
                          <td style={{ fontFamily: MONO, textAlign: "right", color: "var(--text-muted)" }}>{formatCurrency(r.subscription)}</td>
                          <td style={{ fontFamily: MONO, fontWeight: 700, textAlign: "right" }}>
                            {isOwed ? (
                              <span style={{ color: "var(--warning-text, #B45309)" }}>{formatCurrency(r.owed)} <span style={{ fontWeight: 600 }}>(fakturera)</span></span>
                            ) : (
                              formatCurrency(r.payout)
                            )}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <Badge tone={statusTone(r.status)}>{r.status ? STATUS_LABEL[r.status] || r.status : "Ej hanterad"}</Badge>
                          </td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-end"><Button variant="secondary" onClick={() => openPayout(r.restaurantId)}>Öppna</Button></div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Surface>
        </>
      )}
      </>)}
    </div>
  );
}
