"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ShoppingBag } from "lucide-react";
import { useCartStore } from "@/store/cartStore";

const FloatingCartButton = () => {
  const items = useCartStore((state) => state.items);
  const total = useCartStore((state) => state.getTotal());
  const lastAddedItemName = useCartStore((state) => state.lastAddedItemName);
  const lastAddedAt = useCartStore((state) => state.lastAddedAt);
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    if (!lastAddedAt) return;
    setShowToast(true);
    const timeout = window.setTimeout(() => setShowToast(false), 2600);
    return () => window.clearTimeout(timeout);
  }, [lastAddedAt]);

  if (items.length === 0) return null;

  const count = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <>
      <AnimatePresence>
        {showToast && lastAddedItemName && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            className="fixed bottom-28 right-6 z-[55] max-w-xs rounded-[1.75rem] border border-gold-500/20 bg-dark-400/95 px-5 py-4 shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl"
          >
            <div className="text-[10px] font-black uppercase tracking-[0.3em] text-gold-500 mb-2">Tillagd i korgen</div>
            <div className="text-sm font-bold text-white">{lastAddedItemName}</div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="fixed bottom-6 right-6 z-50"
      >
        <Link
          href="/cart"
          className="flex items-center gap-4 rounded-[1.75rem] border border-gold-500/20 bg-dark-400/95 px-5 py-4 shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl transition-all hover:border-gold-500/40 hover:-translate-y-0.5"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-500 text-dark-500">
            <ShoppingBag size={22} />
          </div>
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30">Varukorg</div>
            <div className="text-sm font-bold text-white">{count} varor · {total.toFixed(0)} kr</div>
          </div>
          <ArrowRight size={18} className="text-gold-500" />
        </Link>
      </motion.div>
    </>
  );
};

export default FloatingCartButton;
