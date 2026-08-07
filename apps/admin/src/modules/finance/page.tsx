"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, Loader2, Search } from "lucide-react";
import {
  financeSummaryQueryKey,
  getFinanceSummary,
  type FinanceRow,
  type FinanceSummary,
} from "@/modules/finance/api";
import {
  FinanceKpi,
  FinanceWorkspace,
  financeQuery,
  isMonthParam,
  monthId,
  monthRange,
} from "@/modules/finance/finance-workspace";
import styles from "@/modules/finance/finance-workspace.module.css";
import { Badge, Button, EmptyState, ErrorPanel, Input, Surface } from "@/shared/components/ui";
import { formatCurrencyExact as formatCurrency, formatNumber } from "@/shared/utils/format";

type FinancePageProps = { view?: "overview" | "restaurants" };
type LedgerFilter = "action" | "open" | "review" | "locked" | "paid" | "all";
type SettlementStage = Exclude<LedgerFilter, "all"> | "inactive";

const money = (value: number | null | undefined) => value == null ? "—" : formatCurrency(value);

const STATUS_META: Record<SettlementStage, { label: string; tone: "neutral" | "info" | "success" | "warning" | "danger"; rank: number }> = {
  action: { label: "Åtgärd krävs", tone: "danger", rank: 0 },
  review: { label: "Redo att granska", tone: "info", rank: 1 },
  open: { label: "Pågående", tone: "warning", rank: 2 },
  locked: { label: "Låst", tone: "info", rank: 3 },
  paid: { label: "Betald", tone: "success", rank: 4 },
  inactive: { label: "Ingen aktivitet", tone: "neutral", rank: 5 },
};

function hasActivity(row: FinanceRow) {
  return row.orderCount > 0 || row.payout > 0 || row.owed > 0 || row.manualAdjustment !== 0 ||
    row.lateRefundRecovery > 0 || row.lateRefundRecoveryRemaining > 0 || row.recoveryBlocked || row.status != null;
}

function rowStage(row: FinanceRow, hasDeviation = false): SettlementStage {
  const status = String(row.status || "").toUpperCase();
  if (hasDeviation || row.recoveryRequiresAction) return "action";
  if (status === "PAID") return "paid";
  if (status === "APPROVED") return "locked";
  if (status === "DRAFT") return "action";
  // The summary API confirms provider fees, but the payout endpoint alone
  // verifies period/order refund windows. Never present fee readiness as a
  // promise that the report can already be locked.
  if (status === "HOLD") return row.mollieConfirmationReady ? "action" : "open";
  if (row.owed > 0 && row.orderCount === 0) return "review";
  if (row.mollieFeeStatus === "available" && row.orderCount > 0) return "review";
  if (row.waitingForMollieConfirmation || row.orderCount > 0) return "open";
  return "inactive";
}

function statusReason(row: FinanceRow, stage: SettlementStage) {
  if (row.recoveryRequiresAction && row.recoveryBlocked) return "Sen återbetalning måste granskas";
  if (row.recoveryRequiresAction && row.lateRefundRecoveryRemaining > 0) return `Sen återbetalning · ${money(row.lateRefundRecoveryRemaining)} kvarstår`;
  if (row.recoveryRequiresAction && row.lateRefundRecovery > 0) return `Sen återbetalning · ${money(row.lateRefundRecovery)}`;
  if (stage === "action" && row.mollieConfirmationReady) return "Exakta avgifter finns — skapa ny version";
  if (stage === "action") return "Kontrollera underlaget";
  if (stage === "review") return "Avgifter klara · låsbarhet kontrolleras i avräkningen";
  if (stage === "open" && row.mollieFeeStatus !== "available") return "Inväntar betalavgifter";
  if (stage === "locked") return "Officiell version sparad";
  if (stage === "paid") return row.payoutReference ? `Referens ${row.payoutReference}` : "Utbetalning registrerad";
  return "Ingen ekonomisk aktivitet";
}

function rateLabel(row: FinanceRow) {
  if (row.rateSource === "snapshot") return `${row.commissionPct} % · låst`;
  if (row.rateSource === "override") return `${row.commissionPct} % · eget`;
  return `${row.commissionPct} % · standard`;
}

function outcome(row: FinanceRow) {
  if (row.owed > 0) return { label: "Faktura", amount: row.owed };
  if (row.payout > 0) return { label: "Utbetalning", amount: row.payout };
  return { label: "Nollsaldo", amount: 0 };
}

