"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet } from "@/shared/api/client";
import {
  AlertTriangle,
  BellRing,
  Bike,
  Building2,
  CircleDollarSign,
  ClipboardList,
  ContactRound,
  Filter,
  Gauge,
  Gift,
  Handshake,
  History,
  LayoutDashboard,
  type LucideIcon,
  Map,
  MenuSquare,
  Network,
  ReceiptText,
  Shield,
  Star,
  Store,
  Tablet,
  TicketPercent,
  UserPlus,
  Users,
} from "lucide-react";
import { cn } from "@/shared/utils/cn";

type CommandGroup = "Drift" | "Katalog" | "Tillväxt" | "System" | "Kunder" | "Ordrar" | "Restauranger";

type CommandItem = {
  id: string;
  label: string;
  sublabel?: string;
  href: string;
  icon: LucideIcon;
  group: CommandGroup;
  keywords?: string;
};

// Svar från GET /api/admin/search — globalt sök över kunder, ordrar, restauranger.
interface GlobalSearchResponse {
  customers: { id: string; name: string | null; email: string | null; phone: string | null }[];
  orders: { id: string; orderNumber: string; customerName: string; status: string; restaurant?: { name: string } | null }[];
  restaurants: { id: string; name: string; slug: string; city: string | null }[];
}

const COMMANDS: CommandItem[] = [
  // Drift
  { id: "dashboard", label: "Översikt", href: "/dashboard", icon: LayoutDashboard, group: "Drift", keywords: "dashboard start hem" },
  { id: "orders", label: "Ordrar", href: "/orders", icon: ClipboardList, group: "Drift", keywords: "live aktiva nya" },
  { id: "order-history", label: "Orderhistorik", href: "/order-history", icon: History, group: "Drift", keywords: "historik gamla" },
  { id: "customers", label: "Kunder", href: "/customers", icon: ContactRound, group: "Drift", keywords: "kund sok lookup gdpr" },
  { id: "reviews", label: "Recensioner", href: "/reviews", icon: Star, group: "Drift", keywords: "stjarnor betyg" },
  { id: "couriers", label: "Kurirer", href: "/couriers", icon: Bike, group: "Drift", keywords: "bud leverans" },
  { id: "crisis", label: "Krisverktyg", href: "/crisis", icon: AlertTriangle, group: "Drift", keywords: "emergency stang refund akut" },

  // Katalog
  { id: "restaurants", label: "Restauranger", href: "/restaurants", icon: Store, group: "Katalog" },
  { id: "brands", label: "Kedjor", href: "/brands", icon: Network, group: "Katalog", keywords: "brand kedja chain natverk" },
  { id: "menu", label: "Meny", href: "/menu", icon: MenuSquare, group: "Katalog", keywords: "ratter produkter items" },
  { id: "categories", label: "Kategorier", href: "/categories", icon: Filter, group: "Katalog" },
  { id: "zones", label: "Zoner", href: "/zones", icon: Map, group: "Katalog", keywords: "leverans zone stad city" },
  { id: "restaurant-devices", label: "Enheter", href: "/restaurant-devices", icon: Tablet, group: "Katalog", keywords: "terminal pos surfplatta" },

  // Tillväxt
  { id: "deals", label: "Deals", href: "/deals", icon: Gift, group: "Tillväxt", keywords: "kampanj rabatt app" },
  { id: "coupons", label: "Kuponger", href: "/coupons", icon: TicketPercent, group: "Tillväxt", keywords: "kupong rabattkod kod" },
  { id: "sponsors", label: "Aktuellt", href: "/sponsors", icon: Handshake, group: "Tillväxt", keywords: "rabatter trendar ny sponsor partner annons" },
  { id: "referrals", label: "Värva vän", href: "/referrals", icon: UserPlus, group: "Tillväxt", keywords: "referral varva van valkomst valkomstrabatt" },
  { id: "push", label: "Push-notiser", href: "/push", icon: BellRing, group: "Tillväxt", keywords: "notification meddelande" },

  // System
  { id: "finance", label: "Ekonomi", href: "/finance", icon: CircleDollarSign, group: "System", keywords: "finance utbetalning intakt" },
  { id: "tiers", label: "Tiers", href: "/finance?tab=tiers", icon: Shield, group: "System", keywords: "abonnemang placering guld silver brons" },
  { id: "receipts", label: "Kvitto-mall", href: "/platform-settings?tab=kvitto", icon: ReceiptText, group: "System", keywords: "kvitto utskrift mall" },
  { id: "users", label: "Admin-användare", href: "/users", icon: Users, group: "System", keywords: "anvandare staff admin" },
  { id: "api-health", label: "API-status", href: "/api-health", icon: Gauge, group: "System", keywords: "uptime halsa status" },
  { id: "audit-log", label: "Audit-log", href: "/audit-log", icon: History, group: "System", keywords: "logg compliance" },
  { id: "platform-settings", label: "Plattform-inställningar", href: "/platform-settings", icon: Building2, group: "System", keywords: "foretag company settings" },
  { id: "2fa", label: "Tvåfaktor (2FA)", href: "/users?tab=sakerhet", icon: Shield, group: "System", keywords: "totp sakerhet 2fa" },
];

