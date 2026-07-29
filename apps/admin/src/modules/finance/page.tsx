"use client";

import { useMemo, useState, type ReactNode } from "react";
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
import { financeSummaryQueryKey, getFinanceSummary, type FinanceRow } from "@/modules/finance/api";
import { FinanceSettingsPage } from "@/modules/finance/settings-page";
import { TiersPage } from "@/modules/tiers/page";
import { DeliveryModeBadge } from "@/shared/components/delivery-mode";
import { Badge, Button, EmptyState, ErrorPanel, Field, Input, PageHeader, Surface, Tabs } from "@/shared/components/ui";
import { formatCurrencyExact as formatCurrency, formatDate, formatNumber } from "@/shared/utils/format";

type ModeFilter = "all" | "platform" | "self";
type PresetKey = "month" | "lastMonth" | "7" | "30";
type FinanceTab = "utbetalningar" | "tiers" | "satser";
type FinancePageProps = { view?: "overview" | "restaurants" };

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

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Utkast",
  APPROVED: "Låst",
  PAID: "Betald",
  HOLD: "Upplåst",
};

const MOLLIE_SETTLEMENT_STATUS: Record<string, string> = {
  open: "Öppen",
  pending: "Väntar",
  paidout: "Utbetald",
};

const isoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

function presetRange(kind: PresetKey): { from: string; to: string } {
  const now = new Date();
  if (kind === "month") {
    return { from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: isoDate(now) };
  }
  if (kind === "lastMonth") {
    return {
      from: isoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      to: isoDate(new Date(now.getFullYear(), now.getMonth(), 0)),
    };
  }
  const start = new Date(now);
  start.setDate(start.getDate() - (kind === "7" ? 6 : 29));
  return { from: isoDate(start), to: isoDate(now) };
}

const money = (value: number | null | undefined) =>
  value == null ? "—" : formatCurrency(value);

const negativeMoney = (value: number | null | undefined) =>
  value == null ? "—" : value > 0 ? `−${formatCurrency(value)}` : formatCurrency(0);

const statusTone = (status: string | null): "neutral" | "info" | "success" | "warning" =>
  status === "PAID" ? "success" : status === "APPROVED" ? "info" : status === "HOLD" ? "warning" : "neutral";

