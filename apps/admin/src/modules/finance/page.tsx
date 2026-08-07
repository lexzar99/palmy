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
import {
  financeSummaryQueryKey,
  getFinanceSummary,
  type FinanceRow,
  type FinanceSummary,
} from "@/modules/finance/api";
import { DeliveryModeBadge } from "@/shared/components/delivery-mode";
import {
  Badge,
  Button,
  EmptyState,
  ErrorPanel,
  Input,
  PageHeader,
  Surface,
} from "@/shared/components/ui";
import {
  formatCurrencyExact as formatCurrency,
  formatDate,
  formatNumber,
} from "@/shared/utils/format";

type FinancePageProps = { view?: "overview" | "restaurants" };
type ModeFilter = "all" | "platform" | "self";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Utkast",
  APPROVED: "Låst",
  PAID: "Betald",
  HOLD: "Sparad · ej låst",
};

const MOLLIE_SETTLEMENT_STATUS: Record<string, string> = {
  open: "Öppen",
  pending: "Väntar",
  paidout: "Utbetald",
};

const RATE_SOURCE_LABEL: Record<FinanceRow["rateSource"], string> = {
  "global-self": "global sats",
  "global-platform": "global sats",
  override: "eget avtal",
  snapshot: "låst sats",
};

const isoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const monthId = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const isMonthParam = (value: string | null): value is string =>
  Boolean(value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value));

function monthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(year, monthNumber - 1, 1);
  const calendarEnd = new Date(year, monthNumber, 0);
  return { from: isoDate(start), to: isoDate(calendarEnd) };
}

function previousMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return monthId(new Date(year, monthNumber - 2, 1));
}

function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const label = new Intl.DateTimeFormat("sv-SE", { month: "long", year: "numeric" }).format(
    new Date(year, monthNumber - 1, 1),
  );
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const money = (value: number | null | undefined) =>
  value == null ? "—" : formatCurrency(value);

const deductionMoney = (value: number | null | undefined) =>
  value == null ? "—" : Number(value) === 0 ? formatCurrency(0) : `−${formatCurrency(Math.abs(value))}`;

const statusTone = (status: string | null): "neutral" | "info" | "success" | "warning" =>
  status === "PAID" ? "success" : status === "APPROVED" ? "info" : status === "HOLD" ? "warning" : "neutral";

function MonthPicker({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  const current = monthId(new Date());
  const previous = previousMonth(current);

  return (
    <Surface className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="card-label">Period</p>
        <p className="mt-0.5 text-sm font-black text-[var(--text-primary)]">{monthLabel(month)}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="segmented" role="group" aria-label="Snabbval av period">
          <button type="button" aria-pressed={month === current} onClick={() => onChange(current)} className={month === current ? "is-active" : ""}>
            Denna månad
          </button>
          <button type="button" aria-pressed={month === previous} onClick={() => onChange(previous)} className={month === previous ? "is-active" : ""}>
            Förra månaden
          </button>
        </div>
        <Input
          type="month"
          value={month}
          max={current}
          aria-label="Välj kalendermånad"
          onChange={(event) => event.target.value && onChange(event.target.value)}
          style={{ width: 160 }}
        />
      </div>
    </Surface>
  );
}

function KpiCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Surface className="min-w-0 px-5 py-5">
      <p className="card-label">{label}</p>
      <p className="mt-2 truncate text-[clamp(22px,2.2vw,30px)] font-black tracking-[-0.04em] tabular-nums text-[var(--text-primary)]">
        {value}
      </p>
      <p className="mt-1.5 truncate text-[11.5px] font-semibold text-[var(--text-muted)]">{detail}</p>
    </Surface>
  );
}

function MoneyLine({
  label,
  value,
  deduction = false,
  strong = false,
}: {
  label: string;
  value: number | null | undefined;
  deduction?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-[12px] text-[var(--text-secondary)]">{label}</span>
      <span className={`${strong ? "font-black" : "font-bold"} shrink-0 tabular-nums text-[var(--text-primary)]`}>
        {deduction ? deductionMoney(value) : money(value)}
      </span>
    </div>
  );
}

