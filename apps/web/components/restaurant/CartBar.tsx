"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ShoppingBag } from "lucide-react";
import { useCartStore } from "@/store/cartStore";
import { useTranslation } from "@/lib/i18n/LocaleProvider";

/**
 * Flytande varukorgsknapp för ve-sidan. En enda svart pill nertill, mjuk
 * fjäder in/ut, antalsbadge som "poppar" vid varje tillägg. Länkar till den
 * riktiga kassan (/cart) — samma cart-store som resten av sajten.
 */
/**
 * `aboveEmbedNav`: i partner-embedden ligger EmbeddedNav (h-16 + safe-area)
 * i botten på mobil, så pillen lyfts ovanför den. På dator sitter navbaren
 * högst upp och pillen ligger kvar nere.
 */
export default function CartBar({ href = "/cart", aboveEmbedNav = false }: { href?: string; aboveEmbedNav?: boolean }) {
  const { t } = useTranslation();
  const items = useCartStore((s) => s.items);
  const total = useCartStore((s) => s.getTotal());
  const count = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <AnimatePresence>
      {items.length > 0 && (
        <motion.div
          key="ve-cart-bar"
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
          className={`fixed left-4 right-4 z-50 flex justify-center pointer-events-none ${aboveEmbedNav ? "bottom-[calc(76px+env(safe-area-inset-bottom,0px))] md:bottom-[max(env(safe-area-inset-bottom,0px),14px)]" : ""}`}
          style={aboveEmbedNav ? undefined : { bottom: "max(env(safe-area-inset-bottom, 0px), 14px)" }}
        >
          <Link
            href={href}
            aria-label={t("menu.viewCartAria", { count, total: total.toFixed(0) })}
            className="ve-press pointer-events-auto w-full max-w-md h-[56px] rounded-full flex items-center justify-between pl-2.5 pr-5"
            style={{ backgroundColor: "var(--ve-cta)", color: "var(--ve-cta-ink)", boxShadow: "var(--ve-shadow-float)" }}
          >
            <span className="flex items-center gap-3 min-w-0">
              <span className="relative w-10 h-10 rounded-full grid place-items-center" style={{ backgroundColor: "rgba(255,255,255,0.12)" }}>
                <ShoppingBag size={17} strokeWidth={2} />
                <AnimatePresence mode="popLayout">
                  <motion.span
                    key={count}
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.4, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 700, damping: 20 }}
                    className="ve-tabular absolute -top-1 -right-1 min-w-[19px] h-[19px] px-1.5 rounded-full text-[11px] font-semibold grid place-items-center"
                    style={{ backgroundColor: "var(--ve-accent)", color: "#fff" }}
                  >
                    {count}
                  </motion.span>
                </AnimatePresence>
              </span>
              <span className="text-[16px] font-semibold tracking-[-0.01em] truncate">{t("menu.viewCart")}</span>
            </span>
            <span className="ve-tabular text-[16px] font-semibold shrink-0">{total.toFixed(0)} kr</span>
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