function MetricCard({
  label,
  value,
  detail,
  icon,
  accent = false,
}: {
  label: string;
  value: string;
  detail?: ReactNode;
  icon?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className={`metric-card min-w-0 ${accent ? "border-t-[3px] border-t-[var(--brand-orange)]" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="kpi-label">{label}</p>
        {icon ? <span className="text-[var(--text-muted)]">{icon}</span> : null}
      </div>
      <p className="mt-3 truncate text-[26px] font-black tracking-[-0.035em] text-[var(--text-primary)]">{value}</p>
      {detail ? <div className="mt-2 text-[11.5px] text-[var(--text-muted)]">{detail}</div> : null}
    </div>
  );
}

function MoneyLine({
  label,
  value,
  negative = false,
  strong = false,
}: {
  label: string;
  value: number | null | undefined;
  negative?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-[12px] text-[var(--text-secondary)]">{label}</span>
      <span className={`${strong ? "font-black" : "font-bold"} tabular-nums text-[var(--text-primary)] ${negative && Number(value) > 0 ? "text-[var(--danger)]" : ""}`}>
        {negative ? negativeMoney(value) : money(value)}
      </span>
    </div>
  );
}

function PeriodBar({
  activePreset,
  from,
  to,
  onPreset,
  onFrom,
  onTo,
}: {
  activePreset: PresetKey | null;
  from: string;
  to: string;
  onPreset: (preset: PresetKey) => void;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
}) {
  return (
    <Surface className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="segmented">
        {PERIOD_PRESETS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => onPreset(key)}
            className={activePreset === key ? "is-active" : ""}
          >
            {label}
          </button>
        ))}
      </div>
      <details className="text-[12px]">
        <summary className="cursor-pointer font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
          Eget datum
        </summary>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <Field label="Från">
            <Input type="date" value={from} max={to} onChange={(event) => onFrom(event.target.value)} />
          </Field>
          <Field label="Till">
            <Input type="date" value={to} min={from} onChange={(event) => onTo(event.target.value)} />
          </Field>
        </div>
      </details>
    </Surface>
  );
}

function RestaurantFinanceCard({
  row,
  onOpen,
}: {
  row: FinanceRow;
  onOpen: () => void;
}) {
  const active = row.orderCount > 0;
  const resultNegative = row.commissionAfterMollieFees != null && row.commissionAfterMollieFees < 0;
  const payoutLabel = row.owed > 0 ? "Att fakturera restaurangen" : "Att betala ut";
  const payoutValue = row.owed > 0 ? row.owed : row.payout;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`surface group flex min-w-0 flex-col overflow-hidden text-left transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)] ${
        active ? "border-t-[3px] border-t-[var(--brand-orange)]" : ""
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[14px] font-black text-[var(--text-primary)]">{row.name}</h2>
            <Badge tone={statusTone(row.status)}>{row.status ? STATUS_LABEL[row.status] || row.status : "Ej hanterad"}</Badge>
            {!active ? <Badge tone="neutral">Ingen aktivitet</Badge> : null}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11.5px] text-[var(--text-muted)]">
            <span>{row.city || "Ingen stad"}</span>
            <span>·</span>
            <span>{formatNumber(row.orderCount)} betalningar</span>
            <DeliveryModeBadge selfDelivery={row.selfDelivery} />
          </div>
        </div>
        <ArrowRight size={16} className="mt-1 shrink-0 text-[var(--text-muted)] transition-transform group-hover:translate-x-0.5" />
      </div>

      <div className="grid grid-cols-3 border-y border-[var(--border-subtle)] bg-[var(--bg-page)]">
        <div className="min-w-0 px-3 py-3">
          <p className="card-label">Brutto</p>
          <p className="mt-1 truncate text-[14px] font-extrabold tabular-nums text-[var(--text-primary)]">{money(row.grossTotal)}</p>
        </div>
        <div className="min-w-0 border-x border-[var(--border-subtle)] px-3 py-3">
          <p className="card-label">Återbetalt</p>
          <p className={`mt-1 truncate text-[14px] font-extrabold tabular-nums ${row.refunds > 0 ? "text-[var(--danger)]" : "text-[var(--text-primary)]"}`}>
            {negativeMoney(row.refunds)}
          </p>
        </div>
        <div className="min-w-0 px-3 py-3">
          <p className="card-label">Netto</p>
          <p className="mt-1 truncate text-[14px] font-black tabular-nums text-[var(--text-primary)]">{money(row.netSales)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-5 gap-y-1 px-4 py-3 sm:grid-cols-3">
        <MoneyLine label="Mollie" value={row.mollieFees} />
        <MoneyLine label="Varav återbetalning" value={row.refundTransactionFees} />
        <MoneyLine label="Provision ex moms" value={row.commission} />
        <MoneyLine label="Moms" value={row.commissionVat} />
        <MoneyLine label="Provision inkl moms" value={row.commissionInclVat} />
        <div className="flex items-center justify-between gap-4 py-1.5">
          <span className="text-[12px] text-[var(--text-secondary)]">Efter Mollie</span>
          <span className={`font-black tabular-nums ${resultNegative ? "text-[var(--danger)]" : "text-[var(--text-primary)]"}`}>
            {money(row.commissionAfterMollieFees)}
          </span>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between gap-4 border-t border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] px-4 py-3">
        <div>
          <p className="card-label">{payoutLabel}</p>
          {row.mollieFeeStatus === "partial" ? (
            <p className="mt-1 text-[10.5px] font-semibold text-[var(--warning)]">Mollie-avgift preliminär</p>
          ) : null}
        </div>
        <p className="text-[20px] font-black tracking-[-0.025em] tabular-nums text-[var(--text-primary)]">{money(payoutValue)}</p>
      </div>
    </button>
  );
}

