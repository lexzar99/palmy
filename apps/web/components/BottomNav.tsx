"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Heart, ShoppingBag, User } from "lucide-react";
import { motion } from "framer-motion";
import { useCartStore } from "@/store/cartStore";
import { useTranslation } from "@/lib/i18n/LocaleProvider";

const BottomNav = () => {
  const pathname = usePathname();
  const { t } = useTranslation();
  const items = useCartStore((state) => state.items);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  // Hide bottom nav inside restaurant detail pages — the FloatingCartButton handles navigation there
  if (pathname?.startsWith("/restaurants/")) return null;

  const navItems = [
    { href: "/", label: t("nav.home"), icon: Home },
    { href: "/discover", label: t("nav.favorites"), icon: Heart },
    { href: "/cart", label: t("nav.cart"), icon: ShoppingBag, count: itemCount },
    { href: "/profile", label: t("nav.profile"), icon: User },
  ];

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[100] md:hidden"
      style={{
        backgroundColor: "var(--bg-primary)",
        borderTop: "1px solid var(--border-muted)",
        boxShadow: "0 -4px 20px rgba(17,17,19,0.06)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <nav className="flex items-stretch justify-around px-1 pt-1.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
              className="relative flex-1 flex items-center justify-center pb-2 touch-manipulation"
            >
              <div className="relative flex flex-col items-center gap-1 px-3 py-1.5 rounded-2xl">
                {isActive && (
                  <motion.div
                    layoutId="navActive"
                    className="absolute inset-0 rounded-2xl"
                    style={{ backgroundColor: "rgba(231,178,75,0.16)" }}
                    transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                  />
                )}
                <Icon
                  size={21}
                  strokeWidth={isActive ? 2.6 : 2}
                  fill={isActive ? "currentColor" : "none"}
                  className="relative z-10"
                  style={{ color: isActive ? "#C28E2E" : "var(--text-secondary)" }}
                />
                <span
                  className="relative z-10 text-[9px] font-black uppercase tracking-wider"
                  style={{ color: isActive ? "#C28E2E" : "var(--text-secondary)" }}
                >
                  {item.label}
                </span>
                {item.count !== undefined && item.count > 0 && (
                  <span className="absolute top-0 right-1 z-20 bg-gold-500 text-zinc-950 text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-sm">
                    {item.count}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </nav>
    </div>
  );
};

export default BottomNav;
