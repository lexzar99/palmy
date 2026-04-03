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
            className="fixed bottom-28 right-6 z-[55] max-w-xs rounded-[1.75rem] border border-light-400 bg-white/95 px-5 py-4 premium-shadow backdrop-blur-xl"
          >
            <div className="text-[10px] font-black uppercase tracking-[0.3em] text-gold-600 mb-2">Tillagd i korgen</div>
            <div className="text-sm font-black text-dark-text">{lastAddedItemName}</div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 w-full max-w-xs px-6"
      >
        <Link
          href="/cart"
          className="flex items-center justify-between rounded-2xl border border-gold-400/50 bg-gold-500 px-5 py-3.5 shadow-xl shadow-gold-500/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-gold-600 premium-shadow">
              <ShoppingBag size={20} />
            </div>
            <div>
              <div className="text-[9px] font-black uppercase tracking-[0.2em] text-white/80 leading-none mb-1">Varukorg</div>
              <div className="text-sm font-black text-white leading-none">{count} st · {total.toFixed(0)} kr</div>
            </div>
          </div>
          <div className="bg-white p-2.5 rounded-xl premium-shadow">
            <ArrowRight size={18} className="text-gold-600" />
          </div>
        </Link>
      </motion.div>
    </>
  );
};

export default FloatingCartButton;
