"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowRight,
  ChevronDown,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import { financeSummaryQueryKey, getFinanceSummary, type FinanceRow, type FinanceSummary } from "@/modules/finance/api";
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

const isDateParam = (value: string | null): value is string => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
const isPresetKey = (value: string | null): value is PresetKey =>
  value === "month" || value === "lastMonth" || value === "7" || value === "30";

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

function FundingReconciliationCard({ value }: { value: FinanceSummary["fundingReconciliation"] }) {
  const difference = value.difference;
  const exact = value.status === "exact" && difference === 0;
  const diagnostics: string[] = [];
  if (difference != null && difference !== 0) {
    if (value.salesDifference != null && value.salesDifference !== 0) {
      diagnostics.push(`Försäljning/refunds skiljer ${formatCurrency(Math.abs(value.salesDifference))}.`);
    }
    if (value.feeDifference != null && value.feeDifference !== 0) {
      diagnostics.push(`Mollieavgifter skiljer ${formatCurrency(Math.abs(value.feeDifference))}.`);
    }
    if (value.adjustmentNet !== 0) {
      diagnostics.push(`Manuella justeringar balanserar inte: ${formatCurrency(Math.abs(value.adjustmentNet))}.`);
    }
    if (diagnostics.length === 0) {
      diagnostics.push("Differensen ligger i en ännu omatchad saldo- eller restaurangpost.");
    }
  }

  return (
    <Surface className="px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Kontroll för vald period</p>
          <h2 className="section-title mt-1">Restaurangberäkningar mot Mollie</h2>
        </div>
        <Badge tone={exact ? "success" : value.status === "unavailable" ? "neutral" : "warning"}>
          {exact ? "0,00 kr skillnad" : difference == null ? "Inväntar Mollie" : `${formatCurrency(Math.abs(difference))} skillnad`}
        </Badge>
      </div>
      <div className="mt-4 rounded-[12px] bg-[var(--bg-page)] px-4 py-3">
        <MoneyLine label="Mollie · restaurangernas netto" value={value.mollieRestaurantNet} />
        <MoneyLine label="Utbetalningar, fakturor och ViaEats-avgifter" value={value.calculatedRestaurantNet} />
        <div className="mt-1 border-t border-[var(--border-subtle)] pt-1">
          <MoneyLine label="Oförklarad skillnad" value={difference == null ? null : Math.abs(difference)} strong />
        </div>
      </div>
      {value.externalPayments.count > 0 ? (
        <p className="mt-3 rounded-[10px] bg-[var(--brand-orange-soft)] px-4 py-3 text-[12px] font-semibold text-[var(--text-secondary)]">
          Externa/NFC-betalningar hålls utanför restaurangerna: {money(value.externalPayments.gross)} brutto
          {value.externalPayments.fees == null ? "" : ` − ${money(value.externalPayments.fees)} avgift`}
          {value.externalPayments.net == null ? "" : ` = ${money(value.externalPayments.net)} extra netto`}.
        </p>
      ) : null}
      {exact ? (
        <p className="mt-3 text-[12px] font-bold text-[var(--success)]">Alla restaurangposter och parvisa justeringar går ihop på öret.</p>
      ) : diagnostics.length > 0 ? (
        <div className="mt-3 rounded-[10px] bg-[var(--warning-soft)] px-4 py-3 text-[12px] font-semibold text-[var(--text-secondary)]">
          {diagnostics.map((diagnostic) => <p key={diagnostic}>{diagnostic}</p>)}
        </div>
      ) : null}
    </Surface>
  );
}

function PeriodBar({
  activePreset,
  from,
  to,
  onPreset,
  onFrom,
  onTo,
  variant = "surface",
}: {
  activePreset: PresetKey | null;
  from: string;
  to: string;
  onPreset: (preset: PresetKey) => void;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
  variant?: "surface" | "hero";
}) {
  return (
    <div className={`${variant === "surface" ? "surface px-4 py-3" : ""} flex flex-wrap items-center justify-between gap-3`}>
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
    </div>
  );
}

