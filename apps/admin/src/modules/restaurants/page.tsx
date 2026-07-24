"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Plus, RefreshCw, Search, Star } from "lucide-react";
import {
  getRestaurantOverview,
  patchRestaurant,
  restaurantsQueryKey,
  type ControlCenterRestaurantSnapshot,
} from "@/modules/restaurants/api";
import { Button, EmptyState, ErrorPanel, Input, LoadingPanel, PageHeader, Select, Surface } from "@/shared/components/ui";
import { AcceptingOrdersModeToggle } from "@/shared/components/restaurant-availability";
import type { AcceptingOrdersMode } from "@/shared/contracts/restaurants";
import { cn } from "@/shared/utils/cn";

export function RestaurantsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "attention" | "platform" | "self">("all");
  const [cityFilter, setCityFilter] = useState<string>("all");

  const overview = useQuery({ queryKey: restaurantsQueryKey, queryFn: getRestaurantOverview });

  // Beställningsläget är en explicit trelägesmodell. Effektiv status kan även
  // påverkas av schema, utkast, coming soon och driftöverlägg.
  const statusMutation = useMutation({
    meta: { toast: false },
    mutationFn: ({ id, mode }: { id: string; mode: AcceptingOrdersMode }) =>
      patchRestaurant(id, {
        acceptingOrdersMode: mode,
        acceptingOrdersOverrideUntil: null,
        acceptingOrdersOverrideReason: mode === "SCHEDULED" ? null : "Ändrad från restauranglistan",
      }),
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
              <Input className="input-with-leading-icon" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Sök restaurang" />
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

      {filtered.length === 0 ? (
        <Surface className="p-6"><EmptyState title="Inga restauranger matchar sökningen" /></Surface>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((r) => (
            <RestaurantCard
              key={r.id}
              restaurant={r}
              onOpen={() => router.push(`/restaurants/${r.id}`)}
              onChangeMode={(mode) => statusMutation.mutate({ id: r.id, mode })}
              togglePending={statusMutation.isPending && statusMutation.variables?.id === r.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Ett kort per restaurang — samma komponent på alla skärmstorlekar. */
function RestaurantCard({
  restaurant: r,
  onOpen,
  onChangeMode,
  togglePending,
}: {
  restaurant: ControlCenterRestaurantSnapshot;
  onOpen: () => void;
  onChangeMode: (mode: AcceptingOrdersMode) => void;
  togglePending: boolean;
}) {
  const avatar = r.imageUrl || r.heroImageUrl;
  return (
    <article className="flex flex-col gap-3.5 rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4 transition-[border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-[var(--border-strong)]">
      {/* Identitet — klickbar yta in till detaljsidan */}
      <button type="button" onClick={onOpen} className="flex min-w-0 items-center gap-3 text-left">
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt="" className="h-12 w-12 shrink-0 rounded-[12px] object-cover" />
        ) : (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] bg-[var(--brand-navy-soft)] text-[16px] font-extrabold text-[var(--brand-navy-ink)]" aria-hidden>
            {r.name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[14.5px] font-bold tracking-[-0.01em] text-[var(--text-primary)]">{r.name}</span>
            {r.draft && <span className="badge badge-accent shrink-0">Utkast</span>}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-[var(--text-muted)]">
            <span
              className="h-[7px] w-[7px] shrink-0 rounded-full"
              style={{ background: r.isOpen ? "var(--success)" : "var(--warning)" }}
              aria-hidden
            />
            {r.isOpen ? "Öppen nu" : "Stängd nu"}
            <span aria-hidden>·</span>
            <span className="truncate">{r.city || r.slug}</span>
          </span>
        </span>
        <ChevronRight size={17} className="shrink-0 text-[var(--text-muted)]" />
      </button>

      {/* Nyckeltal */}
      <div className="flex items-center gap-4 text-[12px] font-semibold text-[var(--text-secondary)]">
        <span className="inline-flex items-center gap-1"><Star size={12} className="text-[var(--brand-orange)]" aria-hidden /> {r.reviewScore ? r.reviewScore.toFixed(1) : "—"}</span>
        <span>{r.todayOrders} ordrar idag</span>
        {r.pendingOrders > 0 && <span className="badge badge-warning ml-auto">{r.pendingOrders} väntar</span>}
      </div>

      {/* Beställningsläge */}
      <AcceptingOrdersModeToggle
        className="max-w-none"
        aria-label={`Beställningsläge för ${r.name}`}
        value={r.acceptingOrdersMode}
        disabled={togglePending}
        onValueChange={onChangeMode}
      />
    </article>
  );
}
