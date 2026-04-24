"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import axios from "axios";
import { io as socketIO } from "socket.io-client";
import {
  Bell,
  ChevronDown,
  CreditCard,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  MessageSquare,
  Moon,
  Send,
  Settings2,
  Shield,
  Store,
  Sun,
  Tag,
  Utensils,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { API_URL, SOCKET_URL } from "@/lib/api";
import { clearStoredAdminSession, getStoredAdmin, getStoredToken } from "@/lib/auth-storage";
import { useRestaurantStore } from "@/store/restaurantStore";
import { useTheme } from "@/components/ThemeProvider";

type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
  matches: string[];
  badge?: number;
};

type RestaurantOption = {
  id: string;
  name: string;
  city?: string | null;
  isOpen?: boolean;
};

const PRIMARY_NAV = (pendingCount: number) => [
  {
    href: "/dashboard",
    label: "Översikt",
    icon: LayoutDashboard,
    matches: ["/dashboard", "/", "/overview"],
  },
  {
    href: "/orders",
    label: "Beställningar",
    icon: Bell,
    matches: ["/orders", "/history"],
    badge: pendingCount || undefined,
  },
  {
    href: "/restaurants",
    label: "Restauranger",
    icon: Store,
    matches: ["/restaurants"],
  },
  {
    href: "/restaurant-ops",
    label: "Driftkö",
    icon: Shield,
    matches: ["/restaurant-ops"],
  },
  {
    href: "/cities",
    label: "Städer & zoner",
    icon: MapPin,
    matches: ["/cities"],
  },
  {
    href: "/menu",
    label: "Meny",
    icon: Utensils,
    matches: ["/menu"],
  },
  {
    href: "/finance",
    label: "Ekonomi",
    icon: Wallet,
    matches: ["/finance", "/billing"],
  },
] satisfies NavItem[];

const SECONDARY_NAV = [
  {
    href: "/customers",
    label: "Kunder",
    icon: Users,
    matches: ["/customers"],
  },
  {
    href: "/deals",
    label: "Deals",
    icon: Tag,
    matches: ["/deals", "/campaigns"],
  },
  {
    href: "/push",
    label: "Push",
    icon: Send,
    matches: ["/push"],
  },
  {
    href: "/reviews",
    label: "Reviews",
    icon: MessageSquare,
    matches: ["/reviews"],
  },
  {
    href: "/staff",
    label: "Team",
    icon: Shield,
    matches: ["/staff"],
  },
  {
    href: "/settings/receipt",
    label: "Kvitto",
    icon: CreditCard,
    matches: ["/settings/receipt", "/receipt"],
  },
  {
    href: "/system",
    label: "System",
    icon: Settings2,
    matches: ["/system", "/log", "/settings/printing"],
  },
] satisfies NavItem[];

const isActiveLink = (pathname: string, item: NavItem) =>
  item.matches.some((match) => pathname === match || pathname.startsWith(`${match}/`));

function NavList({ pathname, items }: { pathname: string; items: NavItem[] }) {
  return (
    <div className="grid gap-1.5">
      {items.map((item) => {
        const Icon = item.icon;
        const active = isActiveLink(pathname, item);

        return (
          <Link key={item.href} href={item.href} className={`nav-link ${active ? "nav-link-active" : "nav-link-idle"}`}>
            <div className={`nav-link-icon ${active ? "nav-link-icon-active" : "nav-link-icon-idle"}`}>
              <Icon size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold tracking-[-0.02em]">{item.label}</p>
            </div>
            {item.badge ? <span className="nav-link-badge">{item.badge > 99 ? "99+" : item.badge}</span> : null}
          </Link>
        );
      })}
    </div>
  );
}