function RestaurantFinanceCard({
  row,
  onOpen,
}: {
  row: FinanceRow;
  onOpen: () => void;
}) {
  const active = row.orderCount > 0 || row.manualAdjustment !== 0 || row.owed > 0;
  const payoutLabel = row.owed > 0 ? "Att fakturera restaurangen" : "Att betala ut";
  const payoutValue = row.owed > 0 ? row.owed : row.payout;
  const feeIsFinal = row.mollieFeeStatus === "available";
  const viaEatsFeeInclVat = row.commission + row.subscription + row.feeVat;

  return (
    <article
      className={`surface group flex min-w-0 flex-col overflow-hidden text-left transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)] ${
        active ? "border-t-[3px] border-t-[var(--brand-orange)]" : ""
      }`}
    >
      <button type="button" onClick={onOpen} className="flex w-full flex-wrap items-start justify-between gap-3 px-5 py-5 text-left">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[17px] font-black tracking-[-0.02em] text-[var(--text-primary)]">{row.name}</h2>
            <Badge tone={statusTone(row.status)}>{row.status ? STATUS_LABEL[row.status] || row.status : "Ej hanterad"}</Badge>
            {row.manualAdjustment !== 0 ? (
              <Badge tone="warning">
                {row.manualAdjustment > 0 ? "Extra avdrag" : "Kreditering"} {money(Math.abs(row.manualAdjustment))}
              </Badge>
            ) : null}
            {!active ? <Badge tone="neutral">Ingen aktivitet</Badge> : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-[var(--text-muted)]">
            <span>{row.city || "Ingen stad"}</span>
            <span>·</span>
            <span>{formatNumber(row.orderCount)} betalningar</span>
            <DeliveryModeBadge selfDelivery={row.selfDelivery} />
          </div>
        </div>
        <ArrowRight size={16} className="mt-1 shrink-0 text-[var(--text-muted)] transition-transform group-hover:translate-x-0.5" />
      </button>

      <div className="grid grid-cols-1 border-y border-[var(--border-subtle)] bg-[var(--bg-page)] sm:grid-cols-3">
        <div className="min-w-0 px-5 py-4">
          <p className="card-label">Försäljning</p>
          <p className="mt-1 text-[18px] font-black tabular-nums text-[var(--text-primary)]">{money(row.netSales)}</p>
        </div>
        <div className="min-w-0 border-t border-[var(--border-subtle)] px-5 py-4 sm:border-l sm:border-t-0">
          <p className="card-label">Mollieavgift {feeIsFinal ? "· exakt" : "· beräknad"}</p>
          <p className="mt-1 text-[18px] font-black tabular-nums text-[var(--text-primary)]">
            {feeIsFinal || row.restaurantMollieFee == null ? money(row.restaurantMollieFee) : `≈ ${money(row.restaurantMollieFee)}`}
          </p>
        </div>
        <div className="min-w-0 border-t border-[var(--border-subtle)] px-5 py-4 sm:border-l sm:border-t-0">
          <p className="card-label">{payoutLabel}</p>
          <p className="mt-1 text-[18px] font-black tabular-nums text-[var(--text-primary)]">
            {feeIsFinal ? money(payoutValue) : `≈ ${money(payoutValue)}`}
          </p>
        </div>
      </div>

      <details className="group/details">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[12px] font-extrabold text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">
          Visa ekonomiska detaljer
          <ChevronDown size={15} className="transition-transform group-open/details:rotate-180" />
        </summary>
        <div className="grid grid-cols-2 gap-x-5 border-t border-[var(--border-subtle)] px-4 py-3">
          <MoneyLine label="Återbetalt" value={row.refunds} negative />
          <MoneyLine label="ViaEats inkl moms" value={viaEatsFeeInclVat} negative />
          <MoneyLine label="Mollie" value={row.restaurantMollieFee} negative />
          <MoneyLine
            label={row.manualAdjustment >= 0 ? "Manuell justering" : "Manuell kreditering"}
            value={Math.abs(row.manualAdjustment)}
            negative={row.manualAdjustment > 0}
          />
          <MoneyLine label={payoutLabel} value={payoutValue} strong />
        </div>
        {row.manualAdjustment !== 0 && row.adjustmentNote ? (
          <p className="border-t border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] px-4 py-2 text-[11.5px] font-semibold text-[var(--text-secondary)]">
            Orsak: {row.adjustmentNote}
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] px-4 py-3">
          {row.mollieFeeStatus === "partial" ? (
            <p className="mt-1 text-[10.5px] font-semibold text-[var(--warning)]">Beräknad från korttyp enligt Mollies prislista</p>
          ) : <span />}
          <button type="button" onClick={onOpen} className="inline-flex items-center gap-1.5 text-[12px] font-extrabold text-[var(--brand-navy-ink)] hover:underline">
            Öppna rapport <ArrowRight size={13} />
          </button>
        </div>
      </details>
    </article>
  );
}

export function FinancePage({ view = "overview" }: FinancePageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: FinanceTab = tabParam === "tiers" || tabParam === "satser" ? tabParam : "utbetalningar";
  const initialPresetParam = searchParams.get("period");
  const initialPreset = isPresetKey(initialPresetParam) ? initialPresetParam : "month";
  const presetPeriod = presetRange(initialPreset);
  const initialPeriod = {
    from: isDateParam(searchParams.get("from")) ? searchParams.get("from")! : presetPeriod.from,
    to: isDateParam(searchParams.get("to")) ? searchParams.get("to")! : presetPeriod.to,
  };
  const [from, setFrom] = useState(initialPeriod.from);
  const [to, setTo] = useState(initialPeriod.to);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<ModeFilter>("all");
  const [activePreset, setActivePreset] = useState<PresetKey | null>(
    isPresetKey(initialPresetParam) ? initialPreset : null,
  );

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

  const replaceFinanceUrl = (nextFrom: string, nextTo: string, nextPreset: PresetKey | null) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("from", nextFrom);
    params.set("to", nextTo);
    if (nextPreset) params.set("period", nextPreset);
    else params.delete("period");
    const path = view === "overview" ? "/finance" : "/finance/restauranger";
    router.replace(`${path}?${params.toString()}`, { scroll: false });
  };

  const setPreset = (preset: PresetKey) => {
    const range = presetRange(preset);
    setFrom(range.from);
    setTo(range.to);
    setActivePreset(preset);
    replaceFinanceUrl(range.from, range.to, preset);
  };

  const changeTab = (nextTab: FinanceTab) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", nextTab);
    params.set("from", from);
    params.set("to", to);
    if (activePreset) params.set("period", activePreset);
    else params.delete("period");
    router.replace(`/finance/restauranger?${params.toString()}`, { scroll: false });
  };

  const openPayout = (restaurantId: string) => {
    const params = new URLSearchParams({ from, to });
    if (activePreset) params.set("period", activePreset);
    router.push(`/finance/${restaurantId}?${params.toString()}`);
  };

  const totals = summary.data?.totals;
  const mollie = summary.data?.mollie;
  const reconciliation = summary.data?.reconciliation;
  const activeRows = rows.filter((row) => row.orderCount > 0 || row.manualAdjustment !== 0 || row.owed > 0);
  const inactiveRows = rows.filter((row) => row.orderCount === 0 && row.manualAdjustment === 0 && row.owed === 0);
  const periodLabel = activePreset
    ? PERIOD_PRESETS.find(([key]) => key === activePreset)?.[1] || ""
    : `${from} – ${to}`;
  const feesAreFinal = (summary.data?.rows || [])
    .filter((row) => row.orderCount > 0)
    .every((row) => row.mollieFeeStatus === "available");
  const payoutDisplay = totals?.payout;
  const ledgerDifference = mollie?.periodDifference == null
    ? null
    : Math.abs(mollie.periodDifference);
  const ledgerIsExact = mollie?.periodLedgerStatus === "exact";
  const actionableDeviations = reconciliation?.deviations.filter(
    (deviation) => deviation.severity !== "info",
  ) || [];
  const mollieConfirmationRows = rows.filter((row) => row.mollieConfirmationReady);
  const mollieConfirmationNotice = mollieConfirmationRows.length ? (
    <Surface className="border-[var(--warning)] bg-[var(--warning-soft)] px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black text-[var(--text-primary)]">Mollie har bekräftat avgifterna för perioden</p>
          <p className="mt-1 text-xs font-semibold text-[var(--text-secondary)]">
            Kontrollera plus/minus i avstämningen, justera vid behov och ersätt sedan originalet igen för att göra perioden permanent.
          </p>
        </div>
        <Button onClick={() => openPayout(mollieConfirmationRows[0].restaurantId)}>
          Kontrollera {mollieConfirmationRows.length === 1 ? mollieConfirmationRows[0].name : `${mollieConfirmationRows.length} restauranger`}
          <ArrowRight size={14} />
        </Button>
      </div>
    </Surface>
  ) : null;
  const fundingReconciliationPanel = summary.data
    ? <FundingReconciliationCard value={summary.data.fundingReconciliation} />
    : null;

  const heroPeriodBar = (
    <PeriodBar
      variant="hero"
      activePreset={activePreset}
      from={from}
      to={to}
      onPreset={setPreset}
      onFrom={(value) => {
        setFrom(value);
        setActivePreset(null);
        replaceFinanceUrl(value, to, null);
      }}
      onTo={(value) => {
        setTo(value);
        setActivePreset(null);
        replaceFinanceUrl(from, value, null);
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
              <section className="hero-card">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="hero-stat-label">Mollie-saldo</p>
                    <p className="hero-value mt-2">{money(mollie?.totalBalance)}</p>
                    <p className="mt-1.5 text-[12.5px] font-medium text-[var(--text-secondary)]">
                      {money(mollie?.availableBalance)} tillgängligt · {money(mollie?.pendingBalance)} väntande · {ledgerIsExact && ledgerDifference === 0
                        ? "avstämt med 0 öre i differens"
                        : ledgerDifference == null
                          ? "inväntar komplett balansrapport"
                          : `${money(ledgerDifference)} återstår att förklara`}
                    </p>
                  </div>
                  <div className="w-full max-w-full sm:w-auto sm:min-w-[280px]">{heroPeriodBar}</div>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-x-7 gap-y-5 rounded-[13px] bg-[rgba(254,247,240,0.07)] px-5 py-5 sm:grid-cols-4">
                  <div>
                    <p className="hero-stat-label">Försäljning · {periodLabel}</p>
                    <p className="hero-stat-value">{money(mollie?.periodGross)}</p>
                  </div>
                  <div>
                    <p className="hero-stat-label">Mollieavgifter · exakt</p>
                    <p className="hero-stat-value">{negativeMoney(mollie?.periodFees)}</p>
                  </div>
                  <div>
                    <p className="hero-stat-label">{feesAreFinal ? "Till restauranger" : "Beräknad utbetalning"}</p>
                    <p className="hero-stat-value">{feesAreFinal ? money(payoutDisplay) : `≈ ${money(payoutDisplay)}`}</p>
                  </div>
                  <div>
                    <p className="hero-stat-label">Att fakturera</p>
                    <p className="hero-stat-value">{money(totals?.owed)}</p>
                  </div>
                </div>
                {!feesAreFinal ? (
                  <p className="mt-3 text-[11.5px] font-semibold text-[var(--warning)]">
                    Beräknad med Mollies pris för respektive korttyp. Slutbeloppet låses först när Mollie har bokfört avgiften.
                  </p>
                ) : null}
              </section>

              {mollieConfirmationNotice}
              {fundingReconciliationPanel}

              <Surface className="px-5 py-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="eyebrow">Vald period</p>
                    <h2 className="section-title mt-1">Avstämt mot Mollie</h2>
                  </div>
                  <Badge tone={ledgerIsExact && ledgerDifference === 0 ? "success" : "warning"}>
                    {ledgerIsExact && ledgerDifference === 0 ? "0 öre i differens" : "Preliminär"}
                  </Badge>
                </div>
                <div className="mt-4 rounded-[12px] bg-[var(--bg-page)] px-4 py-3">
                  <MoneyLine label="Ingående saldo" value={mollie?.periodOpeningBalance} />
                  <MoneyLine label="Betalningar" value={mollie?.periodGross} />
                  <MoneyLine label="Återbetalningar" value={mollie?.periodRefunds} negative />
                  <MoneyLine label="Mollieavgifter" value={mollie?.periodFees} negative />
                  {Number(mollie?.periodOtherMovements || 0) !== 0 ? (
                    <MoneyLine label="Övriga saldorörelser" value={mollie?.periodOtherMovements} />
                  ) : null}
                  <div className="mt-1 border-t border-[var(--border-subtle)] pt-1">
                    <MoneyLine label="Utgående saldo" value={mollie?.periodClosingBalance ?? mollie?.totalBalance} strong />
                  </div>
                </div>
                {mollie?.unlinkedPaymentCount ? (
                  <p className="mt-4 rounded-[10px] bg-[var(--brand-orange-soft)] px-4 py-3 text-[12px] font-semibold text-[var(--text-secondary)]">
                    Egna Mollie-/NFC-test och andra betalningar utan ViaEats-order: {formatNumber(mollie.unlinkedPaymentCount)} betalningar
                    {" · "}{money(mollie.unlinkedGross)} brutto · {money(mollie.unlinkedFees)} Mollieavgift
                    {" · "}{money(mollie.unlinkedNet)} netto. De påverkar Mollie-saldot men aldrig en restaurangs utbetalning.
                  </p>
                ) : null}
                <p className="mt-3 text-[11.5px] text-[var(--text-muted)]">
                  Nästa Mollie-utbetalning: {money(mollie?.nextSettlementAmount)}
                  {" · "}{mollie?.nextPayoutDate ? formatDate(mollie.nextPayoutDate) : "datum saknas"}
                  {mollie?.nextSettlementStatus ? ` · ${MOLLIE_SETTLEMENT_STATUS[mollie.nextSettlementStatus] || mollie.nextSettlementStatus}` : ""}
                </p>
              </Surface>

              {actionableDeviations.length ? (
                <Surface className="overflow-hidden">
                  <div className="border-b border-[var(--border-subtle)] px-4 py-3">
                    <h2 className="text-[13px] font-extrabold text-[var(--text-primary)]">Behöver kontrolleras</h2>
                  </div>
                  <div>
                    {actionableDeviations.map((deviation) => (
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

              {summary.data?.internalTestCosts?.orderCount ? (
                <p className="text-[11.5px] text-[var(--text-muted)]">
                  {formatNumber(summary.data.internalTestCosts.orderCount)} interna testordrar är exkluderade från restaurangernas ekonomi.
                </p>
              ) : null}
            </>
          ) : (
            <>
              <section className="hero-card">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="hero-stat-label">Restaurangutbetalningar · {periodLabel}</p>
                    <p className="hero-value mt-2">{feesAreFinal ? money(totals?.payout) : `≈ ${money(totals?.payout)}`}</p>
                    <p className="mt-1.5 text-[12.5px] font-medium text-[var(--text-secondary)]">
                      {formatNumber(rows.filter((row) => row.payout > 0).length)} ska få utbetalning
                      {Number(totals?.owed || 0) > 0 ? ` · ${money(totals?.owed)} faktureras separat` : ""}
                    </p>
                  </div>
                  <div className="w-full max-w-full sm:w-auto sm:min-w-[280px]">{heroPeriodBar}</div>
                </div>
                <div className="mt-6 grid grid-cols-1 gap-x-7 gap-y-5 rounded-[13px] bg-[rgba(254,247,240,0.06)] px-5 py-5 sm:grid-cols-3">
                  <div>
                    <p className="hero-stat-label">Försäljning</p>
                    <p className="hero-stat-value">{money(totals?.netSales)}</p>
                  </div>
                  <div>
                    <p className="hero-stat-label">Mollieavgifter {feesAreFinal ? "· exakta" : "· beräknade"}</p>
                    <p className="hero-stat-value">{feesAreFinal ? money(totals?.mollieFees) : `≈ ${money(totals?.mollieFees)}`}</p>
                  </div>
                  <div>
                    <p className="hero-stat-label">Att fakturera</p>
                    <p className="hero-stat-value">{money(totals?.owed)}</p>
                  </div>
                </div>
                <p className="mt-3 text-[11.5px] text-[var(--text-muted)]">
                  {mollie?.feeStatus === "partial"
                    ? `${formatNumber(mollie.estimatedPaymentCount)} avgifter är beräknade från korttyp och Mollies svenska prislista. Originalet kan ersättas, men kontrollera avstämningen igen när Mollie har bokfört de exakta örena.`
                    : "Alla Mollieavgifter är bokförda och matchade mot payment-id."}
                </p>
              </section>

              {mollieConfirmationNotice}
              {fundingReconciliationPanel}

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

              {summary.isLoading ? (
                <Surface className="flex items-center gap-2 px-6 py-12 text-sm text-[var(--text-secondary)]">
                  <Loader2 size={16} className="animate-spin" /> Laddar ekonomi…
                </Surface>
              ) : rows.length === 0 ? (
                <Surface className="px-6 py-6"><EmptyState title="Inga restauranger i perioden" /></Surface>
              ) : (
                <>
                  <div className="grid min-w-0 gap-3 xl:grid-cols-2">
                  {activeRows.map((row) => (
                    <RestaurantFinanceCard
                      key={row.restaurantId}
                      row={row}
                      onOpen={() => openPayout(row.restaurantId)}
                    />
                  ))}
                  </div>
                  {inactiveRows.length > 0 ? (
                    <details className="surface overflow-hidden" open={Boolean(query.trim())}>
                      <summary className="cursor-pointer px-4 py-3 text-[12.5px] font-extrabold text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">
                        Utan aktivitet under perioden ({formatNumber(inactiveRows.length)})
                      </summary>
                      <div className="grid border-t border-[var(--border-subtle)] sm:grid-cols-2 xl:grid-cols-3">
                        {inactiveRows.map((row) => (
                          <button
                            key={row.restaurantId}
                            type="button"
                            onClick={() => openPayout(row.restaurantId)}
                            className="flex min-w-0 items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-4 py-3 text-left hover:bg-[var(--bg-hover)] sm:border-r"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-[12.5px] font-extrabold text-[var(--text-primary)]">{row.name}</span>
                              <span className="mt-0.5 block text-[11px] text-[var(--text-muted)]">{row.city || "Ingen stad"} · 0 betalningar</span>
                            </span>
                            <ArrowRight size={14} className="shrink-0 text-[var(--text-muted)]" />
                          </button>
                        ))}
                      </div>
                    </details>
                  ) : null}

                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