export function FinancePage({ view = "overview" }: FinancePageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: FinanceTab = tabParam === "tiers" || tabParam === "satser" ? tabParam : "utbetalningar";
  const initialPeriod = presetRange("month");
  const [from, setFrom] = useState(initialPeriod.from);
  const [to, setTo] = useState(initialPeriod.to);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<ModeFilter>("all");
  const [activePreset, setActivePreset] = useState<PresetKey | null>("month");

  const summary = useQuery({
    queryKey: financeSummaryQueryKey(from, to),
    queryFn: () => getFinanceSummary(from, to),
  });

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return (summary.data?.rows || [])
      .filter((row) => {
        if (mode === "self" && !row.selfDelivery) return false;
        if (mode === "platform" && row.selfDelivery) return false;
        return !normalizedQuery || `${row.name} ${row.city || ""}`.toLowerCase().includes(normalizedQuery);
      })
      .sort((a, b) =>
        Number(b.orderCount > 0) - Number(a.orderCount > 0) ||
        b.netSales - a.netSales ||
        a.name.localeCompare(b.name, "sv")
      );
  }, [summary.data, query, mode]);

  const setPreset = (preset: PresetKey) => {
    const range = presetRange(preset);
    setFrom(range.from);
    setTo(range.to);
    setActivePreset(preset);
  };

  const changeTab = (nextTab: FinanceTab) => {
    router.replace(`/finance/restauranger?tab=${nextTab}`, { scroll: false });
  };

  const openPayout = (restaurantId: string) => {
    router.push(`/finance/${restaurantId}?from=${from}&to=${to}`);
  };

  const totals = summary.data?.totals;
  const mollie = summary.data?.mollie;
  const reconciliation = summary.data?.reconciliation;
  const periodLabel = activePreset
    ? PERIOD_PRESETS.find(([key]) => key === activePreset)?.[1] || ""
    : `${from} – ${to}`;

  const periodBar = (
    <PeriodBar
      activePreset={activePreset}
      from={from}
      to={to}
      onPreset={setPreset}
      onFrom={(value) => {
        setFrom(value);
        setActivePreset(null);
      }}
      onTo={(value) => {
        setTo(value);
        setActivePreset(null);
      }}
    />
  );

  return (
    <div className="page-stack">
      <PageHeader
        breadcrumb="Plattform"
        title={view === "overview" ? "Ekonomi" : "Restaurangekonomi"}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => router.push(view === "overview" ? "/finance/restauranger" : "/finance")}>
              {view === "overview" ? "Restauranger" : "Översikt"}
              <ArrowRight size={14} />
            </Button>
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

      {view === "restaurants" && tab === "tiers" ? <TiersPage embedded /> : null}
      {view === "restaurants" && tab === "satser" ? <FinanceSettingsPage embedded /> : null}

      {(view === "overview" || tab === "utbetalningar") && (
        <>
          {summary.isError ? (
            <ErrorPanel
              title="Ekonomin kunde inte laddas"
              description="Försök igen om en stund."
              action={<Button onClick={() => void summary.refetch()}><RefreshCw size={16} /> Försök igen</Button>}
            />
          ) : view === "overview" ? (
            <>
              {periodBar}

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label={`Nettoförsäljning · ${periodLabel}`}
                  value={money(totals?.netSales)}
                  detail={`${formatNumber(totals?.orderCount || 0)} verkliga betalningar`}
                  accent
                />
                <MetricCard
                  label="Mollie-avgifter"
                  value={money(totals?.mollieFees)}
                  detail={mollie?.feeStatus === "partial"
                    ? `${formatNumber(mollie.estimatedPaymentCount)} preliminära`
                    : mollie?.feeStatus === "unavailable"
                      ? "Kan inte hämtas"
                      : "Alla slutbokförda"}
                  icon={<CircleDollarSign size={16} />}
                />
                <MetricCard
                  label="ViaEats efter avgifter"
                  value={money(totals?.commissionAfterMollieFees)}
                  detail="Provision ex moms − Mollie"
                  icon={<ShieldCheck size={16} />}
                />
                <MetricCard
                  label="Till restauranger"
                  value={money(totals?.payout)}
                  detail={`${formatNumber(rows.filter((row) => row.payout > 0).length)} utbetalningar`}
                  icon={<Banknote size={16} />}
                />
              </div>

              <Surface className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-5 py-4">
                  <h2 className="section-title">Periodens siffror</h2>
                  <span className="text-[11.5px] text-[var(--text-muted)]">
                    {formatNumber(reconciliation?.excludedPaymentCount || 0)} ej slutförda betalningar exkluderade
                  </span>
                </div>
                <div className="grid gap-3 p-4 lg:grid-cols-3">
                  <div className="rounded-[11px] bg-[var(--bg-page)] px-4 py-3">
                    <p className="card-label mb-1">Försäljning</p>
                    <MoneyLine label="Brutto" value={totals?.grossTotal} />
                    <MoneyLine label="Återbetalningar" value={totals?.refunds} negative />
                    <MoneyLine label="Netto" value={totals?.netSales} strong />
                  </div>
                  <div className="rounded-[11px] bg-[var(--bg-page)] px-4 py-3">
                    <p className="card-label mb-1">Provision</p>
                    <MoneyLine label="Exkl. moms" value={totals?.commission} />
                    <MoneyLine label="Moms" value={totals?.commissionVat} />
                    <MoneyLine label="Inkl. moms" value={totals?.commissionInclVat} strong />
                  </div>
                  <div className="rounded-[11px] bg-[var(--bg-page)] px-4 py-3">
                    <p className="card-label mb-1">Efter avgifter</p>
                    <MoneyLine label="Mollie totalt" value={totals?.mollieFees} />
                    <MoneyLine label="Varav återbetalningar" value={totals?.refundTransactionFees} />
                    <MoneyLine label="ViaEats nettointäkt" value={totals?.commissionAfterMollieFees} strong />
                  </div>
                </div>
              </Surface>

              <div className="grid gap-3 lg:grid-cols-3">
                <MetricCard
                  label="Mollie-saldo"
                  value={money(mollie?.totalBalance)}
                  detail={<>Tillgängligt {money(mollie?.availableBalance)} · Väntande {money(mollie?.pendingBalance)}</>}
                  icon={<Landmark size={16} />}
                />
                <MetricCard
                  label="Nästa Mollie-utbetalning"
                  value={mollie?.nextPayoutDate ? formatDate(mollie.nextPayoutDate) : "—"}
                  detail={<>{money(mollie?.nextSettlementAmount)}{mollie?.nextSettlementStatus ? ` · ${MOLLIE_SETTLEMENT_STATUS[mollie.nextSettlementStatus] || mollie.nextSettlementStatus}` : ""}</>}
                  icon={<Banknote size={16} />}
                />
                <MetricCard
                  label="Automatisk kontroll"
                  value={reconciliation?.deviationCount ? `${formatNumber(reconciliation.deviationCount)} att kontrollera` : "Allt stämmer"}
                  detail={`${formatNumber(reconciliation?.realPaymentCount || 0)} betalningar kontrollerade`}
                  icon={reconciliation?.deviationCount
                    ? <AlertCircle size={16} className="text-[var(--warning)]" />
                    : <CheckCircle2 size={16} className="text-[var(--success)]" />}
                />
              </div>

              {reconciliation?.deviations.length ? (
                <Surface className="overflow-hidden">
                  <div className="border-b border-[var(--border-subtle)] px-4 py-3">
                    <h2 className="text-[13px] font-extrabold text-[var(--text-primary)]">Behöver kontrolleras</h2>
                  </div>
                  <div>
                    {reconciliation.deviations.map((deviation) => (
                      <button
                        key={deviation.id}
                        type="button"
                        disabled={!deviation.restaurantId}
                        onClick={() => deviation.restaurantId && openPayout(deviation.restaurantId)}
                        className="flex w-full items-center gap-3 border-b border-[var(--border-subtle)] px-4 py-3 text-left last:border-0 enabled:hover:bg-[var(--bg-hover)]"
                      >
                        <AlertCircle size={15} className={deviation.severity === "critical" ? "shrink-0 text-[var(--danger)]" : "shrink-0 text-[var(--warning)]"} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[12.5px] font-extrabold text-[var(--text-primary)]">{deviation.title}</span>
                          <span className="mt-0.5 block truncate text-[11.5px] text-[var(--text-muted)]">
                            {deviation.restaurantName ? `${deviation.restaurantName} · ` : ""}{deviation.detail}
                          </span>
                        </span>
                        {deviation.amount != null ? <span className="shrink-0 text-[12.5px] font-black tabular-nums">{money(deviation.amount)}</span> : null}
                        {deviation.restaurantId ? <ArrowRight size={14} className="shrink-0 text-[var(--text-muted)]" /> : null}
                      </button>
                    ))}
                  </div>
                </Surface>
              ) : null}
            </>
          ) : (
            <>
              {periodBar}

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard label={`Brutto · ${periodLabel}`} value={money(totals?.grossTotal)} detail={`${formatNumber(totals?.orderCount || 0)} betalningar`} />
                <MetricCard label="Återbetalningar" value={negativeMoney(totals?.refunds)} detail={`Avgifter ${money(totals?.refundTransactionFees)}`} />
                <MetricCard label="Netto" value={money(totals?.netSales)} detail={`Mollie ${money(totals?.mollieFees)}`} />
                <MetricCard label="Att betala ut" value={money(totals?.payout)} detail={`${formatNumber(rows.length)} restauranger`} accent />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[220px] flex-1">
                  <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Sök restaurang eller stad"
                    style={{ paddingLeft: 40 }}
                  />
                </div>
                <div className="segmented">
                  {MODE_FILTERS.map(([key, label]) => (
                    <button key={key} type="button" onClick={() => setMode(key)} className={mode === key ? "is-active" : ""}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {mollie?.feeStatus === "partial" ? (
                <div className="flex items-center gap-2 rounded-[10px] bg-[var(--warning-soft)] px-3 py-2 text-[11.5px] font-semibold text-[var(--warning)]">
                  <CircleDollarSign size={14} />
                  {formatNumber(mollie.estimatedPaymentCount)} Mollie-avgifter är preliminära och uppdateras automatiskt.
                </div>
              ) : null}

              {summary.isLoading ? (
                <Surface className="flex items-center gap-2 px-6 py-12 text-sm text-[var(--text-secondary)]">
                  <Loader2 size={16} className="animate-spin" /> Laddar ekonomi…
                </Surface>
              ) : rows.length === 0 ? (
                <Surface className="px-6 py-6"><EmptyState title="Inga restauranger i perioden" /></Surface>
              ) : (
                <div className="grid min-w-0 gap-3 xl:grid-cols-2">
                  {rows.map((row) => (
                    <RestaurantFinanceCard
                      key={row.restaurantId}
                      row={row}
                      onOpen={() => openPayout(row.restaurantId)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