function MollieNowCard({ mollie }: { mollie: FinanceSummary["mollie"] }) {
  return (
    <Surface className="px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Mollie · just nu</p>
          <h2 className="section-title mt-1">Saldo</h2>
        </div>
        <p className="text-[11px] font-semibold text-[var(--text-muted)]">Påverkas inte av vald månad</p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="surface-muted px-4 py-3">
          <p className="card-label">Tillgängligt</p>
          <p className="mt-1.5 text-lg font-black tabular-nums">{money(mollie.availableBalance)}</p>
        </div>
        <div className="surface-muted px-4 py-3">
          <p className="card-label">Väntande</p>
          <p className="mt-1.5 text-lg font-black tabular-nums">{money(mollie.pendingBalance)}</p>
        </div>
        <div className="surface-muted px-4 py-3">
          <p className="card-label">Totalt saldo</p>
          <p className="mt-1.5 text-lg font-black tabular-nums">{money(mollie.totalBalance)}</p>
        </div>
        <div className="surface-muted px-4 py-3">
          <p className="card-label">Nästa utbetalning</p>
          <p className="mt-1.5 text-lg font-black tabular-nums">{money(mollie.nextSettlementAmount)}</p>
          <p className="mt-0.5 text-[10.5px] font-semibold text-[var(--text-muted)]">
            {mollie.nextPayoutDate ? formatDate(mollie.nextPayoutDate) : "Datum saknas"}
            {mollie.nextSettlementStatus
              ? ` · ${MOLLIE_SETTLEMENT_STATUS[mollie.nextSettlementStatus] || mollie.nextSettlementStatus}`
              : ""}
          </p>
        </div>
      </div>
    </Surface>
  );
}

