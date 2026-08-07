"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import styles from "@/modules/finance/finance-workspace.module.css";

// Restaurangreskontran är borta — Ekonomisidans egen tabell per restaurang
// ersätter den.
const NAV_ITEMS = [
  { href: "/finance", label: "Ekonomi" },
  { href: "/finance/payouts", label: "Utbetalningar" },
  { href: "/finance/avstamning", label: "Avstämning" },
  { href: "/finance/installningar", label: "Provision" },
  { href: "/finance/installningar/abonnemang", label: "Abonnemang" },
];

export const isoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export const monthId = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

export const isMonthParam = (value: string | null): value is string =>
  Boolean(value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value));

export function monthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return {
    from: isoDate(new Date(year, monthNumber - 1, 1)),
    to: isoDate(new Date(year, monthNumber, 0)),
  };
}

export function shiftMonth(month: string, delta: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  return monthId(new Date(year, monthNumber - 1 + delta, 1));
}

export function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const label = new Intl.DateTimeFormat("sv-SE", { month: "long", year: "numeric" }).format(
    new Date(year, monthNumber - 1, 1),
  );
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function financeQuery(month: string) {
  const range = monthRange(month);
  return `month=${month}&from=${range.from}&to=${range.to}`;
}

export function FinanceWorkspace({
  title,
  description,
  month,
  onMonthChange,
  onRefresh,
  refreshing,
  actions,
  children,
}: {
  title: string;
  description?: string;
  month?: string;
  onMonthChange?: (month: string) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const currentMonth = monthId(new Date());
  const navQuery = month ? `?${financeQuery(month)}` : "";
  const financeSegment = pathname.split("/")[2] || "";
  // En restaurangs utbetalningsspec hör hem under Ekonomi i navigationen.
  const onRestaurantDetail = Boolean(
    financeSegment && !["payouts", "avstamning", "installningar"].includes(financeSegment),
  );

  return (
    <div className={styles.workspace}>
      <header className={styles.shell}>
        <div className={styles.shellTop}>
          <div>
            <p className={styles.eyebrow}>ViaEats ekonomi</p>
            <h1 className={styles.title}>{title}</h1>
            {description ? <p className={styles.description}>{description}</p> : null}
          </div>
          <div className={styles.shellActions}>
            {month && onMonthChange ? (
              <div className={styles.periodControl} aria-label="Välj ekonomiperiod">
                <button type="button" className={styles.periodArrow} onClick={() => onMonthChange(shiftMonth(month, -1))} aria-label="Föregående månad">
                  <ChevronLeft size={15} />
                </button>
                <input
                  className={styles.periodInput}
                  type="month"
                  value={month}
                  max={currentMonth}
                  aria-label="Kalendermånad"
                  onChange={(event) => event.target.value && onMonthChange(event.target.value)}
                />
                <button type="button" className={styles.periodArrow} disabled={month >= currentMonth} onClick={() => onMonthChange(shiftMonth(month, 1))} aria-label="Nästa månad">
                  <ChevronRight size={15} />
                </button>
              </div>
            ) : null}
            {onRefresh ? (
              <button type="button" className={styles.refreshButton} onClick={onRefresh} disabled={refreshing}>
                <RefreshCw size={14} className={refreshing ? "animate-spin" : undefined} />
                <span>Uppdatera</span>
              </button>
            ) : null}
            {actions}
          </div>
        </div>
        <nav className={styles.nav} aria-label="Ekonomi">
          {NAV_ITEMS.map((item) => {
            const active = item.href === "/finance"
              ? pathname === item.href || onRestaurantDetail
              : item.href === "/finance/installningar"
                ? pathname === item.href
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={`${item.href}${navQuery}`}
                aria-current={active ? "page" : undefined}
                className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      {children}
    </div>
  );
}

export function FinanceKpi({ label, value, detail }: { label: string; value: React.ReactNode; detail?: React.ReactNode }) {
  return (
    <article className={styles.kpiCard}>
      <p className={styles.kpiLabel}>{label}</p>
      <p className={styles.kpiValue}>{value}</p>
      {detail ? <p className={styles.kpiDetail}>{detail}</p> : null}
    </article>
  );
}
