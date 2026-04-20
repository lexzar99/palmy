"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { useSearchParams } from "next/navigation";
import {
  Building2,
  Clock3,
  Loader2,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Store,
  Truck,
} from "lucide-react";
import { API_URL } from "@/lib/api";
import { getStoredToken } from "@/lib/auth-storage";
import { useControlCenter } from "@/lib/use-control-center";
import { useToast } from "@/components/Toast";

type DayHours = {
  open: string;
  close: string;
  closed: boolean;
  open2?: string;
  close2?: string;
  shift2?: boolean;
};

type RestaurantDetail = {
  id: string;
  name: string;
  slug: string;
  city?: string | null;
  description?: string | null;
  adminEmail?: string | null;
  deliveryFee: number;
  minOrderAmount: number;
  etaMinutes: number;
  manualIsOpen?: boolean;
  openingHours?: Record<string, DayHours>;
};

const DAYS = [
  { key: "monday", label: "Måndag" },
  { key: "tuesday", label: "Tisdag" },
  { key: "wednesday", label: "Onsdag" },
  { key: "thursday", label: "Torsdag" },
  { key: "friday", label: "Fredag" },
  { key: "saturday", label: "Lördag" },
  { key: "sunday", label: "Söndag" },
] as const;

const DEFAULT_HOURS: DayHours = {
  open: "11:00",
  close: "21:00",
  closed: false,
  shift2: false,
  open2: "17:00",
  close2: "21:00",
};

const currency = (value: number) => `${Math.round(value).toLocaleString("sv-SE")} kr`;

