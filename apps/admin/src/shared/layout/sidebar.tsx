"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Zap,
  Gauge,
  AlertTriangle,
  BellRing,
  Bike,
  Building2,
  ChevronRight,
  ChevronLeft,
  CircleDollarSign,
  ClipboardList,
  Coins,
  ContactRound,
  Filter,
  Gift,
  History,
  LayoutDashboard,
  LogOut,
  type LucideIcon,
  Map,
  MenuSquare,
  Moon,
  Network,
  Pin,
  ReceiptText,
  Search,
  Sun,
  Shield,
  Star,
  Store,
  Tablet,
  TicketPercent,
  Users,
} from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { clearStoredAdminSession } from "@/shared/auth/storage";
import { getStoredTheme, setStoredTheme, type Theme } from "@/shared/store/theme";

type NavItem = { href: string; label: string; icon: LucideIcon };
type NavSection = { id: string; label: string; items: NavItem[] };

const SECTIONS: NavSection[] = [
  {
    id: "drift",
    label: "Drift",
    items: [
      { href: "/orders", label: "Ordrar", icon: ClipboardList },
      { href: "/order-history", label: "Historik", icon: History },
      { href: "/customers", label: "Kunder", icon: ContactRound },
      { href: "/customer-search", label: "Sök kund", icon: Search },
      { href: "/reviews", label: "Recensioner", icon: Star },
      { href: "/couriers", label: "Kurirer", icon: Bike },
      { href: "/push", label: "Push", icon: BellRing },
    ],
  },
  {
    id: "katalog",
    label: "Katalog",
    items: [
      { href: "/restaurants", label: "Restauranger", icon: Store },
      { href: "/brands", label: "Kedjor", icon: Network },
      { href: "/restaurant-devices", label: "Enheter", icon: Tablet },
      { href: "/menu", label: "Meny", icon: MenuSquare },
      { href: "/categories", label: "Kategorier", icon: Filter },
      { href: "/zones", label: "Zoner", icon: Map },
      { href: "/deals", label: "Deals", icon: Gift },
      { href: "/sponsors", label: "Sponsorer", icon: TicketPercent },
      { href: "/tiers", label: "Tiers", icon: Shield },
    ],
  },
  {
    id: "plattform",
    label: "Plattform",
    items: [
      { href: "/dashboard", label: "Översikt", icon: LayoutDashboard },
      { href: "/finance", label: "Ekonomi", icon: CircleDollarSign },
      { href: "/receipts", label: "Kvitton", icon: ReceiptText },
      { href: "/users", label: "Användare", icon: Users },
      { href: "/dpoints", label: "Lojalitet", icon: Coins },
      { href: "/engines", label: "Motorn", icon: Zap },
      { href: "/api-health", label: "API-status", icon: Gauge },
      { href: "/platform-settings", label: "Inställningar", icon: Building2 },
      { href: "/crisis", label: "Krisverktyg", icon: AlertTriangle },
      { href: "/audit-log", label: "Audit-log", icon: History },
      { href: "/2fa", label: "2FA", icon: Shield },
    ],
  },
];

const SECTION_KEY = "sidebar:expanded-sections";
const PIN_KEY = "nav.pinned";

