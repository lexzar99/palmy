 
"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  ShoppingCart,
  Store,
  Users,
  Settings,
  BarChart3,
  MapPin,
  Bell,
  Tag,
  Server,
  Utensils,
  LayoutDashboard,
  History,
  Calculator,
  Sparkles,
  Truck,
  FileText,
  Zap,
  Globe,
  Printer,
  Shield,
  Command,
} from "lucide-react";

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ElementType;
  action: () => void;
  category: string;
  keywords?: string[];
}

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const commands: CommandItem[] = useMemo(
    () => [
      // Navigation
      { id: "dashboard", label: "Dashboard", description: "Plattformsöversikt", icon: LayoutDashboard, action: () => router.push("/overview"), category: "Navigation", keywords: ["hem", "start", "overview"] },
      { id: "orders", label: "Alla Ordrar", description: "Hantera beställningar", icon: ShoppingCart, action: () => router.push("/orders"), category: "Navigation", keywords: ["beställning", "order"] },
      { id: "orders-new", label: "Nya Ordrar", description: "Väntande beställningar", icon: Bell, action: () => router.push("/orders/new"), category: "Navigation", keywords: ["pending", "ny order"] },
      { id: "orders-preparing", label: "Tillagas", description: "Under tillagning", icon: Utensils, action: () => router.push("/orders/preparing"), category: "Navigation" },
      { id: "orders-ready", label: "Klara / På väg", description: "Redo för leverans", icon: Truck, action: () => router.push("/orders/ready"), category: "Navigation" },
      { id: "history", label: "Orderhistorik", description: "Alla avslutade ordrar", icon: History, action: () => router.push("/history"), category: "Navigation" },
      { id: "restaurants", label: "Restauranger", description: "Hantera restauranger", icon: Store, action: () => router.push("/restaurants"), category: "Navigation" },
      { id: "customers", label: "Kunder & Support", description: "Kundhantering", icon: Users, action: () => router.push("/customers"), category: "Navigation", keywords: ["kund", "support"] },
      { id: "deals", label: "Deals & Kampanjer", description: "Rabattkoder, erbjudanden", icon: Tag, action: () => router.push("/deals"), category: "Navigation", keywords: ["rabatt", "kampanj"] },
      { id: "push", label: "Push Notifikationer", description: "Skicka push-meddelanden", icon: Bell, action: () => router.push("/deals/push"), category: "Navigation" },
      { id: "cities", label: "Städer & Zoner", description: "Leveranszoner", icon: MapPin, action: () => router.push("/cities"), category: "Navigation", keywords: ["zon", "stad", "karta"] },
      { id: "sponsors", label: "Sponsorer", description: "Sponsorhantering", icon: Sparkles, action: () => router.push("/sponsors"), category: "Navigation" },
      { id: "bi", label: "Business Intelligence", description: "Djup dataanalys", icon: BarChart3, action: () => router.push("/bi"), category: "Analytics", keywords: ["analys", "data"] },
      { id: "analytics", label: "Analys", description: "Trafikanalys", icon: Globe, action: () => router.push("/analytics"), category: "Analytics" },
      { id: "billing", label: "Fakturering", description: "Fakturor & provisioner", icon: Calculator, action: () => router.push("/billing"), category: "Analytics", keywords: ["faktura", "provision"] },
      { id: "coupons", label: "Rabattkoder", description: "Hantera kampanjkoder", icon: Tag, action: () => router.push("/coupons"), category: "Navigation", keywords: ["rabattkod", "kupong", "coupon"] },
      { id: "reviews", label: "Recensioner", description: "Kundrecensioner & betyg", icon: FileText, action: () => router.push("/reviews"), category: "Navigation", keywords: ["recension", "betyg", "review"] },
      { id: "staff", label: "Personal & Roller", description: "Teamhantering", icon: Shield, action: () => router.push("/staff"), category: "System", keywords: ["personal", "admin", "roll"] },
      { id: "menu", label: "Menyer", description: "Menyhantering", icon: Utensils, action: () => router.push("/menu"), category: "System" },
      { id: "settings", label: "Inställningar", description: "Systemkonfiguration", icon: Settings, action: () => router.push("/settings"), category: "System" },
      { id: "receipt", label: "Kvittolayout", description: "Design kvitton", icon: Printer, action: () => router.push("/settings/receipt"), category: "System" },
      { id: "system", label: "Systemhälsa", description: "API, DB övervakning", icon: Server, action: () => router.push("/system"), category: "System" },
      // Quick actions
      { id: "quick-testorder", label: "Skapa Testorder", description: "Släpp in en testbeställning", icon: Zap, action: () => { setOpen(false); document.dispatchEvent(new CustomEvent("admin:testorder")); }, category: "Snabbåtgärder" },
    ],
    [router]
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        c.keywords?.some((k) => k.includes(q))
    );
  }, [commands, query]);

  const groupedCommands = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {};
    filtered.forEach((c) => {
      if (!groups[c.category]) groups[c.category] = [];
      groups[c.category].push(c);
    });
    return groups;
  }, [filtered]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        setQuery("");
        setSelectedIdx(0);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  const executeCommand = useCallback(
    (cmd: CommandItem) => {
      setOpen(false);
      setQuery("");
      cmd.action();
    },
    []
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && filtered[selectedIdx]) {
      e.preventDefault();
      executeCommand(filtered[selectedIdx]);
    }
  };

  // Scroll selected into view
  useEffect(() => {
    if (listRef.current) {
      const el = listRef.current.querySelector(`[data-idx="${selectedIdx}"]`);
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIdx]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[100] cmd-overlay flex items-start justify-center pt-[15vh]"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ type: "spring", bounce: 0, duration: 0.25 }}
            className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl shadow-black/40 border border-[var(--border-subtle)]"
            style={{ background: "var(--bg-secondary)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search input */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--border-subtle)]">
              <Search size={16} className="text-[var(--text-secondary)] shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Sök kommandon, sidor, åtgärder…"
                className="flex-1 bg-transparent text-sm font-medium text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none"
              />
              <kbd className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-[var(--border-subtle)] text-[10px] font-black text-[var(--text-secondary)] uppercase tracking-widest">
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div ref={listRef} className="max-h-[360px] overflow-y-auto py-2">
              {filtered.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] opacity-40">
                    Inga resultat
                  </p>
                </div>
              ) : (
                Object.entries(groupedCommands).map(([category, items]) => (
                  <div key={category} className="mb-1">
                    <div className="px-5 py-1.5 text-[10px] font-black uppercase tracking-[0.35em] text-[var(--text-secondary)] opacity-40">
                      {category}
                    </div>
                    {items.map((cmd) => {
                      const globalIdx = filtered.indexOf(cmd);
                      const Icon = cmd.icon;
                      const isSelected = globalIdx === selectedIdx;
                      return (
                        <button
                          key={cmd.id}
                          data-idx={globalIdx}
                          onClick={() => executeCommand(cmd)}
                          onMouseEnter={() => setSelectedIdx(globalIdx)}
                          className={`w-full flex items-center gap-3 px-5 py-3 text-left transition-all ${
                            isSelected
                              ? "bg-gold-500/8 text-gold-500"
                              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                          }`}
                        >
                          <div
                            className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                              isSelected ? "bg-gold-500/15" : "bg-[var(--bg-primary)]"
                            }`}
                          >
                            <Icon size={14} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-black uppercase tracking-wide truncate">
                              {cmd.label}
                            </p>
                            {cmd.description && (
                              <p className="text-[10px] font-medium text-[var(--text-secondary)] truncate mt-0.5">
                                {cmd.description}
                              </p>
                            )}
                          </div>
                          {isSelected && (
                            <span className="text-[10px] font-black uppercase tracking-widest text-gold-500/60">
                              ↵
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            {/* Footer hint */}
            <div className="flex items-center gap-4 px-5 py-3 border-t border-[var(--border-subtle)] text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 rounded border border-[var(--border-subtle)]">↑↓</kbd>
                Navigera
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 rounded border border-[var(--border-subtle)]">↵</kbd>
                Öppna
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 rounded border border-[var(--border-subtle)]">ESC</kbd>
                Stäng
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Export a trigger button component
export function CommandPaletteTrigger() {
  return (
    <button
      onClick={() => {
        window.dispatchEvent(
          new KeyboardEvent("keydown", { key: "k", metaKey: true })
        );
      }}
      className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-gold-500/20 transition-all text-[10px] font-bold"
    >
      <Command size={12} />
      <span className="hidden sm:inline">Sök…</span>
      <kbd className="hidden sm:flex items-center gap-0.5 px-1 py-0.5 rounded border border-[var(--border-subtle)] text-[10px] font-black uppercase">
        ⌘K
      </kbd>
    </button>
  );
}
