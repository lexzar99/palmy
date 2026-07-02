"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Plus, RefreshCw, Search } from "lucide-react";
import {
  getRestaurantOverview,
  patchRestaurant,
  restaurantsQueryKey,
  type ControlCenterRestaurantSnapshot,
} from "@/modules/restaurants/api";
import { Button, EmptyState, ErrorPanel, Input, LoadingPanel, PageHeader, Select, Surface, Toggle } from "@/shared/components/ui";
import { cn } from "@/shared/utils/cn";

export function RestaurantsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "attention" | "platform" | "self">("all");
  const [cityFilter, setCityFilter] = useState<string>("all");

  const overview = useQuery({ queryKey: restaurantsQueryKey, queryFn: getRestaurantOverview });

  // Status-toggle i tabellen återanvänder patchRestaurant({ isOpen }) — samma
  // fält som detalj-/formuläret skriver mot — och invaliderar listan efteråt.
  const statusMutation = useMutation({
    meta: { toast: false },
    mutationFn: ({ id, isOpen }: { id: string; isOpen: boolean }) => patchRestaurant(id, { isOpen }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: restaurantsQueryKey });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  // Unika städer → stad-växlare (dropdown) så man enkelt skiftar mellan städer.
  const cities = useMemo(() => {
    const set = new Set<string>();
    (overview.data || []).forEach((r) => { if (r.city) set.add(r.city); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "sv"));
  }, [overview.data]);

  const filtered = useMemo(() => {
    const items = overview.data || [];
    const q = search.trim().toLowerCase();
    return items.filter((r) => {
      const matchQ = !q || r.name.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q) || (r.city || "").toLowerCase().includes(q);
      const matchCity = cityFilter === "all" || r.city === cityFilter;
      const matchF =
        filter === "all" ? true
        : filter === "open" ? r.isOpen
        : filter === "platform" ? !r.selfDelivery
        : filter === "self" ? r.selfDelivery
        : (r.pendingOrders > 0 || !r.hasHours || r.reviewScore < 4.2);
      return matchQ && matchCity && matchF;
    });
  }, [filter, cityFilter, overview.data, search]);

  if (overview.isLoading) return <LoadingPanel label="Laddar restauranger…" />;
  if (overview.isError || !overview.data) return <ErrorPanel title="Kunde inte ladda restauranger" action={<Button onClick={() => void overview.refetch()}><RefreshCw size={16} /> Försök igen</Button>} />;

  const all = overview.data;
  // Counts för filter-chips beräknas på det stad-filtrerade urvalet så siffrorna
  // matchar vad chippen faktiskt skulle visa.
  const cityScoped = cityFilter === "all" ? all : all.filter((r) => r.city === cityFilter);
  const counts = {
    all: cityScoped.length,
    open: cityScoped.filter((r) => r.isOpen).length,
    closed: cityScoped.filter((r) => !r.isOpen).length,
    attention: cityScoped.filter((r) => r.pendingOrders > 0 || !r.hasHours || r.reviewScore < 4.2).length,
  };

  const FILTER_CHIPS: { value: typeof filter; label: string; count: number }[] = [
    { value: "all", label: "Alla", count: counts.all },
    { value: "open", label: "Öppna", count: counts.open },
    { value: "attention", label: "Kräver åtgärd", count: counts.attention },
  ];

  return (
    <div className="page-stack">
      <PageHeader
        breadcrumb="Katalog"
        title="Restauranger"
        actions={
          <>
            <div className="relative w-full sm:w-64">
              <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <Input className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Sök restaurang" />
            </div>
            <Button variant="secondary" onClick={() => void overview.refetch()} aria-label="Uppdatera"><RefreshCw size={14} /></Button>
            <Button variant="primary" onClick={() => router.push("/restaurants/new")}><Plus size={15} /> Ny restaurang</Button>
          </>
        }
      />

      {/* Filter-chips + stad-väljare */}
      <div className="chip-row items-center">
        {FILTER_CHIPS.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => setFilter(c.value)}
            className={cn("chip", filter === c.value && "is-active")}
          >
            {c.label} {c.count}
          </button>
        ))}
        {cities.length > 1 && (
          <div className="ml-auto">
            <Select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)}>
              <option value="all">Alla städer</option>
              {cities.map((city) => (
                <option key={city} value={city}>{city}</option>
              ))}
            </Select>
          </div>
        )}
      </div>

      <Surface className="overflow-hidden p-0">
        {filtered.length === 0 ? (
          <div className="p-6"><EmptyState title="Inga restauranger matchar sökningen" /></div>
        ) : (
          <div role="table">
            {/* Header */}
            <div
              role="row"
              className="grid items-center gap-3 border-b border-[var(--border-subtle)] px-[18px] py-[11px] text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-[var(--text-muted)]"
              style={{ gridTemplateColumns: "2fr 1fr 0.8fr 0.9fr 0.7fr 60px" }}
            >
              <span>Restaurang</span>
              <span>Status</span>
              <span>Betyg</span>
              <span>Ordrar idag</span>
              <span>Zoner</span>
              <span />
            </div>
            {filtered.map((r, i) => (
              <RestaurantRow
                key={r.id}
                restaurant={r}
                isLast={i === filtered.length - 1}
                onOpen={() => router.push(`/restaurants/${r.id}`)}
                onToggleStatus={(next) => statusMutation.mutate({ id: r.id, isOpen: next })}
                togglePending={statusMutation.isPending}
              />
            ))}
          </div>
        )}
      </Surface>
    </div>
  );
}

