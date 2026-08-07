"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "@/modules/finance/finance-tabs.module.css";

/**
 * Ekonomidelens tre systersidor. De hänger ihop — samma period, samma
 * avräkning, olika detaljnivå — och raden gör den kopplingen synlig oavsett
 * vilken av dem man står på.
 *
 * Perioden följer med i länken så man inte tappar månaden när man byter vy.
 */
const TABS = [
  { href: "/finance", label: "Ekonomi", match: (path: string) => path === "/finance" },
  {
    href: "/finance/restaurangekonomi",
    label: "Restaurangekonomi",
    // En restaurangs spec ligger på /finance/<id> och hör hit, inte till
    // Ekonomi som annars matchar hela prefixet.
    match: (path: string) => {
      if (path.startsWith("/finance/restaurangekonomi")) return true;
      const segment = path.split("/")[2] || "";
      return Boolean(segment) && !["payouts", "avstamning", "installningar"].includes(segment);
    },
  },
  {
    href: "/finance/payouts",
    label: "Utbetalningar",
    match: (path: string) => path.startsWith("/finance/payouts"),
  },
];

export function FinanceTabs({ month }: { month?: string }) {
  const pathname = usePathname();
  const query = month ? `?month=${month}` : "";

  return (
    <nav className={styles.tabs} aria-label="Ekonomi">
      {TABS.map((tab) => {
        const active = tab.match(pathname);
        return (
          <Link
            key={tab.href}
            href={`${tab.href}${query}`}
            aria-current={active ? "page" : undefined}
            className={`${styles.tab} ${active ? styles.tabActive : ""}`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
