"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity,
  Gauge,
  AlertTriangle,
  BellRing,
  Bike,
  Building2,
  ChevronRight,
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
  ReceiptText,
  Search,
  Shield,
  Sparkles,
  Star,
  Store,
  Tablet,
  TicketPercent,
  Users,
} from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { clearStoredAdminSession } from "@/shared/auth/storage";

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
      { href: "/marketing-referrals", label: "Välkomstrabatt", icon: Sparkles },
      { href: "/dpoints", label: "Dpoints", icon: Coins },
      { href: "/api-health", label: "API-status", icon: Gauge },
      { href: "/platform-settings", label: "Inställningar", icon: Building2 },
      { href: "/crisis", label: "Krisverktyg", icon: AlertTriangle },
      { href: "/audit-log", label: "Audit-log", icon: History },
      { href: "/health", label: "Hälsa", icon: Activity },
      { href: "/2fa", label: "2FA", icon: Shield },
    ],
  },
];

const STORAGE_KEY = "sidebar:expanded-sections";

function loadExpanded(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export function Sidebar({ onOpenPalette }: { onOpenPalette: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from storage + auto-expand the section containing current path
  useEffect(() => {
    const stored = loadExpanded();
    const activeSection = SECTIONS.find((section) =>
      section.items.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)),
    );
    const next: Record<string, boolean> = { ...stored };
    if (activeSection) next[activeSection.id] = true;
    // If nothing is set yet, expand Drift by default
    if (Object.keys(stored).length === 0 && !activeSection) next.drift = true;
    setExpanded(next);
    setHydrated(true);
  }, [pathname]);

  const toggleSection = (id: string) => {
    setExpanded((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const handleLogout = async () => {
    try {
      // Best-effort call so the backend can clear the httpOnly cookie.
      // Errors here aren't fatal — we still wipe local state and redirect.
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || ""}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {}
    clearStoredAdminSession();
    router.replace("/login");
  };

  // A5 — "Log out everywhere": bumps tokenVersion server-side so every
  // previously-issued token for this admin becomes invalid on next request.
  const handleLogoutEverywhere = async () => {
    if (!window.confirm("Logga ut alla enheter och sessioner för detta konto?")) return;
    try {
      const token = (typeof localStorage !== "undefined" && localStorage.getItem("matgo_token")) || "";
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

  return (
    <aside className="sidebar-shell">
      <Link href="/dashboard" className="sidebar-brand">
        <div className="sidebar-brand-mark">D</div>
        <span className="sidebar-brand-text">Delívera.</span>
      </Link>

      <nav className="flex-1 overflow-y-auto" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {SECTIONS.map((section) => {
          const isOpen = hydrated && expanded[section.id];
          return (
            <div key={section.id}>
              <button
                type="button"
                onClick={() => toggleSection(section.id)}
                className="sidebar-section-header"
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <ChevronRight
                    size={11}
                    style={{
                      transition: "transform 150ms ease",
                      transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                    }}
                  />
                  {section.label}
                </span>
                <span className="sidebar-section-count">{section.items.length}</span>
              </button>

              {isOpen && (
                <div className="sidebar-section-body">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const active =
                      pathname === item.href || pathname.startsWith(`${item.href}/`);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn("nav-link", active && "nav-link-active")}
                      >
                        <Icon size={14} />
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
        <button type="button" className="cmdk-trigger" onClick={onOpenPalette}>
          <Search size={14} />
          <span>Sök eller hoppa till…</span>
          <kbd>{isMac ? "⌘" : "Ctrl"}K</kbd>
        </button>
        <button
          type="button"
          onClick={handleLogout}
          className="nav-link"
          style={{ paddingLeft: 10, color: "var(--text-muted)" }}
        >
          <LogOut size={14} />
          <span>Logga ut</span>
        </button>
        <button
          type="button"
          onClick={handleLogoutEverywhere}
          className="nav-link"
          style={{ paddingLeft: 10, color: "var(--text-muted)", fontSize: 11 }}
          title="Invaliderar alla utfärdade JWT — använd när token är läckt eller laptop tappad."
        >
          <LogOut size={12} />
          <span>Logga ut alla enheter</span>
        </button>
      </div>
    </aside>
  );
}
