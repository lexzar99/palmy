"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  BellRing,
  Building2,
  CircleDollarSign,
  ClipboardList,
  ContactRound,
  Filter,
  Gift,
  History,
  LayoutDashboard,
  type LucideIcon,
  Map,
  MenuSquare,
  ReceiptText,
  Search,
  Shield,
  Star,
  Store,
  TicketPercent,
  Users,
} from "lucide-react";
import { cn } from "@/shared/utils/cn";

type CommandItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  group: "Drift" | "Katalog" | "Plattform";
  keywords?: string;
};

const COMMANDS: CommandItem[] = [
  // Drift
  { id: "orders", label: "Ordrar", href: "/orders", icon: ClipboardList, group: "Drift", keywords: "live aktiva nya" },
  { id: "order-history", label: "Orderhistorik", href: "/order-history", icon: History, group: "Drift", keywords: "historik gamla" },
  { id: "customers", label: "Kunder", href: "/customers", icon: ContactRound, group: "Drift" },
  { id: "customer-search", label: "Sök kund", href: "/customer-search", icon: Search, group: "Drift", keywords: "kund sok lookup gdpr" },
  { id: "reviews", label: "Recensioner", href: "/reviews", icon: Star, group: "Drift", keywords: "stjarnor betyg" },
  { id: "push", label: "Push-notiser", href: "/push", icon: BellRing, group: "Drift", keywords: "notification meddelande" },

  // Katalog
  { id: "restaurants", label: "Restauranger", href: "/restaurants", icon: Store, group: "Katalog" },
  { id: "menu", label: "Meny", href: "/menu", icon: MenuSquare, group: "Katalog", keywords: "ratter produkter items" },
  { id: "categories", label: "Kategorier", href: "/categories", icon: Filter, group: "Katalog" },
  { id: "zones", label: "Zoner", href: "/zones", icon: Map, group: "Katalog", keywords: "leverans zone stad city" },
  { id: "deals", label: "Deals & BOGO", href: "/deals", icon: Gift, group: "Katalog", keywords: "kampanj rabatt bogo" },
  { id: "sponsors", label: "Sponsorer", href: "/sponsors", icon: TicketPercent, group: "Katalog" },
  { id: "tiers", label: "Tiers", href: "/tiers", icon: Shield, group: "Katalog", keywords: "vip lojalitet medlem" },

  // Plattform
  { id: "dashboard", label: "Översikt", href: "/dashboard", icon: LayoutDashboard, group: "Plattform", keywords: "dashboard start hem" },
  { id: "finance", label: "Ekonomi", href: "/finance", icon: CircleDollarSign, group: "Plattform", keywords: "finance utbetalning intakt" },
  { id: "receipts", label: "Kvitton", href: "/receipts", icon: ReceiptText, group: "Plattform" },
  { id: "users", label: "Admin-användare", href: "/users", icon: Users, group: "Plattform", keywords: "anvandare staff admin" },
  { id: "platform-settings", label: "Plattform-inställningar", href: "/platform-settings", icon: Building2, group: "Plattform", keywords: "foretag company settings" },
  { id: "crisis", label: "Krisverktyg", href: "/crisis", icon: AlertTriangle, group: "Plattform", keywords: "emergency stang refund akut" },
  { id: "audit-log", label: "Audit-log", href: "/audit-log", icon: History, group: "Plattform", keywords: "logg compliance" },
  { id: "health", label: "Systemhälsa", href: "/health", icon: Activity, group: "Plattform", keywords: "uptime status services" },
  { id: "2fa", label: "Tvåfaktor (2FA)", href: "/2fa", icon: Shield, group: "Plattform", keywords: "totp sakerhet" },
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

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => COMMANDS.filter((c) => matches(c, query)), [query]);

  const grouped = useMemo(() => {
    const groups: Record<CommandItem["group"], CommandItem[]> = { Drift: [], Katalog: [], Plattform: [] };
    filtered.forEach((item) => groups[item.group].push(item));
    return groups;
  }, [filtered]);

  // Flat list so up/down keys can move across groups
  const flatItems = filtered;

  useEffect(() => {
    if (open) {
      setQuery("");
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
          placeholder="Sök sida, kund, action…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="cmdk-list">
          {flatItems.length === 0 ? (
            <div className="cmdk-empty">Inget hittades för &ldquo;{query}&rdquo;</div>
          ) : (
            (["Drift", "Katalog", "Plattform"] as const).map((group) => {
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
