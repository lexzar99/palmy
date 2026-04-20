 
 
"use client";

import { use, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { API_URL } from "@/lib/api";
import {
  ArrowLeft, Settings, Clock, Utensils, TrendingUp, ShoppingCart,
  ToggleLeft, ToggleRight, Save, Loader2, Crown, Medal, Award, EyeOff,
  Sun, Moon, Coffee, AlertCircle, Package, CreditCard, Star, User,
  MapPin, Phone, Globe, Lock, FileText, Building, Upload, ImageIcon,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/components/Toast";
import Link from "next/link";

type Tab = "profil" | "admin" | "hours" | "settings" | "orders" | "report";

const DAYS = [
  { key: "monday", label: "Måndag" },
  { key: "tuesday", label: "Tisdag" },
  { key: "wednesday", label: "Onsdag" },
  { key: "thursday", label: "Torsdag" },
  { key: "friday", label: "Fredag" },
  { key: "saturday", label: "Lördag" },
  { key: "sunday", label: "Söndag" },
];

interface DayHours {
  open: string; close: string; closed: boolean;
  open2?: string; close2?: string; shift2?: boolean;
}

const DEFAULT_HOURS: DayHours = { open: "11:00", close: "22:00", closed: false, shift2: false, open2: "17:00", close2: "22:00" };

const PREMIUM_TIERS = [
  { value: 1, label: "Guld", sublabel: "Visas mest", icon: Crown, color: "text-gold-500", bg: "bg-gold-500/10 border-gold-500/30" },
  { value: 2, label: "Silver", sublabel: "Visas mycket", icon: Medal, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/30" },
  { value: 3, label: "Standard", sublabel: "Normal", icon: Award, color: "text-[var(--text-secondary)]", bg: "bg-[var(--border-subtle)] border-[var(--border-subtle)]" },
  { value: 0, label: "Dold", sublabel: "Gömd", icon: EyeOff, color: "text-rose-400", bg: "bg-rose-500/10 border-rose-500/20" },
];

const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: "profil", label: "Profil", icon: Building },
  { id: "admin", label: "Admin-konto", icon: Lock },
  { id: "hours", label: "Öppettider", icon: Clock },
  { id: "settings", label: "Leverans & ETA", icon: Settings },
  { id: "orders", label: "Ordrar", icon: ShoppingCart },
  { id: "report", label: "Rapport / PDF", icon: TrendingUp },
];

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-1.5">{label}</label>
    {children}
  </div>
);

const inputCls = "w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-gold-500/30 transition-all placeholder:opacity-30";

