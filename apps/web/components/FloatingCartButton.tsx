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

      {/* Samma flytande pill-språk som BottomNav: full bredd (max-w-md), samma
          radie/höjd/skugga och bottenoffset — restaurangsidan känns då som
          samma app som övriga sidor. Mörk text på guld (paritet med nav-pillen). */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        className="fixed left-3 right-3 z-50 flex justify-center"
        style={{ bottom: "max(calc(env(safe-area-inset-bottom, 0px) - 12px), 10px)" }}
      >
        <Link
          href="/cart"
          aria-label={`Gå till varukorg, ${count} ${count === 1 ? "vara" : "varor"}, ${total.toFixed(0)} kronor`}
          className="w-full max-w-md h-[60px] rounded-[28px] bg-gold-500 flex items-center justify-between pl-3 pr-5 transition-all hover:scale-[1.01] active:scale-[0.99]"
          style={{ boxShadow: "0 10px 40px rgba(231,178,75,0.45), 0 2px 10px rgba(17,17,19,0.10)" }}
        >
          <span className="flex items-center gap-3 min-w-0">
            <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-zinc-950/90 text-gold-400 shrink-0">
              <ShoppingBag size={17} strokeWidth={2.4} />
              <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-white text-zinc-950 text-[10px] font-black flex items-center justify-center">
                {count}
              </span>
            </span>
            <span className="text-[14px] font-bold text-zinc-950">Visa varukorg</span>
          </span>
          <span className="flex items-center gap-1.5 shrink-0">
            <span className="text-[15px] font-bold text-zinc-950 tabular-nums">{total.toFixed(0)} kr</span>
            <ArrowRight size={16} className="text-zinc-950" strokeWidth={2.5} />
          </span>
        </Link>
      </motion.div>
    </>
  );
};

export default FloatingCartButton;
