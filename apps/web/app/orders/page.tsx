"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { motion } from "framer-motion";
import { Clock, ChevronRight, History } from "lucide-react";
import { API_URL } from "@/lib/api";
import { readOrderHistory, removeOrderFromHistory, type StoredOrderRef } from "@/lib/orderHistory";
import { cacheOrdersList, getCachedOrdersList } from "@/lib/offlineOrders";
import EmptyState from "@/components/EmptyState";
import MobileFooterLinks from "@/components/MobileFooterLinks";
import { useTranslation } from "@/lib/i18n/LocaleProvider";

type FetchedOrder = StoredOrderRef & {
  loaded: true;
  orderNumber?: string;
  status?: string;
  fetchedTotal?: number;
  restaurantName?: string | null;
};

type FailedOrder = StoredOrderRef & {
  loaded: false;
  error: "not_found" | "network";
};

type OrderRow = FetchedOrder | FailedOrder;

// Tone per status (label resolveras via t("orders.status.*") inne i komponenten).
const STATUS_TONE: Record<string, "warn" | "ok" | "info" | "muted"> = {
  PENDING: "warn",
  AWAITING_PAYMENT: "warn",
  ACCEPTED: "info",
  PREPARING: "info",
  READY: "ok",
  DELIVERING: "info",
  DELIVERED: "ok",
  CANCELLED: "muted",
  REJECTED: "muted",
  DELIVERY_FAILED: "muted",
};

// EN statuspalett ("tyst & direkt"): väntar = neutral, pågår = mjuk guld,
// klart = mjuk grön, avbrutet = neutral dämpad.
const toneClasses: Record<string, string> = {
  warn: "bg-[var(--bg-deep)] text-[var(--text-secondary)] border border-[var(--border-muted)]",
  ok: "bg-[var(--success-soft)] text-[var(--success-ink)] border border-[var(--border-muted)]",
  info: "bg-[var(--gold-soft)] text-[var(--gold-ink)] border border-[var(--border-muted)]",
  muted: "bg-[var(--bg-deep)] text-[var(--text-secondary)] border border-[var(--border-muted)]",
};