export default function RestaurantHubPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = use(params);
  const router = useRouter();
  const { success, error: toastError } = useToast();

  const [tab, setTab] = useState<Tab>("profil");
  const [restaurant, setRestaurant] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [profile, setProfile] = useState({
    name: "", description: "", cuisine: "", address: "", city: "", zip: "",
    phone: "", imageUrl: "", heroImageUrl: "", internalInfo: "",
    latitude: "", longitude: "",
  });

  // Admin credentials form
  const [adminForm, setAdminForm] = useState({ adminPassword: "", adminEmail: "" });

  // Opening hours
  const [openingHours, setOpeningHours] = useState<Record<string, DayHours>>(
    DAYS.reduce((acc, d) => ({ ...acc, [d.key]: { ...DEFAULT_HOURS } }), {})
  );

  // Delivery & ETA
  // deliveryFee, minOrderAmount, deliveryRadius are now managed per-zone in Stadshantering
  const [deliveryForm, setDeliveryForm] = useState({
    deliveryFee: 0, minOrderAmount: 0, etaMinutes: 30,
  });

  // Tier & open status
  const [featuredClass, setFeaturedClass] = useState(3);
  const [isOpen, setIsOpen] = useState(true);
  const [togglingOpen, setTogglingOpen] = useState(false);
  const [uploadingImage, setUploadingImage] = useState<"imageUrl" | "heroImageUrl" | null>(null);

  const token = typeof window !== "undefined" ? localStorage.getItem("matgo_token") || "" : "";

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [restRes, ordersRes] = await Promise.allSettled([
        axios.get(`${API_URL}/api/restaurants/${restaurantId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(`${API_URL}/api/admin/orders?limit=100&restaurantId=${restaurantId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (restRes.status === "fulfilled") {
        const r = restRes.value.data;
        setRestaurant(r);
        setFeaturedClass(r.featuredClass ?? 3);
        setIsOpen(r.manualIsOpen ?? r.isOpen ?? true);

        setProfile({
          name: r.name || "",
          description: r.description || "",
          cuisine: r.cuisine || "",
          address: r.address || "",
          city: r.city || "",
          zip: r.zip || "",
          phone: r.phone || "",
          imageUrl: r.imageUrl || "",
          heroImageUrl: r.heroImageUrl || "",
          internalInfo: r.internalInfo || "",
          latitude: r.latitude ? String(r.latitude) : "",
          longitude: r.longitude ? String(r.longitude) : "",
        });

        setDeliveryForm({
          deliveryFee: r.deliveryFee ?? 0,
          minOrderAmount: r.minOrderAmount ?? 0,
          etaMinutes: r.baseEtaMinutes ?? r.etaMinutes ?? 30, // use raw stored value
        });

        const hours = r.openingHours || {};
        setOpeningHours(
          DAYS.reduce((acc, d) => ({
            ...acc,
            [d.key]: hours[d.key] ? { ...DEFAULT_HOURS, ...hours[d.key] } : { ...DEFAULT_HOURS },
          }), {})
        );
        
        setAdminForm({ adminPassword: "", adminEmail: r.adminEmail || "" });
      }

      if (ordersRes.status === "fulfilled") {
        setOrders(ordersRes.value.data.orders || []);
      }
    } catch {
      toastError("Kunde inte ladda restaurang-data");
    } finally {
      setLoading(false);
    }
  }, [restaurantId, token]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const uploadImage = async (file: File, field: "imageUrl" | "heroImageUrl") => {
    setUploadingImage(field);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await axios.post(`${API_URL}/api/admin/upload`, formData, {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "multipart/form-data" },
      });
      setProfile((p) => ({ ...p, [field]: res.data.url }));
      success("Bild uppladdad");
    } catch {
      toastError("Kunde inte ladda upp bilden");
    } finally {
      setUploadingImage(null);
    }
  };

  // Generic patch helper - saves to PATCH /api/restaurants/:id (syncs with webapp via socket)
  const patchRestaurant = async (data: any) => {
    setSaving(true);
    try {
      await axios.patch(`${API_URL}/api/restaurants/${restaurantId}`, data, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return true;
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte spara");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveProfile = async () => {
    const payload = {
      ...profile,
      latitude: profile.latitude ? parseFloat(profile.latitude) : null,
      longitude: profile.longitude ? parseFloat(profile.longitude) : null,
    };
    const ok = await patchRestaurant(payload);
    if (ok) { success("Profil sparad"); setRestaurant((p: any) => ({ ...p, ...payload })); }
  };

  const saveAdminCredentials = async () => {
    if (adminForm.adminPassword && adminForm.adminPassword.length < 6) {
      toastError("Lösenordet måste vara minst 6 tecken");
      return;
    }
    const ok = await patchRestaurant({ 
      adminPassword: adminForm.adminPassword || undefined,
      adminEmail: adminForm.adminEmail || undefined,
    });
    if (ok) { 
      success("Admin-uppgifter uppdaterades"); 
      setAdminForm((p) => ({ ...p, adminPassword: "" })); 
    }
  };

  const saveOpeningHours = async () => {
    const ok = await patchRestaurant({ openingHours });
    if (ok) success("Öppettider sparade och synkade med appen");
  };

  const saveDelivery = async () => {
    const ok = await patchRestaurant(deliveryForm);
    if (ok) { success("Leveransinställningar sparade och synkade"); setRestaurant((p: any) => ({ ...p, ...deliveryForm })); }
  };

  const saveTier = async () => {
    const ok = await patchRestaurant({ featuredClass });
    if (ok) { success("Premium-tier uppdaterad"); setRestaurant((p: any) => ({ ...p, featuredClass })); }
  };

  const toggleOpen = async () => {
    setTogglingOpen(true);
    try {
      const newVal = !isOpen;
      await axios.patch(`${API_URL}/api/restaurants/${restaurantId}`, { isOpen: newVal }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setIsOpen(newVal);
      success(newVal ? "Restaurangen är nu öppen" : "Restaurangen är nu stängd");
    } catch {
      toastError("Kunde inte ändra status");
    } finally {
      setTogglingOpen(false);
    }
  };

  const updateHours = (day: string, field: keyof DayHours, value: string | boolean) => {
    setOpeningHours((prev) => ({ ...prev, [day]: { ...prev[day], [field]: value } }));
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <Loader2 className="animate-spin text-gold-500" size={36} />
        <p className="text-[var(--text-secondary)] font-black uppercase tracking-[0.3em] text-[10px]">Laddar restaurang...</p>
      </div>
    );
  }

  if (!restaurant) {
    return (
      <div className="py-20 text-center">
        <AlertCircle size={40} className="text-rose-500 mx-auto mb-4" />
        <p className="text-[var(--text-secondary)] font-black uppercase tracking-widest text-[10px]">Restaurang hittades inte</p>
        <button onClick={() => router.push("/restaurants")}
          className="mt-6 px-6 py-3 bg-gold-500 text-[#0d0d0d] rounded-xl font-black uppercase tracking-widest text-[10px]">
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

  const currentTier = PREMIUM_TIERS.find((t) => t.value === featuredClass) || PREMIUM_TIERS[2];
  const TierIcon = currentTier.icon;
  const hasSavedHours = Boolean(restaurant?.openingHours && Object.keys(restaurant.openingHours).length > 0);

  return (
    <div className="space-y-5 pb-24 max-w-4xl">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={() => router.push("/restaurants")}
          className="w-9 h-9 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all shrink-0 mt-1">
          <ArrowLeft size={15} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-black uppercase tracking-tight text-[var(--text-primary)]">{restaurant.name}</h1>
            <span className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[10px] font-black uppercase ${currentTier.bg} ${currentTier.color}`}>
              <TierIcon size={10} /> {currentTier.label}
            </span>
            <button onClick={toggleOpen} disabled={togglingOpen}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border text-[10px] font-black uppercase transition-all ${
                isOpen ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-rose-500/10 border-rose-500/20 text-rose-400"
              } ${togglingOpen ? "opacity-50" : ""}`}>
              {isOpen ? <ToggleRight size={12} /> : <ToggleLeft size={12} />}
              {isOpen ? "Öppen" : "Stängd"}
            </button>
          </div>
          <p className="text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-widest mt-0.5">
            {restaurant.cuisine || "—"} · {restaurant.city || "—"}
          </p>
          <p className="text-[var(--text-secondary)] text-sm mt-2 max-w-2xl">
            All restaurangstyrning ligger nu samlad här igen: profil, admin-konto, öppettider, driftinställningar, orderläge och rapport.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 p-1 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl w-fit">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                tab === t.id ? "bg-gold-500 text-[#0d0d0d]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}>
              <Icon size={12} /> {t.label}
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="metric-card panel-muted">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[var(--text-muted)]">Admin-alias</p>
          <p className="mt-3 text-lg font-black tracking-[-0.03em] text-[var(--text-primary)] break-all">{adminForm.adminEmail || restaurant.slug}</p>
          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">Restaurangens login-id för Business-appen</p>
        </div>
        <div className="metric-card panel-muted">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[var(--text-muted)]">Öppettider</p>
          <p className="mt-3 text-lg font-black tracking-[-0.03em] text-[var(--text-primary)]">{hasSavedHours ? "Konfigurerade" : "Ej sparade"}</p>
          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">Veckoschema och extra pass hanteras här</p>
        </div>
        <div className="metric-card panel-muted">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[var(--text-muted)]">Drift</p>
          <p className="mt-3 text-lg font-black tracking-[-0.03em] text-[var(--text-primary)]">ETA {deliveryForm.etaMinutes} min</p>
          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">Min order {deliveryForm.minOrderAmount} kr • avgift {deliveryForm.deliveryFee} kr</p>
        </div>
        <div className="metric-card panel-muted">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[var(--text-muted)]">Orders idag</p>
          <p className="mt-3 text-lg font-black tracking-[-0.03em] text-[var(--text-primary)]">{todayOrders.length} st</p>
          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">Rating {(restaurant.rating ?? 4.6).toFixed(1)} • {isOpen ? "öppen" : "stängd"}</p>
        </div>
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">

        {/* ── PROFIL ── */}
        {tab === "profil" && (
          <motion.div key="profil" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">
            <div className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] space-y-4">
              <h2 className="text-[11px] font-black uppercase tracking-widest text-[var(--text-primary)] flex items-center gap-2">
                <Building size={14} className="text-gold-500" /> Grundinfo
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Namn *">
                  <input className={inputCls} value={profile.name} onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} />
                </Field>
                <Field label="Kök / Kategori">
                  <input className={inputCls} value={profile.cuisine} onChange={(e) => setProfile((p) => ({ ...p, cuisine: e.target.value }))} />
                </Field>
              </div>
              <Field label="Beskrivning">
                <textarea className={`${inputCls} resize-none h-24`} value={profile.description} onChange={(e) => setProfile((p) => ({ ...p, description: e.target.value }))} />
              </Field>
            </div>

            <div className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] space-y-4">
              <h2 className="text-[11px] font-black uppercase tracking-widest text-[var(--text-primary)] flex items-center gap-2">
                <MapPin size={14} className="text-gold-500" /> Kontakt & Adress
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Adress">
                  <div className="relative"><MapPin size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
                    <input className={`${inputCls} pl-9`} value={profile.address} onChange={(e) => setProfile((p) => ({ ...p, address: e.target.value }))} />
                  </div>
                </Field>
                <Field label="Stad">
                  <input className={inputCls} value={profile.city} onChange={(e) => setProfile((p) => ({ ...p, city: e.target.value }))} />
                </Field>
                <Field label="Postnummer">
                  <input className={inputCls} value={profile.zip} onChange={(e) => setProfile((p) => ({ ...p, zip: e.target.value }))} />
                </Field>
                <Field label="Telefon (kontakt)">
                  <div className="relative"><Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
                    <input className={`${inputCls} pl-9`} value={profile.phone} onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))} />
                  </div>
                </Field>
                <Field label="Latitud (GPS)">
                  <input type="number" step="any" className={inputCls} value={profile.latitude} onChange={(e) => setProfile((p) => ({ ...p, latitude: e.target.value }))} placeholder="t.ex. 55.604981" />
                </Field>
                <Field label="Longitud (GPS)">
                  <input type="number" step="any" className={inputCls} value={profile.longitude} onChange={(e) => setProfile((p) => ({ ...p, longitude: e.target.value }))} placeholder="t.ex. 13.003822" />
                </Field>
              </div>
            </div>

            <div className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] space-y-4">
              <h2 className="text-[11px] font-black uppercase tracking-widest text-[var(--text-primary)] flex items-center gap-2">
                <ImageIcon size={14} className="text-gold-500" /> Bilder
              </h2>
              {(["imageUrl", "heroImageUrl"] as const).map((field) => (
                <div key={field}>
                  <Field label={field === "imageUrl" ? "Profilbild" : "Hero-bild"}>
                    <div className="flex gap-2">
                      <input className={inputCls} value={profile[field]} placeholder="https://..."
                        onChange={(e) => setProfile((p) => ({ ...p, [field]: e.target.value }))} />
                      <label className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--border-subtle)] text-[10px] font-black uppercase text-[var(--text-secondary)] hover:text-gold-500 hover:border-gold-500/20 transition-all cursor-pointer shrink-0 ${uploadingImage === field ? "opacity-50" : ""}`}>
                        {uploadingImage === field
                          ? <Loader2 size={14} className="animate-spin" />
                          : <Upload size={14} />}
                        Ladda upp
                        <input type="file" accept="image/*" className="hidden"
                          disabled={uploadingImage !== null}
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f, field); e.target.value = ""; }} />
                      </label>
                    </div>
                  </Field>
                  {profile[field] && (
                    <img src={profile[field]} alt="" className="mt-2 w-24 h-16 rounded-xl object-cover border border-[var(--border-subtle)] bg-[var(--bg-primary)]" />
                  )}
                </div>
              ))}
            </div>

            <div className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] space-y-4">
              <h2 className="text-[11px] font-black uppercase tracking-widest text-[var(--text-primary)] flex items-center gap-2">
                <FileText size={14} className="text-gold-500" /> Intern anteckning (ej synlig i app)
              </h2>
              <textarea className={`${inputCls} resize-none h-20`} value={profile.internalInfo} placeholder="Anteckningar för super-admin..."
                onChange={(e) => setProfile((p) => ({ ...p, internalInfo: e.target.value }))} />
            </div>

            {/* Premium tier */}
            <div className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
              <h2 className="text-[11px] font-black uppercase tracking-widest text-[var(--text-primary)] flex items-center gap-2 mb-4">
                <Crown size={14} className="text-gold-500" /> Premium Tier
              </h2>
              <div className="grid grid-cols-4 gap-3 mb-4">
                {PREMIUM_TIERS.map((tier) => {
                  const Icon = tier.icon;
                  const active = featuredClass === tier.value;
                  return (
                    <button key={tier.value} onClick={() => setFeaturedClass(tier.value)}
                      className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${active ? `${tier.bg} shadow-md` : "border-[var(--border-subtle)] bg-[var(--bg-primary)]"}`}>
                      <Icon size={18} className={active ? tier.color : "text-[var(--text-secondary)]"} />
                      <span className={`text-[10px] font-black uppercase tracking-widest ${active ? tier.color : "text-[var(--text-secondary)]"}`}>{tier.label}</span>
                      <span className={`text-[10px] font-bold ${active ? tier.color : "text-[var(--text-secondary)] opacity-50"}`}>{tier.sublabel}</span>
                    </button>
                  );
                })}
              </div>
              <button onClick={saveTier} disabled={saving}
                className="w-full py-2.5 bg-[var(--bg-primary)] border border-[var(--border-subtle)] hover:border-gold-500/30 rounded-xl text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] hover:text-gold-500 transition-all">
                Spara tier
              </button>
            </div>

            <button onClick={saveProfile} disabled={saving}
              className="w-full py-4 bg-gold-500 hover:bg-gold-400 text-[#0d0d0d] font-black uppercase tracking-widest text-[11px] rounded-xl shadow-lg shadow-gold-500/20 transition-all flex items-center justify-center gap-2">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Spara profil
            </button>
          </motion.div>
        )}

        {/* ── ADMIN-KONTO ── */}
        {tab === "admin" && (
          <motion.div key="admin" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">
            <div className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] space-y-4">
              <h2 className="text-[11px] font-black uppercase tracking-widest text-[var(--text-primary)] flex items-center gap-2">
                <User size={14} className="text-gold-500" /> Admin-inloggning för restaurangen
              </h2>
              <p className="text-[10px] text-[var(--text-secondary)] font-bold leading-relaxed">
                Restaurangadmins loggar in via <strong className="text-[var(--text-primary)]">MatGo Business-appen</strong> (Flutter).
                Användarnamnet är restaurangens slug: <code className="text-gold-500 bg-gold-500/10 px-1.5 py-0.5 rounded">{restaurant.slug}</code>
              </p>
              <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                <p className="text-[10px] text-amber-400 font-bold">
                  Inloggningsuppgifterna gäller endast för restaurang-adminerna — inte super-admin.
                </p>
              </div>
            </div>

            <div className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] space-y-4">
              <h2 className="text-[11px] font-black uppercase tracking-widest text-[var(--text-primary)] flex items-center gap-2">
                <Lock size={14} className="text-gold-500" /> Sätt / Ändra lösenord
              </h2>
              <Field label="Användarnamn (auto)">
                <input className={`${inputCls} opacity-50`} value={restaurant.slug} readOnly />
              </Field>
              <Field label="Inloggnings-epost (frivillig)">
                <div className="relative">
                  <User size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
                  <input className={`${inputCls} pl-9`} value={adminForm.adminEmail}
                    onChange={(e) => setAdminForm((p) => ({ ...p, adminEmail: e.target.value }))}
                    placeholder="t.ex. hej@restaurang.se (används som inlogg)" />
                </div>
              </Field>
              <Field label="Nytt lösenord">
                <div className="relative">
                  <Lock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
                  <input type="password" className={`${inputCls} pl-9`} value={adminForm.adminPassword}
                    onChange={(e) => setAdminForm((p) => ({ ...p, adminPassword: e.target.value }))}
                    placeholder="Lämna tomt för att behålla befintligt" />
                </div>
              </Field>
              <button onClick={saveAdminCredentials} disabled={saving}
                className="w-full py-4 bg-gold-500 hover:bg-gold-400 text-[#0d0d0d] font-black uppercase tracking-widest text-[11px] rounded-xl shadow-lg shadow-gold-500/20 transition-all flex items-center justify-center gap-2">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
                Spara lösenord
              </button>
            </div>

            <div className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
              <h2 className="text-[11px] font-black uppercase tracking-widest text-[var(--text-primary)] flex items-center gap-2 mb-3">
                <Globe size={14} className="text-gold-500" /> Snabblänkar
              </h2>
              <div className="flex flex-wrap gap-2">
                <Link href={`/menu/${restaurantId}`}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[10px] font-black uppercase text-[var(--text-secondary)] hover:text-gold-500 hover:border-gold-500/20 transition-all">
                  <Utensils size={12} /> Redigera meny
                </Link>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── ÖPPETTIDER ── */}
        {tab === "hours" && (
          <motion.div key="hours" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[13px] font-black uppercase tracking-tight text-[var(--text-primary)]">Öppettider</h2>
                <p className="text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-widest mt-0.5">
                  Upp till 2 skift per dag · Synkas direkt med appen
                </p>
              </div>
              <button onClick={saveOpeningHours} disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 bg-gold-500 hover:bg-gold-400 text-[#0d0d0d] font-black uppercase tracking-widest text-[10px] rounded-xl shadow-lg shadow-gold-500/20 transition-all">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Spara
              </button>
            </div>

            <div className="space-y-2">
              {DAYS.map((day) => {
                const h: DayHours = openingHours[day.key] || { ...DEFAULT_HOURS };
                return (
                  <div key={day.key} className={`rounded-2xl border transition-all ${h.closed ? "border-[var(--border-subtle)] bg-[var(--bg-secondary)] opacity-60" : "border-[var(--border-subtle)] bg-[var(--bg-secondary)]"}`}>
                    <div className="flex items-center gap-4 p-4">
                      <div className="w-20 shrink-0">
                        <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-primary)]">{day.label}</p>
                        <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mt-0.5">Skift 1</p>
                      </div>
                      <div className="flex items-center gap-2 flex-1">
                        <div className="flex items-center gap-1.5 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-3 py-2">
                          <Sun size={11} className="text-amber-400" />
                          <input type="time" value={h.open} disabled={h.closed} onChange={(e) => updateHours(day.key, "open", e.target.value)}
                            className="bg-transparent text-[11px] font-black outline-none disabled:opacity-30 w-[70px]" />
                        </div>
                        <span className="text-[var(--text-secondary)] text-xs font-black">–</span>
                        <div className="flex items-center gap-1.5 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-3 py-2">
                          <Moon size={11} className="text-blue-400" />
                          <input type="time" value={h.close} disabled={h.closed} onChange={(e) => updateHours(day.key, "close", e.target.value)}
                            className="bg-transparent text-[11px] font-black outline-none disabled:opacity-30 w-[70px]" />
                        </div>
                      </div>
                      <button onClick={() => updateHours(day.key, "shift2", !h.shift2)} disabled={h.closed}
                        className={`px-2.5 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-widest transition-all ${
                          h.shift2 ? "bg-sky-500/10 border-sky-500/20 text-sky-400" : "border-[var(--border-subtle)] text-[var(--text-secondary)]"
                        } disabled:opacity-30`}>
                        {h.shift2 ? "2 skift" : "+ Skift 2"}
                      </button>
                      <button onClick={() => updateHours(day.key, "closed", !h.closed)}
                        className={`px-2.5 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-widest transition-all ${
                          h.closed ? "bg-rose-500/10 border-rose-500/20 text-rose-400" : "bg-emerald-500/8 border-emerald-500/20 text-emerald-400"
                        }`}>
                        {h.closed ? "Stängd" : "Öppen"}
                      </button>
                    </div>
                    {h.shift2 && !h.closed && (
                      <div className="flex items-center gap-4 px-4 pb-4">
                        <div className="w-20 shrink-0">
                          <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">Skift 2</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1.5 bg-[var(--bg-primary)] border border-sky-500/20 rounded-xl px-3 py-2">
                            <Coffee size={11} className="text-sky-400" />
                            <input type="time" value={h.open2 || "17:00"} onChange={(e) => updateHours(day.key, "open2", e.target.value)}
                              className="bg-transparent text-[11px] font-black outline-none w-[70px]" />
                          </div>
                          <span className="text-[var(--text-secondary)] text-xs font-black">–</span>
                          <div className="flex items-center gap-1.5 bg-[var(--bg-primary)] border border-sky-500/20 rounded-xl px-3 py-2">
                            <Moon size={11} className="text-sky-400" />
                            <input type="time" value={h.close2 || "22:00"} onChange={(e) => updateHours(day.key, "close2", e.target.value)}
                              className="bg-transparent text-[11px] font-black outline-none w-[70px]" />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <button onClick={saveOpeningHours} disabled={saving}
              className="w-full py-4 bg-gold-500 hover:bg-gold-400 text-[#0d0d0d] font-black uppercase tracking-widest text-[11px] rounded-xl shadow-lg shadow-gold-500/20 transition-all">
              {saving ? "Sparar..." : "Spara öppettider"}
            </button>
          </motion.div>
        )}

        {/* ── LEVERANS & ETA ── */}
        {tab === "settings" && (
          <motion.div key="settings" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">

            {/* Zone system notice */}
            <div className="p-5 rounded-2xl border border-sky-500/20 bg-sky-500/5 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 bg-sky-500/15 rounded-xl flex items-center justify-center shrink-0">
                  <MapPin size={16} className="text-sky-400" />
                </div>
                <div>
                  <p className="text-sm font-black text-sky-300 mb-1">Leveransavgift & minimiorder hanteras via Zoner</p>
                  <p className="text-[10px] font-bold text-sky-400/70 leading-relaxed">
                    Priser, minimiorder och leveranszoner konfigureras nu i <strong>Stadshantering & Zoner</strong>.
                    Varje zon kan ha egna avgifter och denna restaurang kan ha anpassade zoner som skiljer sig från stadens.
                  </p>
                </div>
              </div>
              <Link href="/cities"
                className="inline-flex items-center gap-2 px-4 py-2 bg-sky-500 hover:bg-sky-400 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-sky-500/20">
                <MapPin size={12} /> Gå till Stadshantering & Zoner →
              </Link>
            </div>

            <div className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-[13px] font-black uppercase tracking-tight text-[var(--text-primary)]">Basvärden för drift</h2>
                  <p className="text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-widest mt-0.5">
                    Visas här för att hela restaurangen ska gå att styra från en sida
                  </p>
                </div>
                <button onClick={saveDelivery} disabled={saving}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gold-500 hover:bg-gold-400 text-[#0d0d0d] font-black uppercase tracking-widest text-[10px] rounded-xl shadow-lg shadow-gold-500/20 transition-all">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Spara
                </button>
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                <Field label="Leveransavgift (bas)">
                  <input type="number" min={0} value={deliveryForm.deliveryFee}
                    onChange={(e) => setDeliveryForm((p) => ({ ...p, deliveryFee: Number(e.target.value) || 0 }))}
                    className={inputCls} />
                </Field>
                <Field label="Minsta order (bas)">
                  <input type="number" min={0} value={deliveryForm.minOrderAmount}
                    onChange={(e) => setDeliveryForm((p) => ({ ...p, minOrderAmount: Number(e.target.value) || 0 }))}
                    className={inputCls} />
                </Field>
                <Field label="Standard ETA (min)">
                  <input type="number" min={1} value={deliveryForm.etaMinutes}
                    onChange={(e) => setDeliveryForm((p) => ({ ...p, etaMinutes: Number(e.target.value) || 30 }))}
                    className={inputCls} />
                </Field>
              </div>
            </div>

            {/* ETA fallback — only this field stays here */}
            <div className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-[13px] font-black uppercase tracking-tight text-[var(--text-primary)]">Standard ETA</h2>
                  <p className="text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-widest mt-0.5">
                    Används när zonen inte har en specifik ETA
                  </p>
                </div>
                <button onClick={saveDelivery} disabled={saving}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gold-500 hover:bg-gold-400 text-[#0d0d0d] font-black uppercase tracking-widest text-[10px] rounded-xl shadow-lg shadow-gold-500/20 transition-all">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Spara
                </button>
              </div>
              <div className="max-w-xs">
                <div className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-primary)]">
                  <div className="flex items-center gap-2 mb-3">
                    <Clock size={14} className="text-gold-500" />
                    <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)]">ETA (minuter)</label>
                  </div>
                  <input type="number" min={1} value={deliveryForm.etaMinutes}
                    onChange={(e) => setDeliveryForm((p) => ({ ...p, etaMinutes: Number(e.target.value) || 30 }))}
                    className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-2xl font-black outline-none focus:border-gold-500/30 text-gold-500" />
                </div>
              </div>
              <p className="text-[10px] text-[var(--text-secondary)] font-bold">
                Koordinater: {profile.latitude || "ej satt"}, {profile.longitude || "ej satt"}
              </p>
            </div>
          </motion.div>
        )}

        {/* ── ORDRAR ── */}
        {tab === "orders" && (
          <motion.div key="orders" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Ordrar idag", value: todayOrders.length, color: "text-blue-400" },
                { label: "Omsättning idag", value: `${Math.round(todayOrders.filter((o) => o.status === "DELIVERED").reduce((s, o) => s + (o.total || 0), 0) / 100)} kr`, color: "text-gold-500" },
                { label: "Rating", value: (restaurant.rating ?? 4.6).toFixed(1), color: "text-amber-400" },
              ].map((s) => (
                <div key={s.label} className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
                  <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-1">{s.label}</div>
                  <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
                </div>
              ))}
            </div>

            <h2 className="text-[13px] font-black uppercase tracking-tight text-[var(--text-primary)]">Alla ordrar ({orders.length})</h2>
            {orders.length === 0 ? (
              <div className="py-16 text-center rounded-2xl border border-dashed border-[var(--border-subtle)]">
                <ShoppingCart size={32} className="text-[var(--text-secondary)] opacity-20 mx-auto mb-3" />
                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] opacity-30">Inga ordrar</p>
              </div>
            ) : (
              orders.map((o) => (
                <div key={o.id} className="flex items-center justify-between p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] flex items-center justify-center text-[10px] font-black text-[var(--text-secondary)]">
                      #{o.orderNumber}
                    </div>
                    <div>
                      <p className="text-[11px] font-black uppercase text-[var(--text-primary)]">{o.customerName}</p>
                      <p className="text-[10px] font-bold text-[var(--text-secondary)]">
                        {new Date(o.createdAt).toLocaleString("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-black text-gold-500">{Math.round((o.total || 0) / 100)} kr</span>
                    <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase border ${
                      o.status === "DELIVERED" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      : o.status === "PENDING" ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                      : o.status === "CANCELLED" || o.status === "REJECTED" ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                      : "bg-[var(--border-subtle)] text-[var(--text-secondary)] border-[var(--border-subtle)]"
                    }`}>{o.status}</span>
                  </div>
                </div>
              ))
            )}
          </motion.div>
        )}

        {/* ── RAPPORT / PDF ── */}
        {tab === "report" && (
          <ReportTab restaurantId={restaurantId} token={token} restaurantName={restaurant?.name} />
        )}

      </AnimatePresence>
    </div>
  );
}

// ── Per-restaurant report tab ─────────────────────────────────────────────────
function ReportTab({ restaurantId, token, restaurantName }: { restaurantId: string; token: string; restaurantName?: string }) {
  const { error: toastError, success } = useToast();
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/admin/reports/restaurant/${restaurantId}`, {
        params: { from, to },
        headers: { Authorization: `Bearer ${token}` },
      });
      setData(res.data);
    } catch {
      toastError("Kunde inte hämta rapport");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchReport(); }, []);

  const kr = (n: number) => `${n.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`;

  const exportTxt = () => {
    if (!data) return;
    const lines = [
      `RAPPORT: ${restaurantName}`,
      `Period: ${from} – ${to}`,
      `Genererad: ${new Date().toLocaleString("sv-SE")}`,
      ``,
      `SAMMANFATTNING`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `Totala ordrar:       ${data.summary.totalOrders}`,
      `Total omsättning:    ${kr(data.summary.totalRevenue)}`,
      `Snitt-order:         ${kr(data.summary.avgOrderValue)}`,
      `Nya kunder:          ${data.summary.newCustomers}`,
      `Leveransordrar:      ${data.summary.deliveryOrders}`,
      `Avhämtningsordrar:   ${data.summary.pickupOrders}`,
      ``,
      `TOPPSÄLJARE (Topp 10)`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      ...(data.topProducts || []).map((p: any, i: number) => `${i + 1}. ${p.name.padEnd(30)} ${p.count}st   ${kr(p.revenue)}`),
      ``,
      `DAGSDATA`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      ...(data.dailyData || []).map((d: any) => `${d.date}   ${d.orders} ordrar   ${kr(d.revenue)}`),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rapport_${restaurantId}_${from}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    success("Rapport exporterad");
  };

  return (
    <motion.div key="report" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">
      {/* Period selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)]">Period:</label>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
          className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-[10px] font-bold outline-none focus:border-gold-500/30" />
        <span className="text-[var(--text-secondary)] text-xs">–</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
          className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-[10px] font-bold outline-none focus:border-gold-500/30" />
        <button onClick={fetchReport} disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 bg-gold-500 hover:bg-gold-400 text-[#0d0d0d] font-black uppercase tracking-widest text-[10px] rounded-xl shadow-lg shadow-gold-500/20 transition-all">
          {loading ? <Loader2 size={13} className="animate-spin" /> : <TrendingUp size={13} />}
          Hämta rapport
        </button>
        {data && (
          <button onClick={exportTxt}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--border-subtle)] text-[10px] font-black uppercase text-[var(--text-secondary)] hover:text-gold-500 hover:border-gold-500/20 transition-all">
            <TrendingUp size={13} /> Exportera .txt
          </button>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16 gap-3">
          <Loader2 className="animate-spin text-gold-500" size={24} />
        </div>
      )}

      {data && !loading && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { label: "Ordrar", value: data.summary.totalOrders, color: "text-blue-400" },
              { label: "Omsättning", value: `${Math.round(data.summary.totalRevenue)} kr`, color: "text-gold-500" },
              { label: "Snitt-order", value: `${Math.round(data.summary.avgOrderValue)} kr`, color: "text-[var(--text-secondary)]" },
              { label: "Nya kunder", value: data.summary.newCustomers, color: "text-purple-400" },
              { label: "Leverans", value: data.summary.deliveryOrders, color: "text-sky-400" },
              { label: "Avhämtning", value: data.summary.pickupOrders, color: "text-sky-400" },
            ].map((s) => (
              <div key={s.label} className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-1">{s.label}</p>
                <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Top products */}
          {data.topProducts?.length > 0 && (
            <div className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
              <h3 className="text-[11px] font-black uppercase tracking-widest text-[var(--text-primary)] mb-4">Toppsäljare</h3>
              <div className="space-y-2">
                {data.topProducts.map((p: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-gold-500/10 text-gold-500 text-[10px] font-black flex items-center justify-center">{i + 1}</span>
                      <span className="text-[10px] font-bold text-[var(--text-primary)]">{p.name}</span>
                    </div>
                    <div className="flex items-center gap-4 text-right">
                      <span className="text-[10px] font-black text-gold-500">{Math.round(p.revenue)} kr</span>
                      <span className="text-[10px] text-[var(--text-secondary)]">{p.count} st</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Daily data */}
          {data.dailyData?.length > 0 && (
            <div className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
              <h3 className="text-[11px] font-black uppercase tracking-widest text-[var(--text-primary)] mb-4">Per dag</h3>
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {data.dailyData.map((d: any) => (
                  <div key={d.date} className="flex items-center justify-between text-[10px] px-2 py-1">
                    <span className="font-bold text-[var(--text-secondary)]">{d.date}</span>
                    <span className="text-[var(--text-primary)]">{d.orders} ordrar</span>
                    <span className="font-black text-gold-500">{Math.round(d.revenue)} kr</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}
