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
    // Toast removed as requested
  }, [lastAddedAt]);

  if (items.length === 0) return null;

  const count = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <>
      {/* Toast removed */}

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-full max-w-[220px] px-2"
      >
        <Link
          href="/cart"
          className="flex items-center justify-between rounded-full border border-gold-400/50 bg-gold-500 px-3 py-2 shadow-lg shadow-gold-500/20 transition-all hover:scale-[1.01] active:scale-[0.99]"
        >
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-gold-600 shadow-sm">
              <ShoppingBag size={12} />
            </div>
            <div>
              <div className="text-[7px] font-black uppercase tracking-[0.1em] text-white/80 leading-none mb-0.5">Varukorg</div>
              <div className="text-[10px] font-black text-white leading-none">{count} st · {total.toFixed(0)} kr</div>
            </div>
          </div>
          <div className="bg-white/10 p-1 rounded-full">
            <ArrowRight size={12} className="text-white" />
          </div>
        </Link>
      </motion.div>
    </>
  );
};

export default FloatingCartButton;
