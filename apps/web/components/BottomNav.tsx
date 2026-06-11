"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import axios from "axios";
import { Home, Heart, ShoppingBag, User } from "lucide-react";
import { motion } from "framer-motion";
import { useCartStore } from "@/store/cartStore";
import { useTranslation } from "@/lib/i18n/LocaleProvider";

// Dpoints-saldo för nav-badgen under Profil. Tyst om utloggad/av (401 → null).
async function fetchNavBalance(): Promise<{ enabled: boolean; balance: number } | null> {
  try {
    const r = await axios.get("/api/platform/dpoints/me");
    return { enabled: !!r.data?.enabled, balance: Number(r.data?.balance ?? 0) };
  } catch {
    return null;
  }
}

/**
 * BottomNav — flytande glas-bar, fyra LIKA BREDA segment (ikon + etikett).
 * Aktiv-pillen delar layoutId och glider mellan segmenten med ren transform
 * (ingen bredd-animation → inget layout-thrash/jitter). På restaurangsidor
 * göms baren med transform + opacity istället för unmount, så den aldrig
 * flimrar eller spelar om sina animationer vid sidbyten.
 */
const BottomNav = () => {
  const pathname = usePathname();
  const { t } = useTranslation();
  const items = useCartStore((state) => state.items);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const [dpoints, setDpoints] = useState<{ enabled: boolean; balance: number } | null>(null);

  // Uppdatera saldot vid navigering (efter köp/inlösen syns nya saldot direkt).
  useEffect(() => {
    fetchNavBalance().then(setDpoints);
  }, [pathname]);

  // Restaurangsidor: FloatingCartButton tar över — göm baren mjukt (ingen
  // unmount → layoutId-pillen och glaset överlever navigeringen).
  const hidden = pathname?.startsWith("/restaurants/") ?? false;

  const navItems = [
    { href: "/", label: t("nav.home"), icon: Home },
    { href: "/discover", label: t("nav.favorites"), icon: Heart },
    { href: "/cart", label: t("nav.cart"), icon: ShoppingBag, count: itemCount },
    { href: "/profile", label: t("nav.profile"), icon: User },
  ];

  return (
    <div
      className="fixed left-3 right-3 z-[100] md:hidden flex justify-center pointer-events-none transition-all duration-300 ease-out"
      style={{
        bottom: "max(calc(env(safe-area-inset-bottom, 0px) - 12px), 10px)",
        transform: hidden ? "translateY(120%)" : "translateY(0)",
        opacity: hidden ? 0 : 1,
      }}
      aria-hidden={hidden}
    >
      <nav
        className={`w-full max-w-md flex items-stretch p-1.5 rounded-[28px] backdrop-blur-xl ${hidden ? "pointer-events-none" : "pointer-events-auto"}`}
        style={{
          backgroundColor: "var(--glass-bg)",
          border: "1px solid var(--glass-border)",
          boxShadow: "0 10px 40px rgba(17,17,19,0.16), 0 2px 10px rgba(17,17,19,0.08)",
        }}
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
              className="relative flex-1 touch-manipulation"
            >
              {/* Delad guld-pill — ren transform-glidning mellan segmenten */}
              {isActive && (
                <motion.div
                  layoutId="navActivePill"
                  className="absolute inset-0 rounded-[22px]"
                  style={{ backgroundColor: "var(--color-gold-500, #E7B24B)" }}
                  transition={{ type: "spring", bounce: 0.18, duration: 0.45 }}
                />
              )}
              <div className="relative z-10 flex h-[54px] flex-col items-center justify-center gap-0.5">
                <Icon
                  size={21}
                  strokeWidth={isActive ? 2.4 : 2}
                  className="shrink-0 transition-colors duration-200"
                  style={{ color: isActive ? "#1c1c1e" : "var(--text-secondary)" }}
                />
                <span
                  className="text-[10.5px] font-bold leading-none transition-colors duration-200"
                  style={{ color: isActive ? "#1c1c1e" : "var(--text-secondary)" }}
                >
                  {item.label}
                </span>
              </div>
              {/* Cart-antal */}
              {item.count !== undefined && item.count > 0 && (
                <span className="absolute top-1 right-[calc(50%-22px)] z-20 min-w-[16px] h-4 px-1 rounded-full bg-zinc-900 text-gold-400 text-[9px] font-black flex items-center justify-center">
                  {item.count}
                </span>
              )}
              {/* Dpoints-saldo på Profil */}
              {item.href === "/profile" && dpoints?.enabled && dpoints.balance > 0 && (
                <span className="absolute top-1 right-[calc(50%-26px)] z-20 px-1 h-4 rounded-full bg-zinc-900 text-gold-400 text-[8px] font-black flex items-center justify-center leading-none">
                  {dpoints.balance}p
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
};

export default BottomNav;
