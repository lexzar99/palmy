"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowRight,
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  Landmark,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { financeSummaryQueryKey, getFinanceSummary } from "@/modules/finance/api";
import { FinanceSettingsPage } from "@/modules/finance/settings-page";
import { TiersPage } from "@/modules/tiers/page";
import { DeliveryModeBadge } from "@/shared/components/delivery-mode";
import { Badge, Button, EmptyState, ErrorPanel, Field, Input, PageHeader, Surface, Tabs } from "@/shared/components/ui";
import { formatCurrencyExact as formatCurrency, formatDate, formatNumber } from "@/shared/utils/format";

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

const STATUS_LABEL: Record<string, string> = { DRAFT: "Utkast", APPROVED: "Låst", PAID: "Betald", HOLD: "Upplåst" };
const MOLLIE_PAYOUT_STATUS: Record<string, string> = {
  requested: "Begärd",
  initiated: "Påbörjad",
  "processing-at-bank": "Behandlas av banken",
  completed: "Genomförd",
  canceled: "Avbruten",
  failed: "Misslyckad",
};
const statusTone = (s: string | null): "neutral" | "info" | "success" | "warning" =>
  s === "PAID" ? "success" : s === "APPROVED" ? "info" : s === "HOLD" ? "warning" : "neutral";
type FinanceTab = "utbetalningar" | "tiers" | "satser";
type FinancePageProps = {
  view?: "overview" | "restaurants";
};
const money = (value: number | null | undefined) => value == null ? "—" : formatCurrency(value);
const negativeMoney = (value: number | null | undefined) =>
  value == null ? "—" : value > 0 ? `−${formatCurrency(value)}` : formatCurrency(0);

