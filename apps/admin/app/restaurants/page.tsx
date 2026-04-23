"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import axios from "axios";
import { AlertTriangle, ArrowRight, Clock3, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { ConfirmModal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { API_URL } from "@/lib/api";
import { getStoredToken } from "@/lib/auth-storage";
import { useControlCenter } from "@/lib/use-control-center";

const currency = (value: number) => `${Math.round(value).toLocaleString("sv-SE")} kr`;

export default function RestaurantsPage() {
  const router = useRouter();
  const { success, error: toastError } = useToast();
  const { data, loading, error, refresh } = useControlCenter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "closed">("all");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

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

        if (statusFilter === "open" && !restaurant.isOpen) return false;
        if (statusFilter === "closed" && restaurant.isOpen) return false;
        return true;
      })
      .sort((left, right) => left.name.localeCompare(right.name, "sv"));
  }, [data, search, statusFilter]);

  const stats = useMemo(() => {
    if (!data) {
      return { total: 0, open: 0, missingHours: 0, queuePressure: 0 };
    }

    return {
      total: data.restaurantSnapshots.length,
      open: data.restaurantSnapshots.filter((restaurant) => restaurant.isOpen).length,
      missingHours: data.restaurantSnapshots.filter((restaurant) => !restaurant.hasHours).length,
      queuePressure: data.restaurantSnapshots.filter((restaurant) => restaurant.pendingOrders > 0).length,
    };
  }, [data]);

  const handleDelete = async () => {
    if (!deleteTarget) return;

    const token = getStoredToken();
    if (!token) return;

    try {
      await axios.delete(`${API_URL}/api/restaurants/${deleteTarget.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      success(`${deleteTarget.name} raderades.`);
      setDeleteTarget(null);
      await refresh();
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte radera restaurangen.");
    }
  };

  if (loading) {
    return (
      <div className="panel flex min-h-[320px] items-center justify-center rounded-[28px] px-6 py-12">
        <div className="flex items-center gap-3 text-[var(--text-secondary)]">
          <RefreshCw className="animate-spin text-amber-200" size={18} />
          <span className="text-sm font-semibold">Laddar restauranger...</span>
        </div>
      </div>
    );
  }

  if (!data || error) {
    return (
      <div className="panel flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-[28px] px-6 py-12 text-center">
        <AlertTriangle size={34} className="text-amber-200" />
        <h2 className="text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">Kunde inte ladda restaurangerna</h2>
        <p className="max-w-xl text-sm leading-6 text-[var(--text-secondary)]">{error || "Något gick fel när restaurangsidan skulle laddas."}</p>
        <button type="button" onClick={() => void refresh()} className="inline-flex items-center gap-2 rounded-2xl bg-gold-gradient px-5 py-3 text-[11px] font-black uppercase tracking-[0.24em] text-[#091018]">
          <RefreshCw size={14} /> Försök igen
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16">
      <section className="panel rounded-[28px] px-6 py-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <span className="control-chip">Förenklad partnerlista</span>
            <div>
              <h2 className="text-3xl font-black tracking-[-0.06em] text-[var(--text-primary)] sm:text-4xl">Varje restaurang öppnas på egen sida.</h2>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-[var(--text-secondary)] sm:text-base">
                Du ska inte längre behöva expandera listor och scrolla ner till en dold editor. Klicka på en restaurang och jobba vidare där, eller gå till stad och zon för leveransregler.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void refresh()} className="control-chip">
              <RefreshCw size={13} /> Synka
            </button>
            <button
              type="button"
              onClick={() => router.push("/restaurants/new")}
              className="inline-flex items-center gap-2 rounded-2xl bg-gold-gradient px-4 py-3 text-[11px] font-black uppercase tracking-[0.22em] text-[#091018]"
            >
              <Plus size={14} /> Ny restaurang
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Totalt", value: stats.total, sub: "Aktiva partners i systemet" },
          { label: "Öppna nu", value: stats.open, sub: "Schema och manuell status" },
          { label: "Saknar schema", value: stats.missingHours, sub: "Behöver uppföljning" },
          { label: "Har orderkö", value: stats.queuePressure, sub: "Minst en väntande order" },
        ].map((card) => (
          <article key={card.label} className="metric-card panel-muted">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[var(--text-muted)]">{card.label}</p>
            <p className="mt-3 text-3xl font-black tracking-[-0.05em] text-[var(--text-primary)]">{card.value}</p>
            <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">{card.sub}</p>
          </article>
        ))}
      </section>

      <section className="rounded-[28px] border border-sky-300/18 bg-sky-300/10 px-5 py-5">
        <div className="flex items-start gap-3 text-sky-100">
          <Clock3 size={18} className="mt-0.5 shrink-0" />
          <div className="space-y-2 text-sm leading-6">
            <p className="font-black uppercase tracking-[0.2em]">Leveransregler flyttade till rätt plats</p>
            <p>Avgift och minsta order ska styras i <Link href="/cities" className="font-black underline underline-offset-4">Städer & zoner</Link>. Restaurangsidan fokuserar nu på profil, schema, business-login och ETA.</p>
          </div>
        </div>
      </section>

      <section className="panel rounded-[28px] px-6 py-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Sok restaurang, stad eller slug" className="control-input pl-10" />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {([
              { id: "all", label: "Alla" },
              { id: "open", label: "Öppna" },
              { id: "closed", label: "Stängda" },
            ] as const).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setStatusFilter(item.id)}
                className={`rounded-2xl px-4 py-3 text-[11px] font-black uppercase tracking-[0.22em] ${statusFilter === item.id ? "bg-gold-gradient text-[#091018]" : "border border-[var(--border-subtle)] bg-[var(--panel-muted)] text-[var(--text-secondary)]"}`}
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
            restaurants.map((restaurant) => (
              <article key={restaurant.id} className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-5 py-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/restaurants/${restaurant.id}`} className="truncate text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)] hover:text-amber-100">
                        {restaurant.name}
                      </Link>
                      <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${restaurant.isOpen ? "bg-emerald-300/12 text-emerald-100" : "bg-[rgba(255,255,255,0.06)] text-[var(--text-secondary)]"}`}>
                        {restaurant.isOpen ? "Öppet" : "Stängt"}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">{restaurant.city || "Ingen stad"} • {restaurant.slug}</p>

                    <div className="mt-4 grid gap-3 md:grid-cols-4">
                      <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.02)] px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Idag</p>
                        <p className="mt-2 text-lg font-black text-[var(--text-primary)]">{currency(restaurant.todayRevenue)}</p>
                      </div>
                      <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.02)] px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Orders</p>
                        <p className="mt-2 text-lg font-black text-[var(--text-primary)]">{restaurant.todayOrders}</p>
                      </div>
                      <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.02)] px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Kö</p>
                        <p className="mt-2 text-lg font-black text-[var(--text-primary)]">{restaurant.pendingOrders}</p>
                      </div>
                      <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.02)] px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Schema</p>
                        <p className="mt-2 text-lg font-black text-[var(--text-primary)]">{restaurant.hasHours ? "Klart" : "Saknas"}</p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2 text-sm text-[var(--text-secondary)]">
                      <span className="control-chip">ETA {restaurant.etaMinutes} min</span>
                      <span className="control-chip">Rating {restaurant.reviewScore.toFixed(1)}</span>
                      <span className="control-chip">Focus {restaurant.focus}</span>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Link href={`/restaurants/${restaurant.id}`} className="inline-flex items-center gap-2 rounded-2xl bg-gold-gradient px-4 py-3 text-[11px] font-black uppercase tracking-[0.22em] text-[#091018]">
                      Öppna sida <ArrowRight size={14} />
                    </Link>
                    <Link href={`/menu/${restaurant.id}`} className="control-chip">
                      Meny
                    </Link>
                    <button type="button" onClick={() => setDeleteTarget({ id: restaurant.id, name: restaurant.name })} className="control-chip text-rose-200">
                      <Trash2 size={13} /> Radera
                    </button>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Radera restaurang"
        message={`Radera ${deleteTarget?.name} permanent? Detta går inte att ångra.`}
        confirmLabel="Radera"
        danger
      />
    </div>
  );
}
