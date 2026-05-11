"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { motion } from "framer-motion";
import { Clock, ChevronRight, ReceiptText, ShoppingBag } from "lucide-react";
import { API_URL } from "@/lib/api";
import { readOrderHistory, removeOrderFromHistory, type StoredOrderRef } from "@/lib/orderHistory";
import MobileFooterLinks from "@/components/MobileFooterLinks";

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

const STATUS_LABEL: Record<string, { label: string; tone: "warn" | "ok" | "info" | "muted" }> = {
  PENDING: { label: "Granskas", tone: "warn" },
  AWAITING_PAYMENT: { label: "Väntar på betalning", tone: "warn" },
  ACCEPTED: { label: "Bekräftad", tone: "info" },
  PREPARING: { label: "Tillagas", tone: "info" },
  READY: { label: "Klar för upphämtning", tone: "ok" },
  DELIVERING: { label: "På väg", tone: "info" },
  DELIVERED: { label: "Levererad", tone: "ok" },
  CANCELLED: { label: "Avbruten", tone: "muted" },
  REJECTED: { label: "Avvisad", tone: "muted" },
  DELIVERY_FAILED: { label: "Leverans misslyckades", tone: "muted" },
};

const toneClasses: Record<string, string> = {
  warn: "bg-amber-500/10 text-amber-500 border border-amber-500/20",
  ok: "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20",
  info: "bg-sky-500/10 text-sky-500 border border-sky-500/20",
  muted: "bg-zinc-500/10 text-zinc-500 border border-zinc-500/20",
};

export default function OrdersPage() {
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchAll = async () => {
      const refs = readOrderHistory();

      // Hämta också från backend om kund är inloggad — fanger orders gjorda
      // på andra enheter / i RN-appen som inte hamnat i denna browsers localStorage.
      let backendOrders: Array<{
        id: string;
        orderNumber?: string;
        status?: string;
        total?: number;
        createdAt?: string;
        restaurantName?: string | null;
        customerPhone?: string;
      }> = [];
      try {
        const res = await axios.get(`/api/platform/profile/orders`, { timeout: 8000 });
        if (Array.isArray(res.data)) backendOrders = res.data;
      } catch {
        // Inte inloggad eller backend down — falla tillbaka på bara localStorage
      }

      // Merge backend + localStorage: backend-orders har företräde, sen
      // komplettera med localStorage-only (guest-orders eller orders från
      // tidigare sessioner innan login).
      const seenIds = new Set(backendOrders.map((o) => o.id));
      const backendRows: OrderRow[] = backendOrders.map((o) => ({
        id: o.id,
        phone: o.customerPhone || "",
        createdAt: o.createdAt || new Date().toISOString(),
        restaurantName: o.restaurantName ?? null,
        restaurantSlug: null,
        total: o.total,
        loaded: true,
        orderNumber: o.orderNumber,
        status: o.status,
        fetchedTotal: o.total,
      }));

      const localOnlyRefs = refs.filter((r) => !seenIds.has(r.id));

      // Hämta detaljer för localStorage-bara orders via public endpoint med
      // phone som ownership-bevis
      const localRows = await Promise.all(
        localOnlyRefs.map(async (ref): Promise<OrderRow> => {
          try {
            const res = await axios.get(`${API_URL}/api/orders/${ref.id}`, {
              params: { phone: ref.phone },
              timeout: 8000,
            });
            return {
              ...ref,
              loaded: true,
              orderNumber: res.data.orderNumber,
              status: res.data.status,
              fetchedTotal: res.data.total,
              restaurantName: res.data.restaurantName ?? ref.restaurantName ?? null,
            };
          } catch (err) {
            const status = (err as { response?: { status?: number } })?.response?.status;
            return {
              ...ref,
              loaded: false,
              error: status === 404 ? "not_found" : "network",
            };
          }
        }),
      );

      if (cancelled) return;

      // Kombinera + sortera på createdAt desc (senaste först)
      const combined = [...backendRows, ...localRows].sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      setRows(combined);
      setLoading(false);
    };

    void fetchAll();
    return () => { cancelled = true; };
  }, []);

  const handleClearMissing = (id: string) => {
    removeOrderFromHistory(id);
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <div className="min-h-screen md:pt-20 pb-32" style={{ backgroundColor: "var(--bg-primary)", color: "var(--text-primary)" }}>
      <div className="mx-auto max-w-2xl md:max-w-4xl lg:max-w-5xl 2xl:max-w-[1400px] px-4 sm:px-6 lg:px-10 pt-8">
        <header className="mb-8 md:mb-10">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gold-500 mb-2">Beställningar</p>
          <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tighter mb-3" style={{ color: "var(--text-primary)" }}>
            Mina <span className="text-gold-500 italic">beställningar</span>
          </h1>
          <p className="text-sm font-bold" style={{ color: "var(--text-secondary)" }}>
            Sparas lokalt på din enhet — du behöver inte vara inloggad. Senaste 20 beställningarna visas här.
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
                Inga beställningar än
              </p>
              <p className="text-xs font-bold uppercase tracking-widest mb-8" style={{ color: "var(--text-secondary)" }}>
                Lägg din första så hamnar den här
              </p>
              <Link
                href="/"
                className="inline-flex items-center gap-2 px-6 py-3 bg-gold-500 text-zinc-950 rounded-2xl font-black uppercase text-[11px] tracking-widest hover:bg-gold-400 transition-all active:scale-95 shadow-xl shadow-gold-500/20"
              >
                <ShoppingBag size={14} /> Utforska restauranger
              </Link>
            </div>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {rows.map((row, i) => {
              if (!row.loaded) {
                return (
                  <motion.div
                    key={row.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="rounded-2xl border p-5 flex flex-col gap-3"
                    style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-muted)" }}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-black uppercase tracking-widest text-rose-400">
                        {row.error === "not_found" ? "Order hittades inte" : "Kunde inte hämta"}
                      </p>
                      <button
                        onClick={() => handleClearMissing(row.id)}
                        className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-zinc-300"
                      >
                        Ta bort
                      </button>
                    </div>
                    <p className="text-sm font-black" style={{ color: "var(--text-secondary)" }}>
                      {new Date(row.createdAt).toLocaleString("sv-SE")}
                    </p>
                  </motion.div>
                );
              }
              const statusInfo = row.status ? STATUS_LABEL[row.status] : null;
              return (
                <motion.div
                  key={row.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <Link
                    href={`/order/${row.id}?phone=${encodeURIComponent(row.phone)}`}
                    className="group block rounded-2xl border p-5 hover:border-gold-500/40 transition-all"
                    style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-muted)" }}
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: "var(--text-secondary)" }}>
                          {row.restaurantName || "Beställning"}
                        </p>
                        <p className="text-lg font-black tracking-tight truncate" style={{ color: "var(--text-primary)" }}>
                          {row.orderNumber || row.id.slice(-6).toUpperCase()}
                        </p>
                      </div>
                      <ChevronRight size={18} className="shrink-0 text-zinc-500 group-hover:text-gold-500 transition-colors" />
                    </div>
                    <div className="flex items-center gap-2 flex-wrap mb-3">
                      {statusInfo && (
                        <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${toneClasses[statusInfo.tone]}`}>
                          {statusInfo.label}
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
                </motion.div>
              );
            })}
          </div>
        )}

        {rows.length > 0 && (
          <div className="mt-8 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-secondary)", opacity: 0.5 }}>
            <ReceiptText size={12} />
            Beställningar lagras lokalt i webbläsaren. Logga in för att synka mellan enheter.
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
