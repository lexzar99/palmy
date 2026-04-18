"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { Clock, ArrowRight, ShoppingBag } from "lucide-react";
import { motion } from "framer-motion";
import { API_URL } from "@/lib/api";
import { useCartStore } from "@/store/cartStore";

interface Props {
  restaurantId: string;
  restaurantSlug: string;
}

interface Summary {
  hasHistory: boolean;
  orderId?: string;
  orderNumber?: string;
  itemCount?: number;
  total?: number;
  items?: { productId: string; name: string; quantity: number }[];
}

/**
 * Smal bar på en restaurangs sida som visar att användaren har beställt här
 * tidigare. Ett klick fyller kundvagnen med exakt samma items (via befintliga
 * /reorder-endpointen) och tar användaren direkt till kassan där items kan
 * redigeras innan beställning läggs.
 */
export default function PreviouslyOrderedBar({ restaurantId, restaurantSlug }: Props) {
  const router = useRouter();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const addItem = useCartStore((s) => s.addItem);
  const clearCart = useCartStore((s) => s.clearCart);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("platform_user_token") : null;
    if (!token || !restaurantId) return;
    axios
      .get(`${API_URL}/api/profile/previously-ordered/${restaurantId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((r) => setSummary(r.data))
      .catch(() => setSummary(null));
  }, [restaurantId]);

  if (!summary?.hasHistory) return null;

  const handleReorder = async () => {
    if (!summary.orderId) return;
    const token = localStorage.getItem("platform_user_token");
    if (!token) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/profile/orders/${summary.orderId}/reorder`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      clearCart();
      (res.data.items || []).forEach((it: any) => {
        addItem({
          productId: it.productId,
          restaurantId: res.data.restaurantId,
          restaurantSlug: res.data.restaurantSlug,
          name: it.name,
          price: it.price,
          quantity: it.quantity,
          extras: it.extras || [],
          note: it.note,
        });
      });
      router.push("/cart");
    } catch {
      /* noop */
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-4 flex items-center gap-3 p-3 rounded-2xl border shadow-sm"
      style={{ backgroundColor: "var(--bg-secondary)", borderColor: "rgba(234,181,69,0.22)", boxShadow: "var(--card-shadow)" }}
    >
      <div className="w-9 h-9 rounded-xl bg-gold-500/10 text-gold-500 flex items-center justify-center shrink-0">
        <Clock size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[9px] font-black uppercase tracking-[0.25em] text-gold-500">
          Du beställde här senast
        </div>
        <div className="text-[11px] font-bold truncate" style={{ color: "var(--text-primary)" }}>
          {summary.itemCount} {summary.itemCount === 1 ? "rätt" : "rätter"} · {summary.total} kr
          {summary.items?.length ? ` · ${summary.items.map((i) => i.name).slice(0, 2).join(", ")}${summary.items.length > 2 ? "…" : ""}` : ""}
        </div>
      </div>
      <button
        onClick={handleReorder}
        disabled={loading}
        className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gold-500 text-zinc-950 text-[9px] font-black uppercase tracking-widest active:scale-95 transition-all disabled:opacity-60"
      >
        {loading ? (
          <>
            <ShoppingBag size={12} /> Laddar
          </>
        ) : (
          <>
            Beställ igen <ArrowRight size={12} />
          </>
        )}
      </button>
    </motion.div>
  );
}
