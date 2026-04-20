"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import axios from "axios";
import {
  ArrowRight,
  LayoutGrid,
  Loader2,
  Package,
  RefreshCw,
  Search,
  Store,
  Utensils,
} from "lucide-react";
import { API_URL } from "@/lib/api";
import { getStoredToken } from "@/lib/auth-storage";
import { useRestaurantStore } from "@/store/restaurantStore";
import { useControlCenter } from "@/lib/use-control-center";

type RestaurantRow = {
  id: string;
  name: string;
  city?: string | null;
  isOpen?: boolean;
  categories?: number;
  products?: number;
};

export default function MenuSelectionHub() {
  const router = useRouter();
  const { setRestaurant } = useRestaurantStore();
  const { data: controlData } = useControlCenter();
  const [restaurants, setRestaurants] = useState<RestaurantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchRestaurants = useCallback(async () => {
    const token = getStoredToken();
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/api/restaurants`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      setRestaurants(response.data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRestaurants();
  }, [fetchRestaurants]);

  const restaurantCards = useMemo(() => {
    const metricsById = new Map(
      (controlData?.restaurantSnapshots || []).map((restaurant) => [restaurant.id, restaurant])
    );

    return restaurants
      .map((restaurant) => ({
        ...restaurant,
        metrics: metricsById.get(restaurant.id),
      }))
      .filter((restaurant) => {
        if (!search.trim()) return true;
        const query = search.toLowerCase();
        return restaurant.name.toLowerCase().includes(query) || (restaurant.city || "").toLowerCase().includes(query);
      });
  }, [controlData?.restaurantSnapshots, restaurants, search]);

  const stats = useMemo(() => ({
    total: restaurants.length,
    open: (controlData?.restaurantSnapshots || []).filter((restaurant) => restaurant.isOpen).length,
    withMenu: restaurants.length,
    needsAttention: (controlData?.restaurantSnapshots || []).filter((restaurant) => restaurant.pendingOrders > 0 || !restaurant.hasHours).length,
  }), [controlData?.restaurantSnapshots, restaurants.length]);

  if (loading) {
    return (
      <div className="panel flex min-h-[360px] items-center justify-center rounded-[32px] px-6 py-12">
        <div className="flex items-center gap-3 text-[var(--text-secondary)]">
          <Loader2 className="animate-spin text-amber-200" size={18} />
          <span className="text-sm font-bold">Laddar menyhubben…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-16">
      <section className="panel rounded-[32px] px-6 py-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <span className="control-chip">Menu hub</span>
            <div>
              <h2 className="text-3xl font-black tracking-[-0.06em] text-[var(--text-primary)] sm:text-4xl">Menyhantering utan gammal portal-känsla</h2>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-[var(--text-secondary)] sm:text-base">
                Välj restaurang och gå direkt in i produkt-, kategori-, extra- och dealflödet. Hubbens syfte nu är snabb access, inte dubbla inställningssidor.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void fetchRestaurants()} className="control-chip">
              <RefreshCw size={13} /> Synka
            </button>
            <Link href="/categories" className="control-chip">Kategorier</Link>
            <Link href="/cities" className="control-chip">Städer & zoner</Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-4">
        {[
          { label: "Restauranger", value: stats.total, sub: "Valbara i menyhubben" },
          { label: "Öppna nu", value: stats.open, sub: "Drivs live just nu" },
          { label: "Menyytor", value: stats.withMenu, sub: "Har produkt- och kategoriflöde" },
          { label: "Behöver koll", value: stats.needsAttention, sub: "Kö eller saknade hours" },
        ].map((card) => (
          <article key={card.label} className="metric-card panel-muted">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[var(--text-muted)]">{card.label}</p>
            <p className="mt-3 text-3xl font-black tracking-[-0.05em] text-[var(--text-primary)]">{card.value}</p>
            <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">{card.sub}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-5 2xl:grid-cols-[0.9fr_1.1fr]">
        <div className="panel rounded-[32px] px-6 py-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">Snabbflöden</p>
            <h3 className="mt-2 text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">Vad behöver du göra?</h3>
          </div>

          <div className="mt-5 grid gap-3">
            {[
              { href: "/categories", title: "Bygg startsidans rails", description: "Hantera kategorier och sektioner för webb och React Native.", icon: LayoutGrid },
              { href: "/restaurant-ops", title: "Koppla meny till drift", description: "Säkerställ att ETA, öppettider och leveransinställningar hänger ihop med restaurangen.", icon: Store },
              { href: "/deals", title: "Lägg till kampanjer", description: "Skapa deals som syns direkt i menyn och i sponsor/push-flödena.", icon: Package },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href} className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-5 py-5 hover:border-[var(--border-strong)]">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgba(245,191,91,0.12)] text-amber-200">
                    <Icon size={18} />
                  </div>
                  <p className="mt-4 text-lg font-black tracking-[-0.03em] text-[var(--text-primary)]">{item.title}</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{item.description}</p>
                  <div className="mt-4 inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-amber-200">
                    Öppna <ArrowRight size={14} />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="panel rounded-[32px] px-6 py-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="relative flex-1">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Sök restaurang eller stad" className="control-input pl-10" />
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {restaurantCards.map((restaurant) => (
              <button
                key={restaurant.id}
                type="button"
                onClick={() => {
                  setRestaurant(restaurant.id, restaurant.name);
                  router.push(`/menu/${restaurant.id}`);
                }}
                className="rounded-[28px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-5 py-5 text-left hover:border-[var(--border-strong)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-2xl font-black tracking-[-0.05em] text-[var(--text-primary)]">{restaurant.name}</p>
                    <p className="mt-1 text-[11px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">{restaurant.city || "Ingen stad"}</p>
                  </div>
                  <div className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${restaurant.metrics?.isOpen ? "bg-emerald-300/12 text-emerald-100" : "bg-rose-300/12 text-rose-100"}`}>
                    {restaurant.metrics?.isOpen ? "Öppet" : "Stängt"}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Focus</p>
                    <p className="mt-1 text-sm font-black text-[var(--text-primary)]">{restaurant.metrics?.focus || "Menyarbete"}</p>
                  </div>
                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Orders idag</p>
                    <p className="mt-1 text-sm font-black text-[var(--text-primary)]">{restaurant.metrics?.todayOrders || 0}</p>
                  </div>
                </div>

                <div className="mt-5 inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-amber-200">
                  Öppna menyeditor <ArrowRight size={14} />
                </div>
              </button>
            ))}

            {restaurantCards.length === 0 ? (
              <div className="xl:col-span-2 rounded-[28px] border border-dashed border-[var(--border-subtle)] px-6 py-16 text-center text-sm leading-7 text-[var(--text-secondary)]">
                Inga restauranger matchade sökningen.
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
