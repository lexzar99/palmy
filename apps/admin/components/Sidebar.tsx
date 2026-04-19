/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @next/next/no-img-element */
/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import {
  ShoppingCart,
  Utensils,
  Settings,
  LogOut,
  ToggleLeft,
  ToggleRight,
  Menu,
  X,
  Store,
  Globe,
  BarChart3,
  MapPin,
  Users,
  Zap,
  Sun,
  Moon,
  LayoutDashboard,
  Bell,
  Tag,
  ActivitySquare,
  History,
  ChevronDown,
  ChevronRight,
  Printer,
  Calculator,
  Server,
  Sparkles,
  Truck,
  Command,
  Shield,
  FileText,
  Key,
  Clock,
  MessageSquare,
  Megaphone,
  Palette,
  HelpCircle,
  ExternalLink,
  Filter,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import { io as socketIO } from "socket.io-client";
import { API_URL, SOCKET_URL } from "@/lib/api";
import { useRestaurantStore } from "@/store/restaurantStore";
import { useTheme } from "./ThemeProvider";

interface NavGroup {
  label: string;
  icon?: React.ElementType;
  collapsible?: boolean;
  defaultOpen?: boolean;
  links: NavLink[];
}

interface NavLink {
  href: string;
  label: string;
  icon: React.ElementType;
  badge?: number;
  isNew?: boolean;
}

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  time: Date;
  read: boolean;
  type: "order" | "info" | "warning";
}

