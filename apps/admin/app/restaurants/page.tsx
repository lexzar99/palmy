"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import axios from "axios";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Clock3,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Wallet,
} from "lucide-react";
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
  const [aliasFilter, setAliasFilter] = useState<"all" | "missing" | "ok">("all");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const restaurants = useMemo(() => {
    if (!data) return [];

    return data.restaurantSnapshots.filter((restaurant) => {
      if (search.trim()) {
        const query = search.toLowerCase();
        const matchesText =
          restaurant.name.toLowerCase().includes(query) ||
          restaurant.slug.toLowerCase().includes(query) ||
          (restaurant.city || "").toLowerCase().includes(query) ||
          (restaurant.adminEmail || "").toLowerCase().includes(query);

        if (!matchesText) return false;
      }

      if (statusFilter === "open" && !restaurant.isOpen) return false;
      if (statusFilter === "closed" && restaurant.isOpen) return false;

      if (aliasFilter === "missing" && restaurant.adminEmail) return false;
      if (aliasFilter === "ok" && !restaurant.adminEmail) return false;

      return true;
    });
  }, [aliasFilter, data, search, statusFilter]);

  const stats = useMemo(() => {
    if (!data) {
      return { total: 0, open: 0, missingAlias: 0, missingHours: 0, payoutExposure: 0 };
    }

    return {
      total: data.restaurantSnapshots.length,
      open: data.restaurantSnapshots.filter((restaurant) => restaurant.isOpen).length,
      missingAlias: data.restaurantSnapshots.filter((restaurant) => !restaurant.adminEmail).length,
      missingHours: data.restaurantSnapshots.filter((restaurant) => !restaurant.hasHours).length,
      payoutExposure: data.restaurantSnapshots.reduce((sum, restaurant) => sum + restaurant.payoutEstimate, 0),
    };
  }, [data]);

  const playbooks = useMemo(() => {
    if (!data) return [] as Array<{
      title: string;
      countLabel: string;
      description: string;
      href: string;
      hrefLabel: string;
      steps: string[];
      tone: string;
    }>;

    const missingAlias = data.restaurantSnapshots.filter((restaurant) => !restaurant.adminEmail);
    const missingHours = data.restaurantSnapshots.filter((restaurant) => !restaurant.hasHours);
    const payoutRisk = [...data.restaurantSnapshots]
      .filter((restaurant) => restaurant.payoutEstimate > 0 && (restaurant.reviewScore < 4.2 || restaurant.pendingOrders > 0))
      .sort((a, b) => b.payoutEstimate - a.payoutEstimate);

    return [
      {
        title: "Lägg admin-alias",
        countLabel: `${missingAlias.length} restauranger saknar alias`,
        description: "Sätt ett tydligt admin-alias så desktop och restauranginloggning håller samma scope utan manuella genvägar.",
        href: missingAlias[0] ? `/restaurant-ops?restaurantId=${missingAlias[0].id}` : "/restaurant-ops",
        hrefLabel: missingAlias[0] ? `Öppna ${missingAlias[0].name}` : "Öppna restauranghubben",
        steps: [
          "Öppna restaurangen i Restauranghubben.",
          "Fyll i admin-alias under driftinställningar.",
          "Spara och kontrollera att aliaset syns i flottvyn.",
        ],
        tone: "border-amber-300/18 bg-amber-300/10",
      },
      {
        title: "Sätt veckoschema",
        countLabel: `${missingHours.length} restauranger saknar öppettider`,
        description: "Restauranger utan schema får sämre öppet/stängt-logik, vilket påverkar både orderflöde och supporttryck.",
        href: missingHours[0] ? `/restaurant-ops?restaurantId=${missingHours[0].id}` : "/restaurant-ops",
        hrefLabel: missingHours[0] ? `Ställ in ${missingHours[0].name}` : "Öppna schemohubben",
        steps: [
          "Öppna veckoschemat i Restauranghubben.",
          "Fyll i ordinarie tider och extra kvällspass vid behov.",
          "Spara schemat och bekräfta att statusen ändras till 'Schema satt'.",
        ],
        tone: "border-sky-300/18 bg-sky-300/10",
      },
      {
        title: "Följ upp payout-risk",
        countLabel: `${payoutRisk.length} partners kräver payout-uppföljning`,
        description: "När payout är hög men kvaliteten svajar bör du granska reviews, köläge och readiness innan utbetalning godkänns.",
        href: payoutRisk[0] ? "/finance" : "/performance",
        hrefLabel: payoutRisk[0] ? "Öppna Finance HQ" : "Öppna Performance",
        steps: [
          "Öppna Finance HQ och välj partnern med störst exponering.",
          "Kontrollera reviewscore, väntande ordrar och noteringar innan du godkänner payout.",
          "Sätt payout på hold eller markera betald när underlaget är verifierat.",
        ],
        tone: "border-emerald-300/18 bg-emerald-300/10",
      },
    ];
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
      <div className="panel flex min-h-[360px] items-center justify-center rounded-[32px] px-6 py-12">
        <div className="flex items-center gap-3 text-[var(--text-secondary)]">
          <RefreshCw className="animate-spin text-amber-200" size={18} />
          <span className="text-sm font-bold">Laddar restaurangflottan…</span>
        </div>
      </div>
    );
  }

  if (!data || error) {
    return (
      <div className="panel flex min-h-[360px] flex-col items-center justify-center gap-4 rounded-[32px] px-6 py-12 text-center">
        <Building2 size={34} className="text-amber-200" />
        <h2 className="text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">Kunde inte ladda restaurangerna</h2>
        <p className="max-w-xl text-sm leading-6 text-[var(--text-secondary)]">{error || "Något gick fel när restaurangytan skulle laddas."}</p>
        <button type="button" onClick={() => void refresh()} className="inline-flex items-center gap-2 rounded-2xl bg-gold-gradient px-5 py-3 text-[11px] font-black uppercase tracking-[0.24em] text-[#091018]">
          <RefreshCw size={14} /> Försök igen
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-16">
      <section className="panel rounded-[32px] px-6 py-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <span className="control-chip">Fleet overview</span>
            <div>
              <h2 className="text-3xl font-black tracking-[-0.06em] text-[var(--text-primary)] sm:text-4xl">Restaurangflottan i en tydligare vy</h2>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-[var(--text-secondary)] sm:text-base">
                Här ser du vilka restauranger som saknar admin-alias, öppettider eller driftberedskap. Öppettider styrs nu centralt i restauranghubben,
                medan profilsidan kan fokusera på onboarding och varumärke.
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

      <section className="grid gap-4 xl:grid-cols-5">
        {[
          { label: "Totalt", value: stats.total, sub: "Aktiva partners i systemet" },
          { label: "Öppna nu", value: stats.open, sub: "Schema + manuell status" },
          { label: "Saknar alias", value: stats.missingAlias, sub: "Risk för osäker loginhantering" },
          { label: "Saknar öppettider", value: stats.missingHours, sub: "Flyttas till restauranghubben" },
          { label: "Payout-exponering", value: currency(stats.payoutExposure), sub: "Preliminär utbetalning denna månad" },
        ].map((card) => (
          <article key={card.label} className="metric-card panel-muted">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[var(--text-muted)]">{card.label}</p>
            <p className="mt-3 text-3xl font-black tracking-[-0.05em] text-[var(--text-primary)]">{card.value}</p>
            <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">{card.sub}</p>
          </article>
        ))}
      </section>

      <section className="panel rounded-[32px] px-6 py-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Sök restaurang, stad, slug eller admin-alias"
              className="control-input pl-10"
            />
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
                className={`rounded-2xl px-4 py-3 text-[11px] font-black uppercase tracking-[0.22em] ${statusFilter === item.id ? "bg-gold-gradient text-[#091018]" : "border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] text-[var(--text-secondary)]"}`}
              >
                {item.label}
              </button>
            ))}
            {([
              { id: "all", label: "Alla alias" },
              { id: "missing", label: "Saknar alias" },
              { id: "ok", label: "Alias ok" },
            ] as const).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setAliasFilter(item.id)}
                className={`rounded-2xl px-4 py-3 text-[11px] font-black uppercase tracking-[0.22em] ${aliasFilter === item.id ? "bg-[rgba(56,189,248,0.18)] text-sky-100" : "border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] text-[var(--text-secondary)]"}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
          {restaurants.length === 0 ? (
            <div className="xl:col-span-2 2xl:col-span-3 rounded-[28px] border border-dashed border-[var(--border-subtle)] px-6 py-16 text-center text-sm leading-7 text-[var(--text-secondary)]">
              Inga restauranger matchade filtren.
            </div>
          ) : (
            restaurants.map((restaurant) => (
              <article key={restaurant.id} className="rounded-[30px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-5 py-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-2xl font-black tracking-[-0.05em] text-[var(--text-primary)]">{restaurant.name}</p>
                    <p className="mt-1 text-[11px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">
                      {restaurant.city || "Ingen stad"} • {restaurant.featuredLabel} • {restaurant.slug}
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${restaurant.isOpen ? "bg-emerald-300/12 text-emerald-100" : "bg-rose-300/12 text-rose-100"}`}>
                    {restaurant.isOpen ? "Öppet" : "Stängt"}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Driftläge</p>
                    <p className="mt-1 text-base font-black text-[var(--text-primary)]">{restaurant.focus}</p>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">{restaurant.pendingOrders} väntande • {restaurant.liveOrders} live</p>
                  </div>
                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Ekonomi</p>
                    <p className="mt-1 text-base font-black text-amber-200">{currency(restaurant.payoutEstimate)}</p>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">Idag {currency(restaurant.todayRevenue)} • månad {currency(restaurant.monthRevenue)}</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-2">
                  <div className="flex items-center justify-between rounded-2xl border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm">
                    <span className="text-[var(--text-secondary)]">Admin-alias</span>
                    <span className={restaurant.adminEmail ? "font-black text-[var(--text-primary)]" : "font-black text-rose-200"}>
                      {restaurant.adminEmail || "Saknas"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm">
                    <span className="text-[var(--text-secondary)]">Schema / säkerhet</span>
                    <div className="flex items-center gap-2">
                      <span className={`control-chip ${restaurant.hasHours ? "text-emerald-100" : "text-rose-100"}`}>
                        <Clock3 size={12} /> {restaurant.hasHours ? "Schema satt" : "Saknas"}
                      </span>
                      <span className="control-chip">
                        <ShieldCheck size={12} /> {restaurant.reviewScore.toFixed(1)} rating
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <Link href={`/restaurant-ops?restaurantId=${restaurant.id}`} className="inline-flex items-center gap-2 rounded-2xl bg-gold-gradient px-4 py-3 text-[11px] font-black uppercase tracking-[0.22em] text-[#091018]">
                    Hub <ArrowRight size={14} />
                  </Link>
                  <Link href={`/restaurants/${restaurant.id}`} className="control-chip">
                    Profil
                  </Link>
                  <Link href={`/menu/${restaurant.id}`} className="control-chip">
                    Meny
                  </Link>
                  <button type="button" onClick={() => setDeleteTarget({ id: restaurant.id, name: restaurant.name })} className="control-chip text-rose-200">
                    <Trash2 size={13} /> Radera
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-[30px] border border-amber-300/18 bg-amber-300/10 px-5 py-5">
          <div className="flex items-center gap-3 text-amber-100">
            <AlertTriangle size={18} />
            <p className="text-sm font-black uppercase tracking-[0.22em]">Vad ska fixas först?</p>
          </div>
          <div className="mt-4 grid gap-4">
            {playbooks.map((playbook) => (
              <div key={playbook.title} className={`rounded-[24px] border px-4 py-4 ${playbook.tone}`}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-base font-black tracking-[-0.03em] text-[var(--text-primary)]">{playbook.title}</p>
                    <p className="mt-1 text-[11px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">{playbook.countLabel}</p>
                    <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{playbook.description}</p>
                  </div>
                  <Link href={playbook.href} className="control-chip shrink-0">
                    {playbook.hrefLabel} <ArrowRight size={13} />
                  </Link>
                </div>
                <div className="mt-4 grid gap-2">
                  {playbook.steps.map((step, index) => (
                    <div key={step} className="rounded-2xl border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.04)] px-4 py-3 text-sm leading-6 text-[var(--text-secondary)]">
                      <span className="mr-2 font-black text-[var(--text-primary)]">{index + 1}.</span>
                      {step}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[30px] border border-sky-300/18 bg-sky-300/10 px-5 py-5">
          <div className="flex items-center gap-3 text-sky-100">
            <Wallet size={18} />
            <p className="text-sm font-black uppercase tracking-[0.22em]">Nya arbetsflöden</p>
          </div>
          <div className="mt-4 grid gap-3 text-sm leading-7 text-[var(--text-secondary)]">
            <p>Restauranghubben styr nu öppettider och driftinställningar.</p>
            <p>Finance HQ används för att godkänna och markera utbetalningar som betalda.</p>
            <p>Dashboard visar nu drift, quality och payouts i samma kontrollvy.</p>
          </div>
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
