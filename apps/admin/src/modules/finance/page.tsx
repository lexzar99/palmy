"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Loader2, RefreshCw, Search } from "lucide-react";
import { financeSummaryQueryKey, getFinanceSummary } from "@/modules/finance/api";
import { FinanceSettingsPage } from "@/modules/finance/settings-page";
import { TiersPage } from "@/modules/tiers/page";
import { DeliveryModeBadge } from "@/shared/components/delivery-mode";
import { Badge, Button, EmptyState, ErrorPanel, Field, Input, PageHeader, Surface, Tabs } from "@/shared/components/ui";
import { formatCurrencyExact as formatCurrency, formatNumber } from "@/shared/utils/format";

type ModeFilter = "all" | "platform" | "self";
type PresetKey = "month" | "lastMonth" | "7" | "30";

const PERIOD_PRESETS: Array<[PresetKey, string]> = [
  ["month", "Denna mån"],
  ["lastMonth", "Förra mån"],
  ["7", "7 dgr"],
  ["30", "30 dgr"],
];

const MODE_FILTERS: Array<[ModeFilter, string]> = [
  ["all", "Alla"],
  ["platform", "Vi kör"],
  ["self", "Egen"],
];

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
  // Null när användaren valt eget datumintervall — då markeras ingen pill.
  const [activePreset, setActivePreset] = useState<PresetKey | null>("month");

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

  const setPreset = (kind: PresetKey) => {
    const r = presetRange(kind);
    setFrom(r.from);
    setTo(r.to);
    setActivePreset(kind);
  };

  const openPayout = (restaurantId: string) =>
    router.push(`/finance/${restaurantId}?from=${from}&to=${to}`);

  const totals = summary.data?.totals;
  const periodLabel = activePreset
    ? PERIOD_PRESETS.find(([key]) => key === activePreset)?.[1] ?? ""
    : `${from} – ${to}`;
  // Störst belopp i listan sätter skalan för andelsstaplarna.
  const maxAmount = Math.max(1, ...rows.map((r) => (r.owed > 0 ? r.owed : r.payout)));

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
      {summary.isError ? (
        <ErrorPanel
          title="Ekonomi-modulen kunde inte laddas"
          description="Översikten gick inte att hämta."
          action={<Button onClick={() => void summary.refetch()}><RefreshCw size={16} /> Försök igen</Button>}
        />
      ) : (
        <>
          {/* ── Hero: periodens viktigaste siffra ── */}
          <section className="hero-card">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="hero-stat-label">Att betala ut · {periodLabel}</p>
                <p className="hero-value mt-2">{totals ? formatCurrency(totals.payout) : "—"}</p>
                <p className="mt-1.5 text-[12.5px] font-medium text-[rgba(254,247,240,0.65)]">
                  {totals ? `${formatNumber(totals.orderCount)} ordrar · ${formatNumber(rows.length)} restauranger` : "Laddar…"}
                </p>
              </div>
              <div className="segmented">
                {PERIOD_PRESETS.map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPreset(key)}
                    className={activePreset === key ? "is-active" : ""}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 grid gap-x-8 gap-y-4 border-t border-[rgba(254,247,240,0.14)] pt-4 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <p className="hero-stat-label">Försäljning</p>
                <p className="hero-stat-value">{totals ? formatCurrency(totals.grossSales) : "—"}</p>
              </div>
              <div>
                <p className="hero-stat-label">Provision</p>
                <p className="hero-stat-value">{totals ? formatCurrency(totals.commission) : "—"}</p>
              </div>
              <div>
                <p className="hero-stat-label">Restaurangmoms</p>
                <p className="hero-stat-value">{totals ? formatCurrency(totals.foodVat) : "—"}</p>
              </div>
              <div>
                <p className="hero-stat-label">Att fakturera</p>
                <p className="hero-stat-value" style={totals && totals.owed > 0 ? { color: "var(--brand-orange-ink)" } : undefined}>
                  {totals ? formatCurrency(totals.owed) : "—"}
                </p>
              </div>
            </div>

            {/* Eget datumintervall — diskret, bara när man vill avvika */}
            <details className="mt-4 text-[12.5px]">
              <summary className="cursor-pointer font-bold text-[rgba(254,247,240,0.7)] hover:text-white">
                Eget datumintervall
              </summary>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <Field label="Från"><Input type="date" value={from} max={to} onChange={(e) => { setFrom(e.target.value); setActivePreset(null); }} /></Field>
                <Field label="Till"><Input type="date" value={to} min={from} onChange={(e) => { setTo(e.target.value); setActivePreset(null); }} /></Field>
              </div>
            </details>
          </section>

          {/* ── Filterrad ── */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Sök restaurang eller stad" style={{ paddingLeft: 40 }} />
            </div>
            <div className="segmented">
              {MODE_FILTERS.map(([key, label]) => (
                <button key={key} type="button" onClick={() => setMode(key)} className={mode === key ? "is-active" : ""}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Restauranglista som kort ── */}
          {summary.isLoading ? (
            <Surface className="flex items-center gap-2 px-6 py-12 text-sm text-[var(--text-secondary)]">
              <Loader2 size={16} className="animate-spin" /> Laddar ekonomi…
            </Surface>
          ) : rows.length === 0 ? (
            <Surface className="px-6 py-6"><EmptyState title="Inga restauranger i perioden" /></Surface>
          ) : (
            <div className="grid gap-2.5">
              {rows.map((r) => {
                const isOwed = r.owed > 0;
                const amount = isOwed ? r.owed : r.payout;
                const share = Math.min(100, (amount / maxAmount) * 100);
                return (
                  <button key={r.restaurantId} type="button" onClick={() => openPayout(r.restaurantId)} className="fin-row">
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-[14px] font-bold text-[var(--text-primary)]">{r.name}</span>
                        <Badge tone={statusTone(r.status)}>{r.status ? STATUS_LABEL[r.status] || r.status : "Ej hanterad"}</Badge>
                        {isOwed && <span className="badge badge-warning">Fakturera</span>}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-[var(--text-muted)]">
                        <span>{r.city || "Ingen stad"}</span>
                        <span>·</span>
                        <span>{r.tierLabel}</span>
                        <span>·</span>
                        <span>{formatNumber(r.orderCount)} ordrar</span>
                        <span>·</span>
                        <span>{formatCurrency(r.grossSales)} brutto</span>
                        <DeliveryModeBadge selfDelivery={r.selfDelivery} />
                      </span>
                      <span className="progress-track mt-2 block">
                        <span
                          className={`progress-fill block${isOwed ? " is-leader" : ""}`}
                          style={{ width: `${Math.max(2, share)}%` }}
                        />
                      </span>
                    </span>
                    <span className="flex flex-none items-center gap-3 self-center">
                      <span className="text-right">
                        <span
                          className="block text-[17px] font-extrabold tabular-nums"
                          style={{ color: isOwed ? "var(--warning-text)" : "var(--text-primary)" }}
                        >
                          {formatCurrency(amount)}
                        </span>
                        <span className="block text-[11px] font-semibold text-[var(--text-muted)]">
                          −{formatCurrency(r.commission)} provision
                        </span>
                      </span>
                      <ChevronRight size={17} className="text-[var(--text-muted)]" />
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
      </>)}
    </div>
  );
}
