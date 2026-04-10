/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { API_URL } from "@/lib/api";
import {
  Loader2,
  Plus,
  Save,
  Trash2,
  Upload,
  ImageIcon,
  Clock,
  Search,
  Settings,
  ChevronRight,
  Sparkles,
  MapPin,
  Phone,
  Info,
  Lock,
  Users,
  Star,
  Award,
  Medal,
  Crown,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  Package,
  TrendingUp,
  LayoutGrid,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Modal, ConfirmModal } from "@/components/Modal";
import { useToast } from "@/components/Toast";

interface Restaurant {
  id: string;
  name: string;
  slug: string;
  description?: string;
  cuisine?: string;
  city?: string;
  address?: string;
  zip?: string;
  phone?: string;
  rating?: number;
  ratingCount?: number;
  imageUrl?: string;
  heroImageUrl?: string;
  minOrderAmount?: number;
  deliveryFee?: number;
  etaMinutes?: number;
  isOpen?: boolean;
  featuredClass?: number;
  tags?: string;
  openingHours?: string;
  adminPassword?: string;
  internalInfo?: string;
  latitude?: number;
  longitude?: number;
  deliveryZones?: string;
  freeDeliveryAbove?: number;
}

const emptyForm: Partial<Restaurant> = {
  name: "",
  slug: "",
  description: "",
  cuisine: "",
  city: "Lund",
  address: "",
  zip: "",
  phone: "",
  minOrderAmount: 0,
  deliveryFee: 0,
  etaMinutes: 30,
  isOpen: true,
  featuredClass: 2,
  tags: "[]",
  imageUrl: "",
  heroImageUrl: "",
  adminPassword: "",
  internalInfo: "",
  latitude: 0,
  longitude: 0,
  deliveryZones: "[]",
  freeDeliveryAbove: 0,
};

const PREMIUM_TIERS = [
  {
    value: 1,
    label: "Premium",
    icon: Crown,
    color: "text-gold-500",
    bg: "bg-gold-500/10 border-gold-500/30",
    activeBg: "bg-gold-500",
    desc: "Topplacering, featured i appen",
  },
  {
    value: 2,
    label: "Standard",
    icon: Medal,
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/30",
    activeBg: "bg-blue-500",
    desc: "Normal synlighet",
  },
  {
    value: 3,
    label: "Dold",
    icon: Award,
    color: "text-[var(--text-secondary)]",
    bg: "bg-[var(--border-subtle)] border-[var(--border-subtle)]",
    activeBg: "bg-[var(--bg-secondary)]",
    desc: "Inte synlig i appen",
  },
];

