"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Plus, RefreshCw, Search } from "lucide-react";
import { getRestaurantOverview, restaurantsQueryKey, type ControlCenterRestaurantSnapshot } from "@/modules/restaurants/api";
import { Badge, Button, EmptyState, ErrorPanel, Input, LoadingPanel, PageHeader, Surface, Tabs } from "@/shared/components/ui";
import { deliveryModeMeta } from "@/shared/components/delivery-mode";

export function RestaurantsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "attention" | "platform" | "self">("all");
  const [cityFilter, setCityFilter] = useState<string>("all");

  const overview = useQuery({ queryKey: restaurantsQueryKey, queryFn: getRestaurantOverview });

  // Unika städer → stad-växlare (chips) så man enkelt skiftar mellan städer.
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

  const FILTER_TABS: { value: typeof filter; label: string }[] = [
    { value: "all", label: "Alla" },
    { value: "open", label: "Öppna" },
    { value: "platform", label: "Vi kör" },
    { value: "self", label: "Själv" },
    { value: "attention", label: "Kräver åtgärd" },
  ];

  return (
    <div className="page-stack">
      <PageHeader
        title="Restauranger"
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => void overview.refetch()}><RefreshCw size={13} /></Button>
            <Button variant="primary" onClick={() => router.push("/restaurants/new")}><Plus size={14} /> Ny restaurang</Button>
          </div>
        }
      />

      <Surface className="px-6 py-5">
        {/* Stad-växlare — primär kontroll för att skifta mellan städer */}
        {cities.length > 1 && (
          <div className="mb-4">
            <Tabs
              value={cityFilter}
              options={[{ value: "all", label: "Alla städer" }, ...cities.map((c) => ({ value: c, label: c }))]}
              onChange={setCityFilter}
              scroll
            />
          </div>
        )}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Search */}
          <div className="relative w-full max-w-sm">
            <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input className="pl-11" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Sök namn, stad eller slug…" />
          </div>
          {/* Filter tabs */}
          <Tabs value={filter} options={FILTER_TABS} onChange={setFilter} />
        </div>

        {filtered.length === 0 ? (
          <div className="mt-6"><EmptyState title="Inga restauranger matchar sökningen" /></div>
        ) : (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((r) => <RestaurantCard key={r.id} restaurant={r} onClick={() => router.push(`/restaurants/${r.id}`)} />)}
          </div>
        )}
      </Surface>
    </div>
  );
}

function RestaurantCard({ restaurant: r, onClick }: { restaurant: ControlCenterRestaurantSnapshot; onClick: () => void }) {
  const avatar = r.imageUrl || r.heroImageUrl;
  // Vänster-kanten kodar leveransläge (vi kör / själv); detaljerad statistik
  // bor på restaurang-detaljsidan — kortet håller bara namn, status, ort och
  // ev. åtgärds-signal.
  const hasSignal = r.pendingOrders > 0 || r.liveOrders > 0 || !r.hasHours;
  return (
    <button
      type="button"
      onClick={onClick}
      className="surface-muted flex flex-col gap-3 px-4 py-4 text-left transition-colors hover:bg-[var(--bg-hover)]"
      style={{ borderLeft: `3px solid ${deliveryModeMeta(r.selfDelivery).color}` }}
    >
      <div className="flex items-center gap-3">
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
        ) : (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-xl">🍽️</div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate font-bold tracking-[-0.01em]">{r.name}</p>
            <Badge tone={r.isOpen ? "success" : "neutral"}>{r.isOpen ? "Öppen" : "Stängd"}</Badge>
          </div>
          <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">{r.city || ""}{r.city && r.slug ? " · " : ""}{r.slug}</p>
        </div>
      </div>

      {hasSignal && (
        <div className="flex flex-wrap gap-1.5">
          {r.pendingOrders > 0 && <Badge tone="warning">{r.pendingOrders} väntar</Badge>}
          {r.liveOrders > 0 && <Badge tone="info">{r.liveOrders} live</Badge>}
          {!r.hasHours && <Badge tone="danger">Inga öppettider</Badge>}
        </div>
      )}
    </button>
  );
}