function ReconciliationPanel({
  summary,
  onOpenRestaurant,
}: {
  summary: FinanceSummary;
  onOpenRestaurant: (restaurantId: string) => void;
}) {
  const actionable = summary.reconciliation.deviations.filter((deviation) => deviation.severity !== "info");
  const exact =
    actionable.length === 0 &&
    summary.fundingReconciliation.status === "exact" &&
    summary.mollie.periodLedgerStatus === "exact";
  const unavailable =
    summary.fundingReconciliation.status === "unavailable" ||
    summary.mollie.periodLedgerStatus === "unavailable";
  const visibleDeviations = actionable.slice(0, 5);
  const title = exact
    ? "Avstämt"
    : actionable.length > 0
      ? `${formatNumber(actionable.length)} ${actionable.length === 1 ? "post behöver" : "poster behöver"} kontrolleras`
      : unavailable
        ? "Inväntar komplett underlag"
        : "Avstämning pågår";

  return (
    <Surface className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] ${
              exact
                ? "bg-[var(--success-soft)] text-[var(--success)]"
                : unavailable
                  ? "bg-[var(--bg-page)] text-[var(--text-muted)]"
                  : "bg-[var(--warning-soft)] text-[var(--warning)]"
            }`}
          >
            {exact ? <span className="text-lg font-black">✓</span> : <AlertCircle size={17} />}
          </span>
          <div className="min-w-0">
            <p className="text-[13.5px] font-black text-[var(--text-primary)]">{title}</p>
            <p className="mt-0.5 text-[11.5px] text-[var(--text-muted)]">
              {exact
                ? "Restaurangernas belopp matchar Mollies bokförda period."
                : summary.fundingReconciliation.difference == null
                  ? "Beloppen uppdateras när Mollies periodrapport är komplett."
                  : `${money(Math.abs(summary.fundingReconciliation.difference))} i differens för vald månad.`}
            </p>
          </div>
        </div>
        <Badge tone={exact ? "success" : unavailable ? "neutral" : "warning"}>
          {exact ? "Klar" : unavailable ? "Väntar" : "Kontrollera"}
        </Badge>
      </div>

      {visibleDeviations.length > 0 ? (
        <div className="border-t border-[var(--border-subtle)]">
          {visibleDeviations.map((deviation) => {
            const content = (
              <>
                <AlertCircle
                  size={15}
                  className={deviation.severity === "critical" ? "shrink-0 text-[var(--danger)]" : "shrink-0 text-[var(--warning)]"}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-extrabold text-[var(--text-primary)]">
                    {deviation.title}
                  </span>
                  {deviation.restaurantName ? (
                    <span className="mt-0.5 block truncate text-[11px] text-[var(--text-muted)]">{deviation.restaurantName}</span>
                  ) : null}
                </span>
                {deviation.amount != null ? (
                  <span className="shrink-0 text-[12px] font-black tabular-nums">{money(deviation.amount)}</span>
                ) : null}
                {deviation.restaurantId ? <ArrowRight size={14} className="shrink-0 text-[var(--text-muted)]" /> : null}
              </>
            );

            return deviation.restaurantId ? (
              <button
                key={deviation.id}
                type="button"
                onClick={() => onOpenRestaurant(deviation.restaurantId!)}
                className="flex w-full items-center gap-3 border-b border-[var(--border-subtle)] px-5 py-3 text-left last:border-0 hover:bg-[var(--bg-hover)]"
              >
                {content}
              </button>
            ) : (
              <div key={deviation.id} className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-5 py-3 last:border-0">
                {content}
              </div>
            );
          })}
          {actionable.length > visibleDeviations.length ? (
            <p className="border-t border-[var(--border-subtle)] px-5 py-3 text-[11.5px] font-semibold text-[var(--text-muted)]">
              + {formatNumber(actionable.length - visibleDeviations.length)} fler avvikelser
            </p>
          ) : null}
        </div>
      ) : null}
    </Surface>
  );
}

function AdvancedReconciliation({ summary }: { summary: FinanceSummary }) {
  const funding = summary.fundingReconciliation;
  const mollie = summary.mollie;

  return (
    <details className="surface group/advanced overflow-hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-[12.5px] font-extrabold text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">
        Avancerad avstämning
        <ChevronDown size={15} className="transition-transform group-open/advanced:rotate-180" />
      </summary>
      <div className="grid border-t border-[var(--border-subtle)] lg:grid-cols-2">
        <div className="px-5 py-4 lg:border-r lg:border-[var(--border-subtle)]">
          <p className="card-label mb-2">Restauranger mot Mollie</p>
          <MoneyLine label="Mollie · restaurangernas netto" value={funding.mollieRestaurantNet} />
          <MoneyLine label="Beräknat restaurangnetto" value={funding.calculatedRestaurantNet} />
          <MoneyLine label="Att fakturera separat" value={funding.invoiceTotal} />
          <div className="mt-1 border-t border-[var(--border-subtle)] pt-1">
            <MoneyLine label="Differens" value={funding.difference} strong />
          </div>
        </div>
        <div className="border-t border-[var(--border-subtle)] px-5 py-4 lg:border-t-0">
          <p className="card-label mb-2">Mollies periodbok</p>
          <MoneyLine label="Ingående saldo" value={mollie.periodOpeningBalance} />
          <MoneyLine label="Betalningar" value={mollie.periodGross} />
          <MoneyLine label="Återbetalningar" value={mollie.periodRefunds} deduction />
          <MoneyLine label="Mollieavgifter" value={mollie.periodFees} deduction />
          {Number(mollie.periodOtherMovements || 0) !== 0 ? (
            <MoneyLine label="Övriga saldorörelser" value={mollie.periodOtherMovements} />
          ) : null}
          <div className="mt-1 border-t border-[var(--border-subtle)] pt-1">
            <MoneyLine label="Utgående saldo" value={mollie.periodClosingBalance} strong />
          </div>
        </div>
      </div>
      {funding.externalPayments.count > 0 ? (
        <p className="border-t border-[var(--border-subtle)] bg-[var(--bg-page)] px-5 py-3 text-[11.5px] text-[var(--text-muted)]">
          {formatNumber(funding.externalPayments.count)} externa betalningar hålls utanför restaurangernas ekonomi · {money(funding.externalPayments.net)} netto.
        </p>
      ) : null}
    </details>
  );
}

function RestaurantTable({ rows, onOpen }: { rows: FinanceRow[]; onOpen: (restaurantId: string) => void }) {
  return (
    <div className="table-shell">
      <table className="data-table min-w-[980px]">
        <thead>
          <tr>
            <th>Restaurang</th>
            <th>Villkor</th>
            <th className="text-right">Försäljning</th>
            <th className="text-right">Avdrag totalt</th>
            <th className="text-right">Utbetalning / faktura</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const viaEatsCharge = row.commission + row.subscription + row.feeVat;
            const paymentFees = row.restaurantMollieFee;
            const totalDeductions = viaEatsCharge + (paymentFees ?? 0);
            const isInvoice = row.owed > 0;
            const settlement = isInvoice ? row.owed : row.payout;
            const final = row.mollieFeeStatus === "available";
            const status = row.mollieConfirmationReady
              ? "Avgifter klara"
              : row.waitingForMollieConfirmation
                ? "Väntar på avgifter"
                : row.status
                  ? STATUS_LABEL[row.status] || row.status
                  : row.orderCount > 0
                    ? "Pågående"
                    : "Ingen aktivitet";
            const rowStatusTone = row.mollieConfirmationReady
              ? "success"
              : row.waitingForMollieConfirmation
                ? "warning"
                : statusTone(row.status);

            return (
              <tr key={row.restaurantId}>
                <td>
                  <button type="button" onClick={() => onOpen(row.restaurantId)} className="text-left hover:underline">
                    <span className="block font-black text-[var(--text-primary)]">{row.name}</span>
                    <span className="mt-0.5 block text-[11px] text-[var(--text-muted)]">{row.city || "Ingen stad"}</span>
                  </button>
                </td>
                <td>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-black tabular-nums text-[var(--text-primary)]">{row.commissionPct}%</span>
                    <DeliveryModeBadge selfDelivery={row.selfDelivery} />
                  </div>
                  <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                    {row.tierLabel} · {RATE_SOURCE_LABEL[row.rateSource]}
                  </p>
                </td>
                <td className="text-right">
                  <p className="font-black tabular-nums text-[var(--text-primary)]">{money(row.netSales)}</p>
                  <p className="mt-1 text-[11px] text-[var(--text-muted)]">{formatNumber(row.orderCount)} betalningar</p>
                </td>
                <td className="text-right">
                  <p className="font-black tabular-nums text-[var(--text-primary)]">
                    {paymentFees == null ? `≈ ${money(totalDeductions)}` : money(totalDeductions)}
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                    {paymentFees == null
                      ? "ViaEats inkl. moms · betalavgifter inväntar"
                      : `ViaEats ${money(viaEatsCharge)} · betalavgifter ${money(paymentFees)}`}
                  </p>
                </td>
                <td className="text-right">
                  <p className={`font-black tabular-nums ${isInvoice ? "text-[var(--warning)]" : "text-[var(--text-primary)]"}`}>
                    {!final && settlement > 0 ? `≈ ${money(settlement)}` : money(settlement)}
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--text-muted)]">{isInvoice ? "Att fakturera" : "Att betala ut"}</p>
                </td>
                <td><Badge tone={rowStatusTone}>{status}</Badge></td>
                <td>
                  <div className="flex justify-end">
                    <Button onClick={() => onOpen(row.restaurantId)}>
                      {row.mollieConfirmationReady ? "Ersätt rapport" : "Öppna"} <ArrowRight size={13} />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function FinancePage({ view = "overview" }: FinancePageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<ModeFilter>("all");
  const currentMonth = monthId(new Date());
  const requestedMonth = searchParams.get("month");
  const legacyFrom = searchParams.get("from");
  const selectedMonth = isMonthParam(requestedMonth)
    ? requestedMonth
    : isMonthParam(legacyFrom?.slice(0, 7) || null)
      ? legacyFrom!.slice(0, 7)
      : currentMonth;
  const { from, to } = monthRange(selectedMonth);

  const summary = useQuery({
    queryKey: financeSummaryQueryKey(from, to),
    queryFn: () => getFinanceSummary(from, to),
  });

  const filteredRows = useMemo(() => {
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
        a.name.localeCompare(b.name, "sv"),
      );
  }, [mode, query, summary.data]);

  const changeMonth = (month: string) => {
    if (!isMonthParam(month)) return;
    const range = monthRange(month);
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", month);
    params.set("from", range.from);
    params.set("to", range.to);
    params.delete("tab");
    if (month === currentMonth) params.set("period", "month");
    else if (month === previousMonth(currentMonth)) params.set("period", "lastMonth");
    else params.delete("period");
    router.replace(`${view === "overview" ? "/finance" : "/finance/restauranger"}?${params.toString()}`, { scroll: false });
  };

  const openPayout = (restaurantId: string) => {
    const params = new URLSearchParams({ from, to, month: selectedMonth });
    if (selectedMonth === currentMonth) params.set("period", "month");
    else if (selectedMonth === previousMonth(currentMonth)) params.set("period", "lastMonth");
    router.push(`/finance/${restaurantId}?${params.toString()}`);
  };

  const rows = summary.data?.rows || [];
  const rowsWithPayments = rows.filter((row) => row.orderCount > 0);
  const mollieReadyRows = rows.filter((row) => row.mollieConfirmationReady);
  const mollieWaitingRows = rows.filter((row) => row.waitingForMollieConfirmation && !row.mollieConfirmationReady);
  const feesAreFinal = rowsWithPayments.length > 0 && rowsWithPayments.every((row) => row.mollieFeeStatus === "available");
  const activeRows = filteredRows.filter(
    (row) => row.orderCount > 0 || row.manualAdjustment !== 0 || row.payout > 0 || row.owed > 0 || row.status != null,
  );
  const inactiveRows = filteredRows.filter(
    (row) => row.orderCount === 0 && row.manualAdjustment === 0 && row.payout === 0 && row.owed === 0 && row.status == null,
  );

  return (
    <div className="page-stack">
      <PageHeader
        breadcrumb="Plattform"
        title={view === "overview" ? "Ekonomi" : "Restaurangekonomi"}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            {view === "overview" ? (
              <>
                <Button onClick={() => router.push(`/finance/restauranger?month=${selectedMonth}&from=${from}&to=${to}`)}>
                  Restauranger <ArrowRight size={14} />
                </Button>
                <Button onClick={() => router.push("/finance/installningar")}>Satser</Button>
              </>
            ) : (
              <>
                <Button onClick={() => router.push(`/finance?month=${selectedMonth}&from=${from}&to=${to}`)}>Översikt</Button>
                <Button onClick={() => router.push("/finance/installningar")}>Satser</Button>
                <Button onClick={() => router.push("/tiers")}>Tiers</Button>
              </>
            )}
            <Button onClick={() => void summary.refetch()} disabled={summary.isFetching}>
              <RefreshCw size={14} className={summary.isFetching ? "animate-spin" : undefined} />
              Uppdatera
            </Button>
          </div>
        )}
      />

      <MonthPicker month={selectedMonth} onChange={changeMonth} />

      {summary.isError ? (
        <ErrorPanel
          title="Ekonomin kunde inte laddas"
          description="Försök igen om en stund."
          action={<Button onClick={() => void summary.refetch()}><RefreshCw size={15} /> Försök igen</Button>}
        />
      ) : summary.isLoading || !summary.data ? (
        <Surface className="flex items-center gap-2 px-6 py-12 text-sm text-[var(--text-secondary)]">
          <Loader2 size={16} className="animate-spin" /> Laddar ekonomi…
        </Surface>
      ) : view === "overview" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Försäljning"
              value={money(summary.data.totals.netSales)}
              detail={`${formatNumber(summary.data.totals.orderCount)} betalningar efter återbetalningar`}
            />
            <KpiCard
              label="ViaEats intäkt"
              value={money(summary.data.totals.companyRevenueExVat)}
              detail="Provision + abonnemang exkl. moms"
            />
            <KpiCard
              label="Att betala ut"
              value={money(summary.data.totals.payout)}
              detail={rowsWithPayments.length === 0 ? "Ingen utbetalning denna månad" : feesAreFinal ? "Avgifterna är klara" : "Preliminärt tills Mollie är klar"}
            />
            <KpiCard
              label="Att fakturera"
              value={money(summary.data.totals.owed)}
              detail={summary.data.totals.owed > 0 ? "Restaurangavgifter som överstiger saldo" : "Inget att fakturera"}
            />
          </div>

          {mollieReadyRows.length > 0 ? (
            <Surface className="flex flex-wrap items-center justify-between gap-3 border-l-[3px] border-l-[var(--success)] px-5 py-4">
              <div>
                <p className="text-sm font-black text-[var(--text-primary)]">
                  Exakta betalavgifter är klara för {formatNumber(mollieReadyRows.length)} {mollieReadyRows.length === 1 ? "rapport" : "rapporter"}
                </p>
                <p className="mt-1 text-[11.5px] font-semibold text-[var(--text-muted)]">Öppna rapporten och spara en ny version med de exakta avgifterna.</p>
              </div>
              <Button onClick={() => openPayout(mollieReadyRows[0].restaurantId)}>
                Öppna {mollieReadyRows.length === 1 ? "rapport" : "första rapporten"} <ArrowRight size={14} />
              </Button>
            </Surface>
          ) : mollieWaitingRows.length > 0 ? (
            <Surface className="flex items-center gap-3 border-l-[3px] border-l-[var(--warning)] px-5 py-4">
              <AlertCircle size={17} className="shrink-0 text-[var(--warning)]" />
              <p className="text-[12px] font-semibold text-[var(--text-secondary)]">
                {formatNumber(mollieWaitingRows.length)} {mollieWaitingRows.length === 1 ? "sparad rapport väntar" : "sparade rapporter väntar"} på exakta betalavgifter från Mollie.
              </p>
            </Surface>
          ) : null}

          <MollieNowCard mollie={summary.data.mollie} />
          <ReconciliationPanel summary={summary.data} onOpenRestaurant={openPayout} />
          <AdvancedReconciliation summary={summary.data} />
        </>
      ) : (
        <>
          <Surface className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <p className="text-[12px] font-semibold text-[var(--text-secondary)]">
              <span className="font-black text-[var(--text-primary)]">{formatNumber(activeRows.length)}</span> restauranger med aktivitet
              {Number(summary.data.totals.payout || 0) > 0 ? ` · ${money(summary.data.totals.payout)} att betala ut` : ""}
              {Number(summary.data.totals.owed || 0) > 0 ? ` · ${money(summary.data.totals.owed)} att fakturera` : ""}
            </p>
            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
              <div className="relative min-w-[220px] max-w-[360px] flex-1">
                <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Sök restaurang eller stad"
                  style={{ paddingLeft: 38 }}
                />
              </div>
              <div className="segmented" role="radiogroup" aria-label="Filtrera på leveransmodell">
                <button type="button" role="radio" aria-checked={mode === "all"} onClick={() => setMode("all")} className={mode === "all" ? "is-active" : ""}>Alla</button>
                <button type="button" role="radio" aria-checked={mode === "platform"} onClick={() => setMode("platform")} className={mode === "platform" ? "is-active" : ""}>Vi levererar</button>
                <button type="button" role="radio" aria-checked={mode === "self"} onClick={() => setMode("self")} className={mode === "self" ? "is-active" : ""}>Egen leverans</button>
              </div>
            </div>
          </Surface>

          {filteredRows.length === 0 ? (
            <Surface className="px-6 py-6"><EmptyState title="Inga restauranger matchar filtret" /></Surface>
          ) : (
            <>
              {activeRows.length > 0 ? (
                <Surface className="overflow-hidden p-0">
                  <RestaurantTable rows={activeRows} onOpen={openPayout} />
                </Surface>
              ) : null}

              {inactiveRows.length > 0 ? (
                <details className="surface overflow-hidden" open={Boolean(query.trim())}>
                  <summary className="cursor-pointer px-4 py-3 text-[12.5px] font-extrabold text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">
                    Utan aktivitet ({formatNumber(inactiveRows.length)})
                  </summary>
                  <div className="border-t border-[var(--border-subtle)]">
                    <RestaurantTable rows={inactiveRows} onOpen={openPayout} />
                  </div>
                </details>
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  );
}
