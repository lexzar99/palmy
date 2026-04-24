"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowRight, Loader2, RefreshCw, Search, ShieldCheck, Store } from "lucide-react";
import { useControlCenter } from "@/lib/use-control-center";

const currency = (value: number) => `${Math.round(value).toLocaleString("sv-SE")} kr`;

type Filter = "attention" | "hours" | "queue" | "all";

function getReasons(restaurant: {
  pendingOrders: number;
  hasHours: boolean;
  reviewScore: number;
  liveOrders: number;
  isOpen: boolean;
}) {
  const reasons: string[] = [];

  if (restaurant.pendingOrders > 0) {
    reasons.push(`${restaurant.pendingOrders} väntande ordrar`);
  }

  if (!restaurant.hasHours) {
    reasons.push("Saknar schema");
  }

  if (restaurant.reviewScore < 4.2) {
    reasons.push(`Rating ${restaurant.reviewScore.toFixed(1)}`);
  }

  if (!restaurant.isOpen && restaurant.liveOrders > 0) {
    reasons.push("Stängd med liveflöde");
  }

  return reasons;
}

export default function RestaurantOpsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedRestaurantId = searchParams.get("restaurantId");
  const { data, loading, error, refresh } = useControlCenter();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("attention");

  useEffect(() => {
    if (!requestedRestaurantId || !data?.restaurantSnapshots.some((restaurant) => restaurant.id === requestedRestaurantId)) {
      return;
    }

    router.replace(`/restaurants/${requestedRestaurantId}`);
  }, [data?.restaurantSnapshots, requestedRestaurantId, router]);

  const restaurants = useMemo(() => {
    if (!data) return [];

    return [...data.restaurantSnapshots]
      .filter((restaurant) => {
        if (search.trim()) {
          const query = search.toLowerCase();
          const matchesText =
            restaurant.name.toLowerCase().includes(query) ||
            restaurant.slug.toLowerCase().includes(query) ||
            (restaurant.city || "").toLowerCase().includes(query);

          if (!matchesText) return false;
        }

        if (filter === "hours") return !restaurant.hasHours;
        if (filter === "queue") return restaurant.pendingOrders > 0;
        if (filter === "attention") return getReasons(restaurant).length > 0;
        return true;
      })
      .sort((left, right) => {
        const leftScore = left.pendingOrders * 10 + (left.hasHours ? 0 : 6) + (left.reviewScore < 4.2 ? 4 : 0);
        const rightScore = right.pendingOrders * 10 + (right.hasHours ? 0 : 6) + (right.reviewScore < 4.2 ? 4 : 0);
        return rightScore - leftScore;
      });
  }, [data, filter, search]);

  if (loading) {
    return (
      <div className="panel flex min-h-[320px] items-center justify-center rounded-[28px] px-6 py-12">
        <div className="flex items-center gap-3 text-[var(--text-secondary)]">
          <Loader2 className="animate-spin text-amber-200" size={18} />
          <span className="text-sm font-semibold">Laddar driftkön...</span>
        </div>
      </div>
    );
  }

  if (!data || error) {
    return (
      <div className="panel flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-[28px] px-6 py-12 text-center">
        <Store size={34} className="text-amber-200" />
        <h2 className="text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">Kunde inte ladda driftkön</h2>
        <p className="max-w-xl text-sm leading-6 text-[var(--text-secondary)]">{error || "Något gick fel när driftkön skulle laddas."}</p>
        <button type="button" onClick={() => void refresh()} className="inline-flex items-center gap-2 rounded-2xl bg-gold-gradient px-5 py-3 text-[11px] font-black uppercase tracking-[0.24em] text-[#091018]">
          <RefreshCw size={14} /> Försök igen
        </button>
      </div>
    );
  }

  const stats = {
    missingHours: data.restaurantSnapshots.filter((restaurant) => !restaurant.hasHours).length,
    queuePressure: data.restaurantSnapshots.filter((restaurant) => restaurant.pendingOrders > 0).length,
    closedNow: data.restaurantSnapshots.filter((restaurant) => !restaurant.isOpen).length,
  };

  return (
    <div className="space-y-6 pb-16">
      <section className="panel rounded-[28px] px-6 py-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <span className="control-chip">Ny driftkö</span>
            <div>
              <h2 className="text-3xl font-black tracking-[-0.06em] text-[var(--text-primary)] sm:text-4xl">Ingen inline-editor längst ned.</h2>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-[var(--text-secondary)] sm:text-base">
                Den här sidan är nu bara en kö. Klicka vidare till en riktig restaurangsida för att jobba klart, eller hoppa till stad och zon om det är leveransreglerna som ska justeras.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void refresh()} className="control-chip">
              <RefreshCw size={13} /> Synka
            </button>
            <Link href="/restaurants" className="inline-flex items-center gap-2 rounded-2xl bg-gold-gradient px-4 py-3 text-[11px] font-black uppercase tracking-[0.22em] text-[#091018]">
              Öppna restauranger <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          { label: "Saknar schema", value: stats.missingHours, sub: "Behöver öppettider" },
          { label: "Har orderkö", value: stats.queuePressure, sub: "Minst en väntande order" },
          { label: "Stängda nu", value: stats.closedNow, sub: "Manuell eller schemastyrd status" },
        ].map((card) => (
          <article key={card.label} className="metric-card panel-muted">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[var(--text-muted)]">{card.label}</p>
            <p className="mt-3 text-3xl font-black tracking-[-0.05em] text-[var(--text-primary)]">{card.value}</p>
            <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{card.sub}</p>
          </article>
        ))}
      </section>

      <section className="panel rounded-[28px] px-6 py-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Sok restaurang, stad eller slug" className="control-input pl-10" />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {([
              { id: "attention", label: "Behöver uppföljning" },
              { id: "queue", label: "Har orderkö" },
              { id: "hours", label: "Saknar schema" },
              { id: "all", label: "Alla" },
            ] as const).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={`rounded-2xl px-4 py-3 text-[11px] font-black uppercase tracking-[0.22em] ${filter === item.id ? "bg-gold-gradient text-[#091018]" : "border border-[var(--border-subtle)] bg-[var(--panel-muted)] text-[var(--text-secondary)]"}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-4">
          {restaurants.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-[var(--border-subtle)] px-6 py-16 text-center text-sm leading-7 text-[var(--text-secondary)]">
              Inga restauranger matchade filtren.
            </div>
          ) : (
            restaurants.map((restaurant) => {
              const reasons = getReasons(restaurant);

              return (
                <article key={restaurant.id} className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-5 py-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">{restaurant.name}</p>
                        <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${restaurant.isOpen ? "bg-emerald-300/12 text-emerald-100" : "bg-[rgba(255,255,255,0.06)] text-[var(--text-secondary)]"}`}>
                        {restaurant.isOpen ? "Öppet" : "Stängt"}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">{restaurant.city || "Ingen stad"} • {restaurant.slug}</p>

                      <div className="mt-4 grid gap-3 md:grid-cols-4">
                        <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.02)] px-4 py-3">
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Kö</p>
                          <p className="mt-2 text-lg font-black text-[var(--text-primary)]">{restaurant.pendingOrders}</p>
                        </div>
                        <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.02)] px-4 py-3">
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Live</p>
                          <p className="mt-2 text-lg font-black text-[var(--text-primary)]">{restaurant.liveOrders}</p>
                        </div>
                        <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.02)] px-4 py-3">
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Schema</p>
                          <p className="mt-2 text-lg font-black text-[var(--text-primary)]">{restaurant.hasHours ? "Klart" : "Saknas"}</p>
                        </div>
                        <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.02)] px-4 py-3">
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Idag</p>
                          <p className="mt-2 text-lg font-black text-[var(--text-primary)]">{currency(restaurant.todayRevenue)}</p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {reasons.length > 0 ? (
                          reasons.map((reason) => (
                            <span key={reason} className="control-chip">
                              {reason}
                            </span>
                          ))
                        ) : (
                          <span className="control-chip">Inga akuta signaler</span>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Link href={`/restaurants/${restaurant.id}`} className="inline-flex items-center gap-2 rounded-2xl bg-gold-gradient px-4 py-3 text-[11px] font-black uppercase tracking-[0.22em] text-[#091018]">
                        Öppna sida <ArrowRight size={14} />
                      </Link>
                      <Link href="/cities" className="control-chip">
                        <ShieldCheck size={13} /> Styr zoner
                      </Link>
                      <Link href={`/menu/${restaurant.id}`} className="control-chip">
                        <Store size={13} /> Meny
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>

      <section className="rounded-[28px] border border-amber-300/18 bg-amber-300/10 px-5 py-5">
        <div className="flex items-start gap-3 text-amber-100">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div className="space-y-2 text-sm leading-6">
            <p className="font-black uppercase tracking-[0.2em]">Ny regel i admin</p>
            <p>Avgift och minsta order ska styras i stad- och zonsidan. Restaurangsidorna visar nu bara drift, schema, profil och länkar vidare.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
