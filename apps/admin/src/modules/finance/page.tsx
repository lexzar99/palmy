"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  financeSummaryQueryKey,
  getFinanceSummary,
  type FinanceRow,
  type FinanceSummary,
} from "@/modules/finance/api";
import { isMonthParam, monthId, monthLabel, monthRange } from "@/modules/finance/finance-workspace";
import {
  count,
  fee,
  kr,
  negativeFee,
  num,
  shortDate,
  signed,
  statusLabel,
  type StatusLabel,
} from "@/modules/finance/format";
import { FinanceTabs } from "@/modules/finance/finance-tabs";
import styles from "@/modules/finance/ekonomi.module.css";
import { Button, EmptyState, ErrorPanel, Surface } from "@/shared/components/ui";

const adjustTone = (value: number) =>
  value === 0 ? styles.adjustZero : value > 0 ? styles.adjustPlus : styles.adjustMinus;

const STATUS_STYLE: Record<StatusLabel, string> = {
  Utkast: styles.statusDraft,
  Godkänd: styles.statusApproved,
  Betald: styles.statusPaid,
};

/* ── Periodväljaren ─────────────────────────────────────────────────────── */

type Period = { from: string; to: string; month: string | null };

const isDateParam = (value: string | null): value is string =>
  Boolean(value && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value));

/** De sex senaste kalendermånaderna, senaste först. */
function monthPresets(today: Date) {
  return Array.from({ length: 6 }, (_, index) => {
    const month = monthId(new Date(today.getFullYear(), today.getMonth() - index, 1));
    const range = monthRange(month);
    return { month, label: monthLabel(month), ...range };
  });
}

