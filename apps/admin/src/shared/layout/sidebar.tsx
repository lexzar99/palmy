"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ChevronRight,
  ChevronLeft,
  LogOut,
  Menu,
  Moon,
  Pin,
  Search,
  Sun,
  X,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getSystemHealth, healthQueryKey } from "@/modules/dashboard/api";
import { cn } from "@/shared/utils/cn";
import { logoutAdminSession } from "@/shared/auth/storage";
import { useAdminSession } from "@/shared/hooks/use-admin-session";
import { getStoredTheme, setStoredTheme, type Theme } from "@/shared/store/theme";
import { ADMIN_SECTIONS, isActiveAdminHref } from "@/shared/navigation/admin-routes";
// Cream-symbolen — navy-varianten försvinner mot den mörka menyn.
import viaeatsSymbol from "../../../../../Logotyp/sym-cream.png";

/** Visningsnamn för profilkortet; generiska "admin"-konton får riktigt namn. */
function displayName(sessionName?: string | null) {
  const name = (sessionName ?? "").trim();
  if (!name || /^admin$/i.test(name)) return "Jarir Alshaher";
  return name;
}

function nameInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

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

export function Sidebar({ onOpenPalette }: { onOpenPalette: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const session = useAdminSession();
  const profileName = displayName(session.data?.name);

  const isRouteActive = (id: string, href: string) => {
    if (!isActiveAdminHref(pathname, href)) return false;
    if (id === "tiers") return searchParams.get("tab") === "tiers";
    if (id === "finance") return searchParams.get("tab") !== "tiers";
    if (id === "two-factor") return searchParams.get("tab") === "sakerhet";
    if (id === "users") return searchParams.get("tab") !== "sakerhet";
    return true;
  };

  // Kräver åtgärd-badges: ordrar som väntar accept + systemvarningar.
  const health = useQuery({ queryKey: healthQueryKey, queryFn: getSystemHealth, refetchInterval: 60_000, retry: false });
  const navBadges: Record<string, number> = {
    "/orders": health.data?.operations.pendingOrders ?? 0,
    "/dashboard": health.data?.alerts.filter((a) => a.level === "warning").length ?? 0,
  };
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const stored = loadExpanded();
    return Object.fromEntries(
      ADMIN_SECTIONS.map((section) => [section.id, section.id === "partners" ? true : stored[section.id] ?? true]),
    );
  });
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme());

  // Full meny är standard enligt masterplanen. Rail är ett frivilligt desktopläge.
  const [pinned, setPinned] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      const stored = localStorage.getItem(PIN_KEY);
      return stored === null ? true : stored === "1";
    } catch {
      return true;
    }
  });
  const [hovering, setHovering] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [compactViewport, setCompactViewport] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 1199px)").matches,
  );
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1199px)");
    const onChange = (event: MediaQueryListEvent) => {
      setCompactViewport(event.matches);
      if (!event.matches) setMobileOpen(false);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

  const toggleTheme = () =>
    setTheme((t) => {
      const next: Theme = t === "dark" ? "light" : "dark";
      setStoredTheme(next);
      return next;
    });

  const togglePin = () => {
    if (compactViewport) {
      setMobileOpen((value) => !value);
      return;
    }
    setPinned((p) => {
      const next = !p;
      try {
        localStorage.setItem(PIN_KEY, next ? "1" : "0");
      } catch {}
      if (next) setHovering(false);
      return next;
    });
  };

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
    await logoutAdminSession();
    router.replace("/login");
  };

  const handleLogoutEverywhere = async () => {
    if (!window.confirm("Logga ut alla enheter och sessioner för detta konto?")) return;
    await logoutAdminSession(true);
    router.replace("/login");
  };

  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  // ── Full meny (delas av pinned-läget och hover-flyouten) ──
  const fullMenu = (
    <>
      <div className="sidebar-brand" style={{ justifyContent: "space-between", paddingBottom: 14 }}>
        <Link href="/dashboard" style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <span className="sidebar-brand-mark" aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={viaeatsSymbol.src} alt="" />
          </span>
          <span>
            <span className="sidebar-brand-text">
              viaeats
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

      <nav className="sidebar-navigation">
        {ADMIN_SECTIONS.map((section) => {
          const containsActiveRoute = section.routes.some((item) => isRouteActive(item.id, item.href));
          const isAlwaysOpen = section.id === "partners";
          const isOpen = isAlwaysOpen || containsActiveRoute || expanded[section.id] !== false;
          return (
            <div key={section.id}>
              <button
                type="button"
                onClick={() => {
                  if (!isAlwaysOpen) toggleSection(section.id);
                }}
                className="sidebar-section-header"
                aria-expanded={Boolean(isOpen)}
                aria-disabled={isAlwaysOpen || undefined}
              >
                <span>{section.label}</span>
                {!isAlwaysOpen ? (
                  <ChevronRight
                    size={11}
                    style={{
                      transition: "transform 150ms ease",
                      transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                      opacity: 0.6,
                    }}
                  />
                ) : null}
              </button>

              {isOpen && (
                <div className="sidebar-section-body">
                  {section.routes.map((item) => {
                    const Icon = item.icon;
                    const active = isRouteActive(item.id, item.href);
                    return (
                      <Link
                        key={item.id}
                        href={item.href}
                        className={cn("nav-link", active && "nav-link-active")}
                        aria-current={active ? "page" : undefined}
                        onClick={() => {
                          setHovering(false);
                          setMobileOpen(false);
                        }}
                      >
                        <Icon size={16} />
                        <span>{item.shortLabel ?? item.label}</span>
                        {(navBadges[item.href] ?? 0) > 0 && (
                          <span
                            style={{
                              marginLeft: "auto",
                              minWidth: 18,
                              padding: "1px 6px",
                              borderRadius: 999,
                              background: "var(--accent)",
                              color: "#fff",
                              fontSize: 10.5,
                              fontWeight: 800,
                              textAlign: "center",
                              lineHeight: "16px",
                            }}
                          >
                            {navBadges[item.href]}
                          </span>
                        )}
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
        <button
          type="button"
          className="sidebar-profile"
          onClick={() => {
            setMobileOpen(false);
            setHovering(false);
            router.push("/users");
          }}
          title="Öppna användare"
        >
          <span className="sidebar-profile-avatar" aria-hidden>{nameInitials(profileName)}</span>
          <span className="min-w-0 flex-1">
            <span className="sidebar-profile-name truncate">{profileName}</span>
            <span className="sidebar-profile-role">Superadmin</span>
          </span>
          <ChevronRight size={14} style={{ color: "rgba(254,247,240,0.4)", flex: "none" }} />
        </button>
      </div>
    </>
  );

  // ── Ikon-rad (66px) — alltid synlig när menyn inte är pinnad ──
  const rail = (
    <div className="nav-rail">
      <Link href="/dashboard" className="sidebar-brand-mark" aria-label="ViaEats Admin" style={{ marginBottom: 8 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={viaeatsSymbol.src} alt="" />
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

      {ADMIN_SECTIONS.map((section, si) => (
        <div key={section.id} style={{ display: "contents" }}>
          {section.routes.map((item) => {
            const Icon = item.icon;
            const active = isRouteActive(item.id, item.href);
            return (
              <Link
                key={item.id}
                href={item.href}
                className={cn("nav-rail-icon", active && "is-active")}
                title={(navBadges[item.href] ?? 0) > 0 ? `${item.shortLabel ?? item.label} (${navBadges[item.href]})` : (item.shortLabel ?? item.label)}
                aria-label={item.shortLabel ?? item.label}
                aria-current={active ? "page" : undefined}
                style={{ position: "relative" }}
                onClick={() => {
                  setHovering(false);
                  setMobileOpen(false);
                }}
              >
                <Icon size={18} />
                {(navBadges[item.href] ?? 0) > 0 && (
                  <span
                    aria-hidden
                    style={{
                      position: "absolute",
                      top: 5,
                      right: 5,
                      width: 7,
                      height: 7,
                      borderRadius: 999,
                      background: "var(--accent)",
                    }}
                  />
                )}
              </Link>
            );
          })}
          {si < ADMIN_SECTIONS.length - 1 && <div className="nav-rail-sep" />}
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
    <aside className="nav-wrap" data-pinned={pinned} data-mobile-open={mobileOpen} onMouseEnter={openFlyout} onMouseLeave={scheduleClose}>
      <div className="mobile-nav-bar">
        <Link href="/dashboard" className="mobile-nav-brand" aria-label="viaeats admin">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={viaeatsSymbol.src} alt="" />
          <span>viaeats <small>admin</small></span>
        </Link>
        <button type="button" className="icon-button" onClick={() => setMobileOpen((value) => !value)} aria-label={mobileOpen ? "Stäng meny" : "Öppna meny"} aria-expanded={mobileOpen}>
          {mobileOpen ? <X size={19} /> : <Menu size={19} />}
        </button>
      </div>

      <button type="button" className={cn("mobile-nav-backdrop", mobileOpen && "is-open")} onClick={() => setMobileOpen(false)} aria-label="Stäng meny" />
      <div className={cn("mobile-nav-drawer", mobileOpen && "is-open")}>{fullMenu}</div>

      <div className="desktop-nav">
        {pinned && !compactViewport ? (
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
      </div>
    </aside>
  );
}
