"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Plus, RefreshCw, Search } from "lucide-react";
import { getRestaurantOverview, restaurantsQueryKey, type ControlCenterRestaurantSnapshot } from "@/modules/restaurants/api";
import { Badge, Button, EmptyState, ErrorPanel, Input, LoadingPanel, PageHeader, Surface, Tabs } from "@/shared/components/ui";
import { DeliveryModeBadge, deliveryModeMeta } from "@/shared/components/delivery-mode";
import { formatCurrency, formatNumber, restaurantTierLabel } from "@/shared/utils/format";

export function RestaurantsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "attention" | "platform" | "self">("all");

  const overview = useQuery({ queryKey: restaurantsQueryKey, queryFn: getRestaurantOverview });

  const filtered = useMemo(() => {
    const items = overview.data || [];
    const q = search.trim().toLowerCase();
    return items.filter((r) => {
      const matchQ = !q || r.name.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q) || (r.city || "").toLowerCase().includes(q);
      const matchF =
        filter === "all" ? true
        : filter === "open" ? r.isOpen
        : filter === "platform" ? !r.selfDelivery
        : filter === "self" ? r.selfDelivery
        : (r.pendingOrders > 0 || !r.hasHours || r.reviewScore < 4.2);
      return matchQ && matchF;
    });
  }, [filter, overview.data, search]);

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
  const needsAttention = r.pendingOrders > 0 || !r.hasHours || r.reviewScore < 4.2;
  // Prefer the profile pic (imageUrl), fall back to heroImageUrl, then to
  // the food emoji. Image fields are now part of the snapshot from
  // /api/admin/control-center so this isn't an any-cast anymore.
  const avatar = r.imageUrl || r.heroImageUrl;
  return (
    <button type="button" onClick={onClick} className="surface-muted px-5 py-5 text-left hover:brightness-110 transition-all" style={{ borderLeft: `3px solid ${deliveryModeMeta(r.selfDelivery).color}` }}>
      <div className="flex items-start gap-3">
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt="" className="h-12 w-12 rounded-xl object-cover shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-2xl shrink-0">🍽️</div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="font-black tracking-[-0.02em] leading-tight">{r.name}</p>
            <Badge tone={r.isOpen ? "success" : "neutral"}>{r.isOpen ? "Öppen" : "Stängd"}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">{r.city || ""}{r.city && r.slug ? " · " : ""}{r.slug}</p>
          <div className="mt-1.5"><DeliveryModeBadge selfDelivery={r.selfDelivery} /></div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-[rgba(255,255,255,0.04)] px-2 py-2">
          <p className="text-base font-black">{formatNumber(r.liveOrders)}</p>
          <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">Live</p>
        </div>
        <div className="rounded-lg bg-[rgba(255,255,255,0.04)] px-2 py-2">
          <p className="text-base font-black">{formatNumber(r.todayOrders)}</p>
          <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">Idag</p>
        </div>
        <div className="rounded-lg bg-[rgba(255,255,255,0.04)] px-2 py-2">
          <p className="text-base font-black">{formatCurrency(r.todayRevenue)}</p>
          <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">Intäkt</p>
        </div>
      </div>

      {(needsAttention || r.pendingOrders > 0) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {r.pendingOrders > 0 && <Badge tone="warning">{r.pendingOrders} väntande</Badge>}
          {!r.hasHours && <Badge tone="danger">Inga öppettider</Badge>}
          {r.reviewScore < 4.2 && <Badge tone="neutral">{r.reviewScore.toFixed(1)} ★</Badge>}
          <Badge tone="neutral">{restaurantTierLabel((r as any).featuredClass)}</Badge>
        </div>
      )}
      {!needsAttention && r.pendingOrders === 0 && (
        <div className="mt-3 flex gap-1.5">
          <Badge tone="neutral">{restaurantTierLabel((r as any).featuredClass)}</Badge>
          {r.reviewScore > 0 && <Badge tone="neutral">{r.reviewScore.toFixed(1)} ★</Badge>}
        </div>
      )}
    </button>
  );
}
