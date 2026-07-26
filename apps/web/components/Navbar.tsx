"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingBag, Mail } from "lucide-react";
import { useCartStore } from "@/store/cartStore";
import { useTranslation } from "@/lib/i18n/LocaleProvider";
import { useState, useEffect, useSyncExternalStore } from "react";
import axios from "axios";
import { getPlatformSessionStatus, PLATFORM_SESSION_CHANGED_EVENT } from "@/lib/platformSessionClient";
import ViaEatsWordmark from "@/components/ViaEatsWordmark";

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
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [user, setUser] = useState<SessionUser | null>(null);
  const [embedQuery, setEmbedQuery] = useState(false);
  useEffect(() => {
    setEmbedQuery(new URLSearchParams(window.location.search).get("embed") === "1");
  }, [pathname]);
  const embedMode = pathname?.startsWith("/embed/") || (
    embedQuery &&
    (pathname === "/cart" || pathname === "/orders" || pathname?.startsWith("/order/"))
  );

  useEffect(() => {
    if (embedMode || pathname?.startsWith("/order/")) return;
    let cancelled = false;
    const loadUser = async () => {
      try {
        const loggedIn = await getPlatformSessionStatus();
        if (!loggedIn) {
          if (!cancelled) setUser(null);
          return;
        }
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
  }, [embedMode, pathname]);

  if (pathname?.startsWith("/order/") || embedMode) return null;

  // Visningsnamn: först + efternamn om finns, annars name-fältet, annars null
  const displayName = user
    ? ((user.firstName?.trim() || "") + " " + (user.lastName?.trim() || "")).trim()
      || user.name?.trim()
      || null
    : null;

  const logo = (
    <ViaEatsWordmark href="/" size="md" />
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
    { href: "/search", label: t("nav.search") },
    { href: "/deals", label: t("nav.deals") },
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
              {t("nav.profile")}
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
