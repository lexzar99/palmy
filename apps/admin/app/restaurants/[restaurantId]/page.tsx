/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @next/next/no-img-element */
"use client";

import { use, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { API_URL } from "@/lib/api";
import {
  ArrowLeft,
  Settings,
  Clock,
  Utensils,
  TrendingUp,
  ShoppingCart,
  ToggleLeft,
  ToggleRight,
  Save,
  Loader2,
  Crown,
  Medal,
  Award,
  EyeOff,
  Plus,
  Trash2,
  CheckCircle2,
  Sun,
  Moon,
  Coffee,
  AlertCircle,
  Package,
  CreditCard,
  Users,
  Star,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Modal, ConfirmModal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import Link from "next/link";

type Tab = "overview" | "hours" | "settings" | "orders";

const DAYS = [
  { key: "monday", label: "Måndag", short: "Mån" },
  { key: "tuesday", label: "Tisdag", short: "Tis" },
  { key: "wednesday", label: "Onsdag", short: "Ons" },
  { key: "thursday", label: "Torsdag", short: "Tor" },
  { key: "friday", label: "Fredag", short: "Fre" },
  { key: "saturday", label: "Lördag", short: "Lör" },
  { key: "sunday", label: "Söndag", short: "Sön" },
];

interface DayHours {
  open: string;
  close: string;
  closed: boolean;
  // Shift 2 (optional)
  open2?: string;
  close2?: string;
  shift2?: boolean;
}

const DEFAULT_HOURS: DayHours = {
  open: "11:00",
  close: "22:00",
  closed: false,
  shift2: false,
  open2: "17:00",
  close2: "22:00",
};

const PREMIUM_TIERS = [
  { value: 1, label: "Guld", sublabel: "Visas mest", icon: Crown, color: "text-gold-500", bg: "bg-gold-500/10 border-gold-500/30" },
  { value: 2, label: "Silver", sublabel: "Visas mycket", icon: Medal, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/30" },
  { value: 3, label: "Standard", sublabel: "Normal", icon: Award, color: "text-[var(--text-secondary)]", bg: "bg-[var(--border-subtle)] border-[var(--border-subtle)]" },
  { value: 0, label: "Dold", sublabel: "Gömd", icon: EyeOff, color: "text-rose-400", bg: "bg-rose-500/10 border-rose-500/20" },
];

export default function RestaurantHubPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = use(params);
  const router = useRouter();
  const { success, error: toastError } = useToast();

  const [tab, setTab] = useState<Tab>("overview");
  const [restaurant, setRestaurant] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Settings form
  const [form, setForm] = useState({
    deliveryFee: 0,
    minOrderAmount: 0,
    estimatedPickupTime: 20,
    estimatedDeliveryTime: 35,
    notificationSound: "signal-1",
    openingHours: DAYS.reduce(
      (acc, d) => ({ ...acc, [d.key]: { ...DEFAULT_HOURS } }),
      {} as Record<string, DayHours>
    ),
  });

  const [featuredClass, setFeaturedClass] = useState(2);
  const [isOpen, setIsOpen] = useState(true);
  const [togglingOpen, setTogglingOpen] = useState(false);

  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("matgo_token") || ""
      : "";

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [restRes, settingsRes, ordersRes] = await Promise.allSettled([
        axios.get(`${API_URL}/api/restaurants/${restaurantId}`),
        axios.get(`${API_URL}/api/settings?restaurantId=${restaurantId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(
          `${API_URL}/api/admin/orders?limit=50&restaurantId=${restaurantId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        ),
      ]);

      if (restRes.status === "fulfilled") {
        const r = restRes.value.data;
        setRestaurant(r);
        setFeaturedClass(r.featuredClass ?? 2);
        setIsOpen(r.manualIsOpen ?? r.isOpen ?? true);
      }

      if (settingsRes.status === "fulfilled") {
        const s = settingsRes.value.data;
        setSettings(s);
        setForm({
          deliveryFee: s.deliveryFee ?? 0,
          minOrderAmount: s.minOrderAmount ?? 0,
          estimatedPickupTime: s.estimatedPickupTime ?? 20,
          estimatedDeliveryTime: s.estimatedDeliveryTime ?? 35,
          notificationSound: s.notificationSound ?? "signal-1",
          openingHours: {
            ...DAYS.reduce(
              (acc, d) => ({ ...acc, [d.key]: { ...DEFAULT_HOURS } }),
              {} as Record<string, DayHours>
            ),
            ...(s.openingHours || {}),
          },
        });
      }

      if (ordersRes.status === "fulfilled") {
        setOrders(ordersRes.value.data.orders || []);
      }
    } catch (err) {
      toastError("Kunde inte ladda restaurang-data");
    } finally {
      setLoading(false);
    }
  }, [restaurantId, token]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const saveSettings = async () => {
    setSaving(true);
    try {
      await axios.patch(
        `${API_URL}/api/settings?restaurantId=${restaurantId}`,
        form,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      success("Inställningar sparade");
    } catch {
      toastError("Kunde inte spara inställningar");
    } finally {
      setSaving(false);
    }
  };

  const savePremium = async () => {
    setSaving(true);
    try {
      await axios.patch(
        `${API_URL}/api/restaurants/${restaurantId}`,
        { featuredClass },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      success("Premium-tier uppdaterad");
      setRestaurant((prev: any) => ({ ...prev, featuredClass }));
    } catch {
      toastError("Kunde inte uppdatera tier");
    } finally {
      setSaving(false);
    }
  };

  const toggleOpen = async () => {
    setTogglingOpen(true);
    try {
      const newVal = !isOpen;
      await axios.patch(
        `${API_URL}/api/restaurants/${restaurantId}`,
        { isOpen: newVal },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setIsOpen(newVal);
      success(newVal ? "Restaurangen är nu öppen" : "Restaurangen är nu stängd");
    } catch {
      toastError("Kunde inte ändra status");
    } finally {
      setTogglingOpen(false);
    }
  };

  const updateHours = (
    day: string,
    field: keyof DayHours,
    value: string | boolean
  ) => {
    setForm((prev) => ({
      ...prev,
      openingHours: {
        ...prev.openingHours,
        [day]: { ...prev.openingHours[day], [field]: value },
      },
    }));
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <Loader2 className="animate-spin text-gold-500" size={36} />
        <p className="text-[var(--text-secondary)] font-black uppercase tracking-[0.3em] text-[10px]">
          Laddar restaurang...
        </p>
      </div>
    );
  }

  if (!restaurant) {
    return (
      <div className="py-20 text-center">
        <AlertCircle size={40} className="text-rose-500 mx-auto mb-4" />
        <p className="text-[var(--text-secondary)] font-black uppercase tracking-widest text-[10px]">
          Restaurang hittades inte
        </p>
        <button
          onClick={() => router.push("/restaurants")}
          className="mt-6 px-6 py-3 bg-gold-500 text-[#0d0d0d] rounded-xl font-black uppercase tracking-widest text-[10px]"
        >
          Tillbaka
        </button>
      </div>
    );
  }

  const todayOrders = orders.filter((o) => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return new Date(o.createdAt) >= start;
  });

  const todayRevenue = todayOrders
    .filter((o) => o.status === "DELIVERED")
    .reduce((sum, o) => sum + (o.total || 0), 0);

  return (
    <div className="space-y-6 pb-24 max-w-5xl">
      {/* Back + header */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => router.push("/restaurants")}
          className="w-9 h-9 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all shrink-0 mt-1"
        >
          <ArrowLeft size={15} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-black uppercase tracking-tight text-[var(--text-primary)]">
              {restaurant.name}
            </h1>
            {(() => {
              const tier = PREMIUM_TIERS.find((t) => t.value === featuredClass) || PREMIUM_TIERS[1];
              const Icon = tier.icon;
              return (
                <span className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[9px] font-black uppercase ${tier.bg} ${tier.color}`}>
                  <Icon size={10} /> {tier.label}
                </span>
              );
            })()}
            <button
              onClick={toggleOpen}
              disabled={togglingOpen}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border text-[9px] font-black uppercase transition-all ${
                isOpen
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20"
                  : "bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500/20"
              } ${togglingOpen ? "opacity-50" : ""}`}
            >
              {isOpen ? <ToggleRight size={12} /> : <ToggleLeft size={12} />}
              {isOpen ? "Öppen" : "Stängd"}
            </button>
          </div>
          <p className="text-[var(--text-secondary)] text-[9px] font-bold uppercase tracking-widest mt-0.5">
            {restaurant.cuisine || "—"} · {restaurant.city || "—"}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl w-fit">
        {(
          [
            { id: "overview", label: "Översikt", icon: TrendingUp },
            { id: "hours", label: "Öppettider", icon: Clock },
            { id: "settings", label: "Inställningar", icon: Settings },
            { id: "orders", label: "Ordrar", icon: ShoppingCart },
          ] as const
        ).map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                tab === t.id
                  ? "bg-gold-500 text-[#0d0d0d]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <Icon size={13} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        {tab === "overview" && (
          <motion.div
            key="overview"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="space-y-5"
          >
            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: "Ordrar idag", value: todayOrders.length, icon: ShoppingCart, color: "text-blue-400" },
                { label: "Omsättning idag", value: `${Math.round(todayRevenue / 100)} kr`, icon: CreditCard, color: "text-gold-500" },
                { label: "Rating", value: (restaurant.rating ?? 4.6).toFixed(1), icon: Star, color: "text-amber-400" },
                { label: "Leveransavgift", value: `${settings?.deliveryFee ?? 0} kr`, icon: Package, color: "text-emerald-400" },
              ].map((s) => {
                const Icon = s.icon;
                return (
                  <div
                    key={s.label}
                    className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <Icon size={16} className={s.color} />
                    </div>
                    <div className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-1">
                      {s.label}
                    </div>
                    <div className={`text-xl font-black ${s.color}`}>{s.value}</div>
                  </div>
                );
              })}
            </div>

            {/* Premium tier control */}
            <div className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
              <h3 className="text-[11px] font-black uppercase tracking-widest text-[var(--text-primary)] mb-4 flex items-center gap-2">
                <Crown size={15} className="text-gold-500" /> Premium Tier
              </h3>
              <div className="grid grid-cols-3 gap-3 mb-4">
                {PREMIUM_TIERS.map((tier) => {
                  const Icon = tier.icon;
                  const active = featuredClass === tier.value;
                  return (
                    <button
                      key={tier.value}
                      onClick={() => setFeaturedClass(tier.value)}
                      className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${
                        active ? `${tier.bg} shadow-md` : "border-[var(--border-subtle)] bg-[var(--bg-primary)] hover:border-[var(--border-subtle)]"
                      }`}
                    >
                      <Icon size={20} className={active ? tier.color : "text-[var(--text-secondary)]"} />
                      <span className={`text-[9px] font-black uppercase tracking-widest ${active ? tier.color : "text-[var(--text-secondary)]"}`}>
                        {tier.label}
                      </span>
                    </button>
                  );
                })}
              </div>
              <button
                onClick={savePremium}
                disabled={saving}
                className="w-full py-3 bg-gold-500 hover:bg-gold-400 text-[#0d0d0d] font-black uppercase tracking-widest text-[10px] rounded-xl transition-all shadow-lg shadow-gold-500/20"
              >
                {saving ? "Sparar..." : "Spara tier"}
              </button>
            </div>

            {/* Recent orders */}
            <div className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
              <h3 className="text-[11px] font-black uppercase tracking-widest text-[var(--text-primary)] mb-4">
                Senaste ordrar (idag)
              </h3>
              {todayOrders.length === 0 ? (
                <p className="text-center text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] py-8 opacity-30">
                  Inga ordrar idag
                </p>
              ) : (
                <div className="space-y-2">
                  {todayOrders.slice(0, 8).map((o) => (
                    <div
                      key={o.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)]"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-[9px] font-black text-[var(--text-secondary)]">
                          #{o.orderNumber}
                        </span>
                        <span className="text-[10px] font-black uppercase text-[var(--text-primary)]">
                          {o.customerName}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-gold-500">
                          {Math.round((o.total || 0) / 100)} kr
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[7px] font-black uppercase border ${
                            o.status === "DELIVERED"
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                              : o.status === "PENDING"
                              ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                              : "bg-[var(--border-subtle)] text-[var(--text-secondary)] border-[var(--border-subtle)]"
                          }`}
                        >
                          {o.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {tab === "hours" && (
          <motion.div
            key="hours"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[13px] font-black uppercase tracking-tight text-[var(--text-primary)]">
                  Öppettider
                </h2>
                <p className="text-[9px] text-[var(--text-secondary)] font-bold uppercase tracking-widest mt-0.5">
                  Ange upp till 2 skift per dag
                </p>
              </div>
              <button
                onClick={saveSettings}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 bg-gold-500 hover:bg-gold-400 text-[#0d0d0d] font-black uppercase tracking-widest text-[10px] rounded-xl shadow-lg shadow-gold-500/20 transition-all"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Spara
              </button>
            </div>

            <div className="space-y-2">
              {DAYS.map((day) => {
                const hours: DayHours = form.openingHours[day.key] || { ...DEFAULT_HOURS };
                return (
                  <div
                    key={day.key}
                    className={`rounded-2xl border transition-all ${
                      hours.closed
                        ? "border-[var(--border-subtle)] bg-[var(--bg-secondary)] opacity-60"
                        : "border-[var(--border-subtle)] bg-[var(--bg-secondary)]"
                    }`}
                  >
                    <div className="flex items-center gap-4 p-4">
                      {/* Day name */}
                      <div className="w-20 shrink-0">
                        <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-primary)]">
                          {day.label}
                        </p>
                        <p className="text-[8px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mt-0.5">
                          Skift 1
                        </p>
                      </div>

                      {/* Shift 1 */}
                      <div className="flex items-center gap-2 flex-1">
                        <div className="flex items-center gap-1.5 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-3 py-2">
                          <Sun size={11} className="text-amber-400" />
                          <input
                            type="time"
                            value={hours.open}
                            disabled={hours.closed}
                            onChange={(e) => updateHours(day.key, "open", e.target.value)}
                            className="bg-transparent text-[11px] font-black outline-none disabled:opacity-30 w-[70px]"
                          />
                        </div>
                        <span className="text-[var(--text-secondary)] text-xs font-black">–</span>
                        <div className="flex items-center gap-1.5 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-3 py-2">
                          <Moon size={11} className="text-blue-400" />
                          <input
                            type="time"
                            value={hours.close}
                            disabled={hours.closed}
                            onChange={(e) => updateHours(day.key, "close", e.target.value)}
                            className="bg-transparent text-[11px] font-black outline-none disabled:opacity-30 w-[70px]"
                          />
                        </div>
                      </div>

                      {/* Shift 2 toggle */}
                      <button
                        onClick={() => updateHours(day.key, "shift2", !hours.shift2)}
                        disabled={hours.closed}
                        className={`px-2.5 py-1.5 rounded-lg border text-[8px] font-black uppercase tracking-widest transition-all ${
                          hours.shift2
                            ? "bg-sky-500/10 border-sky-500/20 text-sky-400"
                            : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-sky-500/20"
                        } disabled:opacity-30`}
                      >
                        {hours.shift2 ? "2 skift" : "+ Skift 2"}
                      </button>

                      {/* Closed toggle */}
                      <button
                        onClick={() => updateHours(day.key, "closed", !hours.closed)}
                        className={`px-2.5 py-1.5 rounded-lg border text-[8px] font-black uppercase tracking-widest transition-all ${
                          hours.closed
                            ? "bg-rose-500/10 border-rose-500/20 text-rose-400"
                            : "bg-emerald-500/8 border-emerald-500/20 text-emerald-400 hover:border-rose-500/20"
                        }`}
                      >
                        {hours.closed ? "Stängd" : "Öppen"}
                      </button>
                    </div>

                    {/* Shift 2 */}
                    {hours.shift2 && !hours.closed && (
                      <div className="flex items-center gap-4 px-4 pb-4">
                        <div className="w-20 shrink-0">
                          <p className="text-[8px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">
                            Skift 2
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1.5 bg-[var(--bg-primary)] border border-sky-500/20 rounded-xl px-3 py-2">
                            <Coffee size={11} className="text-sky-400" />
                            <input
                              type="time"
                              value={hours.open2 || "17:00"}
                              onChange={(e) => updateHours(day.key, "open2", e.target.value)}
                              className="bg-transparent text-[11px] font-black outline-none w-[70px]"
                            />
                          </div>
                          <span className="text-[var(--text-secondary)] text-xs font-black">–</span>
                          <div className="flex items-center gap-1.5 bg-[var(--bg-primary)] border border-sky-500/20 rounded-xl px-3 py-2">
                            <Moon size={11} className="text-sky-400" />
                            <input
                              type="time"
                              value={hours.close2 || "22:00"}
                              onChange={(e) => updateHours(day.key, "close2", e.target.value)}
                              className="bg-transparent text-[11px] font-black outline-none w-[70px]"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              onClick={saveSettings}
              disabled={saving}
              className="w-full py-4 bg-gold-500 hover:bg-gold-400 text-[#0d0d0d] font-black uppercase tracking-widest text-[11px] rounded-xl shadow-lg shadow-gold-500/20 transition-all"
            >
              {saving ? "Sparar..." : "Spara öppettider"}
            </button>
          </motion.div>
        )}

        {tab === "settings" && (
          <motion.div
            key="settings"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="space-y-5"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-[13px] font-black uppercase tracking-tight text-[var(--text-primary)]">
                Leverans & Tider
              </h2>
              <button
                onClick={saveSettings}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 bg-gold-500 hover:bg-gold-400 text-[#0d0d0d] font-black uppercase tracking-widest text-[10px] rounded-xl shadow-lg shadow-gold-500/20 transition-all"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Spara
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Leveransavgift (kr)", key: "deliveryFee" },
                { label: "Minsta order (kr)", key: "minOrderAmount" },
                { label: "Avhämtningstid (min)", key: "estimatedPickupTime" },
                { label: "Leveranstid (min)", key: "estimatedDeliveryTime" },
              ].map((f) => (
                <div
                  key={f.key}
                  className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]"
                >
                  <label className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-2">
                    {f.label}
                  </label>
                  <input
                    type="number"
                    value={(form as any)[f.key]}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, [f.key]: Number(e.target.value) }))
                    }
                    className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-lg font-black outline-none focus:border-gold-500/30 text-gold-500"
                  />
                </div>
              ))}
            </div>

            {/* Quick links */}
            <div className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
              <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-3">
                Snabblänkar
              </p>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/menu/${restaurantId}`}
                  className="px-4 py-2 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] hover:text-gold-500 hover:border-gold-500/20 transition-all flex items-center gap-1.5"
                >
                  <Utensils size={12} /> Redigera meny
                </Link>
              </div>
            </div>
          </motion.div>
        )}

        {tab === "orders" && (
          <motion.div
            key="orders"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="space-y-3"
          >
            <h2 className="text-[13px] font-black uppercase tracking-tight text-[var(--text-primary)]">
              Alla ordrar ({orders.length})
            </h2>
            {orders.length === 0 ? (
              <div className="py-16 text-center rounded-2xl border border-dashed border-[var(--border-subtle)]">
                <ShoppingCart size={32} className="text-[var(--text-secondary)] opacity-20 mx-auto mb-3" />
                <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] opacity-30">
                  Inga ordrar hittades
                </p>
              </div>
            ) : (
              orders.map((o) => (
                <div
                  key={o.id}
                  className="flex items-center justify-between p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] flex items-center justify-center text-[9px] font-black text-[var(--text-secondary)]">
                      #{o.orderNumber}
                    </div>
                    <div>
                      <p className="text-[11px] font-black uppercase text-[var(--text-primary)]">
                        {o.customerName}
                      </p>
                      <p className="text-[9px] font-bold text-[var(--text-secondary)]">
                        {new Date(o.createdAt).toLocaleString("sv-SE", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-black text-gold-500">
                      {Math.round((o.total || 0) / 100)} kr
                    </span>
                    <span
                      className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase border ${
                        o.status === "DELIVERED"
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : o.status === "PENDING"
                          ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                          : o.status === "CANCELLED" || o.status === "REJECTED"
                          ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                          : "bg-[var(--border-subtle)] text-[var(--text-secondary)] border-[var(--border-subtle)]"
                      }`}
                    >
                      {o.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