function StatusBadge({ stage }: { stage: SettlementStage }) {
  const meta = STATUS_META[stage];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

function KpiStrip({ summary }: { summary: FinanceSummary }) {
  const active = summary.rows.filter(hasActivity);
  const exactFees = active.filter((row) => row.mollieFeeStatus === "available").length;
  return (
    <div className={styles.kpiGrid}>
      <FinanceKpi label="Nettoförsäljning" value={money(summary.totals.netSales)} detail={`Brutto ${money(summary.totals.grossTotal)} · återbetalt ${money(summary.totals.refunds)}`} />
      <FinanceKpi label="ViaEats · exkl. moms" value={money(summary.totals.companyRevenueExVat)} detail={`Inkl. moms ${money(summary.totals.commission + summary.totals.subscription + summary.totals.feeVat)}`} />
      <FinanceKpi label="Att betala ut" value={money(summary.totals.payout)} detail={`${formatNumber(exactFees)} av ${formatNumber(active.length)} avräkningar har exakta avgifter`} />
      <FinanceKpi label="Att fakturera" value={money(summary.totals.owed)} detail={summary.totals.owed > 0 ? "Restaurangens kostnader överstiger saldot" : "Inga negativa avräkningar"} />
    </div>
  );
}

function MonthClose({ summary, stages }: { summary: FinanceSummary; stages: Map<string, SettlementStage> }) {
  const activeRows = summary.rows.filter(hasActivity);
  const values = [
    { name: "Underlag", value: activeRows.length, ready: true },
    { name: "Avgifter klara", value: activeRows.filter((row) => row.mollieFeeStatus === "available").length, ready: activeRows.every((row) => row.mollieFeeStatus === "available") },
    { name: "Att granska", value: activeRows.filter((row) => stages.get(row.restaurantId) === "review").length, ready: activeRows.every((row) => ["locked", "paid"].includes(stages.get(row.restaurantId) || "")) },
    { name: "Låsta", value: activeRows.filter((row) => stages.get(row.restaurantId) === "locked").length, ready: activeRows.every((row) => ["locked", "paid"].includes(stages.get(row.restaurantId) || "")) },
    { name: "Betalda", value: activeRows.filter((row) => stages.get(row.restaurantId) === "paid").length, ready: activeRows.length > 0 && activeRows.every((row) => stages.get(row.restaurantId) === "paid") },
  ];
  const finished = values[4].ready;
  return (
    <section className={styles.closePanel}>
      <div className={styles.closeIntro}>
        <p className={styles.microLabel}>Månadsstängning</p>
        <h2 className={styles.closeTitle}>{finished ? "Perioden är stängd" : "Perioden är i arbete"}</h2>
        <p className={styles.closeCopy}>Följ avräkningarna från komplett orderunderlag till registrerad betalning.</p>
      </div>
      <div className={styles.closeSteps}>
        {values.map((step, index) => (
          <div className={styles.closeStep} key={step.name}>
            <span className={`${styles.stepDot} ${step.ready ? styles.stepDotReady : ""}`}>{step.ready ? <Check size={12} /> : index + 1}</span>
            <p className={styles.stepName}>{step.name}</p>
            <p className={styles.stepValue}>{formatNumber(step.value)} st</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Overview({ summary, onOpen }: { summary: FinanceSummary; onOpen: (id: string) => void }) {
  const deviationIds = new Set(summary.reconciliation.deviations.filter((item) => item.severity !== "info" && item.restaurantId).map((item) => item.restaurantId!));
  const stages = new Map(summary.rows.map((row) => [row.restaurantId, rowStage(row, deviationIds.has(row.restaurantId))]));
  const queue = summary.rows
    .filter((row) => ["action", "review", "open"].includes(stages.get(row.restaurantId) || ""))
    .sort((a, b) => STATUS_META[stages.get(a.restaurantId)!].rank - STATUS_META[stages.get(b.restaurantId)!].rank || Math.max(b.payout, b.owed) - Math.max(a.payout, a.owed))
    .slice(0, 6);
  const counts = (["action", "open", "review", "locked", "paid"] as SettlementStage[]).map((stage) => ({
    stage,
    count: summary.rows.filter((row) => stages.get(row.restaurantId) === stage).length,
  }));

  return (
    <>
      <KpiStrip summary={summary} />
      <MonthClose summary={summary} stages={stages} />
      <div className={styles.twoColumn}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2 className={styles.panelTitle}>Nästa att göra</h2>
              <p className={styles.panelSubtitle}>Avvikelser och avräkningar som kan föras framåt.</p>
            </div>
            <Button onClick={() => onOpen(queue[0]?.restaurantId)} disabled={queue.length === 0}>Öppna nästa <ArrowRight size={14} /></Button>
          </div>
          {queue.length === 0 ? (
            <div className="px-5 py-8"><EmptyState title="Inget kräver åtgärd" description="Periodens aktiva avräkningar är hanterade." /></div>
          ) : queue.map((row) => {
            const stage = stages.get(row.restaurantId)!;
            const rowOutcome = outcome(row);
            return (
              <button type="button" className={`${styles.actionRow} w-full text-left`} key={row.restaurantId} onClick={() => onOpen(row.restaurantId)}>
                <span className="min-w-0">
                  <span className={styles.restaurantName}>{row.name}</span>
                  <span className={styles.restaurantMeta}>{statusReason(row, stage)}</span>
                </span>
                <span><StatusBadge stage={stage} /></span>
                <span className="flex items-center gap-3">
                  <span className="text-right"><span className={styles.amount}>{money(rowOutcome.amount)}</span><span className={`${styles.restaurantMeta} block`}>{rowOutcome.label}</span></span>
                  <ArrowRight size={14} className="text-[var(--text-muted)]" />
                </span>
              </button>
            );
          })}
        </section>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2 className={styles.panelTitle}>Avräkningsstatus</h2>
              <p className={styles.panelSubtitle}>{formatNumber(summary.rows.filter(hasActivity).length)} restauranger med aktivitet.</p>
            </div>
          </div>
          <div className={styles.statusList}>
            {counts.map(({ stage, count }) => (
              <div className={styles.statusLine} key={stage}>
                <span className={styles.statusLabel}>
                  <span className={`${styles.statusDot} ${stage === "action" || stage === "open" ? styles.statusDotWarning : stage === "paid" ? styles.statusDotSuccess : styles.statusDotInfo}`} />
                  {STATUS_META[stage].label}
                </span>
                <span className={styles.statusCount}>{formatNumber(count)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function RestaurantLedger({ summary, onOpen }: { summary: FinanceSummary; onOpen: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<LedgerFilter>("action");
  const deviationIds = useMemo(() => new Set(summary.reconciliation.deviations.filter((item) => item.severity !== "info" && item.restaurantId).map((item) => item.restaurantId!)), [summary.reconciliation.deviations]);
  const rows = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("sv-SE");
    return summary.rows
      .map((row) => ({ row, stage: rowStage(row, deviationIds.has(row.restaurantId)) }))
      .filter(({ row, stage }) => filter === "all" || stage === filter)
      .filter(({ row }) => !normalized || `${row.name} ${row.city || ""}`.toLocaleLowerCase("sv-SE").includes(normalized))
      .sort((a, b) => STATUS_META[a.stage].rank - STATUS_META[b.stage].rank || Math.max(b.row.payout, b.row.owed) - Math.max(a.row.payout, a.row.owed) || a.row.name.localeCompare(b.row.name, "sv"));
  }, [deviationIds, filter, query, summary.rows]);
  const filters: Array<{ value: LedgerFilter; label: string }> = [
    { value: "action", label: "Åtgärd" },
    { value: "open", label: "Pågående" },
    { value: "review", label: "Granska" },
    { value: "locked", label: "Låsta" },
    { value: "paid", label: "Betalda" },
    { value: "all", label: "Alla" },
  ];

  return (
    <>
      <KpiStrip summary={summary} />
      <div className={styles.filterBar}>
        <div className={styles.search}>
          <Search size={15} />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Sök restaurang eller stad" aria-label="Sök restaurang eller stad" />
        </div>
        <div className={styles.filterTabs} role="group" aria-label="Filtrera på avräkningsstatus">
          {filters.map((item) => {
            const count = summary.rows.filter((row) => item.value === "all" ? true : rowStage(row, deviationIds.has(row.restaurantId)) === item.value).length;
            return (
              <button type="button" aria-pressed={filter === item.value} key={item.value} onClick={() => setFilter(item.value)} className={`${styles.filterTab} ${filter === item.value ? styles.filterTabActive : ""}`}>
                {item.label} · {formatNumber(count)}
              </button>
            );
          })}
        </div>
      </div>
      <section className={styles.panel}>
        {rows.length === 0 ? (
          <div className="px-6 py-10"><EmptyState title="Inga avräkningar matchar" description="Byt statusfilter eller sök efter en annan restaurang." /></div>
        ) : (
          <div className={styles.ledger}>
            <table className={styles.ledgerTable}>
              <thead><tr><th>Restaurang</th><th>Status</th><th className={styles.numeric}>Försäljning</th><th>Avtal</th><th className={styles.numeric}>ViaEats</th><th className={styles.numeric}>Utfall</th><th aria-label="Åtgärd" /></tr></thead>
              <tbody>
                {rows.map(({ row, stage }) => {
                  const rowOutcome = outcome(row);
                  const providerFees = row.restaurantMollieFee ?? row.mollieFees;
                  return (
                    <tr key={row.restaurantId} onDoubleClick={() => onOpen(row.restaurantId)}>
                      <td>
                        <p className={styles.restaurantName}>{row.name}</p>
                        <p className={styles.restaurantMeta}>{row.city || "Stad saknas"} · {row.tierLabel}{row.archived ? " · Arkiverad" : ""}</p>
                      </td>
                      <td><StatusBadge stage={stage} /><p className={styles.restaurantMeta}>{statusReason(row, stage)}</p></td>
                      <td className={styles.numeric} data-mobile-label="Försäljning"><span className={styles.outcomePrimary}>Netto {money(row.netSales)}</span><p className={styles.outcomeMeta}>Brutto {money(row.grossTotal)} · återbetalt {money(row.refunds)}</p></td>
                      <td data-mobile-label="Avtal"><span className={styles.outcomePrimary}>{rateLabel(row)}</span><p className={styles.outcomeMeta}>{row.selfDelivery ? "Egen leverans" : "ViaEats levererar"}</p></td>
                      <td className={styles.numeric} data-mobile-hidden="true"><span className={styles.outcomePrimary}>{money(row.commission + row.subscription + row.feeVat)} inkl. moms</span><p className={styles.outcomeMeta}>Provision {money(row.commission)} exkl. · {money(row.commissionInclVat)} inkl.</p><p className={styles.outcomeMeta}>{providerFees == null ? "Kortavgift inväntas" : `Kort + återbetalning ${money(providerFees)}`}</p></td>
                      <td className={styles.numeric} data-mobile-label={rowOutcome.label}><span className={styles.outcomePrimary}>{money(rowOutcome.amount)}</span><p className={styles.outcomeMeta}>{rowOutcome.label}</p></td>
                      <td className={styles.numeric}><Button onClick={() => onOpen(row.restaurantId)}>Granska <ArrowRight size={13} /></Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

export function FinancePage({ view = "overview" }: FinancePageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentMonth = monthId(new Date());
  const requestedMonth = searchParams.get("month") || searchParams.get("from")?.slice(0, 7) || null;
  const month = isMonthParam(requestedMonth) ? requestedMonth : currentMonth;
  const { from, to } = monthRange(month);
  const summary = useQuery({ queryKey: financeSummaryQueryKey(from, to), queryFn: () => getFinanceSummary(from, to) });
  const basePath = view === "overview" ? "/finance" : "/finance/restauranger";

  const changeMonth = (next: string) => {
    if (!isMonthParam(next)) return;
    router.replace(`${basePath}?${financeQuery(next)}`, { scroll: false });
  };
  const openPayout = (restaurantId?: string) => {
    if (!restaurantId) return;
    router.push(`/finance/${restaurantId}?${financeQuery(month)}`);
  };

  return (
    <FinanceWorkspace
      title={view === "overview" ? "Ekonomikontroll" : "Avräkningar"}
      description={view === "overview" ? "Stäng månaden från underlag till betalning." : "En samlad reskontra för varje restaurang och avräkning."}
      month={month}
      onMonthChange={changeMonth}
      onRefresh={() => void summary.refetch()}
      refreshing={summary.isFetching}
    >
      {summary.isError ? (
        <ErrorPanel title="Ekonomin kunde inte laddas" description="Inga reservbelopp visas. Försök hämta det riktiga underlaget igen." action={<Button onClick={() => void summary.refetch()}>Försök igen</Button>} />
      ) : summary.isLoading || !summary.data ? (
        <Surface className="flex items-center gap-2 px-6 py-14 text-sm text-[var(--text-secondary)]"><Loader2 size={16} className="animate-spin" /> Hämtar periodens ekonomi…</Surface>
      ) : view === "overview" ? (
        <Overview summary={summary.data} onOpen={openPayout} />
      ) : (
        <RestaurantLedger summary={summary.data} onOpen={openPayout} />
      )}
    </FinanceWorkspace>
  );
}
