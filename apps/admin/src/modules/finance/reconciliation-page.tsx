"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { financeSummaryQueryKey, getFinanceSummary } from "@/modules/finance/api";
import {
  FinanceKpi,
  FinanceWorkspace,
  financeQuery,
  isMonthParam,
  monthId,
  monthRange,
} from "@/modules/finance/finance-workspace";
import styles from "@/modules/finance/finance-workspace.module.css";
import { Badge, Button, EmptyState, ErrorPanel, Surface } from "@/shared/components/ui";
import { formatCurrencyExact as formatCurrency, formatDate, formatNumber } from "@/shared/utils/format";

const money = (value: number | null | undefined) => value == null ? "—" : formatCurrency(value);

export function FinanceReconciliationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentMonth = monthId(new Date());
  const requestedMonth = searchParams.get("month") || searchParams.get("from")?.slice(0, 7) || null;
  const month = isMonthParam(requestedMonth) ? requestedMonth : currentMonth;
  const { from, to } = monthRange(month);
  const summary = useQuery({ queryKey: financeSummaryQueryKey(from, to), queryFn: () => getFinanceSummary(from, to) });

  const changeMonth = (next: string) => {
    if (isMonthParam(next)) router.replace(`/finance/avstamning?${financeQuery(next)}`, { scroll: false });
  };

  return (
    <FinanceWorkspace
      title="Avstämning"
      description="Matcha restaurangernas avräkningar mot Mollies bokförda transaktioner."
      month={month}
      onMonthChange={changeMonth}
      onRefresh={() => void summary.refetch()}
      refreshing={summary.isFetching}
    >
      {summary.isError ? (
        <ErrorPanel title="Avstämningen kunde inte laddas" description="Försök hämta periodens providerunderlag igen." action={<Button onClick={() => void summary.refetch()}>Försök igen</Button>} />
      ) : summary.isLoading || !summary.data ? (
        <Surface className="flex items-center gap-2 px-6 py-14 text-sm text-[var(--text-secondary)]"><Loader2 size={16} className="animate-spin" /> Matchar transaktioner…</Surface>
      ) : (() => {
        const data = summary.data;
        const deviations = data.reconciliation.deviations.filter((item) => item.severity !== "info");
        const difference = data.fundingReconciliation.difference;
        const exact = deviations.length === 0 && data.fundingReconciliation.status === "exact" && data.mollie.periodLedgerStatus === "exact";
        return (
          <>
            <div className={styles.kpiGrid}>
              <FinanceKpi label="Beräknat restaurangnetto" value={money(data.fundingReconciliation.calculatedRestaurantNet)} detail="Avräkningar efter avgifter och justeringar" />
              <FinanceKpi label="Mollie-netto" value={money(data.fundingReconciliation.mollieRestaurantNet)} detail={`${formatNumber(data.fundingReconciliation.externalPayments.count)} providerbetalningar`} />
              <FinanceKpi label="Differens" value={difference == null ? "Inväntar" : money(Math.abs(difference))} detail={exact ? "Perioden matchar" : "Ska vara 0,00 kr vid komplett underlag"} />
              <FinanceKpi label="Omatchade transaktioner" value={formatNumber(data.mollie.unlinkedPaymentCount)} detail={money(data.mollie.unlinkedNet)} />
            </div>

            <section className={`${styles.panel} border-l-[3px] ${exact ? "border-l-[var(--success)]" : "border-l-[var(--warning)]"}`}>
              <div className={styles.panelHeader}>
                <div className="flex items-center gap-3">
                  {exact ? <CheckCircle2 size={19} className="text-[var(--success)]" /> : <AlertCircle size={19} className="text-[var(--warning)]" />}
                  <div>
                    <h2 className={styles.panelTitle}>{exact ? "Perioden är avstämd" : "Kontroll krävs innan stängning"}</h2>
                    <p className={styles.panelSubtitle}>{exact ? "Restaurangnettot matchar providerboken." : `${formatNumber(deviations.length)} avvikelser eller ofullständiga providerdata.`}</p>
                  </div>
                </div>
                <Badge tone={exact ? "success" : "warning"}>{exact ? "Avstämt" : "Öppet"}</Badge>
              </div>
            </section>

            <div className={styles.twoColumn}>
              <section className={styles.panel}>
                <div className={styles.panelHeader}>
                  <div>
                    <h2 className={styles.panelTitle}>Avvikelser</h2>
                    <p className={styles.panelSubtitle}>Prioriterade fel mellan order, betalning och restaurang.</p>
                  </div>
                </div>
                {deviations.length === 0 ? (
                  <div className="px-5 py-10"><EmptyState title="Inga avvikelser" description="Alla kontrollerade transaktioner matchar." /></div>
                ) : deviations.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={`${styles.actionRow} w-full text-left`}
                    onClick={() => item.restaurantId && router.push(`/finance/${item.restaurantId}?${financeQuery(month)}`)}
                    disabled={!item.restaurantId}
                  >
                    <span className="min-w-0">
                      <span className={styles.restaurantName}>{item.title}</span>
                      <span className={styles.restaurantMeta}>{item.restaurantName || item.paymentId || "Providerpost"} · {item.detail}</span>
                    </span>
                    <span><Badge tone={item.severity === "critical" ? "danger" : "warning"}>{item.severity === "critical" ? "Kritisk" : "Kontrollera"}</Badge></span>
                    <span className="flex items-center gap-3"><span className={styles.amount}>{money(item.amount)}</span>{item.restaurantId ? <ArrowRight size={14} /> : null}</span>
                  </button>
                ))}
              </section>

              <div className="grid gap-3">
                <section className={styles.panel}>
                  <div className={styles.panelHeader}><div><h2 className={styles.panelTitle}>Mollie · saldo</h2><p className={styles.panelSubtitle}>Aktuellt saldo, oberoende av vald månad.</p></div></div>
                  <div className={styles.statusList}>
                    <div className={styles.statusLine}><span className={styles.statusLabel}>Tillgängligt</span><span className={styles.statusCount}>{money(data.mollie.availableBalance)}</span></div>
                    <div className={styles.statusLine}><span className={styles.statusLabel}>Väntande</span><span className={styles.statusCount}>{money(data.mollie.pendingBalance)}</span></div>
                    <div className={styles.statusLine}><span className={styles.statusLabel}>Nästa utbetalning</span><span className={styles.statusCount}>{money(data.mollie.nextSettlementAmount)}</span></div>
                    <div className={styles.statusLine}><span className={styles.statusLabel}>Datum</span><span className={styles.statusCount}>{data.mollie.nextPayoutDate ? formatDate(data.mollie.nextPayoutDate) : "—"}</span></div>
                  </div>
                </section>
                <section className={styles.panel}>
                  <div className={styles.panelHeader}><div><h2 className={styles.panelTitle}>Providerbok · period</h2><p className={styles.panelSubtitle}>{data.mollie.periodReportUntil ? `Rapport t.o.m. ${formatDate(data.mollie.periodReportUntil)}` : "Rapportdatum saknas"}</p></div></div>
                  <div className={styles.statusList}>
                    <div className={styles.statusLine}><span className={styles.statusLabel}>Betalningar</span><span className={styles.statusCount}>{money(data.mollie.periodGross)}</span></div>
                    <div className={styles.statusLine}><span className={styles.statusLabel}>Återbetalningar</span><span className={styles.statusCount}>{data.mollie.periodRefunds == null ? "—" : `− ${money(data.mollie.periodRefunds)}`}</span></div>
                    <div className={styles.statusLine}><span className={styles.statusLabel}>Transaktionsavgifter</span><span className={styles.statusCount}>{data.mollie.periodFees == null ? "—" : `− ${money(data.mollie.periodFees)}`}</span></div>
                    <div className={styles.statusLine}><span className={styles.statusLabel}>Stängningssaldo</span><span className={styles.statusCount}>{money(data.mollie.periodClosingBalance)}</span></div>
                  </div>
                </section>
              </div>
            </div>
          </>
        );
      })()}
    </FinanceWorkspace>
  );
}
