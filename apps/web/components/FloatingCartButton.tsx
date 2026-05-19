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
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        // Slimmer + narrower than before so it doesn't dominate the
        // restaurant menu on small phones. Sits in the safe-area inset.
        className="fixed left-1/2 -translate-x-1/2 z-50 w-auto max-w-[420px] px-0"
        style={{ bottom: "calc(1.0rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <Link
          href="/cart"
          aria-label={`Gå till varukorg, ${count} ${count === 1 ? "vara" : "varor"}, ${total.toFixed(0)} kronor`}
          className="flex items-center gap-3 rounded-full bg-gold-500 pl-3 pr-4 py-2.5 shadow-[0_8px_22px_-6px_rgba(234,181,69,0.55)] transition-all hover:scale-[1.01] active:scale-[0.99]"
          style={{ border: "1.25px solid rgba(255,255,255,0.25)" }}
        >
          <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-white text-gold-600 shadow shrink-0">
            <ShoppingBag size={15} strokeWidth={2.4} />
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-zinc-950 text-gold-400 text-[9px] font-black flex items-center justify-center border border-gold-500">
              {count}
            </span>
          </div>
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="text-[10px] font-black uppercase tracking-[0.15em] text-white/85">Varukorg</span>
            <span className="text-sm font-black text-white">{total.toFixed(0)} kr</span>
          </div>
          <ArrowRight size={14} className="text-white shrink-0 ml-1" strokeWidth={2.5} />
        </Link>
      </motion.div>
    </>
  );
};

export default FloatingCartButton;
