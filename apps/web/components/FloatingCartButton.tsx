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
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        className="fixed left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md px-0"
        style={{ bottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <Link
          href="/cart"
          aria-label={`Gå till varukorg, ${count} ${count === 1 ? "vara" : "varor"}, ${total.toFixed(0)} kronor`}
          className="flex items-center justify-between rounded-full bg-gold-500 px-5 py-4 shadow-[0_10px_30px_-6px_rgba(234,181,69,0.55)] transition-all hover:scale-[1.01] active:scale-[0.99]"
          style={{ border: "1.5px solid rgba(255,255,255,0.25)" }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-gold-600 shadow-md shrink-0 relative">
              <ShoppingBag size={18} strokeWidth={2.4} />
              <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-zinc-950 text-gold-400 text-[10px] font-black flex items-center justify-center border-2 border-gold-500">
                {count}
              </span>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/85 leading-none mb-1">Varukorg</div>
              <div className="text-base font-black text-white leading-none">{total.toFixed(0)} kr</div>
            </div>
          </div>
          <div className="bg-white/15 px-3 py-2 rounded-full flex items-center gap-1.5 shrink-0">
            <span className="text-xs font-black uppercase tracking-wider text-white hidden xs:inline">Visa</span>
            <ArrowRight size={16} className="text-white" strokeWidth={2.5} />
          </div>
        </Link>
      </motion.div>
    </>
  );
};

export default FloatingCartButton;
