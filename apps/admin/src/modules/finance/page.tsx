"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowRight,
  Banknote,
  CheckCircle2,
  ChevronDown,
  Landmark,
  Loader2,
  RefreshCw,
  Search,
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

function RestaurantPayoutChart({ rows }: { rows: FinanceRow[] }) {
  const visible = rows.filter((row) => row.payout > 0 || row.owed > 0).slice(0, 5);
  const maxValue = Math.max(1, ...visible.map((row) => Math.max(row.payout, row.owed)));

  if (visible.length === 0) {
    return <p className="py-7 text-[12px] text-[var(--text-muted)]">Inga restaurangbelopp i perioden.</p>;
  }

  return (
    <div className="grid gap-3">
      {visible.map((row) => {
        const value = row.owed > 0 ? row.owed : row.payout;
        return (
          <div key={row.restaurantId}>
            <div className="mb-1.5 flex items-center justify-between gap-4 text-[11.5px]">
              <span className="truncate font-bold text-[var(--text-primary)]">{row.name}</span>
              <span className="shrink-0 font-extrabold tabular-nums text-[var(--text-primary)]">{money(value)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[rgba(254,247,240,0.1)]">
              <div
                className="h-full rounded-full bg-[var(--brand-orange)]"
                style={{ width: `${Math.max(3, (value / maxValue) * 100)}%` }}
              />
            </div>
          </div>
        );
      })}
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
  const active = row.orderCount > 0;
  const payoutLabel = row.owed > 0 ? "Att fakturera restaurangen" : "Att betala ut";
  const payoutValue = row.owed > 0 ? row.owed : row.payout;

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

      <div className="grid grid-cols-2 border-y border-[var(--border-subtle)] bg-[var(--bg-page)]">
        <div className="min-w-0 px-5 py-4">
          <p className="card-label">Netto</p>
          <p className="mt-1 text-[18px] font-black tabular-nums text-[var(--text-primary)]">{money(row.netSales)}</p>
        </div>
        <div className="min-w-0 border-l border-[var(--border-subtle)] px-5 py-4">
          <p className="card-label">Mollieavgift</p>
          <p className="mt-1 text-[18px] font-black tabular-nums text-[var(--text-primary)]">{money(row.restaurantMollieFee)}</p>
        </div>
        <div className="min-w-0 border-t border-[var(--border-subtle)] px-5 py-4">
          <p className="card-label">Provision inkl moms</p>
          <p className="mt-1 text-[18px] font-black tabular-nums text-[var(--text-primary)]">{money(row.commissionInclVat)}</p>
        </div>
        <div className="min-w-0 border-l border-t border-[var(--border-subtle)] px-5 py-4">
          <p className="card-label">{payoutLabel}</p>
          <p className="mt-1 text-[18px] font-black tabular-nums text-[var(--text-primary)]">{money(payoutValue)}</p>
        </div>
      </div>

      <details className="group/details">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[12px] font-extrabold text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">
          Visa ekonomiska detaljer
          <ChevronDown size={15} className="transition-transform group-open/details:rotate-180" />
        </summary>
        <div className="grid grid-cols-2 gap-x-5 border-t border-[var(--border-subtle)] px-4 py-3 sm:grid-cols-3">
          <MoneyLine label="Brutto" value={row.grossTotal} />
          <MoneyLine label="Återbetalt" value={row.refunds} negative />
          <MoneyLine label="Mollie totalt · restaurang" value={row.mollieFees} />
          <MoneyLine label="Dras från utbetalning" value={row.restaurantMollieFee} negative />
          <MoneyLine label="På refundade köp" value={row.refundTransactionFees} />
          <MoneyLine label="Refundavgift" value={row.refundProcessingFees} />
          <MoneyLine label="Provision ex moms" value={row.commission} />
          <MoneyLine label="Moms att reservera" value={row.commissionVat} />
          <MoneyLine label="Provision inkl moms" value={row.commissionInclVat} />
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] px-4 py-3">
          {row.mollieFeeStatus === "partial" ? (
            <p className="mt-1 text-[10.5px] font-semibold text-[var(--warning)]">Mollie-avgift preliminär</p>
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
  const refundImpact = summary.data?.refundImpact;
  const reconciliation = summary.data?.reconciliation;
  const activeRows = rows.filter((row) => row.orderCount > 0);
  const inactiveRows = rows.filter((row) => row.orderCount === 0);
  const periodLabel = activePreset
    ? PERIOD_PRESETS.find(([key]) => key === activePreset)?.[1] || ""
    : `${from} – ${to}`;
  const paymentFees = totals?.mollieFees != null && totals.refundProcessingFees != null
    ? totals.mollieFees - totals.refundProcessingFees
    : null;
  const balanceAfterRestaurantPayout = mollie?.totalBalance != null && totals?.payout != null
    ? mollie.totalBalance - totals.payout
    : null;
  const mollieFeesDeductedFromPayouts = totals?.restaurantMollieFee == null
    ? null
    : Math.max(0, totals.restaurantMollieFee - Number(totals.owed || 0));
  const cashAfterVatReserve = balanceAfterRestaurantPayout != null && totals?.feeVat != null
    ? balanceAfterRestaurantPayout - totals.feeVat
    : null;
  const periodResultExVat = totals?.companyRevenueExVat ?? null;
  const balanceOutsidePeriod = cashAfterVatReserve != null && periodResultExVat != null
    ? cashAfterVatReserve - periodResultExVat
    : null;
  const availablePayoutShortfall = mollie?.availableBalance != null && totals?.payout != null
    ? Math.max(0, totals.payout - mollie.availableBalance)
    : null;
  const ledgerDifference = mollie?.periodDifference == null
    ? null
    : Math.abs(mollie.periodDifference);
  const ledgerIsExact = mollie?.periodLedgerStatus === "exact";
  const actionableDeviations = reconciliation?.deviations.filter(
    (deviation) => deviation.severity !== "info",
  ) || [];

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
              <div className="grid gap-4 xl:grid-cols-12">
                <section className="hero-card flex flex-col xl:col-span-8">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="hero-stat-label">Mollie-saldo · avstämt öre för öre</p>
                      <p className="hero-value mt-2">{money(mollie?.totalBalance)}</p>
                      <p className="mt-1.5 text-[12.5px] font-medium text-[var(--text-secondary)]">
                        {ledgerIsExact && ledgerDifference === 0
                          ? "Allt förklarat · 0 öre i differens"
                          : ledgerDifference == null
                            ? "Inväntar komplett balansrapport"
                            : `${money(ledgerDifference)} återstår att förklara`}
                      </p>
                    </div>
                    <div className="w-full max-w-full sm:w-auto sm:min-w-[280px]">{heroPeriodBar}</div>
                  </div>
                  <div className="mt-7 grid grid-cols-2 gap-x-8 gap-y-5 border-t border-[rgba(254,247,240,0.14)] pt-5 sm:grid-cols-4">
                    <div>
                      <p className="hero-stat-label">Mollie brutto</p>
                      <p className="hero-stat-value">{money(mollie?.periodGross)}</p>
                    </div>
                    <div>
                      <p className="hero-stat-label">Återbetalningar</p>
                      <p className="hero-stat-value">{negativeMoney(mollie?.periodRefunds)}</p>
                    </div>
                    <div>
                      <p className="hero-stat-label">Alla Mollieavgifter</p>
                      <p className="hero-stat-value">{negativeMoney(mollie?.periodFees)}</p>
                    </div>
                    <div>
                      <p className="hero-stat-label">Oförklarat</p>
                      <p className="hero-stat-value">{money(ledgerDifference)}</p>
                    </div>
                  </div>
                </section>

                <Surface className="flex flex-col px-5 py-5 xl:col-span-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="eyebrow">Utbetalning</p>
                      <h2 className="section-title mt-1">Pengarna efter restauranger</h2>
                    </div>
                    <span className="flex h-[38px] w-[38px] items-center justify-center rounded-[11px] bg-[var(--brand-navy-soft)] text-[var(--brand-navy-ink)]">
                      <Landmark size={17} />
                    </span>
                  </div>
                  <p className="mt-5 text-[30px] font-black tracking-[-0.04em] text-[var(--text-primary)]">{money(balanceAfterRestaurantPayout)}</p>
                  <p className="mt-1 text-[11.5px] text-[var(--text-muted)]">Kvar på Mollie efter planerade restaurangutbetalningar</p>
                  <div className="mt-5 grid gap-3 border-t border-[var(--border-subtle)] pt-4">
                    <MoneyLine label="Att betala restauranger" value={totals?.payout} />
                    <MoneyLine label="ViaEats provision ex moms" value={totals?.commission} />
                    <MoneyLine label="Moms att reservera" value={totals?.commissionVat} />
                    <MoneyLine label="Restaurangavgift att fakturera" value={totals?.owed} />
                    <MoneyLine label="Fristående betalningar netto" value={mollie?.unlinkedNet} />
                    <MoneyLine label="Nästa Mollie-utbetalning" value={mollie?.nextSettlementAmount} />
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {mollie?.nextPayoutDate ? formatDate(mollie.nextPayoutDate) : "Datum saknas"}
                      {mollie?.nextSettlementStatus ? ` · ${MOLLIE_SETTLEMENT_STATUS[mollie.nextSettlementStatus] || mollie.nextSettlementStatus}` : ""}
                    </p>
                  </div>
                  <div className="mt-auto flex items-center gap-2 pt-5 text-[11.5px] font-bold text-[var(--text-secondary)]">
                    {reconciliation?.status !== "ok"
                      ? <AlertCircle size={15} className="text-[var(--warning)]" />
                      : <CheckCircle2 size={15} className="text-[var(--success)]" />}
                    {reconciliation?.status !== "ok"
                      ? `${formatNumber(reconciliation?.deviationCount ?? 0)} avvikelser att kontrollera`
                      : "Balansboken stämmer"}
                  </div>
                </Surface>
              </div>

              <Surface className="px-5 py-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="eyebrow">Automatisk avstämning</p>
                    <h2 className="section-title mt-1">Så blir varje öre Mollie-saldo</h2>
                  </div>
                  <Badge tone={ledgerIsExact && ledgerDifference === 0 ? "success" : "warning"}>
                    {ledgerIsExact && ledgerDifference === 0 ? "0 öre i differens" : "Preliminär"}
                  </Badge>
                </div>
                <div className="mt-5 grid gap-2 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] md:items-center">
                  {[
                    ["Mollie brutto", mollie?.periodGross],
                    ["Återbetalningar", mollie?.periodRefunds],
                    ["Mollieavgifter", mollie?.periodFees],
                    ["Slutsaldo", mollie?.periodClosingBalance ?? mollie?.totalBalance],
                  ].map(([label, value], index) => (
                    <div key={String(label)} className="contents">
                      {index > 0 ? (
                        <span className="hidden text-center text-xl font-black text-[var(--text-muted)] md:block">
                          {index === 3 ? "=" : "−"}
                        </span>
                      ) : null}
                      <div className="rounded-[12px] bg-[var(--bg-page)] px-4 py-4">
                        <p className="card-label">{label}</p>
                        <p className="mt-1 text-[20px] font-black tabular-nums text-[var(--text-primary)]">{money(value as number | null | undefined)}</p>
                      </div>
                    </div>
                  ))}
                </div>
                {mollie?.unlinkedPaymentCount ? (
                  <p className="mt-4 rounded-[10px] bg-[var(--brand-orange-soft)] px-4 py-3 text-[12px] font-semibold text-[var(--text-secondary)]">
                    {formatNumber(mollie.unlinkedPaymentCount)} fristående terminalbetalningar: {money(mollie.unlinkedGross)} brutto
                    {" · "}{money(mollie.unlinkedFees)} Mollieavgift
                    {" · "}{money(mollie.unlinkedNet)} netto. De ligger separat och påverkar ingen restaurang.
                  </p>
                ) : null}
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
                <Surface className="border-l-[3px] border-l-[var(--warning)] px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="eyebrow">Separat från restauranger</p>
                      <h2 className="section-title mt-1">Interna testkostnader</h2>
                      <p className="mt-1 text-[11.5px] text-[var(--text-muted)]">
                        {formatNumber(summary.data.internalTestCosts.orderCount)} testordrar är exkluderade från restaurangernas avräkning.
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-5 text-right">
                      <div><p className="card-label">Brutto</p><p className="mt-1 font-black tabular-nums">{money(summary.data.internalTestCosts.gross)}</p></div>
                      <div><p className="card-label">Mollie</p><p className="mt-1 font-black tabular-nums">{money(summary.data.internalTestCosts.mollieFees)}</p></div>
                      <div><p className="card-label">Kostnad</p><p className="mt-1 font-black tabular-nums text-[var(--warning)]">{money(summary.data.internalTestCosts.netLoss)}</p></div>
                    </div>
                  </div>
                </Surface>
              ) : null}

              <details className="surface group/report overflow-hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 hover:bg-[var(--bg-hover)]">
                  <span>
                    <span className="block text-[14px] font-black text-[var(--text-primary)]">Visa fullständig ekonomirapport</span>
                    <span className="mt-0.5 block text-[11.5px] text-[var(--text-muted)]">Brutto, moms, avgifter, återbetalningar och scenarier</span>
                  </span>
                  <ChevronDown size={18} className="shrink-0 text-[var(--text-muted)] transition-transform group-open/report:rotate-180" />
                </summary>
                <div className="border-t border-[var(--border-subtle)] p-4">
                  <div className="grid gap-3 lg:grid-cols-3">
                    <div className="rounded-[11px] bg-[var(--bg-page)] px-4 py-3">
                      <p className="card-label mb-1">Försäljning</p>
                      <MoneyLine label="Brutto" value={totals?.grossTotal} />
                      <MoneyLine label="Återbetalningar" value={totals?.refunds} negative />
                      <MoneyLine label="Netto" value={totals?.netSales} strong />
                    </div>
                    <div className="rounded-[11px] bg-[var(--bg-page)] px-4 py-3">
                      <p className="card-label mb-1">Provision</p>
                      <MoneyLine label="Intäkt ex moms" value={totals?.commission} />
                      <MoneyLine label="Moms att reservera" value={totals?.commissionVat} />
                      <MoneyLine label="Avdrag inkl moms" value={totals?.commissionInclVat} strong />
                    </div>
                    <div className="rounded-[11px] bg-[var(--bg-page)] px-4 py-3">
                      <p className="card-label mb-1">Mollie och resultat</p>
                      <MoneyLine label="Kortavgifter · restaurang" value={paymentFees} />
                      <MoneyLine label="Återbetalningsavgifter" value={totals?.refundProcessingFees} />
                      <MoneyLine label="Mollie totalt · restaurang" value={totals?.mollieFees} />
                      <MoneyLine label="Dras från restaurangutbetalning" value={mollieFeesDeductedFromPayouts} negative />
                      <MoneyLine label="Faktureras restaurang" value={totals?.owed} />
                      <MoneyLine label="ViaEats intäkt ex moms" value={totals?.companyRevenueExVat} strong />
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <div className="rounded-[11px] border border-[var(--border-subtle)] px-4 py-3">
                      <p className="card-label mb-1">Efter restaurangutbetalning</p>
                      <MoneyLine label="Mollie-saldo" value={mollie?.totalBalance} />
                      <MoneyLine label="Till restauranger" value={totals?.payout} negative />
                      <MoneyLine label="Kvar efter utbetalning" value={balanceAfterRestaurantPayout} strong />
                      <MoneyLine label="Reservera moms" value={totals?.feeVat} negative />
                      <MoneyLine label="Kvar före bolagsskatt" value={cashAfterVatReserve} strong />
                      <p className="mt-2 text-[11px] text-[var(--text-muted)]">
                        {availablePayoutShortfall != null && availablePayoutShortfall > 0
                          ? `${money(availablePayoutShortfall)} inväntar Mollies väntande saldo.`
                          : "Utbetalningen ryms i tillgängligt saldo."}
                        {balanceOutsidePeriod != null && Math.abs(balanceOutsidePeriod) >= 0.01
                          ? ` ${money(Math.abs(balanceOutsidePeriod))} hör till annan period eller bokföringstidpunkt.`
                          : ""}
                      </p>
                    </div>

                    <div className="overflow-hidden rounded-[11px] border border-[var(--border-subtle)]">
                      <div className="px-4 py-3">
                        <p className="card-label">Återbetalningarnas effekt</p>
                        <p className="mt-1 text-[11px] text-[var(--text-muted)]">{formatNumber(refundImpact?.refundCount || 0)} återbetalningar · {money(refundImpact?.refundedAmount)}</p>
                      </div>
                      <div className="grid grid-cols-3 divide-x divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">
                        <div className="min-w-0 px-3 py-3">
                          <p className="card-label">Nu</p>
                          <p className="mt-1 truncate text-[15px] font-black">{money(totals?.companyRevenueExVat)}</p>
                        </div>
                        <div className="min-w-0 px-3 py-3">
                          <p className="card-label">1 refund</p>
                          <p className="mt-1 truncate text-[15px] font-black">{money(refundImpact?.withOneRefund.resultExVat)}</p>
                        </div>
                        <div className="min-w-0 px-3 py-3">
                          <p className="card-label">Utan</p>
                          <p className="mt-1 truncate text-[15px] font-black">{money(refundImpact?.withoutRefunds.resultExVat)}</p>
                        </div>
                      </div>
                      <p className="px-4 py-3 text-[11px] text-[var(--text-muted)]">
                        Refunds har påverkat Mollie-saldot med {money(refundImpact?.balanceImpact)}. Avgifter på refundade köp är {money(totals?.refundTransactionFees)} och dras från restaurangens utbetalning.
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-[11px] text-[var(--text-muted)]">
                    {formatNumber(reconciliation?.excludedPaymentCount || 0)} ej slutförda betalningar är exkluderade.
                    {mollie?.feeStatus === "partial" ? ` ${formatNumber(mollie.estimatedPaymentCount)} avgifter är preliminära och uppdateras automatiskt.` : ""}
                  </p>
                </div>
              </details>
            </>
          ) : (
            <>
              <div className="grid gap-4 xl:grid-cols-12">
                <section className="hero-card xl:col-span-8">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="hero-stat-label">Till restauranger efter avgifter · {periodLabel}</p>
                      <p className="hero-value mt-2">{money(totals?.payout)}</p>
                      <p className="mt-1.5 text-[12.5px] font-medium text-[var(--text-secondary)]">
                        {formatNumber(activeRows.length)} aktiva restauranger · netto {money(totals?.netSales)}
                      </p>
                    </div>
                    <div className="w-full max-w-full sm:w-auto sm:min-w-[280px]">{heroPeriodBar}</div>
                  </div>
                  <div className="mt-7">
                    <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.09em] text-[var(--text-muted)]">Största restaurangbeloppen</p>
                    <RestaurantPayoutChart rows={activeRows} />
                  </div>
                  <div className="mt-6 grid grid-cols-3 gap-4 border-t border-[var(--border-subtle)] pt-4">
                    <div className="min-w-0">
                      <p className="hero-stat-label">Netto</p>
                      <p className="hero-stat-value truncate">{money(totals?.netSales)}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="hero-stat-label">Provision inkl moms</p>
                      <p className="hero-stat-value truncate">{money(totals?.commissionInclVat)}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="hero-stat-label">Återbetalt</p>
                      <p className="hero-stat-value truncate">{money(totals?.refunds)}</p>
                    </div>
                  </div>
                </section>

                <Surface className="flex flex-col px-5 py-5 xl:col-span-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="eyebrow">Periodens status</p>
                      <h2 className="section-title mt-1">Utbetalningar</h2>
                    </div>
                    <span className="flex h-[38px] w-[38px] items-center justify-center rounded-[11px] bg-[var(--brand-orange-soft)] text-[var(--brand-orange)]">
                      <Banknote size={17} />
                    </span>
                  </div>
                  <div className="mt-5 grid gap-4">
                    <div>
                      <p className="card-label">Att betala ut</p>
                      <p className="mt-1 text-[27px] font-black tracking-[-0.035em]">{money(totals?.payout)}</p>
                    </div>
                    <div className="flex items-center justify-between gap-4 py-1.5">
                      <span className="text-[12px] text-[var(--text-secondary)]">Restauranger med belopp</span>
                      <span className="font-bold tabular-nums text-[var(--text-primary)]">{formatNumber(rows.filter((row) => row.payout > 0).length)}</span>
                    </div>
                    <MoneyLine label="Kortavgifter · restaurang" value={totals?.mollieFees} />
                    <MoneyLine label="Dras från restaurangutbetalning" value={mollieFeesDeductedFromPayouts} negative />
                    <MoneyLine label="Faktureras restaurang" value={totals?.owed} />
                    <MoneyLine label="ViaEats intäkt ex moms" value={totals?.companyRevenueExVat} strong />
                  </div>
                  <div className="mt-auto border-t border-[var(--border-subtle)] pt-4 text-[11.5px] text-[var(--text-secondary)]">
                    {mollie?.feeStatus === "partial"
                      ? `${formatNumber(mollie.estimatedPaymentCount)} avgifter är preliminära och uppdateras automatiskt.`
                      : "Alla Mollie-avgifter är slutbokförda."}
                  </div>
                </Surface>
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

                  <details className="surface group/totals overflow-hidden">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 hover:bg-[var(--bg-hover)]">
                      <span>
                        <span className="block text-[13.5px] font-black text-[var(--text-primary)]">Visa total ekonomisammanställning</span>
                        <span className="mt-0.5 block text-[11px] text-[var(--text-muted)]">Brutto, återbetalningar, Mollie, provision och moms</span>
                      </span>
                      <ChevronDown size={17} className="shrink-0 text-[var(--text-muted)] transition-transform group-open/totals:rotate-180" />
                    </summary>
                    <div className="grid gap-3 border-t border-[var(--border-subtle)] p-4 lg:grid-cols-3">
                      <div className="rounded-[11px] bg-[var(--bg-page)] px-4 py-3">
                        <p className="card-label mb-1">Försäljning</p>
                        <MoneyLine label="Brutto" value={totals?.grossTotal} />
                        <MoneyLine label="Återbetalt" value={totals?.refunds} negative />
                        <MoneyLine label="Netto" value={totals?.netSales} strong />
                      </div>
                      <div className="rounded-[11px] bg-[var(--bg-page)] px-4 py-3">
                        <p className="card-label mb-1">Mollie</p>
                        <MoneyLine label="Betalavgifter" value={paymentFees} />
                        <MoneyLine label="Refundavgifter" value={totals?.refundProcessingFees} />
                        <MoneyLine label="Totalt" value={totals?.mollieFees} strong />
                      </div>
                      <div className="rounded-[11px] bg-[var(--bg-page)] px-4 py-3">
                        <p className="card-label mb-1">ViaEats</p>
                        <MoneyLine label="Provision ex moms" value={totals?.commission} />
                        <MoneyLine label="Moms" value={totals?.commissionVat} />
                        <MoneyLine label="ViaEats intäkt ex moms" value={totals?.companyRevenueExVat} strong />
                      </div>
                    </div>
                  </details>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