function matches(item: CommandItem, query: string): boolean {
  if (!query) return true;
  const haystack = `${item.label} ${item.keywords ?? ""} ${item.group}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token));
}

const GROUP_ORDER: CommandGroup[] = ["Kunder", "Ordrar", "Restauranger", "Drift", "Katalog", "Tillväxt", "System"];

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [hits, setHits] = useState<GlobalSearchResponse | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => COMMANDS.filter((c) => matches(c, query)), [query]);

  // Globalt data-sök: debounce 250 ms, ignorera svar som kommit i fel ordning.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      apiGet<GlobalSearchResponse>(`/admin/search?q=${encodeURIComponent(q)}`)
        .then((r) => { if (!cancelled) setHits(r); })
        .catch(() => { if (!cancelled) setHits(null); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);

  const hitItems = useMemo<CommandItem[]>(() => {
    if (!hits) return [];
    const items: CommandItem[] = [];
    for (const c of hits.customers) {
      items.push({
        id: `customer-${c.id}`,
        label: c.name || c.phone || c.email || c.id,
        sublabel: [c.phone, c.email].filter(Boolean).join(" · ") || undefined,
        href: `/customers?id=${c.id}`,
        icon: ContactRound,
        group: "Kunder",
      });
    }
    for (const o of hits.orders) {
      items.push({
        id: `order-${o.id}`,
        label: `#${o.orderNumber} · ${o.customerName}`,
        sublabel: [o.restaurant?.name, o.status].filter(Boolean).join(" · ") || undefined,
        href: `/orders?order=${o.id}`,
        icon: ClipboardList,
        group: "Ordrar",
      });
    }
    for (const r of hits.restaurants) {
      items.push({
        id: `restaurant-${r.id}`,
        label: r.name,
        sublabel: r.city || undefined,
        href: `/restaurants/${r.id}`,
        icon: Store,
        group: "Restauranger",
      });
    }
    return items;
  }, [hits]);

  const grouped = useMemo(() => {
    const groups = Object.fromEntries(GROUP_ORDER.map((g) => [g, [] as CommandItem[]])) as Record<CommandGroup, CommandItem[]>;
    hitItems.forEach((item) => groups[item.group].push(item));
    filtered.forEach((item) => groups[item.group].push(item));
    return groups;
  }, [filtered, hitItems]);

  // Flat list so up/down keys can move across groups — data-träffar först.
  const flatItems = useMemo(() => GROUP_ORDER.flatMap((g) => grouped[g]), [grouped]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setHits(null);
      setActiveIndex(0);
      // Focus next tick so the input is mounted
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!open) return null;

  const select = (item: CommandItem) => {
    router.push(item.href);
    onClose();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (flatItems.length === 0 ? 0 : (i + 1) % flatItems.length));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => (flatItems.length === 0 ? 0 : (i - 1 + flatItems.length) % flatItems.length));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const item = flatItems[activeIndex];
      if (item) select(item);
    }
  };

  return (
    <div className="cmdk-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="cmdk-panel" onClick={(event) => event.stopPropagation()}>
        <input
          ref={inputRef}
          className="cmdk-input"
          placeholder="Sök sida, kund, order, restaurang…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="cmdk-list">
          {flatItems.length === 0 ? (
            <div className="cmdk-empty">Inget hittades för &ldquo;{query}&rdquo;</div>
          ) : (
            GROUP_ORDER.map((group) => {
              const items = grouped[group];
              if (items.length === 0) return null;
              return (
                <div key={group}>
                  <p className="cmdk-group-label">{group}</p>
                  {items.map((item) => {
                    const flatIndex = flatItems.indexOf(item);
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={cn("cmdk-item", flatIndex === activeIndex && "cmdk-item-active")}
                        onMouseEnter={() => setActiveIndex(flatIndex)}
                        onClick={() => select(item)}
                      >
                        <Icon size={15} />
                        <span>{item.label}</span>
                        {item.sublabel ? <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--text-muted)" }}>{item.sublabel}</span> : null}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
        <div className="cmdk-footer">
          <span><kbd>↑↓</kbd> navigera</span>
          <span><kbd>↵</kbd> öppna</span>
          <span><kbd>esc</kbd> stäng</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Global hook — listens for Cmd+K / Ctrl+K and toggles the palette.
 */
export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return { open, openPalette: () => setOpen(true), close: () => setOpen(false) };
}