export function FinancePage({ view = "overview" }: FinancePageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: FinanceTab = tabParam === "tiers" || tabParam === "satser" ? tabParam : "utbetalningar";
  const changeTab = (t: FinanceTab) => {
    router.replace(`/finance/restauranger?tab=${t}`, { scroll: false });
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
  const mollie = summary.data?.mollie;
  const reconciliation = summary.data?.reconciliation;
  const periodLabel = activePreset
    ? PERIOD_PRESETS.find(([key]) => key === activePreset)?.[1] ?? ""
    : `${from} – ${to}`;
  return (
    <div className="page-stack">
      <PageHeader
        breadcrumb="Plattform"
        title={view === "overview" ? "Ekonomiöversikt" : "Restaurangekonomi"}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            {view === "overview" ? (
              <Button onClick={() => router.push("/finance/restauranger")}>
                Restaurangekonomi <ArrowRight size={14} />
              </Button>
            ) : (
              <Button onClick={() => router.push("/finance")}>
                Ekonomiöversikt
              </Button>
            )}
            <Button onClick={() => void summary.refetch()} disabled={summary.isFetching}>
              <RefreshCw size={14} className={summary.isFetching ? "animate-spin" : undefined} />
              Uppdatera
            </Button>
          </div>
        )}
      />

      {view === "restaurants" ? (
        <Tabs<FinanceTab>
          value={tab}
          onChange={changeTab}
          options={[
            { value: "utbetalningar", label: "Utbetalningar" },
            { value: "tiers", label: "Tiers" },
            { value: "satser", label: "Provision & moms" },
          ]}
        />
      ) : null}

      {view === "restaurants" && tab === "tiers" && <TiersPage embedded />}
      {view === "restaurants" && tab === "satser" && <FinanceSettingsPage embedded />}

      {(view === "overview" || tab === "utbetalningar") && (<>
      {summary.isError ? (
        <ErrorPanel
          title="Ekonomi-modulen kunde inte laddas"
          description="Översikten gick inte att hämta."
          action={<Button onClick={() => void summary.refetch()}><RefreshCw size={16} /> Försök igen</Button>}
        />
      ) : (
        <>
          {view === "overview" ? (<>
          {/* ── Plattformsekonomi: samma visuella språk som översikten ── */}
          <section className="hero-card">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="hero-stat-label">Intäkt efter avgifter · {periodLabel}</p>
                <p className="hero-value mt-2">{money(totals?.commissionAfterMollieFees)}</p>
                <p className="mt-1.5 text-[12.5px] font-medium text-[rgba(254,247,240,0.65)]">
                  {totals ? `${formatNumber(totals.orderCount)} riktiga betalningar · brutto ${formatCurrency(totals.grossTotal)}` : "Laddar…"}
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

            <div className="mt-5 grid gap-x-7 gap-y-4 border-t border-[rgba(254,247,240,0.14)] pt-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {[
                ["Brutto", totals?.grossTotal],
                ["Återbetalningar", totals?.refunds],
                ["Netto", totals?.netSales],
                ["Mollie-avgifter", totals?.mollieFees],
                ["Refund-avgifter", totals?.refundTransactionFees],
                ["Provision ex moms", totals?.commission],
                ["Moms", totals?.commissionVat],
                ["Provision inkl moms", totals?.commissionInclVat],
                ["Provision − Mollie", totals?.commissionAfterMollieFees],
                ["Till restauranger", totals?.payout],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <p className="hero-stat-label">{label}</p>
                  <p className="hero-stat-value">{money(value as number | null | undefined)}</p>
                </div>
              ))}
            </div>

            {summary.data?.mollie.feeStatus !== "available" ? (
              <p className="mt-4 rounded-[10px] border border-[rgba(254,247,240,0.14)] px-3 py-2 text-[12px] text-[rgba(254,247,240,0.72)]">
                Mollie-avgifter: {summary.data?.mollie.feeError || "rapportdata saknas"}. Beloppen visas inte som 0 kr eftersom det skulle ge en felaktig rapport.
              </p>
            ) : null}

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

          {/* ── Mollie, avstämning och beräkningslogik ── */}
          <div className="grid gap-4 xl:grid-cols-12">
            <Surface className="flex flex-col px-5 py-5 xl:col-span-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="eyebrow">Mollie · just nu</p>
                  <h2 className="section-title mt-1">Saldo & utbetalning</h2>
                </div>
                <span className="flex h-[38px] w-[38px] items-center justify-center rounded-[11px] bg-[var(--brand-navy-soft)] text-[var(--brand-navy-ink)]">
                  <Landmark size={17} />
                </span>
              </div>
              <p className="mt-5 text-[28px] font-black tracking-[-0.03em] text-[var(--text-primary)]">
                {money(mollie?.totalBalance)}
              </p>
              <p className="mt-1 text-[12px] font-semibold text-[var(--text-muted)]">Totalt saldo hos Mollie</p>
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--border-subtle)] pt-4">
                <div>
                  <p className="eyebrow">Tillgängligt</p>
                  <p className="mt-1 text-[14px] font-extrabold text-[var(--text-primary)]">{money(mollie?.availableBalance)}</p>
                </div>
                <div>
                  <p className="eyebrow">Väntande</p>
                  <p className="mt-1 text-[14px] font-extrabold text-[var(--text-primary)]">{money(mollie?.pendingBalance)}</p>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between gap-3 rounded-[11px] bg-[var(--bg-page)] px-3 py-3 text-[12px]">
                <span className="font-semibold text-[var(--text-secondary)]">
                  Nästa utbetalning{mollie?.nextPayoutDateSource === "schedule" ? " enligt schema" : ""}
                </span>
                <span className="font-extrabold text-[var(--text-primary)]">
                  {mollie?.nextPayoutDate ? formatDate(mollie.nextPayoutDate) : "—"}
                </span>
              </div>
            </Surface>

            <Surface className="flex flex-col px-5 py-5 xl:col-span-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="eyebrow">Mollie · bankflöde</p>
                  <h2 className="section-title mt-1">Utbetalningsspårning</h2>
                </div>
                <span className="flex h-[38px] w-[38px] items-center justify-center rounded-[11px] bg-[var(--brand-orange-soft)] text-[var(--brand-orange)]">
                  <Banknote size={17} />
                </span>
              </div>
              <p className="mt-5 text-[28px] font-black tracking-[-0.03em] text-[var(--text-primary)]">
                {money(mollie?.nextSettlementAmount)}
              </p>
              <p className="mt-1 text-[12px] font-semibold text-[var(--text-muted)]">Kommande settlement</p>
              {mollie?.nextSettlementStatus ? (
                <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                  {mollie.nextSettlementStatus}
                </p>
              ) : null}
              <div className="mt-4 grid gap-3 border-t border-[var(--border-subtle)] pt-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[12px] font-semibold text-[var(--text-secondary)]">Senaste utbetalning</span>
                  <span className="text-[13px] font-extrabold text-[var(--text-primary)]">{money(mollie?.latestPayoutAmount)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[12px] font-semibold text-[var(--text-secondary)]">Status</span>
                  <Badge tone={mollie?.latestPayoutStatus === "failed" ? "warning" : mollie?.latestPayoutStatus === "completed" ? "success" : "info"}>
                    {mollie?.latestPayoutStatus
                      ? MOLLIE_PAYOUT_STATUS[mollie.latestPayoutStatus] || mollie.latestPayoutStatus
                      : "Ingen registrerad"}
                  </Badge>
                </div>
              </div>
              {mollie?.latestPayoutCreatedAt ? (
                <p className="mt-4 text-[11.5px] leading-5 text-[var(--text-muted)]">
                  Senast uppdaterad {formatDate(mollie.latestPayoutCreatedAt)}.
                </p>
              ) : null}
            </Surface>

            <Surface className="flex flex-col px-5 py-5 xl:col-span-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="eyebrow">Automatisk kontroll</p>
                  <h2 className="section-title mt-1">Avstämningsstatus</h2>
                </div>
                <span className={`flex h-[38px] w-[38px] items-center justify-center rounded-[11px] ${
                  reconciliation?.status === "ok"
                    ? "bg-[var(--success-soft)] text-[var(--success)]"
                    : "bg-[var(--warning-soft)] text-[var(--warning)]"
                }`}>
                  {reconciliation?.status === "ok" ? <ShieldCheck size={17} /> : <AlertCircle size={17} />}
                </span>
              </div>
              <div className="mt-5 flex items-end justify-between gap-3">
                <div>
                  <p className="text-[28px] font-black tracking-[-0.03em] text-[var(--text-primary)]">
                    {formatNumber(reconciliation?.deviationCount || 0)}
                  </p>
                  <p className="text-[12px] font-semibold text-[var(--text-muted)]">upptäckta avvikelser</p>
                </div>
                <Badge tone={reconciliation?.status === "ok" ? "success" : reconciliation?.status === "critical" ? "warning" : "info"}>
                  {reconciliation?.status === "ok" ? "Allt stämmer" : reconciliation?.status === "critical" ? "Kräver åtgärd" : "Kontrollera"}
                </Badge>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--border-subtle)] pt-4">
                <div>
                  <p className="eyebrow">Bekräftad negativ marginal</p>
                  <p className={`mt-1 text-[14px] font-extrabold ${reconciliation?.confirmedLoss ? "text-[var(--danger)]" : "text-[var(--text-primary)]"}`}>
                    {money(reconciliation?.confirmedLoss)}
                  </p>
                </div>
                <div>
                  <p className="eyebrow">Belopp att granska</p>
                  <p className="mt-1 text-[14px] font-extrabold text-[var(--text-primary)]">{money(reconciliation?.amountToReview)}</p>
                </div>
              </div>
              <p className="mt-4 text-[11.5px] leading-5 text-[var(--text-muted)]">
                {formatNumber(reconciliation?.realPaymentCount || 0)} riktiga betalningar avstämda ·{" "}
                {formatNumber(reconciliation?.excludedPaymentCount || 0)} pending/failed eller ej slutförda exkluderade.
              </p>
            </Surface>

            <Surface className="flex flex-col px-5 py-5 xl:col-span-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="eyebrow">Samma logik överallt</p>
                  <h2 className="section-title mt-1">Så räknas perioden</h2>
                </div>
                <span className="flex h-[38px] w-[38px] items-center justify-center rounded-[11px] bg-[var(--brand-orange-soft)] text-[var(--brand-orange)]">
                  <CircleDollarSign size={17} />
                </span>
              </div>
              <div className="mt-4 grid gap-3 text-[12.5px]">
                {[
                  ["Brutto", "Slutförda, betalda orderbelopp före återbetalning"],
                  ["Netto", "Brutto − genomförda återbetalningar"],
                  ["Vår intäkt", "Provision ex moms − alla Mollie-avgifter"],
                  ["Till restaurang", "Restauranggrund − provision − abonnemang − avgiftsmoms"],
                ].map(([label, formula]) => (
                  <div key={label} className="flex gap-3 rounded-[11px] bg-[var(--bg-page)] px-3 py-2.5">
                    <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-[var(--success)]" />
                    <div>
                      <p className="font-extrabold text-[var(--text-primary)]">{label}</p>
                      <p className="mt-0.5 leading-5 text-[var(--text-muted)]">{formula}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Surface>
          </div>

          <Surface className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-5 py-4">
              <div>
                <p className="eyebrow">Pengar som kan gå förlorade</p>
                <h2 className="section-title mt-1">Avvikelser & förklaringar</h2>
              </div>
              <span className="text-[12px] font-semibold text-[var(--text-muted)]">
                Mollie-avgifter matchade {formatNumber(reconciliation?.matchedFeeCount || 0)}/{formatNumber(reconciliation?.molliePaymentCount || 0)}
              </span>
            </div>
            {!reconciliation || reconciliation.deviations.length === 0 ? (
              <div className="flex items-center gap-3 px-5 py-6">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--success-soft)] text-[var(--success)]">
                  <CheckCircle2 size={17} />
                </span>
                <div>
                  <p className="text-[13px] font-extrabold text-[var(--text-primary)]">Inga avvikelser hittades</p>
                  <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">Orderstatus, verkliga betalningar, återbetalningar och tillgängliga Mollie-avgifter stämmer för perioden.</p>
                </div>
              </div>
            ) : (
              <div className="max-h-[460px] overflow-y-auto">
                {reconciliation.deviations.map((deviation) => (
                  <button
                    key={deviation.id}
                    type="button"
                    disabled={!deviation.restaurantId}
                    onClick={() => deviation.restaurantId && openPayout(deviation.restaurantId)}
                    className="flex w-full items-start gap-3 border-b border-[var(--border-subtle)] px-5 py-4 text-left last:border-0 enabled:hover:bg-[var(--bg-page)]"
                  >
                    <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] ${
                      deviation.severity === "critical"
                        ? "bg-[var(--danger-soft)] text-[var(--danger)]"
                        : "bg-[var(--warning-soft)] text-[var(--warning)]"
                    }`}>
                      <AlertCircle size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-extrabold text-[var(--text-primary)]">{deviation.title}</span>
                        {deviation.restaurantName ? <Badge tone="neutral">{deviation.restaurantName}</Badge> : null}
                        {deviation.confirmedLoss ? <Badge tone="warning">Bekräftad negativ marginal</Badge> : null}
                      </span>
                      <span className="mt-1 block text-[12px] leading-5 text-[var(--text-secondary)]">{deviation.detail}</span>
                      {deviation.paymentId ? <span className="mt-1 block font-mono text-[10.5px] text-[var(--text-muted)]">{deviation.paymentId}</span> : null}
                    </span>
                    <span className="shrink-0 text-right">
                      <span className={`block text-[13px] font-black tabular-nums ${deviation.confirmedLoss ? "text-[var(--danger)]" : "text-[var(--text-primary)]"}`}>
                        {money(deviation.amount)}
                      </span>
                      {deviation.restaurantId ? <ArrowRight size={13} className="ml-auto mt-2 text-[var(--text-muted)]" /> : null}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Surface>
          </>) : null}

          {view === "restaurants" ? (<>
          <section className="hero-card">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="hero-stat-label">Att betala ut · {periodLabel}</p>
                <p className="hero-value mt-2">{totals ? formatCurrency(totals.payout) : "—"}</p>
                <p className="mt-1.5 text-[12.5px] font-medium text-[rgba(254,247,240,0.65)]">
                  {totals ? `${formatNumber(totals.orderCount)} riktiga betalningar · ${formatNumber(rows.length)} restauranger` : "Laddar…"}
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
            <div className="mt-5 grid gap-x-7 gap-y-4 border-t border-[rgba(254,247,240,0.14)] pt-4 sm:grid-cols-2 lg:grid-cols-5">
              {[
                ["Brutto", totals?.grossTotal],
                ["Återbetalningar", totals?.refunds],
                ["Netto", totals?.netSales],
                ["Provision inkl moms", totals?.commissionInclVat],
                ["Mollie-avgifter", totals?.mollieFees],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <p className="hero-stat-label">{label}</p>
                  <p className="hero-stat-value">{money(value as number | null | undefined)}</p>
                </div>
              ))}
            </div>
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

          {/* ── Ekonomitabell i efterfrågad vänster-till-höger-ordning ── */}
          {summary.isLoading ? (
            <Surface className="flex items-center gap-2 px-6 py-12 text-sm text-[var(--text-secondary)]">
              <Loader2 size={16} className="animate-spin" /> Laddar ekonomi…
            </Surface>
          ) : rows.length === 0 ? (
            <Surface className="px-6 py-6"><EmptyState title="Inga restauranger i perioden" /></Surface>
          ) : (
            <Surface className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-[1760px] w-full border-collapse text-left text-[12px]">
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-page)] text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                      {[
                        "Restaurang", "Brutto", "Återbetalningar", "Netto",
                        "Mollie-avgifter", "Refund-avgifter", "Provision ex moms",
                        "Moms", "Provision inkl moms", "Provision − Mollie", "Att betala ut",
                      ].map((label, index) => (
                        <th key={label} className={`${index === 0 ? "sticky left-0 z-10 min-w-[260px] bg-[var(--bg-page)]" : "min-w-[145px] text-right"} px-4 py-3`}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.restaurantId}
                        onClick={() => openPayout(r.restaurantId)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") openPayout(r.restaurantId);
                        }}
                        role="button"
                        tabIndex={0}
                        className="cursor-pointer border-b border-[var(--border-subtle)] transition-colors last:border-0 hover:bg-[var(--bg-hover)]"
                      >
                        <td className="sticky left-0 z-10 bg-[var(--bg-panel)] px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-[var(--text-primary)]">{r.name}</span>
                            <Badge tone={statusTone(r.status)}>{r.status ? STATUS_LABEL[r.status] || r.status : "Ej hanterad"}</Badge>
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                            <span>{r.city || "Ingen stad"}</span>
                            <span>·</span>
                            <span>{formatNumber(r.orderCount)} riktiga betalningar</span>
                            <DeliveryModeBadge selfDelivery={r.selfDelivery} />
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-right font-bold tabular-nums">{money(r.grossTotal)}</td>
                        <td className="px-4 py-3.5 text-right font-bold tabular-nums text-[var(--danger)]">{negativeMoney(r.refunds)}</td>
                        <td className="px-4 py-3.5 text-right font-extrabold tabular-nums">{money(r.netSales)}</td>
                        <td className="px-4 py-3.5 text-right font-bold tabular-nums">{money(r.mollieFees)}</td>
                        <td className="px-4 py-3.5 text-right font-bold tabular-nums">{money(r.refundTransactionFees)}</td>
                        <td className="px-4 py-3.5 text-right font-bold tabular-nums">{money(r.commission)}</td>
                        <td className="px-4 py-3.5 text-right font-bold tabular-nums">{money(r.commissionVat)}</td>
                        <td className="px-4 py-3.5 text-right font-bold tabular-nums">{money(r.commissionInclVat)}</td>
                        <td className="px-4 py-3.5 text-right font-extrabold tabular-nums">{money(r.commissionAfterMollieFees)}</td>
                        <td className="px-4 py-3.5 text-right text-[14px] font-black tabular-nums">{money(r.payout)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-[var(--border-strong)] bg-[var(--bg-page)] font-black text-[var(--text-primary)]">
                      <td className="sticky left-0 z-10 bg-[var(--bg-page)] px-4 py-4">Totalt · alla restauranger</td>
                      <td className="px-4 py-4 text-right tabular-nums">{money(totals?.grossTotal)}</td>
                      <td className="px-4 py-4 text-right tabular-nums text-[var(--danger)]">{negativeMoney(totals?.refunds)}</td>
                      <td className="px-4 py-4 text-right tabular-nums">{money(totals?.netSales)}</td>
                      <td className="px-4 py-4 text-right tabular-nums">{money(totals?.mollieFees)}</td>
                      <td className="px-4 py-4 text-right tabular-nums">{money(totals?.refundTransactionFees)}</td>
                      <td className="px-4 py-4 text-right tabular-nums">{money(totals?.commission)}</td>
                      <td className="px-4 py-4 text-right tabular-nums">{money(totals?.commissionVat)}</td>
                      <td className="px-4 py-4 text-right tabular-nums">{money(totals?.commissionInclVat)}</td>
                      <td className="px-4 py-4 text-right tabular-nums">{money(totals?.commissionAfterMollieFees)}</td>
                      <td className="px-4 py-4 text-right text-[14px] tabular-nums">{money(totals?.payout)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="border-t border-[var(--border-subtle)] px-4 py-3 text-[11px] text-[var(--text-muted)]">
                Refund-avgifter är den ursprungliga Mollie-transaktionsavgiften för betalningar som senare återbetalats. Den ingår redan i totala Mollie-avgifter och adderas inte en gång till.
              </p>
            </Surface>
          )}
          </>) : null}
        </>
      )}
      </>)}
    </div>
  );
}