const Sidebar = () => {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const notifRef = useRef<HTMLDivElement>(null);

  const { selectedRestaurantId, selectedRestaurantName, setRestaurant } = useRestaurantStore();

  const getToken = () =>
    typeof window !== "undefined" ? localStorage.getItem("matgo_token") || "" : "";

  // Close notification panel on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    setIsMounted(true);

    // Load restaurants
    axios
      .get(`${API_URL}/api/restaurants`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      .then((res) => setRestaurants(res.data))
      .catch(() => {});

    // Load current open status
    if (selectedRestaurantId) {
      axios
        .get(`${API_URL}/api/restaurants/${selectedRestaurantId}`)
        .then((res) =>
          setIsOpen(res.data.manualIsOpen ?? res.data.isOpen ?? true)
        )
        .catch(() => {});
    }

    // Socket for real-time updates
    const socket = socketIO(SOCKET_URL, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
    });

    socket.on("settings:updated", (data: any) => {
      if (data.restaurantId === selectedRestaurantId)
        setIsOpen(data.manualIsOpen ?? data.isOpen ?? true);
    });

    socket.on("order:new", (order: any) => {
      setPendingCount((prev) => prev + 1);
      const notif: NotificationItem = {
        id: order.id || Math.random().toString(36).slice(2),
        title: "Ny beställning",
        message: `${order.customerName} — ${Math.round((order.total || 0) / 100)} kr`,
        time: new Date(),
        read: false,
        type: "order",
      };
      setNotifications((prev) => [notif, ...prev.slice(0, 19)]);
    });

    return () => {
      socket.disconnect();
    };
  }, [selectedRestaurantId]);

  // Fetch pending count on mount
  useEffect(() => {
    if (!isMounted) return;
    const fetchPending = async () => {
      try {
        const restaurantParam = selectedRestaurantId
          ? `&restaurantId=${selectedRestaurantId}`
          : "";
        const res = await axios.get(
          `${API_URL}/api/admin/orders?limit=50${restaurantParam}`,
          { headers: { Authorization: `Bearer ${getToken()}` } }
        );
        const pending = (res.data.orders || []).filter(
          (o: any) => o.status === "PENDING"
        );
        setPendingCount(pending.length);
      } catch {
        // ignore
      }
    };
    fetchPending();
  }, [isMounted, selectedRestaurantId]);

  const toggleOpen = async () => {
    if (!selectedRestaurantId) return;
    setToggling(true);
    try {
      const newVal = !isOpen;
      await axios.patch(
        `${API_URL}/api/restaurants/${selectedRestaurantId}`,
        { isOpen: newVal },
        { headers: { Authorization: `Bearer ${getToken()}` } }
      );
      setIsOpen(newVal);
    } catch {
      // silent
    } finally {
      setToggling(false);
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = () =>
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));

  const toggleGroup = (label: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [label]: !prev[label],
    }));
  };

  const navGroups: NavGroup[] = [
    {
      label: "Live Monitor",
      icon: Zap,
      collapsible: true,
      defaultOpen: true,
      links: [
        {
          href: "/overview",
          label: "Dashboard",
          icon: LayoutDashboard,
        },
        {
          href: "/orders",
          label: "Alla Ordrar",
          icon: ShoppingCart,
        },
        {
          href: "/orders/new",
          label: "Nya Ordrar",
          icon: Bell,
          badge: pendingCount || undefined,
        },
        {
          href: "/orders/preparing",
          label: "Tillagas",
          icon: Utensils,
        },
        {
          href: "/orders/ready",
          label: "Klara / På väg",
          icon: Truck,
        },
        {
          href: "/history",
          label: "Orderhistorik",
          icon: History,
        },
      ],
    },
    {
      label: "Plattform",
      icon: Globe,
      collapsible: true,
      defaultOpen: true,
      links: [
        { href: "/restaurants", label: "Restauranger", icon: Store },
        { href: "/customers", label: "Kunder & Support", icon: Users },
        { href: "/deals", label: "Deals & Kampanjer", icon: Tag },
        { href: "/discounts", label: "Rabattkoder", icon: Tag, isNew: true },
        { href: "/push", label: "Push Notiser", icon: Megaphone },
        { href: "/cities", label: "Städer & Zoner", icon: MapPin },
        { href: "/categories", label: "Kategorier", icon: Filter, isNew: true },
        { href: "/sponsors", label: "Sponsorer", icon: Sparkles },
        { href: "/reviews", label: "Recensioner", icon: MessageSquare, isNew: true },
      ],
    },
    {
      label: "Analytics & Finans",
      icon: BarChart3,
      collapsible: true,
      defaultOpen: false,
      links: [
        { href: "/bi", label: "Business Intel.", icon: BarChart3 },
        { href: "/analytics", label: "Trafikanalys", icon: Globe },
        { href: "/billing", label: "Fakturering & Prov.", icon: Calculator },
        { href: "/stats", label: "Statistik", icon: BarChart3 },
      ],
    },
    {
      label: "System & Config",
      icon: Server,
      collapsible: true,
      defaultOpen: false,
      links: [
        { href: "/menu", label: "Menyer", icon: Utensils },
        { href: "/settings", label: "Inställningar", icon: Settings },
        { href: "/settings/receipt", label: "Kvittolayout", icon: Printer },
        { href: "/staff", label: "Personal & Roller", icon: Shield, isNew: true },
        { href: "/system", label: "Systemhälsa", icon: Server },
        { href: "/log", label: "Aktivitetslogg", icon: ActivitySquare },
      ],
    },
  ];

  // Determine which group should be open based on active route
  useEffect(() => {
    if (!isMounted) return;
    const initial: Record<string, boolean> = {};
    navGroups.forEach((group) => {
      const isGroupActive = group.links.some(
        (link) =>
          pathname === link.href ||
          (link.href !== "/overview" &&
            link.href !== "/" &&
            link.href !== "/orders" &&
            pathname.startsWith(link.href + "/"))
      );
      if (isGroupActive) {
        initial[group.label] = false; // false = not collapsed = open
      } else {
        initial[group.label] = !(group.defaultOpen ?? true);
      }
    });
    setCollapsedGroups(initial);
  }, [isMounted]);

  if (!isMounted) return null;

  const NavItem = ({ link }: { link: NavLink }) => {
    const Icon = link.icon;
    const isActive =
      pathname === link.href ||
      (link.href !== "/overview" &&
        link.href !== "/" &&
        link.href !== "/orders" &&
        pathname.startsWith(link.href + "/"));
    return (
      <Link
        href={link.href}
        onClick={() => setIsMobileMenuOpen(false)}
        className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-[10px] font-bold uppercase tracking-wide ${
          isActive
            ? "bg-gold-500/10 text-gold-500"
            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.03]"
        }`}
      >
        {isActive && <div className="sidebar-active-indicator" />}
        <Icon
          size={15}
          className={isActive ? "text-gold-500" : "text-[var(--text-secondary)]"}
        />
        <span className="flex-1 truncate">{link.label}</span>
        {link.isNew && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 uppercase">
            Ny
          </span>
        )}
        {link.badge && link.badge > 0 ? (
          <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center shadow-lg shadow-rose-500/30 animate-pulse">
            {link.badge > 99 ? "99+" : link.badge}
          </span>
        ) : null}
      </Link>
    );
  };

  const sidebarContent = (
    <div className="flex flex-col h-full border-r border-[var(--border-subtle)]" style={{ background: "var(--bg-primary)" }}>
      {/* Header */}
      <div className="p-4 pb-0">
        {/* Logo row */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gold-gradient flex items-center justify-center shadow-lg glow-gold-sm">
              <span className="text-[#0d0d0d] font-black text-base italic">M</span>
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.4em] text-[var(--text-secondary)] opacity-50">
                Super Admin
              </div>
              <div className="font-black text-[var(--text-primary)] text-sm uppercase tracking-tight leading-none">
                MatGo <span className="text-gold-gradient">Control</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {/* Notification Bell */}
            <div ref={notifRef} className="relative">
              <button
                onClick={() => {
                  setShowNotifications((v) => !v);
                  if (!showNotifications) markAllRead();
                }}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.04] transition-all relative"
              >
                <Bell size={15} />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center shadow-lg shadow-rose-500/30">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {showNotifications && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.97 }}
                    className="absolute top-10 left-0 w-80 rounded-2xl border border-[var(--border-subtle)] shadow-2xl shadow-black/50 z-50 overflow-hidden"
                    style={{ background: "var(--bg-secondary)" }}
                  >
                    <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)]">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]">
                        Notiser
                      </span>
                      <button
                        onClick={markAllRead}
                        className="text-[10px] font-bold uppercase text-gold-500 hover:text-gold-400"
                      >
                        Markera alla lästa
                      </button>
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="py-10 text-center text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-widest">
                          Inga notiser
                        </div>
                      ) : (
                        notifications.map((n) => (
                          <div
                            key={n.id}
                            className={`flex items-start gap-3 px-5 py-4 border-b border-[var(--border-subtle)] last:border-0 ${
                              !n.read ? "bg-gold-500/5" : ""
                            }`}
                          >
                            <div
                              className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                                n.type === "order"
                                  ? "bg-emerald-500/10 text-emerald-500"
                                  : "bg-gold-500/10 text-gold-500"
                              }`}
                            >
                              {n.type === "order" ? (
                                <ShoppingCart size={14} />
                              ) : (
                                <Bell size={14} />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] font-black text-[var(--text-primary)] uppercase tracking-wide">
                                {n.title}
                              </p>
                              <p className="text-[10px] text-[var(--text-secondary)] mt-0.5 truncate">
                                {n.message}
                              </p>
                              <p className="text-[10px] text-[var(--text-secondary)] opacity-40 mt-1 font-bold uppercase">
                                {n.time.toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </p>
                            </div>
                            {!n.read && (
                              <div className="w-2 h-2 rounded-full bg-gold-500 shrink-0 mt-2" />
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.04] transition-all"
            >
              {theme === "dark" ? <Moon size={15} /> : <Sun size={15} />}
            </button>

            {/* Mobile close */}
            <button
              onClick={() => setIsMobileMenuOpen(false)}
              className="lg:hidden w-8 h-8 rounded-xl flex items-center justify-center text-[var(--text-secondary)] hover:bg-white/[0.04]"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Command Palette Trigger */}
        <button
          onClick={() =>
            window.dispatchEvent(
              new KeyboardEvent("keydown", { key: "k", metaKey: true })
            )
          }
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-gold-500/15 transition-all mb-3"
        >
          <Command size={13} className="opacity-40" />
          <span className="flex-1 text-left text-[10px] font-bold uppercase tracking-wider opacity-40">
            Sök kommandon…
          </span>
          <kbd className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-[var(--border-subtle)] text-[10px] font-black text-[var(--text-secondary)] uppercase">
            ⌘K
          </kbd>
        </button>

        {/* Restaurant Selector */}
        <div className="mb-3 space-y-2">
          <div className="relative">
            <select
              value={selectedRestaurantId || ""}
              onChange={(e) => {
                if (e.target.value === "") {
                  setRestaurant(null, null);
                } else {
                  const r = restaurants.find((res) => res.id === e.target.value);
                  setRestaurant(r?.id || null, r?.name || null);
                }
              }}
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl px-3 py-2.5 text-[10px] font-black text-[var(--text-primary)] appearance-none cursor-pointer focus:outline-none focus:border-gold-500/30 transition-all uppercase tracking-wider"
            >
              <option value="">Alla restauranger</option>
              {restaurants.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <ChevronDown
              size={12}
              className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-secondary)]"
            />
          </div>

          {/* Open/Closed toggle */}
          {selectedRestaurantId && (
            <button
              onClick={toggleOpen}
              disabled={toggling}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-[10px] font-black uppercase tracking-wider ${
                isOpen
                  ? "bg-emerald-500/8 border-emerald-500/15 text-emerald-400"
                  : "bg-rose-500/8 border-rose-500/15 text-rose-400"
              } ${toggling ? "opacity-50" : "active:scale-[0.98]"}`}
            >
              {isOpen ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
              <span className="flex-1 text-left">
                {isOpen ? "Restaurangen är öppen" : "Restaurangen är stängd"}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="px-4 mb-2">
        <div className="grid grid-cols-3 gap-1.5">
          <Link
            href="/orders/new"
            className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] hover:border-gold-500/15 transition-all group"
          >
            <Bell size={14} className="text-[var(--text-secondary)] group-hover:text-gold-500 transition-colors" />
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">
              Nya
            </span>
            {pendingCount > 0 && (
              <span className="min-w-[14px] h-[14px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center">
                {pendingCount > 9 ? "9+" : pendingCount}
              </span>
            )}
          </Link>
          <Link
            href="/restaurants"
            className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] hover:border-gold-500/15 transition-all group"
          >
            <Store size={14} className="text-[var(--text-secondary)] group-hover:text-gold-500 transition-colors" />
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">
              Restauranger
            </span>
          </Link>
          <Link
            href="/customers"
            className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] hover:border-gold-500/15 transition-all group"
          >
            <Users size={14} className="text-[var(--text-secondary)] group-hover:text-gold-500 transition-colors" />
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">
              Kunder
            </span>
          </Link>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto no-scrollbar px-3 py-2 space-y-1">
        {navGroups.map((group) => {
          const isCollapsed = collapsedGroups[group.label] ?? false;
          const GroupIcon = group.icon;
          const hasActiveLink = group.links.some(
            (link) =>
              pathname === link.href ||
              (link.href !== "/overview" &&
                link.href !== "/" &&
                link.href !== "/orders" &&
                pathname.startsWith(link.href + "/"))
          );

          return (
            <div key={group.label} className="mb-1">
              {group.collapsible ? (
                <button
                  onClick={() => toggleGroup(group.label)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors rounded-lg hover:bg-white/[0.02]"
                >
                  {GroupIcon && (
                    <GroupIcon
                      size={11}
                      className={hasActiveLink ? "text-gold-500/60" : "opacity-40"}
                    />
                  )}
                  <span className={`flex-1 text-left ${hasActiveLink ? "text-gold-500/60" : "opacity-40"}`}>
                    {group.label}
                  </span>
                  <ChevronRight
                    size={10}
                    className={`opacity-30 transition-transform duration-200 ${
                      !isCollapsed ? "rotate-90" : ""
                    }`}
                  />
                </button>
              ) : (
                <div className="px-3 py-2 text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-secondary)] opacity-40">
                  {group.label}
                </div>
              )}
              <AnimatePresence initial={false}>
                {!isCollapsed && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-0.5 py-0.5">
                      {group.links.map((link) => (
                        <NavItem key={link.href} link={link} />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-[var(--border-subtle)] space-y-1">
        {/* System status indicator */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] mb-1">
          <div className="status-dot online" />
          <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 flex-1">
            System Online
          </span>
          <Clock size={10} className="text-[var(--text-secondary)] opacity-40" />
          <span className="text-[10px] font-bold text-[var(--text-secondary)] opacity-40">
            {new Date().toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>

        {/* Test order button */}
        {selectedRestaurantId && (
          <button
            onClick={async () => {
              try {
                const productsRes = await axios.get(
                  `${API_URL}/api/menu/categories?restaurantId=${selectedRestaurantId}`
                );
                const products = productsRes.data.flatMap((c: any) => c.products);
                if (products.length === 0) return;
                const randomProduct =
                  products[Math.floor(Math.random() * products.length)];
                await axios.post(`${API_URL}/api/orders`, {
                  restaurantId: selectedRestaurantId,
                  type: "PICKUP",
                  customerName: "AUTOTEST",
                  customerPhone: "0700101010",
                  discountCode: "test",
                  stripePaymentIntentId: "TEST_PAYMENT",
                  items: [
                    {
                      productId: randomProduct.id,
                      quantity: 1,
                      selectedExtras: [],
                      note: "Systemtest",
                    },
                  ],
                });
              } catch {
                // silent
              }
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[var(--text-secondary)] hover:text-gold-500 hover:bg-gold-500/5 transition-all text-[10px] font-black uppercase tracking-widest border border-[var(--border-subtle)]"
          >
            <Zap size={12} /> Testorder
          </button>
        )}

        {/* Help link */}
        <Link
          href="/system"
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.03] transition-all text-[10px] font-black uppercase tracking-widest"
        >
          <HelpCircle size={12} /> Hjälp & System
        </Link>

        <button
          onClick={() => {
            localStorage.removeItem("matgo_token");
            localStorage.removeItem("matgo_admin");
            window.location.href = "/login";
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-rose-500/40 hover:text-rose-400 hover:bg-rose-500/5 transition-all text-[10px] font-black uppercase tracking-widest"
        >
          <LogOut size={12} /> Logga ut
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 w-full h-14 border-b border-[var(--border-subtle)] z-40 flex items-center justify-between px-5" style={{ background: "var(--bg-primary)" }}>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gold-gradient flex items-center justify-center glow-gold-sm">
            <span className="text-[#0d0d0d] font-black text-sm italic">M</span>
          </div>
          <span className="font-black text-[var(--text-primary)] text-sm uppercase tracking-tight">
            MatGo <span className="text-gold-500">Admin</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <span className="px-2 py-1 rounded-lg bg-rose-500 text-white text-[10px] font-black shadow-lg shadow-rose-500/30 animate-pulse">
              {pendingCount} ny
            </span>
          )}
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-[var(--text-secondary)] bg-[var(--bg-secondary)] border border-[var(--border-subtle)]"
          >
            <Menu size={18} />
          </button>
        </div>
      </div>

      {/* Mobile overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", bounce: 0, duration: 0.35 }}
              className="lg:hidden fixed top-0 left-0 bottom-0 w-[280px] z-[70] shadow-2xl"
            >
              {sidebarContent}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Desktop sidebar */}
      <div className="hidden lg:block fixed top-0 left-0 bottom-0 w-[260px] z-40">
        {sidebarContent}
      </div>
    </>
  );
};

export default Sidebar;