function PeriodPicker({ period, onChange }: { period: Period; onChange: (next: Period) => void }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(period.from);
  const [to, setTo] = useState(period.to);
  const presets = useMemo(() => monthPresets(new Date()), []);

  const label = period.month
    ? monthLabel(period.month)
    : `${shortDate(period.from)} – ${shortDate(period.to)}`;

  return (
    <>
      <button type="button" className={styles.chip} onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        {label} ▾
      </button>
      {open ? (
        <div className={styles.periodMenu}>
          {presets.map((preset) => (
            <button
              type="button"
              key={preset.month}
              className={styles.periodPreset}
              onClick={() => {
                onChange({ from: preset.from, to: preset.to, month: preset.month });
                setFrom(preset.from);
                setTo(preset.to);
                setOpen(false);
              }}
            >
              <span>{preset.label}</span>
              <span className={styles.periodPresetRange}>
                {shortDate(preset.from)}–{shortDate(preset.to)}
              </span>
            </button>
          ))}
          <div className={styles.periodCustom}>
            <p className={styles.periodCustomLabel}>Egen period</p>
            <div className={styles.periodRange}>
              <input type="date" className={styles.periodDate} value={from} onChange={(event) => setFrom(event.target.value)} aria-label="Från" />
              <span className={styles.periodArrow}>→</span>
              <input type="date" className={styles.periodDate} value={to} onChange={(event) => setTo(event.target.value)} aria-label="Till" />
            </div>
            <button
              type="button"
              className={styles.periodApply}
              disabled={!isDateParam(from) || !isDateParam(to) || from > to}
              onClick={() => {
                onChange({ from, to, month: null });
                setOpen(false);
              }}
            >
              Använd period
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

/* ── De tre kolumnerna ──────────────────────────────────────────────────── */

function MoneyFlow({ summary }: { summary: FinanceSummary }) {
  const s = summary.settlement;
  const orders = summary.totals.orderCount;

  return (
    <div className={styles.columns}>
      {/* 1 — Kunderna betalade */}
      <section className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.step}>1</span>
          <p className={styles.cardLabel}>Kunderna betalade</p>
        </div>
        <p className={styles.cardValue}>{kr(summary.totals.grossTotal)}</p>
        <p className={styles.cardCaption}>Brutto före återbetalningar</p>

        <div className={styles.lines}>
          <div className={styles.line}>
            <span className={styles.lineLabel}>Ordrar</span>
            <span className={styles.lineValue}>{count(orders)}</span>
          </div>
          <div className={styles.line}>
            <span className={styles.lineLabel}>Snittorder</span>
            <span className={styles.lineValue}>
              {orders > 0 ? kr(summary.totals.grossTotal / orders) : "—"}
            </span>
          </div>
          <div className={styles.line}>
            <span className={`${styles.lineLabel} ${styles.lineRefund}`}>
              Återbetalt · {count(s.refundCount)} st
            </span>
            <span className={`${styles.lineValue} ${styles.lineRefund}`}>{num(-summary.totals.refunds)}</span>
          </div>
        </div>

        <div className={styles.cardFoot}>
          <div className={styles.cardTotal}>
            <span className={styles.cardTotalLabel}>Nettoförsäljning</span>
            <span className={styles.cardTotalValue}>{kr(s.netSales)}</span>
          </div>
        </div>
      </section>

      {/* 2 — Restaurangerna får */}
      <section className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.step}>2</span>
          <p className={styles.cardLabel}>Restaurangerna får</p>
        </div>
        <p className={styles.cardValue}>{kr(s.payout)}</p>
        <p className={styles.cardCaption}>Efter provision och egna kortavgifter</p>

        <div className={styles.lines}>
          <div className={styles.line}>
            <span className={styles.lineLabel}>Nettoförsäljning</span>
            <span className={styles.lineValue}>{num(s.netSales)}</span>
          </div>
          <div className={styles.line}>
            <span className={styles.lineLabel}>− Provision inkl moms</span>
            <span className={styles.lineValue}>{num(-s.commissionInclVat)}</span>
          </div>
          <div className={styles.line}>
            <span className={styles.lineLabel}>− Kortavgifter</span>
            <span className={styles.lineValue}>{negativeFee(s.cardFees)}</span>
          </div>
          <div className={styles.line}>
            <span className={styles.lineLabel}>± Manuella justeringar</span>
            <span className={`${styles.lineValue} ${adjustTone(s.adjustment)}`}>{signed(s.adjustment)}</span>
          </div>
        </div>

        <div className={styles.cardFoot}>
          <div className={styles.cardTotal}>
            <span className={styles.cardTotalLabel}>Att betala ut</span>
            <span className={styles.cardTotalValue}>{kr(s.payout)}</span>
          </div>
        </div>
      </section>

      {/* 3 — Vi behåller */}
      <section className={`${styles.card} ${styles.cardNavy}`}>
        <div className={styles.cardHead}>
          <span className={styles.step}>3</span>
          <p className={styles.cardLabel}>Vi behåller</p>
        </div>
        <p className={styles.cardValue}>{kr(s.ourRevenue)}</p>
        <p className={styles.cardCaption}>
          {s.marginPct.toFixed(1).replace(".", ",")} % av nettoförsäljningen
        </p>

        <div className={styles.lines}>
          <div className={styles.line}>
            <span className={styles.lineLabel}>Provision ex moms</span>
            <span className={styles.lineValue}>{num(s.commission)}</span>
          </div>
          <div className={styles.line}>
            <span className={styles.lineLabel}>± Manuella justeringar</span>
            <span className={styles.lineValue}>{signed(-s.adjustment)}</span>
          </div>
          <div className={styles.line}>
            <span className={`${styles.lineLabel} ${styles.lineDim}`}>Moms att redovisa</span>
            <span className={`${styles.lineValue} ${styles.lineDim}`}>{num(s.commissionVat)}</span>
          </div>
        </div>

        <div className={styles.cardFoot}>
          <div className={styles.cardTotal}>
            <span className={styles.cardTotalLabel}>Vår intäkt ex moms</span>
            <span className={styles.cardTotalValue}>{kr(s.ourRevenue)}</span>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ── Tabellen per restaurang ────────────────────────────────────────────── */

const COLUMNS = ["Restaurang", "Ordrar", "Netto", "Provision", "Kortavg.", "Justering", "Utbetalning", "Status"];

function RestaurantTable({ summary, onOpen }: { summary: FinanceSummary; onOpen: (row: FinanceRow) => void }) {
  const rows = summary.rows;
  const statuses = rows.map((row) => statusLabel(row.status));
  const withStatus = (label: StatusLabel) => statuses.filter((value) => value === label).length;
  const s = summary.settlement;

  return (
    <section className={styles.table}>
      <div className={styles.tableHead}>
        <div>
          <h2 className={styles.tableTitle}>Per restaurang</h2>
          <p className={styles.tableSubtitle}>Klicka på en rad för utbetalningsspecifikationen</p>
        </div>
        <div className={styles.counts}>
          <span className={`${styles.count} ${styles.countDraft}`}>{withStatus("Utkast")} utkast</span>
          <span className={`${styles.count} ${styles.countApproved}`}>{withStatus("Godkänd")} godkända</span>
          <span className={`${styles.count} ${styles.countPaid}`}>{withStatus("Betald")} betalda</span>
        </div>
      </div>

      <div className={`${styles.grid} ${styles.columnHeaders}`}>
        {COLUMNS.map((column, index) => (
          <span key={column} className={`${styles.columnHeader} ${index === 0 ? "" : styles.numeric}`}>
            {column}
          </span>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className={styles.empty}>
          <EmptyState
            title="Ingen aktivitet i perioden"
            description="Välj en annan period för att se underlaget."
          />
        </div>
      ) : (
        rows.map((row) => {
          const status = statusLabel(row.status);
          return (
            <button type="button" key={row.restaurantId} className={`${styles.grid} ${styles.row}`} onClick={() => onOpen(row)}>
              <span>
                <span className={styles.rowName}>{row.name}</span>
                <span className={styles.rowMeta}>
                  {row.settlement.commissionPct} % provision · {row.tierLabel}
                </span>
              </span>
              <span className={`${styles.numeric} ${styles.cellSoft}`}>{count(row.orderCount)}</span>
              <span className={`${styles.numeric} ${styles.cellStrong}`}>{num(row.settlement.netSales)}</span>
              <span className={`${styles.numeric} ${styles.cellSoft}`}>{num(row.settlement.commission)}</span>
              <span className={`${styles.numeric} ${styles.cellSoft}`}>{fee(row.settlement.cardFees)}</span>
              <span className={`${styles.numeric} ${styles.cellAdjust} ${adjustTone(row.settlement.adjustment)}`}>
                {signed(row.settlement.adjustment)}
              </span>
              <span className={`${styles.numeric} ${styles.cellPayout}`}>{num(row.settlement.payout)}</span>
              <span className={styles.numeric}>
                <span className={`${styles.status} ${STATUS_STYLE[status]}`}>{status}</span>
              </span>
            </button>
          );
        })
      )}

      <div className={`${styles.grid} ${styles.totalsRow}`}>
        <span className={styles.totalsCell}>Totalt</span>
        <span className={`${styles.numeric} ${styles.totalsCell}`}>{count(summary.totals.orderCount)}</span>
        <span className={`${styles.numeric} ${styles.totalsCell}`}>{num(s.netSales)}</span>
        <span className={`${styles.numeric} ${styles.totalsCell}`}>{num(s.commission)}</span>
        <span className={`${styles.numeric} ${styles.totalsCell}`}>{fee(s.cardFees)}</span>
        <span className={`${styles.numeric} ${styles.totalsCell}`}>{signed(s.adjustment)}</span>
        <span className={`${styles.numeric} ${styles.totalsPayout}`}>{num(s.payout)}</span>
        <span />
      </div>
    </section>
  );
}

/* ── Sidan ──────────────────────────────────────────────────────────────── */

export function FinancePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Perioden lever i URL:en, så en delad länk öppnar samma underlag.
  const period = useMemo<Period>(() => {
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const month = searchParams.get("month");
    if (isDateParam(from) && isDateParam(to) && from <= to) {
      const monthMatch = isMonthParam(month) && monthRange(month).from === from && monthRange(month).to === to
        ? month
        : from.slice(0, 7) === to.slice(0, 7) && monthRange(from.slice(0, 7)).from === from && monthRange(from.slice(0, 7)).to === to
          ? from.slice(0, 7)
          : null;
      return { from, to, month: monthMatch };
    }
    const fallback = isMonthParam(month) ? month : monthId(new Date());
    return { ...monthRange(fallback), month: fallback };
  }, [searchParams]);

  const summary = useQuery({
    queryKey: financeSummaryQueryKey(period.from, period.to),
    queryFn: () => getFinanceSummary(period.from, period.to),
  });

  const changePeriod = (next: Period) => {
    const query = new URLSearchParams({ from: next.from, to: next.to });
    if (next.month) query.set("month", next.month);
    router.replace(`/finance?${query.toString()}`, { scroll: false });
  };

  const openPayout = (row: FinanceRow) => {
    const query = new URLSearchParams({ from: period.from, to: period.to });
    if (period.month) query.set("month", period.month);
    router.push(`/finance/${row.restaurantId}?${query.toString()}`);
  };

  const data = summary.data;
  const periodLabel = period.month
    ? monthLabel(period.month)
    : `${shortDate(period.from)} – ${shortDate(period.to)}`;
  const restaurantCount = data?.rows.length ?? 0;
  const meta = data
    ? `${periodLabel} · ${count(data.totals.orderCount)} ordrar · ${count(restaurantCount)} ${restaurantCount === 1 ? "restaurang" : "restauranger"}`
    : periodLabel;

  return (
    <div className={styles.page}>
      <FinanceTabs month={period.month || period.from.slice(0, 7)} />
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{meta}</p>
          <h1 className={styles.title}>Ekonomi</h1>
        </div>
        <div className={styles.headerActions}>
          <PeriodPicker period={period} onChange={changePeriod} />
          <button
            type="button"
            className={styles.chip}
            onClick={() => void summary.refetch()}
            disabled={summary.isFetching}
          >
            {summary.isFetching ? "Hämtar…" : "Uppdatera"}
          </button>
          <Link
            className={styles.chipPrimary}
            href={`/finance/payouts?month=${period.month || period.from.slice(0, 7)}`}
          >
            Till utbetalningar
          </Link>
        </div>
      </div>

      {summary.isError ? (
        <ErrorPanel
          title="Ekonomin kunde inte laddas"
          description="Inga reservbelopp visas. Försök hämta det riktiga underlaget igen."
          action={<Button onClick={() => void summary.refetch()}>Försök igen</Button>}
        />
      ) : !data ? (
        <Surface className="flex items-center gap-2 px-6 py-14 text-sm text-[var(--text-secondary)]">
          <Loader2 size={16} className="animate-spin" /> Hämtar periodens ekonomi…
        </Surface>
      ) : (
        <>
          <MoneyFlow summary={data} />
          <RestaurantTable summary={data} onOpen={openPayout} />
        </>
      )}
    </div>
  );
}