export default function RestaurantOpsPage() {
  const searchParams = useSearchParams();
  const initialRestaurantId = searchParams.get("restaurantId");
  const { data, loading, error, refresh } = useControlCenter();
  const { success, error: toastError } = useToast();
  const [search, setSearch] = useState("");
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string | null>(initialRestaurantId);
  const [detail, setDetail] = useState<RestaurantDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [hoursSaving, setHoursSaving] = useState(false);
  const [form, setForm] = useState({
    adminEmail: "",
    deliveryFee: 0,
    minOrderAmount: 0,
    etaMinutes: 30,
  });
  const [openingHours, setOpeningHours] = useState<Record<string, DayHours>>(
    DAYS.reduce((acc, day) => ({ ...acc, [day.key]: { ...DEFAULT_HOURS } }), {})
  );

  useEffect(() => {
    if (!data?.restaurantSnapshots.length) return;

    const hasRequestedRestaurant = initialRestaurantId
      ? data.restaurantSnapshots.some((restaurant) => restaurant.id === initialRestaurantId)
      : false;

    setSelectedRestaurantId((current) => current || (hasRequestedRestaurant ? initialRestaurantId : data.restaurantSnapshots[0].id));
  }, [data?.restaurantSnapshots, initialRestaurantId]);

  useEffect(() => {
    const token = getStoredToken();
    if (!selectedRestaurantId || !token) return;

    const loadRestaurant = async () => {
      setDetailLoading(true);
      setDetailError(null);

      try {
        const response = await axios.get(`${API_URL}/api/restaurants/${selectedRestaurantId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const restaurant = response.data as RestaurantDetail;
        setDetail(restaurant);
        setForm({
          adminEmail: restaurant.adminEmail || "",
          deliveryFee: restaurant.deliveryFee || 0,
          minOrderAmount: restaurant.minOrderAmount || 0,
          etaMinutes: restaurant.etaMinutes || 30,
        });
        setOpeningHours(
          DAYS.reduce(
            (acc, day) => ({
              ...acc,
              [day.key]: restaurant.openingHours?.[day.key] ? { ...DEFAULT_HOURS, ...restaurant.openingHours[day.key] } : { ...DEFAULT_HOURS },
            }),
            {} as Record<string, DayHours>
          )
        );
      } catch (err: any) {
        setDetailError(err.response?.data?.error || "Kunde inte ladda restaurangens hub-data.");
      } finally {
        setDetailLoading(false);
      }
    };

    void loadRestaurant();
  }, [selectedRestaurantId]);

  const restaurants = useMemo(() => {
    if (!data) return [];

    return data.restaurantSnapshots.filter((restaurant) => {
      if (!search.trim()) return true;
      const query = search.toLowerCase();
      return restaurant.name.toLowerCase().includes(query) || (restaurant.city || "").toLowerCase().includes(query);
    });
  }, [data, search]);

  const activeSnapshot = data?.restaurantSnapshots.find((restaurant) => restaurant.id === selectedRestaurantId) || null;

  const saveCoreSettings = async () => {
    if (!selectedRestaurantId) return;

    const token = getStoredToken();
    if (!token) return;

    setSaving(true);
    try {
      await axios.patch(
        `${API_URL}/api/restaurants/${selectedRestaurantId}`,
        {
          adminEmail: form.adminEmail || null,
          deliveryFee: form.deliveryFee,
          minOrderAmount: form.minOrderAmount,
          etaMinutes: form.etaMinutes,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      await refresh();
      success("Driftinställningarna sparades.");
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte spara driftinställningarna.");
    } finally {
      setSaving(false);
    }
  };

  const saveHours = async () => {
    if (!selectedRestaurantId) return;

    const token = getStoredToken();
    if (!token) return;

    setHoursSaving(true);
    try {
      await axios.patch(
        `${API_URL}/api/restaurants/${selectedRestaurantId}`,
        { openingHours },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      await refresh();
      success("Öppettiderna uppdaterades.");
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte spara öppettiderna.");
    } finally {
      setHoursSaving(false);
    }
  };

  const toggleOpen = async () => {
    if (!selectedRestaurantId || !activeSnapshot) return;

    const token = getStoredToken();
    if (!token) return;

    setSaving(true);
    try {
      await axios.patch(
        `${API_URL}/api/restaurants/${selectedRestaurantId}`,
        { isOpen: !activeSnapshot.manualIsOpen },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      await refresh();
      success(activeSnapshot.manualIsOpen ? "Restaurangen markerades som stängd." : "Restaurangen markerades som öppen.");
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte ändra öppetstatus.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="panel flex min-h-[360px] items-center justify-center rounded-[32px] px-6 py-12">
        <div className="flex items-center gap-3 text-[var(--text-secondary)]">
          <Loader2 className="animate-spin text-amber-200" size={18} />
          <span className="text-sm font-bold">Laddar restauranghubben…</span>
        </div>
      </div>
    );
  }

  if (!data || error) {
    return (
      <div className="panel flex min-h-[360px] flex-col items-center justify-center gap-4 rounded-[32px] px-6 py-12 text-center">
        <Store size={34} className="text-amber-200" />
        <h2 className="text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">Restauranghubben kunde inte laddas</h2>
        <p className="max-w-xl text-sm leading-6 text-[var(--text-secondary)]">{error || "Något gick fel när restauranghubben skulle laddas."}</p>
        <button type="button" onClick={() => void refresh()} className="inline-flex items-center gap-2 rounded-2xl bg-gold-gradient px-5 py-3 text-[11px] font-black uppercase tracking-[0.24em] text-[#091018]">
          <RefreshCw size={14} /> Försök igen
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-5 pb-16 2xl:grid-cols-[0.82fr_1.18fr]">
      <section className="panel rounded-[32px] px-6 py-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">Central restaurangdrift</p>
            <h3 className="mt-2 text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">Öppettider är flyttade hit</h3>
          </div>
          <button type="button" onClick={() => void refresh()} className="control-chip">
            <RefreshCw size={13} /> Synka
          </button>
        </div>

        <div className="relative mt-5">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Sök restaurang eller stad"
            className="control-input pl-10"
          />
        </div>

        <div className="mt-5 grid gap-3">
          {restaurants.map((restaurant) => (
            <button
              key={restaurant.id}
              type="button"
              onClick={() => setSelectedRestaurantId(restaurant.id)}
              className={`rounded-[28px] border px-5 py-5 text-left transition ${
                selectedRestaurantId === restaurant.id
                  ? "border-amber-300/22 bg-amber-300/10"
                  : "border-[var(--border-subtle)] bg-[var(--panel-muted)]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xl font-black tracking-[-0.04em] text-[var(--text-primary)]">{restaurant.name}</p>
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">{restaurant.city || "Ingen stad"} • {restaurant.featuredLabel}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${restaurant.isOpen ? "bg-emerald-300/12 text-emerald-100" : "bg-rose-300/12 text-rose-100"}`}>
                  {restaurant.isOpen ? "Öppet" : "Stängt"}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-[var(--text-secondary)]">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Idag</p>
                  <p className="mt-1 font-black text-[var(--text-primary)]">{currency(restaurant.todayRevenue)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Kö</p>
                  <p className="mt-1 font-black text-[var(--text-primary)]">{restaurant.pendingOrders} väntande</p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <span className="control-chip">Focus: {restaurant.focus}</span>
                <span className="control-chip">Payout {currency(restaurant.payoutEstimate)}</span>
                <span className="control-chip">Rating {restaurant.reviewScore.toFixed(1)}</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="panel rounded-[32px] px-6 py-6">
        {detailLoading ? (
          <div className="flex min-h-[420px] items-center justify-center rounded-[28px] border border-[var(--border-subtle)] bg-[var(--panel-muted)]">
            <Loader2 className="animate-spin text-amber-200" size={18} />
          </div>
        ) : detailError || !detail || !activeSnapshot ? (
          <div className="rounded-[28px] border border-rose-300/18 bg-rose-300/10 px-5 py-5 text-sm leading-6 text-rose-100">
            {detailError || "Välj en restaurang för att öppna den centrala hubben."}
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">Vald restaurang</p>
                <h3 className="mt-2 text-3xl font-black tracking-[-0.05em] text-[var(--text-primary)]">{detail.name}</h3>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
                  Här styr du öppettider, ETA, minorder, leveransavgift och admin-alias centralt. Själva restaurangsidan kan nu fokusera på profil och rapport.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={toggleOpen}
                  disabled={saving}
                  className={`rounded-2xl px-4 py-3 text-[11px] font-black uppercase tracking-[0.22em] ${
                    activeSnapshot.manualIsOpen ? "bg-emerald-300/12 text-emerald-100" : "bg-rose-300/12 text-rose-100"
                  }`}
                >
                  {saving ? "Sparar..." : activeSnapshot.manualIsOpen ? "Markera stängd" : "Markera öppen"}
                </button>
                <Link href={`/restaurants/${detail.id}`} className="control-chip">
                  <Building2 size={13} /> Detaljsida
                </Link>
                <Link href={`/menu/${detail.id}`} className="control-chip">
                  <Truck size={13} /> Meny
                </Link>
                <Link href={`/finance`} className="control-chip">
                  <ShieldCheck size={13} /> Finance HQ
                </Link>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-4">
              {[
                { label: "Idag", value: currency(activeSnapshot.todayRevenue), sub: `${activeSnapshot.todayOrders} ordrar` },
                { label: "Livekö", value: String(activeSnapshot.liveOrders), sub: `${activeSnapshot.pendingOrders} väntande` },
                { label: "Månad", value: currency(activeSnapshot.monthRevenue), sub: `Payout ${currency(activeSnapshot.payoutEstimate)}` },
                { label: "Kvalitet", value: activeSnapshot.reviewScore.toFixed(1), sub: `${activeSnapshot.reviewCount} review-grundade signaler` },
              ].map((metric) => (
                <div key={metric.label} className="metric-card panel-muted">
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[var(--text-muted)]">{metric.label}</p>
                  <p className="mt-3 text-3xl font-black tracking-[-0.05em] text-[var(--text-primary)]">{metric.value}</p>
                  <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{metric.sub}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-5 xl:grid-cols-[0.84fr_1.16fr]">
              <div className="space-y-5">
                <div className="rounded-[28px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-5 py-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Driftinställningar</p>
                      <p className="mt-1 text-xl font-black tracking-[-0.03em] text-[var(--text-primary)]">ETA, minorder och admin-alias</p>
                    </div>
                    <button type="button" onClick={saveCoreSettings} disabled={saving} className="inline-flex items-center gap-2 rounded-2xl bg-gold-gradient px-4 py-3 text-[11px] font-black uppercase tracking-[0.22em] text-[#091018]">
                      <Save size={13} /> {saving ? "Sparar" : "Spara"}
                    </button>
                  </div>

                  <div className="mt-5 grid gap-4">
                    <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)]">
                      <span>Admin-alias för login</span>
                      <input value={form.adminEmail} onChange={(event) => setForm((previous) => ({ ...previous, adminEmail: event.target.value }))} className="control-input" placeholder="t.ex. palmyra@partner.matgo" />
                    </label>
                    <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)]">
                      <span>Leveransavgift</span>
                      <input type="number" value={form.deliveryFee} onChange={(event) => setForm((previous) => ({ ...previous, deliveryFee: Number(event.target.value) }))} className="control-input" />
                    </label>
                    <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)]">
                      <span>Minsta order</span>
                      <input type="number" value={form.minOrderAmount} onChange={(event) => setForm((previous) => ({ ...previous, minOrderAmount: Number(event.target.value) }))} className="control-input" />
                    </label>
                    <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)]">
                      <span>Standard-ETA</span>
                      <input type="number" value={form.etaMinutes} onChange={(event) => setForm((previous) => ({ ...previous, etaMinutes: Number(event.target.value) }))} className="control-input" />
                    </label>
                  </div>
                </div>

                <div className="rounded-[28px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-5 py-5">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Signalspanel</p>
                  <div className="mt-4 grid gap-2">
                    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm leading-6 text-[var(--text-secondary)]">
                      Focus just nu: <span className="font-black text-[var(--text-primary)]">{activeSnapshot.focus}</span>
                    </div>
                    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm leading-6 text-[var(--text-secondary)]">
                      Login-alias: <span className="font-black text-[var(--text-primary)]">{activeSnapshot.adminEmail || "Saknas"}</span>
                    </div>
                    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm leading-6 text-[var(--text-secondary)]">
                      Nästa utbetalning: <span className="font-black text-amber-200">{currency(activeSnapshot.payoutEstimate)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-5 py-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Öppettids-hub</p>
                    <p className="mt-1 text-xl font-black tracking-[-0.03em] text-[var(--text-primary)]">Veckoschema</p>
                  </div>
                  <button type="button" onClick={saveHours} disabled={hoursSaving} className="inline-flex items-center gap-2 rounded-2xl bg-gold-gradient px-4 py-3 text-[11px] font-black uppercase tracking-[0.22em] text-[#091018]">
                    <Clock3 size={13} /> {hoursSaving ? "Sparar" : "Spara schema"}
                  </button>
                </div>

                <div className="mt-5 grid gap-3">
                  {DAYS.map((day) => {
                    const current = openingHours[day.key] || DEFAULT_HOURS;
                    return (
                      <div key={day.key} className="rounded-[24px] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-4 py-4">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                          <div>
                            <p className="text-base font-black tracking-[-0.03em] text-[var(--text-primary)]">{day.label}</p>
                            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">
                              {current.closed ? "Stängd" : `${current.open} - ${current.close}`}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setOpeningHours((previous) => ({ ...previous, [day.key]: { ...current, closed: !current.closed } }))}
                            className={`rounded-full px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] ${current.closed ? "bg-rose-300/12 text-rose-100" : "bg-emerald-300/12 text-emerald-100"}`}
                          >
                            {current.closed ? "Stängd" : "Öppen"}
                          </button>
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <input type="time" value={current.open} disabled={current.closed} onChange={(event) => setOpeningHours((previous) => ({ ...previous, [day.key]: { ...current, open: event.target.value } }))} className="control-input" />
                          <input type="time" value={current.close} disabled={current.closed} onChange={(event) => setOpeningHours((previous) => ({ ...previous, [day.key]: { ...current, close: event.target.value } }))} className="control-input" />
                          <input type="time" value={current.open2 || "17:00"} disabled={current.closed || !current.shift2} onChange={(event) => setOpeningHours((previous) => ({ ...previous, [day.key]: { ...current, open2: event.target.value } }))} className="control-input" />
                          <input type="time" value={current.close2 || "21:00"} disabled={current.closed || !current.shift2} onChange={(event) => setOpeningHours((previous) => ({ ...previous, [day.key]: { ...current, close2: event.target.value } }))} className="control-input" />
                        </div>

                        <label className="mt-4 inline-flex items-center gap-3 text-sm font-bold text-[var(--text-secondary)]">
                          <input
                            type="checkbox"
                            checked={Boolean(current.shift2)}
                            disabled={current.closed}
                            onChange={(event) => setOpeningHours((previous) => ({ ...previous, [day.key]: { ...current, shift2: event.target.checked } }))}
                          />
                          Extra kvällspass
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
