"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ShoppingBag } from "lucide-react";
import { useCartStore } from "@/store/cartStore";
import { useTranslation } from "@/lib/i18n/LocaleProvider";
import { usePathname } from "next/navigation";

/**
 * Flytande varukorgs-CTA — enda guldknappen på sidan ("tyst & direkt"-temat).
 * h-12, rounded-xl, "Visa varukorg" vänster + summa (tabular) höger.
 * Ingen glow/uppercase — bara en diskret neutral skugga så den lyfter från listan.
 */
const FloatingCartButton = () => {
  const { t } = useTranslation();
  const pathname = usePathname();
  const items = useCartStore((state) => state.items);
  const total = useCartStore((state) => state.getTotal());

  if (items.length === 0) return null;

  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  const embedSlug = pathname?.startsWith("/embed/") ? pathname.split("/")[2] : null;
  const cartHref = embedSlug ? `/cart?embed=1&restaurant=${encodeURIComponent(embedSlug)}` : "/cart";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="fixed left-3 right-3 z-50 flex justify-center"
      style={{ bottom: "max(calc(env(safe-area-inset-bottom, 0px) - 12px), 10px)" }}
    >
      <Link
        href={cartHref}
        aria-label={t("menu.viewCartAria", { count, total: total.toFixed(0) })}
        className="w-full max-w-md h-12 rounded-xl bg-gold-500 flex items-center justify-between px-5 transition-opacity active:opacity-90"
        style={{ color: "#FFFFFF", boxShadow: "0 2px 12px rgba(20,20,22,0.18)" }}
      >
        <span className="flex items-center gap-2.5 min-w-0">
          <span className="relative shrink-0">
            <ShoppingBag size={16} strokeWidth={2} />
            {/* Antals-chip springer till vid varje "lägg till" — den lilla wow-känslan. */}
            <AnimatePresence>
              <motion.span
                key={count}
                initial={{ scale: 0.3, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.3, opacity: 0 }}
                transition={{ type: "spring", stiffness: 700, damping: 18 }}
                className="absolute -top-2 -right-2 min-w-[15px] h-[15px] px-1 rounded-full text-[9px] font-bold flex items-center justify-center"
                style={{ backgroundColor: "#FFFFFF", color: "var(--color-gold-500, #F0531C)" }}
              >
                {count}
              </motion.span>
            </AnimatePresence>
          </span>
          <span className="text-[15px] font-semibold truncate">{t("menu.viewCart")}</span>
        </span>
        <span className="text-[15px] font-semibold shrink-0" style={{ fontVariantNumeric: "tabular-nums" }}>
          {total.toFixed(0)} kr
        </span>
      </Link>
    </motion.div>
  );
};

export default FloatingCartButton;