export default function RestaurantsPage() {
  const router = useRouter();
  const { success, error: toastError, warning } = useToast();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [mode, setMode] = useState<"list" | "edit" | "new">("list");
  const [form, setForm] = useState<Partial<Restaurant>>(emptyForm);
  const [adminStatus, setAdminStatus] = useState<{ exists: boolean; admin?: any } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Restaurant | null>(null);
  const [cities, setCities] = useState<any[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const heroInputRef = useRef<HTMLInputElement>(null);

  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("matgo_token") || ""
      : "";

  const slugify = (val: string) =>
    val
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

  const checkAdminStatus = async (slug: string) => {
    if (!slug) { setAdminStatus(null); return; }
    try {
      const res = await axios.get(`${API_URL}/api/auth/check-admin/${slug}`);
      setAdminStatus(res.data);
    } catch { setAdminStatus(null); }
  };

  const fetchRestaurants = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/restaurants`);
      setRestaurants(res.data);
    } catch { toastError("Kunde inte ladda restauranger"); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchRestaurants();
    axios.get(`${API_URL}/api/cities`).then((r) => setCities(r.data)).catch(() => {});
  }, []);

  const selected = useMemo(
    () => restaurants.find((r) => r.id === selectedId),
    [restaurants, selectedId]
  );

  useEffect(() => {
    if (selected) {
      setForm({
        ...selected,
        tags: typeof selected.tags === "string" ? selected.tags : JSON.stringify(selected.tags || []),
        openingHours: typeof selected.openingHours === "string" ? selected.openingHours : JSON.stringify(selected.openingHours || {}),
        adminPassword: "",
      });
      checkAdminStatus(selected.slug);
    } else {
      setAdminStatus(null);
    }
  }, [selected]);

  const filteredRestaurants = useMemo(
    () =>
      restaurants.filter(
        (r) =>
          r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          r.cuisine?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          r.city?.toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [restaurants, searchTerm]
  );

  const handleSave = async () => {
    if (!form.name) return;
    setSaving(true);
    try {
      const { id, createdAt, updatedAt, ...cleanForm } = form as any;
      const payload = {
        ...cleanForm,
        featuredClass: Number(form.featuredClass || 2),
        isOpen: form.isOpen !== false,
        deliveryFee: Number(form.deliveryFee || 0),
        minOrderAmount: Number(form.minOrderAmount || 0),
        etaMinutes: Number(form.etaMinutes || 30),
        latitude: Number(form.latitude || 0),
        longitude: Number(form.longitude || 0),
        freeDeliveryAbove: Number(form.freeDeliveryAbove || 0),
        deliveryZones: typeof form.deliveryZones === "string" ? form.deliveryZones : JSON.stringify(form.deliveryZones || []),
        imageUrl: form.imageUrl || "",
        heroImageUrl: form.heroImageUrl || "",
        internalInfo: form.internalInfo || "",
        tags: typeof form.tags === "string" ? JSON.parse(form.tags || "[]") : (form.tags || []),
        openingHours: typeof form.openingHours === "string" ? JSON.parse(form.openingHours || "{}") : (form.openingHours || {}),
      };

      if (selectedId) {
        await axios.patch(`${API_URL}/api/restaurants/${selectedId}`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        success(`${form.name} sparad!`);
      } else {
        await axios.post(`${API_URL}/api/restaurants`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        success(`${form.name} skapad!`);
        setMode("list");
        setSelectedId(null);
      }

      if (form.adminPassword && form.adminPassword.trim().length > 0) {
        success("Admin-konto uppdaterat med nytt lösenord.");
      } else if (!selectedId && (!form.adminPassword || !form.adminPassword.trim())) {
        warning("Inget lösenord angivet — admin-konto ej skapat/ändrat.");
      }

      await fetchRestaurants();
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte spara restaurangen");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await axios.delete(`${API_URL}/api/restaurants/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      success("Restaurang raderad");
      await fetchRestaurants();
      if (selectedId === id) { setSelectedId(null); setMode("list"); }
      setDeleteConfirm(null);
    } catch {
      toastError("Kunde inte radera restaurangen");
    }
  };

  const handleImageUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    field: "imageUrl" | "heroImageUrl"
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () =>
        setForm((prev) => ({ ...prev, [field]: reader.result as string }));
      reader.readAsDataURL(file);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <Loader2 className="animate-spin text-gold-500" size={36} />
        <p className="text-[var(--text-secondary)] font-black uppercase tracking-[0.3em] text-[10px]">
          Laddar restauranger...
        </p>
      </div>
    );
  }

  // ── EDIT FORM ──────────────────────────────────────────────────────────────
  if (mode === "edit" || mode === "new") {
    return (
      <div className="space-y-6 pb-24 max-w-5xl">
        {/* Back button */}
        <button
          onClick={() => { setMode("list"); setSelectedId(null); }}
          className="flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors text-[10px] font-black uppercase tracking-widest"
        >
          <ArrowLeft size={14} /> Tillbaka till lista
        </button>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tight text-[var(--text-primary)]">
              {mode === "new" ? "Ny Restaurang" : `Redigera: ${selected?.name || ""}`}
            </h1>
            <p className="text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-widest mt-1">
              {mode === "new" ? "Lägg till en ny restaurang på plattformen" : "Hantera restaurangens inställningar"}
            </p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !form.name}
            className="flex items-center gap-3 px-6 py-3 bg-gold-500 hover:bg-gold-400 text-[#0d0d0d] font-black uppercase tracking-widest text-[10px] rounded-xl shadow-lg shadow-gold-500/20 transition-all disabled:opacity-50 active:scale-95"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Spara
          </button>
        </div>

        <div className="grid lg:grid-cols-[1fr,320px] gap-6">
          {/* Main form */}
          <div className="space-y-5">
            {/* Basic info */}
            <Section title="Grundinformation" icon={Sparkles}>
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="Restaurangnamn">
                  <input
                    value={form.name || ""}
                    onChange={(e) => {
                      const name = e.target.value;
                      setForm((prev) => ({
                        ...prev,
                        name,
                        ...(mode === "new" ? { slug: slugify(name) } : {}),
                      }));
                    }}
                    className={inputCls}
                    placeholder="t.ex. MatGo Sushi"
                  />
                </Field>
                <Field label="Kök / Tags">
                  <input
                    value={form.cuisine || ""}
                    onChange={(e) => setForm({ ...form, cuisine: e.target.value })}
                    className={inputCls}
                    placeholder="Kebab, Pizza, Falafel"
                  />
                </Field>
                <div className="md:col-span-2">
                  <Field label="Beskrivning">
                    <textarea
                      value={form.description || ""}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      className={`${inputCls} h-24 resize-none`}
                      placeholder="Kort beskrivning för kunderna..."
                    />
                  </Field>
                </div>
              </div>
            </Section>

            {/* Location */}
            <Section title="Plats & Kontakt" icon={MapPin}>
              <div className="grid md:grid-cols-3 gap-4">
                <Field label="Stad">
                  <select
                    value={form.city || ""}
                    onChange={(e) => {
                      if (e.target.value === "ADD_NEW") { router.push("/cities"); return; }
                      setForm({ ...form, city: e.target.value });
                    }}
                    className={inputCls}
                  >
                    <option value="">Välj stad...</option>
                    {cities.map((c) => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                    <option value="ADD_NEW">+ Lägg till stad</option>
                  </select>
                </Field>
                <Field label="Telefon">
                  <input
                    value={form.phone || ""}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className={inputCls}
                    placeholder="046-XXX XXX"
                  />
                </Field>
                <Field label="Postnummer">
                  <input
                    value={form.zip || ""}
                    onChange={(e) => setForm({ ...form, zip: e.target.value })}
                    className={inputCls}
                    placeholder="222 10"
                  />
                </Field>
                <div className="md:col-span-3">
                  <Field label="Adress">
                    <input
                      value={form.address || ""}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                      className={inputCls}
                      placeholder="Gatan 10"
                    />
                  </Field>
                </div>
              </div>
            </Section>

            {/* Delivery settings */}
            <Section title="Logistik" icon={Package}>
              <div className="grid grid-cols-3 gap-4">
                <NumField
                  label="Minsta order (kr)"
                  value={form.minOrderAmount}
                  onChange={(v) => setForm({ ...form, minOrderAmount: v })}
                />
                <NumField
                  label="Leveransavgift (kr)"
                  value={form.deliveryFee}
                  onChange={(v) => setForm({ ...form, deliveryFee: v })}
                />
                <NumField
                  label="ETA (min)"
                  value={form.etaMinutes}
                  onChange={(v) => setForm({ ...form, etaMinutes: v })}
                />
                <NumField
                  label="Fri frakt över (kr)"
                  value={form.freeDeliveryAbove}
                  onChange={(v) => setForm({ ...form, freeDeliveryAbove: v })}
                />
              </div>
            </Section>

            {/* Admin login */}
            <Section title="Admin-inloggning" icon={Lock}>
              {adminStatus && (
                <div
                  className={`flex items-center gap-3 p-3 rounded-xl mb-4 text-[10px] font-bold uppercase tracking-wider ${
                    adminStatus.exists
                      ? "bg-emerald-500/8 border border-emerald-500/20 text-emerald-400"
                      : "bg-amber-500/8 border border-amber-500/20 text-amber-400"
                  }`}
                >
                  <div
                    className={`w-2 h-2 rounded-full ${
                      adminStatus.exists ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
                    }`}
                  />
                  {adminStatus.exists
                    ? `Admin-konto: ${adminStatus.admin?.email} (${adminStatus.admin?.role})`
                    : "Inget admin-konto. Ange lösenord för att skapa."}
                </div>
              )}
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="Användarnamn (slug)">
                  <input
                    value={form.slug || ""}
                    onChange={(e) => {
                      const newSlug = slugify(e.target.value);
                      setForm({ ...form, slug: newSlug });
                      checkAdminStatus(newSlug);
                    }}
                    className={`${inputCls} font-mono`}
                  />
                </Field>
                <Field label={adminStatus?.exists ? "Nytt lösenord" : "Lösenord (skapar konto)"}>
                  <input
                    type="password"
                    value={form.adminPassword || ""}
                    onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
                    className={inputCls}
                    placeholder={adminStatus?.exists ? "Lämna tomt för att behålla" : "Ange lösenord"}
                  />
                </Field>
              </div>
              <div className="mt-3 flex items-start gap-2 p-3 bg-gold-500/5 border border-gold-500/10 rounded-xl">
                <Info size={13} className="text-gold-500 mt-0.5 shrink-0" />
                <p className="text-[9px] font-medium text-[var(--text-secondary)] leading-relaxed">
                  Inloggning:{" "}
                  <span className="text-gold-500 font-black">{form.slug}</span> + lösenord.
                  Används i Flutter-appen MatGo Business.
                </p>
              </div>
            </Section>

            {/* Internal notes */}
            <Section title="Interna anteckningar (Super Admin)" icon={Users}>
              <textarea
                value={form.internalInfo || ""}
                onChange={(e) => setForm({ ...form, internalInfo: e.target.value })}
                className={`${inputCls} h-28 resize-none border-l-2 border-l-sky-500`}
                placeholder="Kontaktperson, avtalsdetaljer, Swish-nummer..."
              />
            </Section>
          </div>

          {/* Sidebar controls */}
          <div className="space-y-5">
            {/* Images */}
            <Section title="Bilder" icon={ImageIcon} compact>
              {/* Hero */}
              <div className="mb-4">
                <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-2">
                  Cover-bild (banner)
                </p>
                <div
                  onClick={() => heroInputRef.current?.click()}
                  className="group relative h-36 w-full rounded-xl border-2 border-dashed border-[var(--border-subtle)] overflow-hidden bg-[var(--bg-primary)] flex items-center justify-center cursor-pointer hover:border-gold-500/30 transition-all"
                >
                  {form.heroImageUrl ? (
                    <>
                      <img
                        src={form.heroImageUrl}
                        className="h-full w-full object-cover opacity-60 group-hover:scale-105 transition-transform"
                        alt=""
                      />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/40 transition-all">
                        <Upload className="text-white" size={20} />
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-[var(--text-secondary)]">
                      <ImageIcon size={24} className="opacity-30" />
                      <span className="text-[9px] font-black uppercase opacity-40">Ladda upp</span>
                    </div>
                  )}
                  <input
                    ref={heroInputRef}
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={(e) => handleImageUpload(e, "heroImageUrl")}
                  />
                </div>
              </div>

              {/* Logo */}
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-2">
                  Logo / Avatar
                </p>
                <div className="flex items-center gap-3">
                  <div className="h-16 w-16 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] overflow-hidden flex items-center justify-center shrink-0">
                    {form.imageUrl ? (
                      <img src={form.imageUrl} className="h-full w-full object-cover" alt="" />
                    ) : (
                      <Plus size={20} className="text-[var(--text-secondary)] opacity-20" />
                    )}
                  </div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 py-2.5 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl text-[9px] font-black uppercase tracking-widest hover:border-gold-500/30 transition-all"
                  >
                    Välj bild
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={(e) => handleImageUpload(e, "imageUrl")}
                  />
                </div>
              </div>
            </Section>

            {/* Premium tier */}
            <Section title="Premium-tier" icon={Crown} compact>
              <div className="space-y-2">
                {PREMIUM_TIERS.map((tier) => {
                  const Icon = tier.icon;
                  const isActive = form.featuredClass === tier.value;
                  return (
                    <button
                      key={tier.value}
                      onClick={() => setForm({ ...form, featuredClass: tier.value })}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${
                        isActive
                          ? `${tier.bg} shadow-md`
                          : "border-[var(--border-subtle)] bg-[var(--bg-primary)] hover:border-[var(--border-subtle)]"
                      }`}
                    >
                      <Icon
                        size={16}
                        className={isActive ? tier.color : "text-[var(--text-secondary)]"}
                      />
                      <div className="text-left">
                        <p
                          className={`text-[10px] font-black uppercase tracking-wider ${
                            isActive ? tier.color : "text-[var(--text-secondary)]"
                          }`}
                        >
                          {tier.label}
                        </p>
                        <p className="text-[8px] text-[var(--text-secondary)] opacity-60">
                          {tier.desc}
                        </p>
                      </div>
                      {isActive && (
                        <CheckCircle2
                          size={14}
                          className={`ml-auto ${tier.color}`}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </Section>

            {/* Status */}
            <Section title="Status" compact>
              <button
                onClick={() => setForm({ ...form, isOpen: !form.isOpen })}
                className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
                  form.isOpen
                    ? "bg-emerald-500/8 border-emerald-500/20 text-emerald-400"
                    : "bg-rose-500/8 border-rose-500/20 text-rose-400"
                }`}
              >
                <span className="text-[10px] font-black uppercase tracking-widest">
                  {form.isOpen ? "Öppen för beställning" : "Stängd"}
                </span>
                {form.isOpen ? (
                  <CheckCircle2 size={16} />
                ) : (
                  <XCircle size={16} />
                )}
              </button>
            </Section>

            {/* Save button */}
            <button
              onClick={handleSave}
              disabled={saving || !form.name}
              className="w-full py-4 bg-gold-500 hover:bg-gold-400 text-[#0d0d0d] font-black uppercase tracking-widest text-[11px] rounded-xl shadow-lg shadow-gold-500/20 transition-all disabled:opacity-50 active:scale-95 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Publicera ändringar
            </button>

            {/* Delete */}
            {selectedId && (
              <div className="p-4 bg-rose-500/5 border border-rose-500/10 rounded-xl text-center">
                <p className="text-[8px] font-black uppercase tracking-widest text-rose-400 mb-3">
                  Farozon
                </p>
                <button
                  onClick={() =>
                    setDeleteConfirm(
                      restaurants.find((r) => r.id === selectedId) || null
                    )
                  }
                  className="text-rose-500/40 hover:text-rose-500 text-[9px] font-bold uppercase tracking-widest underline underline-offset-4 transition-colors"
                >
                  Radera restaurang permanent
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Delete confirm modal */}
        <ConfirmModal
          open={!!deleteConfirm}
          onClose={() => setDeleteConfirm(null)}
          onConfirm={() => deleteConfirm && handleDelete(deleteConfirm.id)}
          title="Radera restaurang"
          message={`Är du säker? ${deleteConfirm?.name} och ALLA dess ordrar, menyprodukter och inställningar raderas permanent.`}
          confirmLabel="Radera permanent"
          danger
        />
      </div>
    );
  }

  // ── LIST VIEW ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-[var(--text-primary)]">
            Restauranger
          </h1>
          <p className="text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-widest mt-1">
            {restaurants.length} restauranger på plattformen
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
            />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Sök restauranger..."
              className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl py-2.5 pl-9 pr-4 text-[11px] font-bold outline-none focus:border-gold-500/30 transition-all w-64"
            />
          </div>
          <button
            onClick={() => { setMode("new"); setForm(emptyForm); setSelectedId(null); }}
            className="flex items-center gap-2 px-5 py-2.5 bg-gold-500 hover:bg-gold-400 text-[#0d0d0d] font-black uppercase tracking-widest text-[10px] rounded-xl shadow-lg shadow-gold-500/20 transition-all active:scale-95"
          >
            <Plus size={15} /> Ny restaurang
          </button>
        </div>
      </div>

      {/* Restaurant grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredRestaurants.map((r) => {
          const tier = PREMIUM_TIERS.find((t) => t.value === r.featuredClass) || PREMIUM_TIERS[1];
          const TierIcon = tier.icon;
          return (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="group relative rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] overflow-hidden hover:border-gold-500/20 transition-all cursor-pointer"
              onClick={() => {
                setSelectedId(r.id);
                setMode("edit");
              }}
            >
              {/* Hero image */}
              <div className="h-32 w-full bg-[var(--bg-primary)] relative overflow-hidden">
                {r.heroImageUrl ? (
                  <img
                    src={r.heroImageUrl}
                    className="h-full w-full object-cover opacity-50 group-hover:scale-105 transition-transform duration-500"
                    alt={r.name}
                  />
                ) : (
                  <div className="h-full flex items-center justify-center text-[var(--text-secondary)] opacity-10 text-[9px] font-black uppercase">
                    Ingen bild
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-secondary)] to-transparent" />

                {/* Avatar */}
                <div className="absolute -bottom-5 left-4 w-14 h-14 rounded-xl border-2 border-[var(--bg-secondary)] overflow-hidden bg-[var(--bg-primary)] shadow-xl">
                  {r.imageUrl ? (
                    <img src={r.imageUrl} className="h-full w-full object-cover" alt="" />
                  ) : (
                    <div className="h-full flex items-center justify-center text-[var(--text-secondary)] opacity-20">
                      <Sparkles size={18} />
                    </div>
                  )}
                </div>

                {/* Tier badge */}
                <div className="absolute top-3 right-3">
                  <span
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[8px] font-black uppercase border ${tier.bg} ${tier.color}`}
                  >
                    <TierIcon size={9} />
                    {tier.label}
                  </span>
                </div>
              </div>

              <div className="p-4 pt-8">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-tight text-[var(--text-primary)]">
                      {r.name}
                    </h3>
                    <p className="text-[9px] font-bold text-gold-500 uppercase tracking-widest mt-0.5">
                      {r.cuisine || "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Star className="text-gold-500 fill-gold-500" size={11} />
                    <span className="text-[10px] font-black text-[var(--text-secondary)]">
                      {(r.rating ?? 4.6).toFixed(1)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-3">
                  <Stat label="ETA" value={`${r.etaMinutes} min`} />
                  <Stat label="Frakt" value={`${r.deliveryFee} kr`} />
                  <Stat label="Stad" value={r.city || "—"} />
                  <div
                    className={`flex items-center gap-1 text-[9px] font-black uppercase ${
                      r.isOpen ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    <div
                      className={`w-1.5 h-1.5 rounded-full ${
                        r.isOpen ? "bg-emerald-400 animate-pulse" : "bg-rose-400"
                      }`}
                    />
                    {r.isOpen ? "Öppen" : "Stängd"}
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-4 pt-4 border-t border-[var(--border-subtle)]">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedId(r.id);
                      setMode("edit");
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[9px] font-black uppercase tracking-wider text-[var(--text-secondary)] hover:text-gold-500 hover:border-gold-500/20 transition-all"
                  >
                    <Settings size={12} /> Redigera
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/restaurants/${r.id}`);
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[9px] font-black uppercase tracking-wider text-[var(--text-secondary)] hover:text-sky-400 hover:border-sky-500/20 transition-all"
                  >
                    <TrendingUp size={12} /> Hub
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirm(r);
                    }}
                    className="w-8 h-8 rounded-xl bg-rose-500/5 border border-rose-500/10 text-rose-400 hover:bg-rose-500/15 transition-all flex items-center justify-center"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}

        {/* Add new card */}
        <div
          onClick={() => { setMode("new"); setForm(emptyForm); setSelectedId(null); }}
          className="group border-2 border-dashed border-[var(--border-subtle)] rounded-2xl flex flex-col items-center justify-center p-10 hover:border-gold-500/30 transition-all cursor-pointer bg-white/[0.01] min-h-[240px]"
        >
          <div className="w-12 h-12 rounded-xl bg-[var(--bg-secondary)] flex items-center justify-center text-[var(--text-secondary)] group-hover:text-gold-500 group-hover:bg-gold-500/10 transition-all mb-3">
            <Plus size={24} />
          </div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
            Lägg till restaurang
          </p>
        </div>
      </div>

      {/* Delete confirm */}
      <ConfirmModal
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm.id)}
        title="Radera restaurang"
        message={`Är du säker? ${deleteConfirm?.name} och ALLA dess ordrar, menyprodukter och inställningar raderas permanent.`}
        confirmLabel="Radera permanent"
        danger
      />
    </div>
  );
}

// ── Helper components ────────────────────────────────────────────────────────
const inputCls =
  "w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-gold-500/30 transition-all placeholder:text-[var(--text-secondary)] placeholder:opacity-40";

function Section({
  title,
  icon: Icon,
  children,
  compact,
}: {
  title: string;
  icon?: React.ElementType;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-2xl p-5">
      {title && (
        <div className={`flex items-center gap-2 ${compact ? "mb-4" : "mb-5"}`}>
          {Icon && <Icon size={16} className="text-gold-500" />}
          <h3 className="text-[11px] font-black uppercase tracking-widest text-[var(--text-primary)]">
            {title}
          </h3>
        </div>
      )}
      {children}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)]">
        {label}
      </label>
      {children}
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number) => void;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        value={value || 0}
        onChange={(e) => onChange(Number(e.target.value))}
        className={inputCls}
      />
    </Field>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[8px] font-black uppercase tracking-widest text-[var(--text-secondary)] opacity-50">
        {label}
      </div>
      <div className="text-[10px] font-black text-[var(--text-primary)]">{value}</div>
    </div>
  );
}
