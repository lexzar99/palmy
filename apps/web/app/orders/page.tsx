"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { ChevronRight, History } from "lucide-react";
import { useTranslation } from "@/lib/i18n/LocaleProvider";
import { getPlatformSessionStatus } from "@/lib/platformSessionClient";
import { forgetRawOrderAccessToken, readOrderHistory, removeOrderFromHistory, type StoredOrderRef } from "@/lib/orderHistory";
import { ensureKioskAccess } from "@/lib/kioskAccessClient";
import { forgetActiveOrder, readActiveOrderRefs } from "@/lib/activeOrder";
import { partnerOriginForRestaurant, readEmbedParentOrigin, trustedPartnerOrigin } from "@/lib/embedPartner";

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
  type?: string | null;
  selfDelivery?: boolean | null;
};

type ProfileOrderResponse = {
  id: string | number;
  customerPhone?: string | null;
  createdAt?: string | null;
  restaurantName?: string | null;
  restaurant?: { name?: string | null; selfDelivery?: boolean | null } | null;
  total?: number | string | null;
  totalAmount?: number | string | null;
  status?: string | null;
  paymentStatus?: string | null;
  items?: unknown[];
  type?: string | null;
};

type OrderSummaryResponse = Omit<Partial<OrderRow>, "id"> & { id: string };
type SummaryResult = { id: string; data: OrderSummaryResponse | null; missing: boolean };

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
  const [embedMode, setEmbedMode] = useState(false);
  const [embedRestaurant, setEmbedRestaurant] = useState("");
  const [hostOrderIds, setHostOrderIds] = useState<string[]>([]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      setEmbedMode(params.get("embed") === "1");
      setEmbedRestaurant(params.get("restaurant") || "");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!embedMode || !embedRestaurant || typeof window === "undefined") return;
    const receiveHostHistory = (event: MessageEvent) => {
      if (event.source !== window.parent || !trustedPartnerOrigin(event.origin)) return;
      if (event.data?.type !== "viaeats:host-order-history" || !Array.isArray(event.data.orderIds)) return;
      const ids = event.data.orderIds
        .filter((id: unknown): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id))
        .slice(0, 20);
      setHostOrderIds(Array.from(new Set(ids)));
    };
    window.addEventListener("message", receiveHostHistory);
    const parentOrigin = readEmbedParentOrigin() || partnerOriginForRestaurant(embedRestaurant);
    if (parentOrigin && window.parent !== window) {
      window.parent.postMessage({ type: "viaeats:request-order-history", restaurantSlug: embedRestaurant }, parentOrigin);
    }
    return () => window.removeEventListener("message", receiveHostHistory);
  }, [embedMode, embedRestaurant]);
  const embedMenuHref = embedRestaurant ? `/embed/${encodeURIComponent(embedRestaurant)}` : "/";
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

  const statusLabel = (order: OrderRow) => {
    const key = String(order.status || "").toUpperCase();
    if (!key) return null;
    if (key === "READY" && String(order.type || "").toUpperCase() === "DELIVERY") {
      return order.selfDelivery
        ? t("orders.status.READY_SELF_DELIVERY")
        : t("orders.status.READY_PLATFORM_DELIVERY");
    }
    const label = t(`orders.status.${key}`);
    // t() returnerar nyckeln vid miss — visa då rå status hellre än nyckeln.
    return label.startsWith("orders.status.") ? key : label;
  };

  useEffect(() => {
    let active = true;

    const loadLoggedIn = async () => {
      // Samma endpoint + statusfilter som profilens order-flik. Verifierade
      // orderlänkar behöver ingen PII i URL:en; proxyn skickar sessionen.
      const [ordersRes, profileRes] = await Promise.all([
        axios.get(`/api/platform/profile/orders`).catch(() => ({ data: [] })),
        axios.get(`/api/platform/profile`).catch(() => ({ data: null })),
      ]);
      const profilePhone = profileRes.data?.phone || null;
      const sourceOrders = (Array.isArray(ordersRes.data) ? ordersRes.data : []) as ProfileOrderResponse[];
      const rows = sourceOrders
        .filter((order) => {
          const status = String(order?.status || "").toUpperCase();
          const paymentStatus = String(order?.paymentStatus || "").toUpperCase();
          return !HIDDEN_ORDER_STATUSES.has(status) && !HIDDEN_PAYMENT_STATUSES.has(paymentStatus);
        })
        .map((order): OrderRow => ({
          id: String(order.id),
          phone: order.customerPhone || profilePhone,
          accessToken: null,
          createdAt: order.createdAt ?? null,
          restaurantName: order.restaurantName || order.restaurant?.name || null,
          total: Number(order.total ?? order.totalAmount ?? 0),
          status: order.status ?? null,
          itemCount: Array.isArray(order.items) ? order.items.length : null,
          type: order.type ?? null,
          selfDelivery: order.restaurant?.selfDelivery ?? null,
        }));
      if (active) setOrders(rows);
    };

    const loadGuest = async () => {
      // Gäst: lokalt sparade, icke-hemliga orderreferenser. Varje rad hämtas
      // med sin orderspecifika HttpOnly-session. Äldre raw-token migreras en
      // gång via POST-body och raderas sedan från localStorage. Embedden slår
      // även ihop ViaEats historik, aktiva refs och Palmyras egen host-historik
      // så en partitionerad iframe-lagring inte kan gömma en betald order.
      const refsById = new Map<string, StoredOrderRef>();
      for (const ref of readOrderHistory()) {
        if (!embedMode || !embedRestaurant || !ref.restaurantSlug || ref.restaurantSlug === embedRestaurant) {
          refsById.set(ref.id, ref);
        }
      }
      for (const ref of readActiveOrderRefs()) {
        if (!refsById.has(ref.id)) {
          refsById.set(ref.id, {
            id: ref.id,
            phone: ref.phone || "",
            createdAt: "",
            restaurantSlug: null,
          });
        }
      }
      for (const id of hostOrderIds) {
        const previous = refsById.get(id);
        refsById.set(id, {
          id,
          phone: previous?.phone || "",
          createdAt: previous?.createdAt || "",
          restaurantName: previous?.restaurantName || "Palmyra Pizzeria",
          restaurantSlug: embedRestaurant,
          total: previous?.total,
        });
      }
      const refs = Array.from(refsById.values()).slice(0, 20);
      const baseRefs = refs.filter((ref) =>
        !embedMode || !embedRestaurant || ref.restaurantSlug === embedRestaurant,
      );
      const base: OrderRow[] = baseRefs.map((ref: StoredOrderRef) => ({
        id: ref.id,
        phone: ref.phone,
        accessToken: ref.accessToken ?? null,
        createdAt: ref.createdAt,
        restaurantName: ref.restaurantName ?? null,
        total: typeof ref.total === "number" ? ref.total : null,
        status: null,
      }));
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
          .get<OrderSummaryResponse>(`/api/platform/orders/${ref.id}/summary`)
          .then((res): SummaryResult => ({ id: ref.id, data: res.data, missing: false }))
          .catch((error: unknown): SummaryResult => ({
            id: ref.id,
            data: null,
            missing: axios.isAxiosError(error) && [404, 410].includes(Number(error.response?.status)),
          }));
      }));
      const missingIds = new Set(summaries.filter((result) => result.missing).map((result) => result.id));
      for (const id of missingIds) {
        removeOrderFromHistory(id);
        forgetActiveOrder(id);
      }
      const liveById = new Map<string, OrderSummaryResponse>();
      summaries.forEach((result) => {
        if (result.data?.id) liveById.set(String(result.data.id), result.data);
      });
      if (!active) return;
      const baseById = new Map(base.map((row) => [row.id, row]));
      const merged = refs.flatMap((ref): OrderRow[] => {
        if (missingIds.has(ref.id)) return [];
        const live = liveById.get(ref.id);
        const existing = baseById.get(ref.id);
        // Referenser utan restaurangslug visas först efter att Palmyras
        // restaurangbundna kioskbevis har verifierat summary-anropet.
        if (!live && !existing) return [];
        const row = existing || {
          id: ref.id,
          phone: ref.phone,
          createdAt: ref.createdAt,
          restaurantName: ref.restaurantName ?? null,
          total: typeof ref.total === "number" ? ref.total : null,
          status: null,
        };
        return [{
          ...row,
          createdAt: live?.createdAt ?? row.createdAt,
          status: live?.status ?? row.status,
          total: typeof live?.total === "number" ? live.total : row.total,
          restaurantName: live?.restaurantName || row.restaurantName,
          itemCount: typeof live?.itemCount === "number" ? live.itemCount : row.itemCount,
          type: live?.type ?? row.type,
          selfDelivery: typeof live?.selfDelivery === "boolean" ? live.selfDelivery : row.selfDelivery,
        }];
      });
      setOrders(merged.filter((row) => !HIDDEN_ORDER_STATUSES.has(String(row.status || "").toUpperCase())));
    };

    const accessReady = embedMode && embedRestaurant
      ? ensureKioskAccess(embedRestaurant).then(() => false)
      : getPlatformSessionStatus();

    accessReady
      .then(async (authed) => {
        if (!active) return;
        setLoggedIn(authed);
        if (authed && !embedMode) await loadLoggedIn();
        else await loadGuest();
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [embedMode, embedRestaurant, hostOrderIds]);

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
              href={embedMode ? embedMenuHref : "/"}
              className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-gold-500 px-5 text-[14px] font-semibold"
              style={{ color: "#141416" }}
            >
              {t("orders.empty.cta")}
            </Link>
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
            {orders.map((order, index) => {
              const href = embedMode
                ? `/order/${order.id}?embed=1&restaurant=${encodeURIComponent(embedRestaurant)}`
                : `/order/${order.id}`;
              const status = statusLabel(order);
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

        {!embedMode && !loading && !loggedIn && (
          <div className="rounded-2xl px-4 py-3.5" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
            <p className="text-[12.5px] leading-[18px]" style={{ color: "var(--text-secondary)" }}>
              {t("orders.localNote")}
            </p>
            <Link href="/profile" className="mt-1.5 inline-block text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
              Verifiera nummer
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