function RestaurantRow({
  restaurant: r,
  isLast,
  onOpen,
  onToggleStatus,
  togglePending,
}: {
  restaurant: ControlCenterRestaurantSnapshot;
  isLast: boolean;
  onOpen: () => void;
  onToggleStatus: (next: boolean) => void;
  togglePending: boolean;
}) {
  const avatar = r.imageUrl || r.heroImageUrl;
  // Zoner finns inte i snapshot-payloaden — visa "—" tills datat finns.
  const zones = "—";
  return (
    <div
      role="row"
      className={cn(
        "grid items-center gap-3 px-[18px] py-[13px] text-[13px]",
        !isLast && "border-b border-[var(--row-divider)]",
      )}
      style={{ gridTemplateColumns: "2fr 1fr 0.8fr 0.9fr 0.7fr 60px" }}
    >
      {/* Restaurang */}
      <span className="flex items-center gap-3">
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatar}
            alt=""
            className="h-9 w-9 shrink-0 rounded-[9px] object-cover"
            onError={(e) => {
              const img = e.currentTarget;
              img.style.display = "none";
              (img.nextElementSibling as HTMLElement | null)?.style.removeProperty("display");
            }}
          />
        ) : null}
        <span
          className="h-9 w-9 shrink-0 rounded-[9px]"
          style={{ display: avatar ? "none" : "block", background: "linear-gradient(150deg,#F0D4A8,#DCB070)" }}
        />
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <button type="button" onClick={onOpen} className="block truncate text-left font-bold tracking-[-0.01em] hover:text-[var(--accent-ink)]">
              {r.name}
            </button>
            {r.draft && (
              <span className="shrink-0 rounded-md border border-[var(--row-divider)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                Utkast
              </span>
            )}
          </span>
          <span className="block truncate text-[11.5px] text-[var(--text-muted)]">{r.city || r.slug}</span>
        </span>
      </span>

      {/* Status */}
      <span className="flex items-center gap-2">
        <Toggle checked={r.isOpen} disabled={togglePending} onChange={onToggleStatus} />
        <span className={cn("text-[11.5px] font-bold", r.isOpen ? "text-[var(--success-text)]" : "text-[var(--warning-text)]")}>
          {r.isOpen ? "Öppen" : "Stängd"}
        </span>
      </span>

      {/* Betyg */}
      <span className="font-bold">{r.reviewScore ? r.reviewScore.toFixed(1) : "—"}</span>

      {/* Ordrar idag */}
      <span>{r.todayOrders}</span>

      {/* Zoner */}
      <span>{zones}</span>

      {/* Chevron → detalj */}
      <span className="flex justify-end">
        <button type="button" onClick={onOpen} aria-label={`Öppna ${r.name}`} className="text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]">
          <ChevronRight size={18} />
        </button>
      </span>
    </div>
  );
}