function loadExpanded(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(SECTION_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function isActiveHref(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ onOpenPalette }: { onOpenPalette: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [hydrated, setHydrated] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");

  // Nav-läge: pinned (full meny i flödet) vs ikon-rad + hover-flyout.
  const [pinned, setPinned] = useState(false);
  const [hovering, setHovering] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setTheme(getStoredTheme());
    try {
      setPinned(localStorage.getItem(PIN_KEY) === "1");
    } catch {}
  }, []);

  const toggleTheme = () =>
    setTheme((t) => {
      const next: Theme = t === "dark" ? "light" : "dark";
      setStoredTheme(next);
      return next;
    });

  const togglePin = () =>
    setPinned((p) => {
      const next = !p;
      try {
        localStorage.setItem(PIN_KEY, next ? "1" : "0");
      } catch {}
      if (next) setHovering(false);
      return next;
    });

  // Hover-flyout: öppna direkt, stäng med ~150 ms fördröjning så man hinner
  // föra musen in i flyouten utan att den fälls.
  const openFlyout = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (!pinned) setHovering(true);
  };
  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setHovering(false), 150);
  };
  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  // Stäng flyouten när man navigerat till en ny sida.
  useEffect(() => {
    setHovering(false);
  }, [pathname]);

  // Hydrate from storage + se till att gruppen med aktuell route är öppen.
  useEffect(() => {
    const stored = loadExpanded();
    const next: Record<string, boolean> = { ...stored };
    if (Object.keys(stored).length === 0) {
      for (const section of SECTIONS) next[section.id] = true;
    }
    const activeSection = SECTIONS.find((section) =>
      section.items.some((item) => isActiveHref(pathname, item.href)),
    );
    if (activeSection) next[activeSection.id] = true;
    setExpanded(next);
    setHydrated(true);
  }, [pathname]);

  const toggleSection = (id: string) => {
    setExpanded((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem(SECTION_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const handleLogout = async () => {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || ""}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {}
    clearStoredAdminSession();
    router.replace("/login");
  };

  const handleLogoutEverywhere = async () => {
    if (!window.confirm("Logga ut alla enheter och sessioner för detta konto?")) return;
    try {
      const token = (typeof localStorage !== "undefined" && localStorage.getItem("viaeats_token")) || "";
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || ""}/api/auth/logout-everywhere`, {
        method: "POST",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
    } catch {}
    clearStoredAdminSession();
    router.replace("/login");
  };

  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  // ── Full meny (delas av pinned-läget och hover-flyouten) ──
  const fullMenu = (
    <>
      <div className="sidebar-brand" style={{ justifyContent: "space-between", paddingBottom: 14 }}>
        <Link href="/dashboard" style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <span className="sidebar-brand-mark" aria-hidden>V</span>
          <span>
            <span className="sidebar-brand-text">
              ViaEats
            </span>
            <span className="sidebar-brand-sub">Admin</span>
          </span>
        </Link>
        <button
          type="button"
          onClick={togglePin}
          className={cn("nav-pin", pinned && "is-pinned")}
          title={pinned ? "Lås upp menyn (ikon-rad)" : "Lås menyn öppen"}
          aria-label={pinned ? "Lås upp menyn" : "Lås menyn öppen"}
          aria-pressed={pinned}
        >
          {pinned ? <ChevronLeft size={14} /> : <Pin size={13} />}
        </button>
      </div>

      <button type="button" className="cmdk-trigger" onClick={onOpenPalette} style={{ marginBottom: 14 }}>
        <Search size={14} />
        <span style={{ flex: 1, textAlign: "left" }}>Sök eller hoppa till…</span>
        <kbd>{isMac ? "⌘" : "Ctrl"}K</kbd>
      </button>

      <nav className="flex-1 overflow-y-auto" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {SECTIONS.map((section) => {
          const isOpen = hydrated && expanded[section.id];
          return (
            <div key={section.id}>
              <button type="button" onClick={() => toggleSection(section.id)} className="sidebar-section-header">
                <span>{section.label}</span>
                <ChevronRight
                  size={11}
                  style={{
                    transition: "transform 150ms ease",
                    transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                    opacity: 0.6,
                  }}
                />
              </button>

              {isOpen && (
                <div className="sidebar-section-body">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const active = isActiveHref(pathname, item.href);
                    return (
                      <Link key={item.href} href={item.href} className={cn("nav-link", active && "nav-link-active")}>
                        <Icon size={16} />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div style={{ display: "flex", gap: 4 }}>
          <button type="button" onClick={toggleTheme} className="nav-link" style={{ flex: 1, paddingLeft: 12, color: "var(--text-muted)" }}>
            {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
            <span>{theme === "dark" ? "Ljust" : "Mörkt"}</span>
          </button>
          <button type="button" onClick={handleLogout} className="nav-link" style={{ flex: 1, paddingLeft: 12, color: "var(--text-muted)" }}>
            <LogOut size={14} />
            <span>Logga ut</span>
          </button>
        </div>
        <button
          type="button"
          onClick={handleLogoutEverywhere}
          className="nav-link"
          style={{ paddingLeft: 12, color: "var(--text-muted)", fontSize: 11, minHeight: 32 }}
          title="Loggar ut alla enheter och sessioner för detta konto."
        >
          <LogOut size={12} />
          <span>Logga ut överallt</span>
        </button>
      </div>
    </>
  );

  // ── Ikon-rad (66px) — alltid synlig när menyn inte är pinnad ──
  const rail = (
    <div className="nav-rail">
      <Link href="/dashboard" className="sidebar-brand-mark" aria-label="ViaEats Admin" style={{ marginBottom: 8 }}>
        V
      </Link>
      <button
        type="button"
        onClick={togglePin}
        className="nav-rail-icon"
        title="Lås menyn öppen"
        aria-label="Lås menyn öppen"
      >
        <Pin size={16} />
      </button>
      <div className="nav-rail-sep" />

      {SECTIONS.map((section, si) => (
        <div key={section.id} style={{ display: "contents" }}>
          {section.items.map((item) => {
            const Icon = item.icon;
            const active = isActiveHref(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn("nav-rail-icon", active && "is-active")}
                title={item.label}
                aria-label={item.label}
              >
                <Icon size={18} />
              </Link>
            );
          })}
          {si < SECTIONS.length - 1 && <div className="nav-rail-sep" />}
        </div>
      ))}

      <div className="nav-rail-spacer" />
      <button type="button" onClick={toggleTheme} className="nav-rail-icon" title="Byt tema" aria-label="Byt tema">
        {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
      </button>
      <button type="button" onClick={handleLogout} className="nav-rail-icon" title="Logga ut" aria-label="Logga ut">
        <LogOut size={16} />
      </button>
    </div>
  );

  return (
    <aside className="nav-wrap" data-pinned={pinned} onMouseEnter={openFlyout} onMouseLeave={scheduleClose}>
      {pinned ? (
        <div className="sidebar-shell">{fullMenu}</div>
      ) : (
        <>
          {rail}
          {hovering && (
            <div className="nav-flyout" onMouseEnter={openFlyout} onMouseLeave={scheduleClose}>
              {fullMenu}
            </div>
          )}
        </>
      )}
    </aside>
  );
}
