"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet } from "@/shared/api/client";
import {
  ClipboardList,
  ContactRound,
  type LucideIcon,
  Store,
} from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { useUiStore } from "@/shared/store/ui-store";
import { ADMIN_ROUTES, ADMIN_SECTIONS, ADMIN_SECTION_LABELS } from "@/shared/navigation/admin-routes";

type CommandGroup = string;

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

const COMMANDS: CommandItem[] = ADMIN_ROUTES.map((item) => ({
  id: item.id,
  label: item.label,
  sublabel: item.description,
  href: item.href,
  icon: item.icon,
  group: ADMIN_SECTION_LABELS[item.section],
  keywords: item.keywords,
}));

function matches(item: CommandItem, query: string): boolean {
  if (!query) return true;
  const haystack = `${item.label} ${item.keywords ?? ""} ${item.group}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token));
}

const GROUP_ORDER: CommandGroup[] = [
  "Kunder",
  "Ordrar",
  "Restauranger",
  ...ADMIN_SECTIONS.map((section) => section.label),
];

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <CommandPaletteContent onClose={onClose} />;
}

function CommandPaletteContent({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [hits, setHits] = useState<GlobalSearchResponse | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => COMMANDS.filter((c) => matches(c, query)), [query]);

  // Globalt data-sök: debounce 250 ms, ignorera svar som kommit i fel ordning.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
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
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

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
          onChange={(event) => {
            const next = event.target.value;
            setQuery(next);
            setActiveIndex(0);
            if (next.trim().length < 2) setHits(null);
          }}
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
 * State lives in the ui-store so any view (e.g. dashboardens sökfält)
 * can open the palette via useUiStore.
 */
export function useCommandPalette() {
  const open = useUiStore((s) => s.paletteOpen);
  const setOpen = useUiStore((s) => s.setPaletteOpen);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(!useUiStore.getState().paletteOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  return { open, openPalette: () => setOpen(true), close: () => setOpen(false) };
}