function SidebarContent({
  pathname,
  pendingCount,
  restaurants,
  selectedRestaurantId,
  selectedRestaurantName,
  onSelectRestaurant,
  onToggleOpen,
  currentRestaurantOpen,
  togglingOpen,
  onLogout,
}: {
  pathname: string;
  pendingCount: number;
  restaurants: RestaurantOption[];
  selectedRestaurantId: string | null;
  selectedRestaurantName: string | null;
  onSelectRestaurant: (id: string | null, name: string | null) => void;
  onToggleOpen: () => void;
  currentRestaurantOpen: boolean | null;
  togglingOpen: boolean;
  onLogout: () => void;
}) {
  const { theme, toggleTheme } = useTheme();
  const selectedRestaurant = restaurants.find((restaurant) => restaurant.id === selectedRestaurantId) || null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto overflow-x-hidden px-4 py-4 text-[var(--text-primary)]">
      <div className="panel shrink-0 rounded-[24px] px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[var(--text-muted)]">MatGo Admin</p>
            <p className="mt-1 text-lg font-black tracking-[-0.03em] text-[var(--text-primary)]">Renare kontrollpanel</p>
          </div>
          <button type="button" onClick={toggleTheme} className="control-icon-button shrink-0" aria-label="Byt tema">
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </div>

      <div className="panel shrink-0 rounded-[24px] px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[var(--text-muted)]">Aktiv scope</p>
            <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{selectedRestaurantName || "Alla restauranger"}</p>
          </div>
          <div className={`status-dot ${currentRestaurantOpen ? "online" : "offline"}`} />
        </div>

        <div className="mt-4 grid gap-3">
          <label className="grid gap-2 text-[11px] font-semibold text-[var(--text-secondary)]">
            <span>Filtrera till en restaurang</span>
            <div className="relative">
              <select
                value={selectedRestaurantId || ""}
                onChange={(event) => {
                  const nextId = event.target.value || null;
                  const nextRestaurant = restaurants.find((restaurant) => restaurant.id === nextId) || null;
                  onSelectRestaurant(nextId, nextRestaurant?.name || null);
                }}
                className="control-input appearance-none pr-10"
              >
                <option value="">Alla restauranger</option>
                {restaurants.map((restaurant) => (
                  <option key={restaurant.id} value={restaurant.id}>
                    {restaurant.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            </div>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-3 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">Nya</p>
              <p className="mt-2 text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">{pendingCount}</p>
            </div>
            <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-3 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">Status</p>
                <p className={`mt-2 text-sm font-black uppercase tracking-[0.18em] ${currentRestaurantOpen ? "text-emerald-300" : "text-[var(--text-secondary)]"}`}>
                {selectedRestaurant ? (currentRestaurantOpen ? "Öppet" : "Stängt") : "Ingen vald"}
                </p>
            </div>
          </div>

          {selectedRestaurant ? (
            <div className="grid gap-2">
              <Link href={`/restaurants/${selectedRestaurant.id}`} className="inline-flex items-center justify-center rounded-2xl bg-gold-gradient px-4 py-3 text-[11px] font-black uppercase tracking-[0.22em] text-[#091018]">
                Öppna restaurangsida
              </Link>
              <button
                type="button"
                onClick={onToggleOpen}
                disabled={togglingOpen}
                className={`inline-flex items-center justify-center rounded-2xl border px-4 py-3 text-[11px] font-black uppercase tracking-[0.22em] transition ${currentRestaurantOpen ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200" : "border-[var(--border-subtle)] bg-[var(--panel-muted)] text-[var(--text-primary)]"} ${togglingOpen ? "opacity-60" : "hover:border-[var(--border-strong)]"}`}
              >
                {togglingOpen ? "Sparar..." : currentRestaurantOpen ? "Markera stängd" : "Markera öppen"}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="panel min-h-[220px] flex-1 rounded-[24px] px-3 py-3">
        <div className="space-y-5">
          <div>
            <p className="px-2 text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">Jobba</p>
            <div className="mt-2">
              <NavList pathname={pathname} items={PRIMARY_NAV(pendingCount)} />
            </div>
          </div>

          <div>
            <p className="px-2 text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">Fler verktyg</p>
            <div className="mt-2">
              <NavList pathname={pathname} items={SECONDARY_NAV} />
            </div>
          </div>
        </div>
      </div>

      <div className="panel shrink-0 rounded-[24px] px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[var(--text-muted)]">Session</p>
            <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{getStoredAdmin()?.email || "Super admin"}</p>
          </div>
          <button type="button" onClick={onLogout} className="control-icon-button" aria-label="Logga ut">
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { selectedRestaurantId, selectedRestaurantName, setRestaurant } = useRestaurantStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [restaurants, setRestaurants] = useState<RestaurantOption[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [currentRestaurantOpen, setCurrentRestaurantOpen] = useState<boolean | null>(null);
  const [togglingOpen, setTogglingOpen] = useState(false);

  const token = getStoredToken();

  const fetchRestaurants = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/restaurants`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      setRestaurants(response.data || []);
    } catch {
      setRestaurants([]);
    }
  };

  const fetchPendingCount = async () => {
    if (!token) return;

    try {
      const response = await axios.get(`${API_URL}/api/admin/orders`, {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          limit: 100,
          ...(selectedRestaurantId ? { restaurantId: selectedRestaurantId } : {}),
        },
      });

      const pending = (response.data.orders || []).filter((order: { status: string }) => order.status === "PENDING");
      setPendingCount(pending.length);
    } catch {
      setPendingCount(0);
    }
  };

  useEffect(() => {
    void fetchRestaurants();
  }, []);

  useEffect(() => {
    const selectedRestaurant = restaurants.find((restaurant) => restaurant.id === selectedRestaurantId) || null;
    setCurrentRestaurantOpen(selectedRestaurant?.isOpen ?? null);
  }, [restaurants, selectedRestaurantId]);

  useEffect(() => {
    void fetchPendingCount();
  }, [selectedRestaurantId]);

  useEffect(() => {
    if (!token) return;

    const socket = socketIO(SOCKET_URL, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      auth: { token },
    });

    socket.on("connect", () => {
      socket.emit("join:admin", {
        token,
        ...(selectedRestaurantId ? { restaurantId: selectedRestaurantId } : {}),
      });
    });

    socket.on("order:new", (order: { restaurantId?: string }) => {
      if (!selectedRestaurantId || order.restaurantId === selectedRestaurantId) {
        setPendingCount((value) => value + 1);
      }
    });

    socket.on("order:updated", () => {
      void fetchPendingCount();
    });

    socket.on("settings:updated", (payload: { restaurantId?: string; isOpen?: boolean }) => {
      if (!payload.restaurantId || !selectedRestaurantId || payload.restaurantId !== selectedRestaurantId) {
        return;
      }

      if (typeof payload.isOpen === "boolean") {
        setCurrentRestaurantOpen(payload.isOpen);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [selectedRestaurantId, token]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const handleToggleRestaurant = async () => {
    if (!selectedRestaurantId || !token) return;

    setTogglingOpen(true);
    try {
      const nextValue = !currentRestaurantOpen;
      await axios.patch(
        `${API_URL}/api/restaurants/${selectedRestaurantId}`,
        { isOpen: nextValue },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setCurrentRestaurantOpen(nextValue);
      setRestaurants((previous) =>
        previous.map((restaurant) =>
          restaurant.id === selectedRestaurantId ? { ...restaurant, isOpen: nextValue } : restaurant
        )
      );
    } catch {
      // Silent here, page-level forms show the main errors.
    } finally {
      setTogglingOpen(false);
    }
  };

  const handleLogout = () => {
    clearStoredAdminSession();
    setRestaurant(null, null);
    router.replace("/login");
  };

  const scopeLabel = useMemo(() => {
    if (selectedRestaurantName) return selectedRestaurantName;
    if (selectedRestaurantId) {
      return restaurants.find((restaurant) => restaurant.id === selectedRestaurantId)?.name || "Vald restaurang";
    }
    return "Alla restauranger";
  }, [restaurants, selectedRestaurantId, selectedRestaurantName]);

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-40 border-b border-[var(--border-subtle)] bg-[var(--bg-primary)]/95 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.32em] text-[var(--text-muted)]">MatGo Admin</p>
            <p className="text-sm font-semibold text-[var(--text-primary)]">{scopeLabel}</p>
          </div>
          <button type="button" onClick={() => setMobileOpen((value) => !value)} className="control-icon-button" aria-label="Öppna navigation">
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:block lg:w-[300px] lg:overflow-hidden lg:border-r lg:border-[var(--border-subtle)] lg:bg-[var(--bg-primary)]">
        <SidebarContent
          pathname={pathname}
          pendingCount={pendingCount}
          restaurants={restaurants}
          selectedRestaurantId={selectedRestaurantId}
          selectedRestaurantName={scopeLabel}
          onSelectRestaurant={setRestaurant}
          onToggleOpen={handleToggleRestaurant}
          currentRestaurantOpen={currentRestaurantOpen}
          togglingOpen={togglingOpen}
          onLogout={handleLogout}
        />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-y-0 left-0 h-full w-[88vw] max-w-[340px] overflow-hidden border-r border-[var(--border-subtle)] bg-[var(--bg-primary)]" onClick={(event) => event.stopPropagation()}>
            <SidebarContent
              pathname={pathname}
              pendingCount={pendingCount}
              restaurants={restaurants}
              selectedRestaurantId={selectedRestaurantId}
              selectedRestaurantName={scopeLabel}
              onSelectRestaurant={setRestaurant}
              onToggleOpen={handleToggleRestaurant}
              currentRestaurantOpen={currentRestaurantOpen}
              togglingOpen={togglingOpen}
              onLogout={handleLogout}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
