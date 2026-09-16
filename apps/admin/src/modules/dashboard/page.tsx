"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  Clock3,
  Loader2,
  ReceiptText,
} from "lucide-react";
import {
  getDashboardOverview,
  overviewQueryKey,
} from "@/modules/dashboard/api";
import {
  financeSummaryQueryKey,
  getFinanceSummary,
} from "@/modules/finance/api";
import {
  monthId,
  monthLabel,
  monthRange,
} from "@/modules/finance/finance-workspace";
import { getOrders, ordersQueryKey } from "@/modules/orders/api";
import { OrderDetailsModal } from "@/modules/orders/page";
import { useAdminSession } from "@/shared/hooks/use-admin-session";
import { Badge, Button, ErrorPanel } from "@/shared/components/ui";
import {
  formatCurrency,
  orderStatusLabel,
  orderStatusTone,
  refundBadge,
} from "@/shared/utils/format";
import styles from "./oversikt.module.css";

export function DashboardPage() {
  const session = useAdminSession();
  const [activeOrder, setActiveOrder] = useState<string | null>(null);
  const months = useMemo(
    () =>
      Array.from({ length: 2 }, (_, index) => {
        const date = new Date();
        return monthId(
          new Date(date.getFullYear(), date.getMonth() - index, 1),
        );
      }),
    [],
  );
  const [month, setMonth] = useState(months[0]);
  const { from, to } = monthRange(month);
  const overview = useQuery({
    queryKey: overviewQueryKey(),
    queryFn: () => getDashboardOverview(),
    refetchInterval: 30_000,
  });
  const finance = useQuery({
    queryKey: financeSummaryQueryKey(from, to),
    queryFn: () => getFinanceSummary(from, to),
  });
  const orders = useQuery({
    queryKey: ordersQueryKey("ALL", 1, 5),
    queryFn: () => getOrders("ALL", 1, 5),
    refetchInterval: 20_000,
  });
  const data = overview.data;
  const now = new Date();
  const timeZone = data?.timeZone || "Europe/Stockholm";
  const date = new Intl.DateTimeFormat("sv-SE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone,
  }).format(now);
  const hour = Number(
    new Intl.DateTimeFormat("sv-SE", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone,
    }).format(now),
  );
  const greeting = hour < 10 ? "God morgon" : hour < 17 ? "Hej" : "God kväll";
  const name = session.data?.name?.trim().split(/\s+/)[0];
  if (overview.isError)
    return (
      <ErrorPanel
        title="Översikten kunde inte laddas"
        action={
          <Button onClick={() => void overview.refetch()}>Försök igen</Button>
        }
      />
    );
  if (!data)
    return (
      <div className={styles.loading}>
        <Loader2 size={18} className="animate-spin" /> Hämtar dagens läge…
      </div>
    );
  const yesterday = data.trend7d.at(-2);
  const delta =
    yesterday && yesterday.netSales > 0
      ? ((data.today.netSales - yesterday.netSales) / yesterday.netSales) * 100
      : null;
  const peak = Math.max(1, ...data.trend7d.map((point) => point.netSales));
  const financeHref = `/finance?month=${month}&from=${from}&to=${to}`;
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{date}</p>
          <h1>
            {greeting}
            {name ? `, ${name}` : ""}.
          </h1>
        </div>
        <span className={styles.updated}>
          Uppdaterad{" "}
          {new Intl.DateTimeFormat("sv-SE", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone,
          }).format(new Date(data.generatedAt))}
        </span>
      </header>
      <div className={styles.stats}>
        <div>
          <p>Försäljning idag</p>
          <strong>{formatCurrency(data.today.netSales)}</strong>
          <small>
            {delta === null ? (
              "Efter återbetalningar"
            ) : (
              <>
                <span
                  className={delta >= 0 ? styles.positive : styles.negative}
                >
                  {delta >= 0 ? "+" : ""}
                  {delta.toFixed(1).replace(".", ",")} %
                </span>{" "}
                mot igår
              </>
            )}
          </small>
        </div>
        <div>
          <p>Ordrar idag</p>
          <strong>{data.today.orders}</strong>
          <small>
            {data.today.orders
              ? `${formatCurrency(data.today.netSales / data.today.orders)} i snitt`
              : "Inga beställningar än"}
          </small>
        </div>
        <Link href="/orders">
          <p>Pågående</p>
          <strong>{data.today.liveOrders}</strong>
          <small
            className={data.today.pendingOrders ? styles.accent : undefined}
          >
            {data.today.pendingOrders
              ? `${data.today.pendingOrders} väntar på svar`
              : "Inga väntar på svar"}
          </small>
        </Link>
      </div>
      <div className={styles.grid}>
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <h2>Försäljning</h2>
            <span>Senaste 7 dagarna</span>
          </div>
          <div className={styles.chart}>
            <div className={styles.chartScale}>
              <span>kr / dag</span>
              <span>{formatCurrency(peak)}</span>
            </div>
            <div className={styles.bars}>
              {data.trend7d.map((point, index) => (
                <div className={styles.day} key={point.date}>
                  <div className={styles.barTrack}>
                    <div
                      className={`${styles.bar} ${index === data.trend7d.length - 1 ? styles.todayBar : ""}`}
                      style={{ height: `${(point.netSales / peak) * 100}%` }}
                    />
                  </div>
                  <span>{point.label}</span>
                  <small>{formatCurrency(point.netSales)}</small>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className={`${styles.panel} ${styles.attention}`}>
          <div className={styles.panelHead}>
            <h2>Att hålla koll på</h2>
            <span className={data.actions.length ? styles.accent : undefined}>
              {data.actions.length}
            </span>
          </div>
          <div className={styles.actions}>
            {data.actions.length ? (
              data.actions.slice(0, 4).map((action) => (
                <Link
                  href={action.href}
                  className={styles.action}
                  key={action.id}
                >
                  <span className={styles.actionIcon}>
                    <Clock3 size={17} />
                  </span>
                  <span>
                    <strong>{action.title}</strong>
                    <small>{action.detail}</small>
                  </span>
                  <ChevronRight size={15} />
                </Link>
              ))
            ) : (
              <div className={styles.action}>
                <span className={styles.actionIcon}>
                  <Check size={17} />
                </span>
                <span>
                  <strong>Allt är i ordning</strong>
                  <small>Inga driftåtgärder just nu</small>
                </span>
              </div>
            )}
            {data.actions.length > 4 && (
              <Link href="/restaurants" className={styles.moreLink}>
                Visa fler åtgärder <ArrowUpRight size={14} />
              </Link>
            )}
          </div>
          <Link href="/restaurants" className={styles.openRestaurants}>
            <span />
            {data.restaurants.open} av {data.restaurants.total} restauranger
            öppna
            <ChevronRight size={14} />
          </Link>
        </section>
      </div>
      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <h2>Senaste ordrar</h2>
          <Link href="/orders">
            Visa alla <ArrowUpRight size={14} />
          </Link>
        </div>
        {orders.isError ? (
          <div className={styles.inlineState}>
            <p>Ordrarna kunde inte laddas.</p>
            <Button onClick={() => void orders.refetch()}>Försök igen</Button>
          </div>
        ) : !orders.data ? (
          <p className={styles.inlineState}>Hämtar ordrar…</p>
        ) : orders.data.orders.length === 0 ? (
          <p className={styles.inlineState}>Inga ordrar ännu.</p>
        ) : (
          orders.data.orders.map((order) => {
            const refund = refundBadge(order.paymentStatus);
            return (
              <button
                type="button"
                key={order.id}
                className={styles.order}
                onClick={() => setActiveOrder(order.id)}
              >
                <span className={styles.orderIdentity}>
                  <span className={styles.orderIcon}>
                    <ReceiptText size={17} />
                  </span>
                  <span>
                    <strong>{order.orderNumber}</strong>
                    <small>{order.restaurantName || "Restaurang saknas"}</small>
                  </span>
                </span>
                <span className={styles.customer}>
                  {order.customerName}
                  <small>
                    {order.type === "DELIVERY" ? "Leverans" : "Avhämtning"}
                  </small>
                </span>
                <span className={styles.status}>
                  <Badge
                    tone={
                      refund?.tone ??
                      (orderStatusTone(order.status) as
                        | "success"
                        | "danger"
                        | "warning"
                        | "info"
                        | "neutral")
                    }
                  >
                    {refund?.label ?? orderStatusLabel(order.status)}
                  </Badge>
                </span>
                <span className={styles.amount}>
                  {formatCurrency(order.total)}
                </span>
                <ChevronRight className={styles.orderArrow} size={15} />
              </button>
            );
          })
        )}
      </section>
      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <h2>Ekonomi</h2>
          <label>
            <span className="sr-only">Ekonomiperiod</span>
            <select
              className={styles.month}
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            >
              {months.map((value) => (
                <option key={value} value={value}>
                  {monthLabel(value)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {finance.isError ? (
          <div className={styles.inlineState}>
            <p>Ekonomin kunde inte laddas.</p>
            <Button onClick={() => void finance.refetch()}>Försök igen</Button>
          </div>
        ) : !finance.data ? (
          <p className={styles.inlineState}>Hämtar ekonomi…</p>
        ) : (
          <>
            <div className={styles.finance}>
              <Link href={financeHref}>
                <small>Försäljning totalt</small>
                <strong>
                  {formatCurrency(finance.data.totals.grossTotal)}
                </strong>
              </Link>
              <Link href={`/finance/payouts?month=${month}`}>
                <small>Restaurangernas netto</small>
                <strong>
                  {formatCurrency(finance.data.settlement.payout)}
                </strong>
              </Link>
              <Link href={financeHref}>
                <small>Provision exkl. moms</small>
                <strong>
                  {formatCurrency(finance.data.settlement.ourRevenue)}
                </strong>
              </Link>
            </div>
            <Link className={styles.financeLink} href={financeHref}>
              Öppna ekonomi <ArrowUpRight size={14} />
            </Link>
          </>
        )}
      </section>
      <OrderDetailsModal
        orderId={activeOrder}
        open={Boolean(activeOrder)}
        onClose={() => setActiveOrder(null)}
      />
    </div>
  );
}
