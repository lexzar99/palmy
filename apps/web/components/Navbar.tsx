"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingBag, Mail, Coins } from "lucide-react";
import { useCartStore } from "@/store/cartStore";
import { useTranslation } from "@/lib/i18n/LocaleProvider";
import { useState, useEffect } from "react";
import axios from "axios";
import { PLATFORM_SESSION_CHANGED_EVENT } from "@/lib/platformSessionClient";
import DeliveraWordmark from "@/components/DeliveraWordmark";

type SessionUser = {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
};

type DpointsHeader = {
  enabled?: boolean;
  balance?: number;
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
  const [dpoints, setDpoints] = useState<DpointsHeader | null>(null);

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
    const loadDpoints = async () => {
      try {
        const res = await axios.get(`/api/platform/dpoints/me`);
        if (!cancelled && res.data?.enabled) setDpoints({ enabled: true, balance: Number(res.data.balance ?? 0) });
        else if (!cancelled) setDpoints(null);
      } catch {
        if (!cancelled) setDpoints(null);
      }
    };

    loadUser();
    loadDpoints();

    // Lyssna på session-events (login/logout i samma flik eller annan flik)
    const onChange = () => { void loadUser(); void loadDpoints(); };
    window.addEventListener(PLATFORM_SESSION_CHANGED_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      cancelled = true;
      window.removeEventListener(PLATFORM_SESSION_CHANGED_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  if (pathname?.startsWith("/order/")) return null;

  // Visningsnamn: först + efternamn om finns, annars name-fältet, annars null
  const displayName = user
    ? ((user.firstName?.trim() || "") + " " + (user.lastName?.trim() || "")).trim()
      || user.name?.trim()
      || null
    : null;

  const logo = (
    <DeliveraWordmark href="/" size="md" />
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

          <Link
            href="/orders"
            className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition-colors"
            style={{ backgroundColor: "var(--gold-soft)", color: "var(--color-gold-500)", border: "1px solid color-mix(in srgb, var(--color-gold-500) 24%, transparent)" }}
            aria-label="Dpoints"
          >
            <Coins size={15} strokeWidth={1.9} />
            <span className="tabular-nums">{dpoints?.enabled ? `${(dpoints.balance ?? 0).toLocaleString("sv-SE")} p` : "Dpoints"}</span>
          </Link>

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
                  style={{ backgroundColor: "var(--color-gold-500, #F0531C)", color: "#141416" }}
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