export default function OrdersPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showingOffline, setShowingOffline] = useState(false);

  // Offline orderhistorik: persist:a berikade rader (status/ordernummer) så
  // listan är komplett även utan nät — inte bara app-skalet.
  useEffect(() => {
    if (rows.length > 0 && rows.some((r) => r.loaded && (r as FetchedOrder).status)) {
      cacheOrdersList(rows);
    }
  }, [rows]);

  useEffect(() => {
    let cancelled = false;

    // 1) Visa localStorage-refs DIREKT som "loaded med basic data" — namn,
    //    total och createdAt har vi redan. Statusen fylls i async i bakgrunden.
    //    Detta gör att listan blir klickbar omedelbart istället för att vänta
    //    8s på flera API-anrop.
    const refs = readOrderHistory();
    // Berika direkt från offline-cachen (status/ordernummer från förra
    // besöket) — utan nät är detta hela innehållet, med nät ersätts det
    // strax av färsk data.
    const cached = getCachedOrdersList();
    const cachedById = new Map<string, any>((cached?.orders ?? []).map((o: any) => [o.id, o]));
    if (typeof navigator !== "undefined" && !navigator.onLine && cachedById.size > 0) {
      setShowingOffline(true);
    }
    if (refs.length > 0) {
      const initial: OrderRow[] = refs
        .map((ref) => ({
          ...ref,
          loaded: true as const,
          orderNumber: cachedById.get(ref.id)?.orderNumber ?? undefined,
          status: cachedById.get(ref.id)?.status ?? undefined,
          fetchedTotal: ref.total,
          restaurantName: ref.restaurantName ?? null,
        }))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setRows(initial);
      setLoading(false);
    }

    // 2) Backend-fetch i bakgrunden (inloggade users — orders från andra enheter)
    axios
      .get(`/api/platform/profile/orders`, { timeout: 5000 })
      .then((res) => {
        if (cancelled || !Array.isArray(res.data)) return;
        const backendOrders = res.data;
        setRows((prev) => {
          const seenIds = new Set(backendOrders.map((o: any) => o.id));
          const backendRows: OrderRow[] = backendOrders.map((o: any) => ({
            id: o.id,
            phone: o.customerPhone || "",
            createdAt: o.createdAt || new Date().toISOString(),
            restaurantName: o.restaurantName ?? null,
            restaurantSlug: null,
            total: o.total,
            loaded: true as const,
            orderNumber: o.orderNumber,
            status: o.status,
            fetchedTotal: o.total,
          }));
          const localOnly = prev.filter((r) => !seenIds.has(r.id));
          return [...backendRows, ...localOnly].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          );
        });
        setLoading(false);
      })
      .catch(() => {
        // Inte inloggad / backend nere — vi har redan localStorage-rader
        if (!cancelled) setLoading(false);
      });

    // 3) Status/orderNumber för gäst-ordrar i EN batch per telefonnummer
    //    (istället för ett anrop per order — ~21/laddning förut). Kollapsar
    //    fan-out:en så order-historiken håller vid hög samtidig last.
    const idsByPhone = new Map<string, string[]>();
    refs.forEach((ref) => {
      const p = ref.phone || "";
      const list = idsByPhone.get(p) ?? [];
      list.push(ref.id);
      idsByPhone.set(p, list);
    });
    idsByPhone.forEach((ids, phone) => {
      axios
        .get(`${API_URL}/api/orders/status-batch`, {
          params: { ids: ids.join(","), phone },
          timeout: 5000,
        })
        .then((res) => {
          if (cancelled || !Array.isArray(res.data)) return;
          const byId = new Map<string, any>(res.data.map((o: any) => [o.id, o]));
          setRows((prev) =>
            prev.map((row) => {
              const m = byId.get(row.id);
              return m
                ? {
                    ...row,
                    loaded: true as const,
                    orderNumber: m.orderNumber,
                    status: m.status,
                    fetchedTotal: m.total,
                    restaurantName: m.restaurantName ?? row.restaurantName ?? null,
                  }
                : row;
            }),
          );
        })
        .catch(() => {
          // Nätfel/inte inloggad — vi har redan basic localStorage-data att visa.
        });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleClearMissing = (id: string) => {
    removeOrderFromHistory(id);
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <div className="min-h-screen md:pt-20 pb-32" style={{ backgroundColor: "var(--bg-primary)", color: "var(--text-primary)" }}>
      <div className="mx-auto max-w-2xl md:max-w-4xl lg:max-w-5xl 2xl:max-w-[1400px] px-4 sm:px-6 lg:px-10 pt-8">
        <header className="mb-8 md:mb-10">
          
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-2" style={{ color: "var(--text-primary)" }}>
            {t("orders.title")} {t("orders.titleAccent")}
          </h1>
          {showingOffline && (
            <p className="mb-2 inline-flex items-center gap-2 rounded-md px-2.5 py-1 text-[12.5px] font-medium" style={{ backgroundColor: "var(--bg-deep)", color: "var(--text-secondary)" }}>
              Offline — visar senast sparade ordrar
            </p>
          )}
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {t("orders.subtitle")}
          </p>
        </header>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 skeleton rounded-2xl" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <EmptyState
              icon={History}
              title={t("orders.empty.title")}
              text={t("orders.empty.subtitle")}
              ctaLabel={t("orders.empty.cta")}
              ctaHref="/"
            />
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {rows.map((row) => {
              if (!row.loaded) {
                return (
                  <div
                    key={row.id}
                    className="rounded-2xl border p-5 flex flex-col gap-3"
                    style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-muted)" }}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold text-rose-400">
                        {row.error === "not_found" ? t("orders.row.notFound") : t("orders.row.fetchError")}
                      </p>
                      <button
                        onClick={() => handleClearMissing(row.id)}
                        className="text-[12px] font-medium text-zinc-500 hover:text-zinc-300"
                      >
                        {t("orders.row.remove")}
                      </button>
                    </div>
                    <p className="text-sm font-bold" style={{ color: "var(--text-secondary)" }}>
                      {new Date(row.createdAt).toLocaleString("sv-SE")}
                    </p>
                  </div>
                );
              }
              const tone = row.status ? STATUS_TONE[row.status] : null;
              return (
                <Link
                  key={row.id}
                  href={`/order/${row.id}?phone=${encodeURIComponent(row.phone)}`}
                  className="group block rounded-2xl border p-5 hover:border-gold-500/40 transition-colors active:scale-[0.99]"
                  style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-muted)", touchAction: "manipulation" }}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold mb-1" style={{ color: "var(--text-secondary)" }}>
                        {row.restaurantName || t("orders.row.fallbackName")}
                      </p>
                      <p className="text-lg font-bold tracking-tight truncate" style={{ color: "var(--text-primary)" }}>
                        {row.orderNumber || row.id.slice(-6).toUpperCase()}
                      </p>
                    </div>
                    <ChevronRight size={18} className="shrink-0 text-zinc-500 group-hover:text-gold-500 transition-colors" />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap mb-3">
                    {row.status && tone ? (
                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold ${toneClasses[tone]}`}>
                        {t(`orders.status.${row.status}`)}
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
                        {t("orders.row.statusLoading")}
                      </span>
                    )}
                    {typeof row.fetchedTotal === "number" && (
                      <span className="text-[10px] font-bold" style={{ color: "var(--text-secondary)" }}>
                        {row.fetchedTotal.toFixed(0)} kr
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] font-bold" style={{ color: "var(--text-secondary)", opacity: 0.6 }}>
                    <Clock size={11} /> {new Date(row.createdAt).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" })}
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* Om oss + Kontakt — mobil-knappar */}
        <div className="mt-10">
          <MobileFooterLinks />
        </div>
      </div>
    </div>
  );
}
