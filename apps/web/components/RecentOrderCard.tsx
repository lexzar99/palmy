"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { motion } from "framer-motion";
import { ArrowRight, Clock, ReceiptText } from "lucide-react";
import { API_URL } from "@/lib/api";
import { readOrderHistory } from "@/lib/orderHistory";

type RecentOrder = {
  id: string;
  orderNumber?: string;
  restaurantSlug?: string | null;
  restaurantName?: string | null;
  status?: string;
  createdAt: string;
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Granskas",
  ACCEPTED: "Bekräftad",
  PREPARING: "Tillagas",
  READY: "Klar",
  DELIVERING: "På väg",
  DELIVERED: "Levererad",
  CANCELLED: "Avbruten",
  REJECTED: "Avvisad",
};

/**
 * RecentOrderCard — visar senaste beställningen som ett kort högst upp på
 * home-sidan när användaren har minst en order (inloggad ELLER gäst via
 * localStorage). Klick → /order/[id] för tracking.
 *
 * Conversion-booster: synlig "fortsätt där du var"-CTA istället för att
 * användaren behöver hitta orders-sidan själv.
 */
export default function RecentOrderCard() {
  const [order, setOrder] = useState<RecentOrder | null>(null);
  const [phone, setPhone] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      // Försök hämta från backend först (inloggad)
      try {
        const res = await axios.get(`/api/platform/profile/orders`, { timeout: 5000 });
        if (!cancelled && Array.isArray(res.data) && res.data.length > 0) {
          const latest = res.data[0];
          setOrder({
            id: latest.id,
            orderNumber: latest.orderNumber,
            restaurantSlug: latest.restaurantSlug ?? null,
            restaurantName: latest.restaurantName ?? null,
            status: latest.status,
            createdAt: latest.createdAt || new Date().toISOString(),
          });
          setPhone(latest.customerPhone || null);
          return;
        }
      } catch {
        // Inte inloggad — falla till localStorage
      }

      // Gäst-flöde: läs senaste från localStorage
      if (cancelled) return;
      const history = readOrderHistory();
      if (history.length > 0) {
        const latest = history[0];
        setOrder({
          id: latest.id,
          restaurantSlug: latest.restaurantSlug ?? null,
          restaurantName: latest.restaurantName ?? null,
          createdAt: latest.createdAt,
        });
        setPhone(latest.phone);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, []);

  if (!order) return null;

  // AWAITING_PAYMENT visas ALDRIG som "Pågående beställning" på home — då
  // skulle en kund som backade ur Stripe-flödet se sin (aldrig betalda) order
  // sitta som aktiv tills cleanup-cronen tar den. Cart-sidans abandon-flöde
  // raderar normalt direkt, men detta är en belt-and-suspenders mot race med
  // backend-fetch och guests som har AWAITING_PAYMENT i localStorage-history.
  if (order.status === "AWAITING_PAYMENT") return null;

  // Dölj kortet för gamla "DELIVERED" eller "CANCELLED" orders (>24h) —
  // ingen poäng med "fortsätt"-CTA då
  const ageMs = Date.now() - new Date(order.createdAt).getTime();
  const isStale = ageMs > 24 * 60 * 60 * 1000 && ["DELIVERED", "CANCELLED", "REJECTED"].includes(order.status || "");
  if (isStale) return null;

  const href = phone
    ? `/order/${order.id}?phone=${encodeURIComponent(phone)}`
    : `/order/${order.id}`;

  const statusText = order.status ? STATUS_LABEL[order.status] || order.status : null;
  const isActive = order.status && !["DELIVERED", "CANCELLED", "REJECTED", "DELIVERY_FAILED"].includes(order.status);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-4"
    >
      <Link
        href={href}
        className="group flex items-center gap-3 rounded-2xl border px-4 py-3 transition-all hover:border-gold-500/40"
        style={{
          backgroundColor: "var(--bg-secondary)",
          borderColor: "var(--border-muted)",
        }}
      >
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "var(--bg-deep)", border: "1px solid var(--border-muted)" }}>
          <ReceiptText size={16} className="text-gold-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>
              {isActive ? "Pågående beställning" : "Senaste beställning"}
            </p>
            {statusText && (
              <span className={`text-[9px] font-black uppercase tracking-widest ${isActive ? "text-gold-500" : ""}`} style={!isActive ? { color: "var(--text-secondary)", opacity: 0.6 } : undefined}>
                · {statusText}
              </span>
            )}
          </div>
          <p className="text-sm font-black truncate" style={{ color: "var(--text-primary)" }}>
            {order.restaurantName || "Din beställning"}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5 text-[10px] font-bold" style={{ color: "var(--text-secondary)", opacity: 0.7 }}>
            <Clock size={10} />
            {new Date(order.createdAt).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" })}
          </div>
        </div>
        <ArrowRight size={16} className="text-zinc-500 group-hover:text-gold-500 group-hover:translate-x-1 transition-all shrink-0" />
      </Link>
    </motion.div>
  );
}
