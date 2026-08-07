"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { getDashboardOverview, overviewQueryKey } from "@/modules/dashboard/api";
import {
  financeSummaryQueryKey,
  getFinanceSummary,
  type FinanceRow,
} from "@/modules/finance/api";
import { monthId, monthLabel, monthRange } from "@/modules/finance/finance-workspace";
import { count, krCompact, negativeFee, num, signed, statusLabel } from "@/modules/finance/format";
import { useAdminSession } from "@/shared/hooks/use-admin-session";
import { ErrorPanel, Surface } from "@/shared/components/ui";
import styles from "@/modules/dashboard/oversikt.module.css";

/** "Lördag 8 augusti" med versal begynnelsebokstav. */
const longDate = (date: Date) => {
  const text = new Intl.DateTimeFormat("sv-SE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const clockTime = (value: string | undefined) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("sv-SE", { hour: "2-digit", minute: "2-digit" }).format(date);
};

const greeting = (date: Date) => {
  const hour = date.getHours();
  if (hour < 10) return "God morgon";
  if (hour < 17) return "Hej";
  return "God kväll";
};

/** Förnamnet räcker i en hälsningsfras. */
const firstName = (name: string | null | undefined, email: string | null | undefined) => {
  const trimmed = String(name || "").trim();
  if (trimmed) return trimmed.split(/\s+/)[0];
  const local = String(email || "").split("@")[0];
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : "";
};

export function DashboardPage() {
  const router = useRouter();
  const session = useAdminSession();
  const [more, setMore] = useState(false);

  const months = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 2 }, (_, index) =>
      monthId(new Date(today.getFullYear(), today.getMonth() - index, 1)),
    );
  }, []);
  const [month, setMonth] = useState(months[0]);
  const { from, to } = monthRange(month);

  const overview = useQuery({ queryKey: overviewQueryKey(), queryFn: () => getDashboardOverview() });
  const finance = useQuery({
    queryKey: financeSummaryQueryKey(from, to),
    queryFn: () => getFinanceSummary(from, to),
  });

  const now = new Date();
  const data = overview.data;
  const summary = finance.data;

  if (overview.isError || finance.isError) {
    return (
      <div className={styles.page}>
        <ErrorPanel
          title="Översikten kunde inte laddas"
          description="Inga reservbelopp visas. Försök hämta det riktiga underlaget igen."
          action={
            <button
              type="button"
              className={styles.moreToggle}
              onClick={() => {
                void overview.refetch();
                void finance.refetch();
              }}
            >
              Försök igen
            </button>
          }
        />
      </div>
    );
  }

  if (!data || !summary) {
    return (
      <div className={styles.page}>
        <Surface className="flex items-center gap-2 px-6 py-14 text-sm text-[var(--text-secondary)]">
          <Loader2 size={16} className="animate-spin" /> Hämtar dagens läge…
        </Surface>
      </div>
    );
  }

  const s = summary.settlement;
  // Störst försäljning först. På översikten är listan en rangordning, inte ett
  // register — den som omsätter mest ska stå överst, inte den som råkar heta
  // något tidigt i alfabetet. Vid lika netto avgör namnet, så ordningen är
  // stabil mellan omladdningar.
  const rows = [...summary.rows]
    .sort(
      (a, b) =>
        b.settlement.netSales - a.settlement.netSales || a.name.localeCompare(b.name, "sv"),
    )
    .map((row) => ({ row, status: statusLabel(row.status) }));
  const group = (status: string) => rows.filter((item) => item.status === status);
  const sum = (list: typeof rows) => list.reduce((total, item) => total + item.row.settlement.payout, 0);
  const drafts = group("Utkast");
  const approved = group("Godkänd");
  const paid = group("Betald");

  // Fördelningsstapeln speglar beloppen, inte antalet poster.
  const totalPayout = Math.max(1, sum(drafts) + sum(approved) + sum(paid));
  const share = (value: number) => `${Math.max(0, (value / totalPayout) * 100)}%`;

  const trend = data.trend7d;
  const peak = Math.max(1, ...trend.map((point) => point.netSales));
  const reference = trend.length > 1 ? trend[0] : null;
  const delta =
    reference && reference.netSales > 0
      ? ((data.today.netSales - reference.netSales) / reference.netSales) * 100
      : null;

  const openPayout = (row: FinanceRow) =>
    router.push(`/finance/${row.restaurantId}?month=${month}&from=${from}&to=${to}`);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>
            {longDate(now)} · uppdaterad {clockTime(data.generatedAt)}
          </p>
          <h1 className={styles.greeting}>
            {greeting(now)}
            {firstName(session.data?.name, session.data?.email)
              ? `, ${firstName(session.data?.name, session.data?.email)}`
              : ""}
          </h1>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.openChip}>
            <span
              className={`${styles.openDot} ${data.restaurants.open < data.restaurants.total ? styles.openDotClosed : ""}`}
            />
            <span>
              {data.restaurants.open} av {data.restaurants.total} öppna nu
            </span>
          </span>
          <div className={styles.segment}>
            {months.map((value) => (
              <button
                type="button"
                key={value}
                className={`${styles.segmentButton} ${value === month ? styles.segmentButtonActive : ""}`}
                onClick={() => setMonth(value)}
              >
                {monthLabel(value)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.topRow}>
        <section className={styles.hero}>
          <div className={styles.heroTop}>
            <p className={styles.eyebrow}>{monthLabel(month)}</p>
            <Link className={styles.heroLink} href={`/finance?month=${month}&from=${from}&to=${to}`}>
              Ekonomi →
            </Link>
          </div>

          <div className={styles.heroBlock}>
            <p className={styles.heroLabel}>Försäljning totalt</p>
            <p className={styles.heroValue}>{krCompact(summary.totals.grossTotal)}</p>
          </div>

          <div className={styles.heroSplit}>
            <div>
              <p className={styles.heroLabel}>Netto till restaurangerna</p>
              <p className={styles.heroSubValue}>{krCompact(s.payout)}</p>
              <div className={styles.heroLines}>
                <span className={styles.heroLine}>
                  <span className={styles.heroLineLabel}>Återbetalningar</span>
                  <span className={styles.heroLineValue}>{num(-summary.totals.refunds)}</span>
                </span>
                <span className={styles.heroLine}>
                  <span className={styles.heroLineLabel}>Kortavgifter</span>
                  <span className={styles.heroLineValue}>{negativeFee(s.cardFees)}</span>
                </span>
                <span className={styles.heroLine}>
                  <span className={styles.heroLineLabel}>Provision inkl moms</span>
                  <span className={styles.heroLineValue}>{num(-s.commissionInclVat)}</span>
                </span>
              </div>
            </div>
            <div>
              <p className={styles.heroLabel}>Vår provision ex moms</p>
              <p className={styles.heroSubValue}>{krCompact(s.ourRevenue)}</p>
              <div className={styles.heroLines}>
                <span className={styles.heroLine}>
                  <span className={styles.heroLineLabel}>Inkl moms</span>
                  <span className={styles.heroLineValue}>{num(s.commissionInclVat)}</span>
                </span>
                <span className={styles.heroLine}>
                  <span className={styles.heroLineLabel}>Moms att redovisa</span>
                  <span className={styles.heroLineValue}>{num(s.commissionVat)}</span>
                </span>
                <span className={styles.heroLine}>
                  <span className={styles.heroLineLabel}>Justeringar</span>
                  <span className={styles.heroLineValue}>{signed(s.adjustment)}</span>
                </span>
              </div>
            </div>
          </div>

          <div className={styles.trend}>
            {trend.map((point, index) => (
              <span className={styles.trendDay} key={point.date}>
                <span className={styles.trendValue}>{Math.round(point.netSales / 1000)}k</span>
                <span className={styles.trendTrack}>
                  <span
                    className={`${styles.trendBar} ${index === trend.length - 1 ? styles.trendBarToday : ""}`}
                    style={{ height: `${Math.max(10, Math.round((point.netSales / peak) * 100))}%` }}
                  />
                </span>
                <span className={styles.trendLabel}>{point.label}</span>
              </span>
            ))}
          </div>
        </section>

        <div className={styles.sideColumn}>
          <Link className={`${styles.card} ${styles.cardLink}`} href={`/finance/payouts?month=${month}`}>
            <div className={styles.cardHead}>
              <p className={styles.cardLabel}>Att betala ut</p>
              <span className={styles.cardOpen}>Öppna →</span>
            </div>
            <p className={styles.cardValue}>{krCompact(s.payout)}</p>
            <div className={styles.shareBar}>
              <span className={styles.shareDraft} style={{ width: share(sum(drafts)) }} />
              <span className={styles.shareApproved} style={{ width: share(sum(approved)) }} />
              <span className={styles.sharePaid} style={{ width: share(sum(paid)) }} />
            </div>
            <div className={styles.shareLegend}>
              <span className={styles.shareItem}>
                <span className={styles.shareCount}>{drafts.length} utkast</span>
                <span className={styles.shareValue}>{num(sum(drafts))}</span>
              </span>
              <span className={`${styles.shareItem} ${styles.shareItemCenter}`}>
                <span className={styles.shareCount}>{approved.length} godkända</span>
                <span className={styles.shareValue}>{num(sum(approved))}</span>
              </span>
              <span className={`${styles.shareItem} ${styles.shareItemRight}`}>
                <span className={styles.shareCount}>{paid.length} betalda</span>
                <span className={styles.shareValue}>{num(sum(paid))}</span>
              </span>
            </div>
          </Link>

          <section className={`${styles.card} ${styles.todayCard}`}>
            <p className={styles.cardLabel}>Idag</p>
            <p className={styles.cardValue}>{krCompact(data.today.netSales)}</p>
            {delta == null ? (
              <p className={styles.cardDelta} style={{ color: "var(--text-muted)" }}>
                Ingen jämförelseperiod
              </p>
            ) : (
              <p className={`${styles.cardDelta} ${delta < 0 ? styles.cardDeltaDown : ""}`}>
                {delta >= 0 ? "+" : "−"}
                {Math.abs(delta).toFixed(1).replace(".", ",")} % mot {reference?.label}
              </p>
            )}
            <div className={styles.todayFoot}>
              <span className={styles.todayStat}>
                <span className={styles.todayStatLabel}>Ordrar</span>
                <span className={styles.todayStatValue}>{count(data.today.orders)}</span>
              </span>
              <span className={styles.todayStat}>
                <span className={styles.todayStatLabel}>Live</span>
                <span className={`${styles.todayStatValue} ${styles.todayStatLive}`}>
                  {count(data.today.liveOrders)}
                </span>
              </span>
              <span className={styles.todayStat}>
                <span className={styles.todayStatLabel}>Öppna</span>
                <span className={styles.todayStatValue}>
                  {data.restaurants.open}/{data.restaurants.total}
                </span>
              </span>
            </div>
          </section>
        </div>
      </div>

      <div className={styles.bottomRow}>
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Restauranger</h2>
            <Link className={styles.panelLink} href={`/finance?month=${month}&from=${from}&to=${to}`}>
              Visa alla
            </Link>
          </div>
          <div className={`${styles.grid} ${styles.columnHeaders}`}>
            <span className={styles.columnHeader}>Restaurang</span>
            <span className={`${styles.columnHeader} ${styles.numeric}`}>Netto</span>
            <span className={`${styles.columnHeader} ${styles.numeric} ${styles.hideNarrow}`}>Provision</span>
            <span className={`${styles.columnHeader} ${styles.numeric}`}>Utbetalning</span>
            <span className={`${styles.columnHeader} ${styles.numeric} ${styles.hideNarrow}`}>Status</span>
          </div>
          {rows.map(({ row, status }) => (
            <button
              type="button"
              key={row.restaurantId}
              className={`${styles.grid} ${styles.row}`}
              onClick={() => openPayout(row)}
            >
              <span className={styles.rowName}>{row.name}</span>
              <span className={`${styles.numeric} ${styles.cellSoft}`}>{num(row.settlement.netSales)}</span>
              <span className={`${styles.numeric} ${styles.cellSoft} ${styles.hideNarrow}`}>
                {num(row.settlement.commission)}
              </span>
              <span className={`${styles.numeric} ${styles.cellPayout}`}>{num(row.settlement.payout)}</span>
              <span className={`${styles.numeric} ${styles.cellStatus} ${styles.hideNarrow}`}>{status}</span>
            </button>
          ))}
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Behöver åtgärd</h2>
            <span className={styles.panelCount}>
              {data.actions.length + drafts.length} att göra
            </span>
          </div>
          {drafts.length > 0 ? (
            <button
              type="button"
              className={styles.actionRow}
              onClick={() => router.push(`/finance/payouts?month=${month}`)}
            >
              <span className={styles.actionTitle}>
                {drafts.length} utbetalning{drafts.length === 1 ? "" : "ar"} väntar på godkännande
              </span>
              <span className={styles.actionValue}>{num(sum(drafts))}</span>
            </button>
          ) : null}
          {data.actions.map((action) => (
            <button
              type="button"
              key={action.id}
              className={styles.actionRow}
              onClick={() => router.push(action.href)}
            >
              <span className={styles.actionTitle}>{action.title}</span>
              <span className={styles.actionValue}>{action.detail}</span>
            </button>
          ))}
          {data.actions.length === 0 && drafts.length === 0 ? (
            <p className={styles.actionEmpty}>Inget kräver åtgärd just nu.</p>
          ) : null}
          <span className={styles.actionSpacer} />
        </section>
      </div>

      {more ? (
        <div className={styles.moreGrid}>
          <article className={styles.moreCard}>
            <p className={styles.moreLabel}>Live-ordrar</p>
            <p className={styles.moreValue}>{count(data.today.liveOrders)}</p>
          </article>
          <article className={styles.moreCard}>
            <p className={styles.moreLabel}>Väntar på svar</p>
            <p className={styles.moreValue}>{count(data.today.pendingOrders)}</p>
          </article>
          <article className={styles.moreCard}>
            <p className={styles.moreLabel}>Återbetalningar</p>
            <p className={styles.moreValue}>{krCompact(summary.totals.refunds)}</p>
          </article>
          <article className={styles.moreCard}>
            <p className={styles.moreLabel}>Snittorder</p>
            <p className={styles.moreValue}>
              {summary.totals.orderCount > 0
                ? krCompact(summary.totals.grossTotal / summary.totals.orderCount)
                : "—"}
            </p>
          </article>
        </div>
      ) : null}

      <button type="button" className={styles.moreToggle} onClick={() => setMore((value) => !value)}>
        {more ? "Dölj" : "Fler åtgärder"}
      </button>
    </div>
  );
}
