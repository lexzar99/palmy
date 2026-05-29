"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { motion } from "framer-motion";
import { Clock, ChevronRight, ReceiptText, ShoppingBag } from "lucide-react";
import { API_URL } from "@/lib/api";
import { readOrderHistory, removeOrderFromHistory, type StoredOrderRef } from "@/lib/orderHistory";
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

const toneClasses: Record<string, string> = {
  warn: "bg-amber-500/10 text-amber-500 border border-amber-500/20",
  ok: "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20",
  info: "bg-sky-500/10 text-sky-500 border border-sky-500/20",
  muted: "bg-zinc-500/10 text-zinc-500 border border-zinc-500/20",
};

export default function OrdersPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // 1) Visa localStorage-refs DIREKT som "loaded med basic data" — namn,
    //    total och createdAt har vi redan. Statusen fylls i async i bakgrunden.
    //    Detta gör att listan blir klickbar omedelbart istället för att vänta
    //    8s på flera API-anrop.
    const refs = readOrderHistory();
    if (refs.length > 0) {
      const initial: OrderRow[] = refs
        .map((ref) => ({
          ...ref,
          loaded: true as const,
          orderNumber: undefined,
          status: undefined,
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
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gold-500 mb-2">{t("orders.eyebrow")}</p>
          <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tighter mb-3" style={{ color: "var(--text-primary)" }}>
            {t("orders.title")} <span className="text-gold-500 italic">{t("orders.titleAccent")}</span>
          </h1>
          <p className="text-sm font-bold" style={{ color: "var(--text-secondary)" }}>
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
            className="relative py-20 text-center rounded-3xl border overflow-hidden"
            style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-muted)" }}
          >
            {/* Decorative gold-glow + floating emoji */}
            <div className="absolute inset-0 pointer-events-none" style={{
              background: "radial-gradient(circle at 50% 30%, rgba(212,167,74,0.18) 0%, transparent 55%)",
            }} />
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              className="relative text-6xl mb-6"
            >
              🍕
            </motion.div>
            <div className="relative">
              <p className="text-2xl font-black uppercase italic tracking-tight mb-2" style={{ color: "var(--text-primary)" }}>
                {t("orders.empty.title")}
              </p>
              <p className="text-xs font-bold uppercase tracking-widest mb-8" style={{ color: "var(--text-secondary)" }}>
                {t("orders.empty.subtitle")}
              </p>
              <Link
                href="/"
                className="inline-flex items-center gap-2 px-6 py-3 bg-gold-500 text-zinc-950 rounded-2xl font-black uppercase text-[11px] tracking-widest hover:bg-gold-400 transition-all active:scale-95 shadow-xl shadow-gold-500/20"
              >
                <ShoppingBag size={14} /> {t("orders.empty.cta")}
              </Link>
            </div>
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
                      <p className="text-[10px] font-black uppercase tracking-widest text-rose-400">
                        {row.error === "not_found" ? t("orders.row.notFound") : t("orders.row.fetchError")}
                      </p>
                      <button
                        onClick={() => handleClearMissing(row.id)}
                        className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-300"
                      >
                        {t("orders.row.remove")}
                      </button>
                    </div>
                    <p className="text-sm font-black" style={{ color: "var(--text-secondary)" }}>
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
                      <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: "var(--text-secondary)" }}>
                        {row.restaurantName || t("orders.row.fallbackName")}
                      </p>
                      <p className="text-lg font-black tracking-tight truncate" style={{ color: "var(--text-primary)" }}>
                        {row.orderNumber || row.id.slice(-6).toUpperCase()}
                      </p>
                    </div>
                    <ChevronRight size={18} className="shrink-0 text-zinc-500 group-hover:text-gold-500 transition-colors" />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap mb-3">
                    {row.status && tone ? (
                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${toneClasses[tone]}`}>
                        {t(`orders.status.${row.status}`)}
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
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

        {rows.length > 0 && (
          <div className="mt-8 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-secondary)", opacity: 0.5 }}>
            <ReceiptText size={12} />
            {t("orders.localNote")}
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
