"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { ChevronRight, History } from "lucide-react";
import { useTranslation } from "@/lib/i18n/LocaleProvider";
import { getPlatformSessionStatus } from "@/lib/platformSessionClient";
import { forgetRawOrderAccessToken, readOrderHistory, type StoredOrderRef } from "@/lib/orderHistory";

// Ordrar som inte ska visas i historiken — samma filter som profilens
// order-flik (avbrutna/avvisade/obetalda göms).
const HIDDEN_ORDER_STATUSES = new Set(["AWAITING_PAYMENT", "CANCELLED", "REJECTED", "DELIVERY_FAILED"]);
const HIDDEN_PAYMENT_STATUSES = new Set(["PENDING", "FAILED", "EXPIRED"]);

type OrderRow = {
  id: string;
  phone: string | null;
  accessToken?: string | null;
  createdAt?: string | null;
  restaurantName?: string | null;
  total?: number | null; // kr — API:t levererar redan kronor, dividera ALDRIG igen
  status?: string | null;
  itemCount?: number | null;
};

function OrdersSkeleton() {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-[15px]" style={{ borderTop: i === 0 ? "0" : "1px solid var(--border-muted)" }}>
          <div className="skeleton h-9 w-9 rounded-full shrink-0" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="skeleton h-3.5 w-40 rounded-full" />
            <div className="skeleton h-3 w-56 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function OrdersPage() {
  const { t, locale } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [orders, setOrders] = useState<OrderRow[]>([]);

  const dateLabel = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "sv-SE", { day: "numeric", month: "short" });
    return (iso?: string | null) => {
      if (!iso) return null;
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? null : fmt.format(d);
    };
  }, [locale]);

  const statusLabel = (status?: string | null) => {
    const key = String(status || "").toUpperCase();
    if (!key) return null;
    const label = t(`orders.status.${key}`);
    // t() returnerar nyckeln vid miss — visa då rå status hellre än nyckeln.
    return label.startsWith("orders.status.") ? key : label;
  };

  useEffect(() => {
    let active = true;

    const loadLoggedIn = async () => {
      // Samma endpoint + statusfilter som profilens order-flik. Inloggade
      // orderlänkar behöver ingen PII i URL:en; proxyn skickar sessionen.
      const [ordersRes, profileRes] = await Promise.all([
        axios.get(`/api/platform/profile/orders`).catch(() => ({ data: [] })),
        axios.get(`/api/platform/profile`).catch(() => ({ data: null })),
      ]);
      const profilePhone = profileRes.data?.phone || null;
      const rows = (Array.isArray(ordersRes.data) ? ordersRes.data : [])
        .filter((order: any) => {
          const status = String(order?.status || "").toUpperCase();
          const paymentStatus = String(order?.paymentStatus || "").toUpperCase();
          return !HIDDEN_ORDER_STATUSES.has(status) && !HIDDEN_PAYMENT_STATUSES.has(paymentStatus);
        })
        .map((order: any): OrderRow => ({
          id: String(order.id),
          phone: order.customerPhone || profilePhone,
          accessToken: null,
          createdAt: order.createdAt ?? null,
          restaurantName: order.restaurantName || order.restaurant?.name || null,
          total: Number(order.total ?? order.totalAmount ?? 0),
          status: order.status ?? null,
          itemCount: Array.isArray(order.items) ? order.items.length : null,
        }));
      if (active) setOrders(rows);
    };

    const loadGuest = async () => {
      // Gäst: lokalt sparade, icke-hemliga orderreferenser. Varje rad hämtas
      // med sin orderspecifika HttpOnly-session. Äldre raw-token migreras en
      // gång via POST-body och raderas sedan från localStorage.
      const refs = readOrderHistory();
      const base: OrderRow[] = refs.map((ref: StoredOrderRef) => ({
        id: ref.id,
        phone: ref.phone,
        accessToken: ref.accessToken ?? null,
        createdAt: ref.createdAt,
        restaurantName: ref.restaurantName ?? null,
        total: typeof ref.total === "number" ? ref.total : null,
        status: null,
      }));
      if (active) setOrders(base);
      if (base.length === 0) return;

      const summaries = await Promise.all(refs.slice(0, 20).map(async (ref) => {
        if (typeof ref.accessToken === "string" && ref.accessToken.length >= 20) {
          try {
            await axios.post(`/api/platform/orders/${ref.id}/session`, {
              accessToken: ref.accessToken,
            });
            forgetRawOrderAccessToken(ref.id);
          } catch {
            // The existing HttpOnly cookie may still authorize the summary.
          }
        }
        return axios
          .get(`/api/platform/orders/${ref.id}/summary`)
          .then((res) => res.data)
          .catch(() => null);
      }));
      const liveById = new Map<string, any>();
      summaries.forEach((row: any) => { if (row?.id) liveById.set(String(row.id), row); });
      if (!active || liveById.size === 0) return;
      setOrders((current) =>
        current
          .map((row) => {
            const live = liveById.get(row.id);
            if (!live) return row;
            return {
              ...row,
              status: live.status ?? row.status,
              total: typeof live.total === "number" ? live.total : row.total,
              restaurantName: live.restaurantName || row.restaurantName,
            };
          })
          .filter((row) => !HIDDEN_ORDER_STATUSES.has(String(row.status || "").toUpperCase())),
      );
    };

    getPlatformSessionStatus()
      .then(async (authed) => {
        if (!active) return;
        setLoggedIn(authed);
        if (authed) await loadLoggedIn();
        else await loadGuest();
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, []);

  return (
    <div className="min-h-screen md:pt-20 pb-32" style={{ backgroundColor: "var(--bg-primary)", color: "var(--text-primary)" }}>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-5 pt-8 sm:px-6 lg:px-10">
        <header className="space-y-1">
          <h1 className="text-[26px] font-bold leading-tight tracking-tight" style={{ color: "var(--text-primary)" }}>
            {t("orders.title")} {t("orders.titleAccent")}
          </h1>
          <p className="text-[13.5px] leading-[19px]" style={{ color: "var(--text-secondary)" }}>
            {t("orders.subtitle")}
          </p>
        </header>

        {loading ? (
          <OrdersSkeleton />
        ) : orders.length === 0 ? (
          <div className="rounded-2xl px-5 py-10 text-center" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
            <History size={30} strokeWidth={1.8} className="mx-auto" style={{ color: "var(--text-secondary)" }} />
            <p className="mt-3 text-[15px] font-bold" style={{ color: "var(--text-primary)" }}>{t("orders.empty.title")}</p>
            <p className="mt-1 text-[12.5px] font-medium" style={{ color: "var(--text-secondary)" }}>{t("orders.empty.subtitle")}</p>
            <Link
              href="/"
              className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-gold-500 px-5 text-[14px] font-semibold"
              style={{ color: "#141416" }}
            >
              {t("orders.empty.cta")}
            </Link>
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
            {orders.map((order, index) => {
              const href = `/order/${order.id}`;
              const status = statusLabel(order.status);
              const date = dateLabel(order.createdAt);
              const items =
                order.itemCount == null
                  ? null
                  : order.itemCount === 1
                    ? t("orders.row.itemOne")
                    : t("orders.row.itemMany", { n: order.itemCount });
              const meta = [date, items, status, order.total != null ? `${order.total.toLocaleString("sv-SE")} kr` : null]
                .filter(Boolean)
                .join(" · ");
              return (
                <Link
                  key={order.id}
                  href={href}
                  className="flex items-center gap-[13px] px-4 py-[15px] active:opacity-70 transition-opacity"
                  style={{ borderTop: index === 0 ? "0" : "1px solid var(--border-muted)" }}
                >
                  <History size={20} strokeWidth={1.9} className="shrink-0" style={{ color: "var(--text-primary)" }} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-bold truncate" style={{ color: "var(--text-primary)" }}>
                      {order.restaurantName || t("orders.row.fallbackName")}
                    </span>
                    <span className="block mt-0.5 text-[12.5px] font-medium truncate" style={{ color: "var(--text-secondary)" }}>
                      {meta || t("orders.row.statusLoading")}
                    </span>
                  </span>
                  <ChevronRight size={18} className="shrink-0" style={{ color: "var(--text-secondary)" }} />
                </Link>
              );
            })}
          </div>
        )}

        {!loading && !loggedIn && (
          <div className="rounded-2xl px-4 py-3.5" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
            <p className="text-[12.5px] leading-[18px]" style={{ color: "var(--text-secondary)" }}>
              {t("orders.localNote")}
            </p>
            <Link href="/login" className="mt-1.5 inline-block text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
              {t("nav.login")}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
