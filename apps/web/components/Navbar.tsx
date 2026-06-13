"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingBag, Mail } from "lucide-react";
import { useCartStore } from "@/store/cartStore";
import { useTranslation } from "@/lib/i18n/LocaleProvider";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import { useState, useEffect } from "react";
import axios from "axios";
import { PLATFORM_SESSION_CHANGED_EVENT } from "@/lib/platformSessionClient";

type SessionUser = {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
};

/**
 * Navbar — desktop-header (renderas bara md+ via layout.tsx).
 * Platt vit bar med hårfin linje under: logotyp till vänster,
 * sentence case-länkar + tysta ikonknappar till höger.
 * Ingen blur, ingen skugga, inga versaler.
 */
const Navbar = () => {
  const { t } = useTranslation();
  const pathname = usePathname();
  const items = useCartStore((state) => state.items);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    setMounted(true);

    let cancelled = false;
    const loadUser = async () => {
      try {
        const res = await axios.get(`/api/platform/profile`);
        if (!cancelled && res.data) setUser(res.data);
      } catch {
        if (!cancelled) setUser(null);
      }
    };

    loadUser();

    // Lyssna på session-events (login/logout i samma flik eller annan flik)
    const onChange = () => { void loadUser(); };
    window.addEventListener(PLATFORM_SESSION_CHANGED_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      cancelled = true;
      window.removeEventListener(PLATFORM_SESSION_CHANGED_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  // Visningsnamn: först + efternamn om finns, annars name-fältet, annars null
  const displayName = user
    ? ((user.firstName?.trim() || "") + " " + (user.lastName?.trim() || "")).trim()
      || user.name?.trim()
      || null
    : null;

  const logo = (
    <Link href="/" className="flex items-center" aria-label="Delívera — startsidan">
      <span className="text-[21px] font-extrabold tracking-tight leading-none" style={{ color: "var(--text-primary)" }}>
        delí<span style={{ color: "var(--gold-ink)" }}>vera</span>
      </span>
    </Link>
  );

  if (!mounted) return (
    <nav
      className="fixed top-0 left-0 right-0 z-[100] h-16 flex items-center px-7"
      style={{ background: "var(--bg-primary)", borderBottom: "1px solid var(--border-muted)" }}
    >
      {logo}
    </nav>
  );

  const links = [
    { href: "/", label: t("nav.home") },
    { href: "/discover", label: t("nav.favorites") },
    { href: "/orders", label: t("nav.myOrders") },
  ];

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-[100]"
      style={{
        backgroundColor: "var(--bg-primary)",
        borderBottom: "1px solid var(--border-muted)",
      }}
    >
      <div className="max-w-7xl 2xl:max-w-[1600px] mx-auto px-7 h-16 flex items-center justify-between">
        {logo}

        <div className="flex items-center gap-7">
          {links.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm transition-colors"
                style={{
                  color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                  fontWeight: isActive ? 650 : 500,
                }}
                aria-current={isActive ? "page" : undefined}
              >
                {link.label}
              </Link>
            );
          })}

          {displayName ? (
            <Link
              href="/profile"
              className="text-sm font-semibold transition-colors truncate max-w-[160px]"
              style={{ color: "var(--text-primary)" }}
            >
              {displayName}
            </Link>
          ) : (
            <Link
              href="/profile"
              className="text-sm font-semibold transition-colors"
              style={{ color: "var(--text-primary)" }}
            >
              {t("nav.login")}
            </Link>
          )}

          {/* Tysta ikonknappar — ingen bakgrundsplatta, ingen kant */}
          <div className="flex items-center gap-1 pl-4" style={{ borderLeft: "1px solid var(--border-muted)" }}>
            <Link
              href="/contact"
              className="p-2 rounded-lg transition-colors"
              style={{ color: "var(--text-secondary)" }}
              aria-label={t("nav.contact")}
              title={t("nav.contact")}
            >
              <Mail size={18} strokeWidth={1.8} />
            </Link>

            <LocaleSwitcher />

            <Link
              href="/cart"
              className="relative p-2 rounded-lg transition-colors"
              style={{ color: "var(--text-primary)" }}
              aria-label={t("nav.cart")}
            >
              <ShoppingBag size={19} strokeWidth={1.8} />
              {itemCount > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 text-[10px] font-bold rounded-full flex items-center justify-center"
                  style={{ backgroundColor: "var(--color-gold-500, #E7B24B)", color: "#141416" }}
                >
                  {itemCount}
                </span>
              )}
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
