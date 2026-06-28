"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { ArrowRight } from "lucide-react";
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
    if (!restaurantId) return;
    axios
      .get(`/api/platform/profile/previously-ordered/${restaurantId}`)
      .then((r) => setSummary(r.data))
      .catch(() => setSummary(null));
  }, [restaurantId]);

  if (!summary?.hasHistory) return null;

  const handleReorder = async () => {
    if (!summary.orderId) return;
    setLoading(true);
    try {
      const res = await axios.get(`/api/platform/profile/orders/${summary.orderId}/reorder`);
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
      className="mb-4 flex items-center gap-3 p-3 rounded-xl"
      style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}
    >
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-semibold" style={{ color: "var(--text-secondary)" }}>
          Du beställde här senast
        </div>
        <div className="text-[13px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>
          {summary.itemCount} {summary.itemCount === 1 ? "rätt" : "rätter"} · {summary.total} kr
          {summary.items?.length ? ` · ${summary.items.map((i) => i.name).slice(0, 2).join(", ")}${summary.items.length > 2 ? "…" : ""}` : ""}
        </div>
      </div>
      <button
        onClick={handleReorder}
        disabled={loading}
        className="shrink-0 flex items-center gap-1.5 px-3.5 h-9 rounded-xl bg-gold-500 text-[13px] font-semibold transition-opacity active:opacity-90 disabled:opacity-60"
        style={{ color: "#141416" }}
      >
        {loading ? "Laddar" : <>Beställ igen <ArrowRight size={14} strokeWidth={1.8} /></>}
      </button>
    </motion.div>
  );
}
