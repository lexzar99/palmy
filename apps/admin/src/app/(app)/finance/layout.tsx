import styles from "@/modules/finance/finance-layout.module.css";

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return <div className={styles.finance}>{children}</div>;
}
