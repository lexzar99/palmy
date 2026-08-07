import Link from "next/link";

export type RestaurantFinanceView =
  | "settlement"
  | "orders"
  | "versions"
  | "documents"
  | "agreement";

const items: Array<{
  view: RestaurantFinanceView;
  label: string;
  suffix: string;
}> = [
  { view: "settlement", label: "Avräkning", suffix: "" },
  { view: "orders", label: "Order", suffix: "/order" },
  { view: "versions", label: "Versioner", suffix: "/versioner" },
  { view: "documents", label: "PDF", suffix: "/dokument" },
  { view: "agreement", label: "Avtal", suffix: "/avtal" },
];

export function RestaurantFinanceNav({
  restaurantId,
  active,
  month,
  from,
  to,
  period,
}: {
  restaurantId: string;
  active: RestaurantFinanceView;
  month?: string;
  from?: string;
  to?: string;
  period?: string;
}) {
  const params = new URLSearchParams();
  if (month) params.set("month", month);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (period) params.set("period", period);
  const query = params.size ? `?${params.toString()}` : "";

  return (
    <nav
      aria-label="Restaurangens ekonomi"
      className="flex min-w-0 gap-1 overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-1.5 shadow-[var(--shadow-panel)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {items.map((item) => {
        const current = active === item.view;
        return (
          <Link
            key={item.view}
            href={`/finance/${restaurantId}${item.suffix}${query}`}
            aria-current={current ? "page" : undefined}
            className={`inline-flex min-h-9 flex-none items-center rounded-lg px-3 text-xs font-extrabold transition-colors ${
              current
                ? "bg-[var(--brand-navy)] text-white"
                : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
