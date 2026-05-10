"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  Clock3,
  Eye,
  EyeOff,
  Filter,
  Loader2,
  Plus,
  Save,
  Search,
  Settings2,
  Store,
  Trash2,
  X,
} from "lucide-react";
import { API_URL } from "@/lib/api";
import { ConfirmModal } from "@/components/Modal";
import { useToast } from "@/components/Toast";

type HomeCategorySection = {
  id: string;
  title: string;
  slug: string;
  subtitle?: string | null;
  description?: string | null;
  isActive: boolean;
  sortOrder: number;
  filterMode: "FILTER" | "MANUAL" | "HYBRID";
  maxRestaurants: number;
  manualRestaurantIds: string[];
  filters: {
    searchTerm?: string | null;
    cuisines?: string[];
    tags?: string[];
    featuredClasses?: number[];
    minRating?: number | null;
    maxEtaMinutes?: number | null;
    maxDeliveryFee?: number | null;
    freeDeliveryOnly?: boolean;
    dealsOnly?: boolean;
    openNowOnly?: boolean;
    sortBy?: "FEATURED" | "RATING" | "ETA" | "NAME";
    sortDirection?: "ASC" | "DESC";
  };
  schedule: {
    enabled?: boolean;
    daysOfWeek?: number[];
    startTime?: string | null;
    endTime?: string | null;
  };
};

type RestaurantOption = {
  id: string;
  name: string;
  slug: string;
  cuisine?: string;
  city?: string;
};

const dayOptions = [
  { value: 1, label: "Mån" },
  { value: 2, label: "Tis" },
  { value: 3, label: "Ons" },
  { value: 4, label: "Tors" },
  { value: 5, label: "Fre" },
  { value: 6, label: "Lör" },
  { value: 0, label: "Sön" },
];

const emptyForm = (): HomeCategorySection => ({
  id: "",
  title: "",
  slug: "",
  subtitle: "",
  description: "",
  isActive: true,
  sortOrder: 0,
  filterMode: "FILTER",
  maxRestaurants: 8,
  manualRestaurantIds: [],
  filters: {
    searchTerm: "",
    cuisines: [],
    tags: [],
    featuredClasses: [],
    minRating: null,
    maxEtaMinutes: null,
    maxDeliveryFee: null,
    freeDeliveryOnly: false,
    dealsOnly: false,
    openNowOnly: false,
    sortBy: "FEATURED",
    sortDirection: "DESC",
  },
  schedule: {
    enabled: false,
    daysOfWeek: [],
    startTime: null,
    endTime: null,
  },
});

const splitCsv = (value: string) =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

function formatFilterSummary(section: HomeCategorySection) {
  const tags: string[] = [];
  if (section.filterMode !== "FILTER") {
    tags.push(`${section.manualRestaurantIds.length} valda restauranger`);
  }
  if (section.filters.cuisines?.length) tags.push(`Kök: ${section.filters.cuisines.join(", ")}`);
  if (section.filters.searchTerm) tags.push(`Sök: ${section.filters.searchTerm}`);
  if (section.filters.maxEtaMinutes != null) tags.push(`ETA <= ${section.filters.maxEtaMinutes} min`);
  if (section.filters.minRating != null) tags.push(`Betyg >= ${section.filters.minRating}`);
  if (section.filters.openNowOnly) tags.push("Endast öppna");
  if (section.filters.dealsOnly) tags.push("Måste ha deal");
  if (section.schedule.enabled) tags.push("Schemalagd");
  return tags.slice(0, 4);
}

export default function CategoriesPage() {
  const { success, error: toastError } = useToast();
  const [categories, setCategories] = useState<HomeCategorySection[]>([]);
  const [restaurants, setRestaurants] = useState<RestaurantOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<HomeCategorySection>(emptyForm());
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HomeCategorySection | null>(null);
  const [restaurantSearch, setRestaurantSearch] = useState("");

  const token = () => (typeof window !== "undefined" ? localStorage.getItem("matgo_token") || "" : "");
  const headers = () => ({ Authorization: `Bearer ${token()}` });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [categoryRes, restaurantRes] = await Promise.all([
        axios.get(`${API_URL}/api/home-categories/all`, { headers: headers() }),
        axios.get(`${API_URL}/api/restaurants`),
      ]);
      setCategories(categoryRes.data || []);
      setRestaurants(restaurantRes.data || []);
    } catch {
      toastError("Kunde inte hämta kategorier");
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "sv")),
    [categories],
  );

  const filteredRestaurants = useMemo(() => {
    const query = restaurantSearch.trim().toLowerCase();
    if (!query) return restaurants;
    return restaurants.filter((restaurant) => {
      const haystack = `${restaurant.name} ${restaurant.slug} ${restaurant.cuisine || ""} ${restaurant.city || ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [restaurantSearch, restaurants]);

  const resetForm = () => {
    setForm(emptyForm());
    setEditId(null);
    setRestaurantSearch("");
    setFormOpen(false);
  };

  const updateFilters = (patch: Partial<HomeCategorySection["filters"]>) => {
    setForm((current) => ({ ...current, filters: { ...current.filters, ...patch } }));
  };

  const updateSchedule = (patch: Partial<HomeCategorySection["schedule"]>) => {
    setForm((current) => ({ ...current, schedule: { ...current.schedule, ...patch } }));
  };

  const toggleFeaturedClass = (value: number) => {
    setForm((current) => {
      const currentValues = current.filters.featuredClasses || [];
      const nextValues = currentValues.includes(value)
        ? currentValues.filter((entry) => entry !== value)
        : [...currentValues, value];
      return { ...current, filters: { ...current.filters, featuredClasses: nextValues } };
    });
  };

  const toggleDay = (value: number) => {
    setForm((current) => {
      const currentValues = current.schedule.daysOfWeek || [];
      const nextValues = currentValues.includes(value)
        ? currentValues.filter((entry) => entry !== value)
        : [...currentValues, value];
      return { ...current, schedule: { ...current.schedule, daysOfWeek: nextValues } };
    });
  };

  const toggleRestaurant = (restaurantId: string) => {
    setForm((current) => {
      const exists = current.manualRestaurantIds.includes(restaurantId);
      return {
        ...current,
        manualRestaurantIds: exists
          ? current.manualRestaurantIds.filter((entry) => entry !== restaurantId)
          : [...current.manualRestaurantIds, restaurantId],
      };
    });
  };

  const handleEdit = (section: HomeCategorySection) => {
    setForm({
      ...emptyForm(),
      ...section,
      filters: { ...emptyForm().filters, ...(section.filters || {}) },
      schedule: { ...emptyForm().schedule, ...(section.schedule || {}) },
      manualRestaurantIds: section.manualRestaurantIds || [],
    });
    setEditId(section.id);
    setRestaurantSearch("");
    setFormOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      toastError("Titel krävs");
      return;
    }

    setSaving(true);
    const payload = {
      title: form.title.trim(),
      slug: form.slug.trim() || undefined,
      subtitle: form.subtitle?.trim() || null,
      description: form.description?.trim() || null,
      isActive: form.isActive,
      sortOrder: Number(form.sortOrder || 0),
      filterMode: form.filterMode,
      maxRestaurants: Number(form.maxRestaurants || 8),
      manualRestaurantIds: form.manualRestaurantIds,
      filters: {
        ...form.filters,
        cuisines: form.filters.cuisines || [],
        tags: form.filters.tags || [],
        featuredClasses: form.filters.featuredClasses || [],
        minRating: form.filters.minRating == null ? null : Number(form.filters.minRating),
        maxEtaMinutes: form.filters.maxEtaMinutes == null ? null : Number(form.filters.maxEtaMinutes),
        maxDeliveryFee: form.filters.maxDeliveryFee == null ? null : Number(form.filters.maxDeliveryFee),
      },
      schedule: {
        ...form.schedule,
        daysOfWeek: form.schedule.daysOfWeek || [],
        startTime: form.schedule.startTime || null,
        endTime: form.schedule.endTime || null,
      },
    };

    try {
      if (editId) {
        const res = await axios.patch(`${API_URL}/api/home-categories/${editId}`, payload, { headers: headers() });
        setCategories((current) => current.map((entry) => (entry.id === editId ? res.data : entry)));
        success("Kategori uppdaterad");
      } else {
        const res = await axios.post(`${API_URL}/api/home-categories`, payload, { headers: headers() });
        setCategories((current) => [...current, res.data]);
        success("Kategori skapad");
      }
      resetForm();
    } catch (error: any) {
      toastError(error?.response?.data?.error || "Kunde inte spara kategori");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (section: HomeCategorySection) => {
    try {
      await axios.delete(`${API_URL}/api/home-categories/${section.id}`, { headers: headers() });
      setCategories((current) => current.filter((entry) => entry.id !== section.id));
      setDeleteTarget(null);
      success("Kategori raderad");
    } catch {
      toastError("Kunde inte radera kategori");
    }
  };

  const toggleActive = async (section: HomeCategorySection) => {
    try {
      const res = await axios.patch(`${API_URL}/api/home-categories/${section.id}`, { isActive: !section.isActive }, { headers: headers() });
      setCategories((current) => current.map((entry) => (entry.id === section.id ? res.data : entry)));
      success(section.isActive ? "Kategori dold" : "Kategori aktiverad");
    } catch {
      toastError("Kunde inte uppdatera kategori");
    }
  };

  const moveCategory = async (section: HomeCategorySection, direction: "up" | "down") => {
    const sorted = [...sortedCategories];
    const index = sorted.findIndex((entry) => entry.id === section.id);
    if ((direction === "up" && index === 0) || (direction === "down" && index === sorted.length - 1)) return;
    const swap = sorted[direction === "up" ? index - 1 : index + 1];
    try {
      const [updatedSection, updatedSwap] = await Promise.all([
        axios.patch(`${API_URL}/api/home-categories/${section.id}`, { sortOrder: swap.sortOrder }, { headers: headers() }),
        axios.patch(`${API_URL}/api/home-categories/${swap.id}`, { sortOrder: section.sortOrder }, { headers: headers() }),
      ]);

      setCategories((current) =>
        current.map((entry) => {
          if (entry.id === section.id) return updatedSection.data;
          if (entry.id === swap.id) return updatedSwap.data;
          return entry;
        }),
      );
    } catch {
      toastError("Kunde inte ändra ordning");
    }
  };

  return (
    <div className="space-y-5 pb-16">
      <section className="panel rounded-[32px] px-6 py-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <span className="control-chip">Home rails</span>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.06em] text-[var(--text-primary)] sm:text-4xl">Kategorier och startsidessektioner</h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-[var(--text-secondary)]">Bygg rails för webb och React Native med samma filterlogik, samma manuella urval och samma schema.</p>
          </div>
          <button
            onClick={() => {
              setForm(emptyForm());
              setEditId(null);
              setRestaurantSearch("");
              setFormOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-2xl bg-gold-gradient px-4 py-3 text-[11px] font-black uppercase tracking-[0.22em] text-[#091018]"
          >
            <Plus size={15} /> Ny kategori
          </button>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-4">
        <article className="metric-card panel-muted">
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[var(--text-muted)]">Totalt</p>
          <p className="mt-3 text-3xl font-black tracking-[-0.05em] text-[var(--text-primary)]">{categories.length}</p>
          <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">Alla rails i systemet</p>
        </article>
        <article className="metric-card panel-muted">
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[var(--text-muted)]">Aktiva</p>
          <p className="mt-3 text-3xl font-black tracking-[-0.05em] text-[var(--text-primary)]">{categories.filter((section) => section.isActive).length}</p>
          <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">Visas publikt just nu</p>
        </article>
        <article className="metric-card panel-muted">
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[var(--text-muted)]">Schemalagda</p>
          <p className="mt-3 text-3xl font-black tracking-[-0.05em] text-[var(--text-primary)]">{categories.filter((section) => section.schedule.enabled).length}</p>
          <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">Har tidsstyrning</p>
        </article>
        <article className="metric-card panel-muted">
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[var(--text-muted)]">Manuella val</p>
          <p className="mt-3 text-3xl font-black tracking-[-0.05em] text-[var(--text-primary)]">{categories.filter((section) => section.filterMode !== "FILTER").length}</p>
          <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">Behöver kuratering</p>
        </article>
      </div>

      <div className="panel rounded-[32px] px-6 py-6 flex items-start gap-3">
        <Settings2 size={15} className="text-sky-400 shrink-0 mt-0.5" />
        <div className="text-[10px] font-bold text-sky-400/80 leading-relaxed space-y-1">
          <p><strong>FILTER:</strong> väljer restauranger automatiskt baserat på regler som kök, ETA, betyg och deals.</p>
          <p><strong>MANUAL:</strong> visar bara restaurangerna du själv väljer.</p>
          <p><strong>HYBRID:</strong> lägger dina utvalda restauranger först och fyller sedan på med filtermatchningar.</p>
          <p>Schemalägg med veckodagar + tider, till exempel <strong>Pizza fredag</strong> mellan 15:00 och 23:59.</p>
        </div>
      </div>

      <AnimatePresence>
        {formOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="panel rounded-[32px] p-8 space-y-8"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-black uppercase tracking-tight">{editId ? "Redigera kategori" : "Ny kategori"}</h2>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-secondary)] mt-1">Heta listan-stil med adminstyrd logik</p>
              </div>
              <button onClick={resetForm} className="p-2 rounded-xl hover:bg-white/10 transition-all text-[var(--text-secondary)]">
                <X size={16} />
              </button>
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
              <div className="space-y-5">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-1">Titel *</label>
                  <input
                    value={form.title}
                    onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))}
                    placeholder="t.ex. Pizza fredag"
                    className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-gold-500/30 transition-all"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-1">Slug</label>
                  <input
                    value={form.slug}
                    onChange={(e) => setForm((current) => ({ ...current, slug: e.target.value }))}
                    placeholder="auto från titel om tom"
                    className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-gold-500/30 transition-all font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-1">Underrubrik</label>
                  <input
                    value={form.subtitle || ""}
                    onChange={(e) => setForm((current) => ({ ...current, subtitle: e.target.value }))}
                    placeholder="Visas under rubriken på startsidan"
                    className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-gold-500/30 transition-all"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-1">Beskrivning</label>
                  <textarea
                    value={form.description || ""}
                    onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))}
                    rows={3}
                    placeholder="Intern anteckning för teamet"
                    className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-gold-500/30 transition-all resize-none"
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4 content-start">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-1">Mode</label>
                  <select
                    value={form.filterMode}
                    onChange={(e) => setForm((current) => ({ ...current, filterMode: e.target.value as HomeCategorySection["filterMode"] }))}
                    className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-gold-500/30 transition-all"
                  >
                    <option value="FILTER">Filter</option>
                    <option value="MANUAL">Manual</option>
                    <option value="HYBRID">Hybrid</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-1">Max restauranger</label>
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={form.maxRestaurants}
                    onChange={(e) => setForm((current) => ({ ...current, maxRestaurants: Number(e.target.value || 8) }))}
                    className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-gold-500/30 transition-all"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-1">Sort order</label>
                  <input
                    type="number"
                    value={form.sortOrder}
                    onChange={(e) => setForm((current) => ({ ...current, sortOrder: Number(e.target.value || 0) }))}
                    className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-gold-500/30 transition-all"
                  />
                </div>
                <button
                  onClick={() => setForm((current) => ({ ...current, isActive: !current.isActive }))}
                  className={`mt-6 h-[46px] rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
                    form.isActive
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                  }`}
                >
                  {form.isActive ? "Aktiv" : "Inaktiv"}
                </button>
              </div>
            </div>

            <div className="grid xl:grid-cols-[1.1fr_0.9fr] gap-6">
              <div className="space-y-6 p-6 rounded-[2rem] border border-gold-500/15 bg-gold-500/5">
                <div className="flex items-center gap-2">
                  <Filter size={15} className="text-gold-500" />
                  <h3 className="text-sm font-black uppercase tracking-widest">Filterregler</h3>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-1">Sökterm</label>
                    <input
                      value={form.filters.searchTerm || ""}
                      onChange={(e) => updateFilters({ searchTerm: e.target.value })}
                      placeholder="pizza, sushi, kebab..."
                      className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-gold-500/30 transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-1">Kök (kommaseparerat)</label>
                    <input
                      value={(form.filters.cuisines || []).join(", ")}
                      onChange={(e) => updateFilters({ cuisines: splitCsv(e.target.value) })}
                      placeholder="Pizza, Sushi"
                      className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-gold-500/30 transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-1">Tags (kommaseparerat)</label>
                    <input
                      value={(form.filters.tags || []).join(", ")}
                      onChange={(e) => updateFilters({ tags: splitCsv(e.target.value) })}
                      placeholder="Halal, Burgare"
                      className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-gold-500/30 transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-1">Sortera efter</label>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={form.filters.sortBy || "FEATURED"}
                        onChange={(e) => updateFilters({ sortBy: e.target.value as HomeCategorySection["filters"]["sortBy"] })}
                        className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-gold-500/30 transition-all"
                      >
                        <option value="FEATURED">Featured</option>
                        <option value="RATING">Betyg</option>
                        <option value="ETA">ETA</option>
                        <option value="NAME">Namn</option>
                      </select>
                      <select
                        value={form.filters.sortDirection || "DESC"}
                        onChange={(e) => updateFilters({ sortDirection: e.target.value as HomeCategorySection["filters"]["sortDirection"] })}
                        className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-gold-500/30 transition-all"
                      >
                        <option value="DESC">Desc</option>
                        <option value="ASC">Asc</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="grid sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-1">Min betyg</label>
                    <input type="number" min={0} max={5} step="0.1" value={form.filters.minRating ?? ""} onChange={(e) => updateFilters({ minRating: e.target.value ? Number(e.target.value) : null })} className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-gold-500/30 transition-all" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-1">Max ETA (min)</label>
                    <input type="number" min={0} value={form.filters.maxEtaMinutes ?? ""} onChange={(e) => updateFilters({ maxEtaMinutes: e.target.value ? Number(e.target.value) : null })} className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-gold-500/30 transition-all" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-1">Max leveransavgift</label>
                    <input type="number" min={0} value={form.filters.maxDeliveryFee ?? ""} onChange={(e) => updateFilters({ maxDeliveryFee: e.target.value ? Number(e.target.value) : null })} className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-gold-500/30 transition-all" />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-2">Featured class</label>
                  <div className="flex gap-2 flex-wrap">
                    {[1, 2, 3].map((value) => {
                      const active = (form.filters.featuredClasses || []).includes(value);
                      return (
                        <button
                          key={value}
                          onClick={() => toggleFeaturedClass(value)}
                          className={`px-4 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
                            active
                              ? "bg-gold-500 text-[#0d0d0d] border-gold-500"
                              : "bg-[var(--bg-primary)] border-[var(--border-subtle)] text-[var(--text-secondary)]"
                          }`}
                        >
                          Class {value}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid sm:grid-cols-3 gap-3">
                  {[
                    { key: "openNowOnly", label: "Endast öppna" },
                    { key: "dealsOnly", label: "Måste ha deals" },
                    { key: "freeDeliveryOnly", label: "Fri leverans" },
                  ].map((toggle) => {
                    const active = Boolean(form.filters[toggle.key as keyof HomeCategorySection["filters"]]);
                    return (
                      <button
                        key={toggle.key}
                        onClick={() => updateFilters({ [toggle.key]: !active } as Partial<HomeCategorySection["filters"]>)}
                        className={`px-4 py-3 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
                          active
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-[var(--bg-primary)] text-[var(--text-secondary)] border-[var(--border-subtle)]"
                        }`}
                      >
                        {toggle.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-6">
                <div className="p-6 rounded-[2rem] border border-violet-500/20 bg-violet-500/5 space-y-4">
                  <div className="flex items-center gap-2">
                    <Clock3 size={15} className="text-violet-400" />
                    <h3 className="text-sm font-black uppercase tracking-widest">Schema</h3>
                  </div>
                  <button
                    onClick={() => updateSchedule({ enabled: !form.schedule.enabled })}
                    className={`w-full px-4 py-3 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
                      form.schedule.enabled
                        ? "bg-violet-500/12 text-violet-300 border-violet-500/30"
                        : "bg-[var(--bg-primary)] text-[var(--text-secondary)] border-[var(--border-subtle)]"
                    }`}
                  >
                    {form.schedule.enabled ? "Schema aktivt" : "Alltid synlig"}
                  </button>

                  <div className="flex gap-2 flex-wrap">
                    {dayOptions.map((day) => {
                      const active = (form.schedule.daysOfWeek || []).includes(day.value);
                      return (
                        <button
                          key={day.value}
                          onClick={() => toggleDay(day.value)}
                          className={`px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
                            active
                              ? "bg-violet-500 text-white border-violet-500"
                              : "bg-[var(--bg-primary)] text-[var(--text-secondary)] border-[var(--border-subtle)]"
                          }`}
                        >
                          {day.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-1">Från</label>
                      <input type="time" value={form.schedule.startTime || ""} onChange={(e) => updateSchedule({ startTime: e.target.value || null })} className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-violet-500/30 transition-all" />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-1">Till</label>
                      <input type="time" value={form.schedule.endTime || ""} onChange={(e) => updateSchedule({ endTime: e.target.value || null })} className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-violet-500/30 transition-all" />
                    </div>
                  </div>
                </div>

                <div className="p-6 rounded-[2rem] border border-emerald-500/20 bg-emerald-500/5 space-y-4">
                  <div className="flex items-center gap-2">
                    <Store size={15} className="text-emerald-400" />
                    <h3 className="text-sm font-black uppercase tracking-widest">Valda restauranger</h3>
                  </div>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
                    <input
                      value={restaurantSearch}
                      onChange={(e) => setRestaurantSearch(e.target.value)}
                      placeholder="Sök restaurang..."
                      className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl pl-9 pr-4 py-3 text-xs font-bold outline-none focus:border-emerald-500/30 transition-all"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 min-h-8">
                    {form.manualRestaurantIds.length === 0 ? (
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)]/60">Inga manuella restauranger valda</span>
                    ) : (
                      form.manualRestaurantIds.map((restaurantId) => {
                        const restaurant = restaurants.find((entry) => entry.id === restaurantId);
                        return (
                          <button
                            key={restaurantId}
                            onClick={() => toggleRestaurant(restaurantId)}
                            className="px-3 py-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-300 text-[10px] font-black uppercase tracking-widest"
                          >
                            {restaurant?.name || restaurantId}
                          </button>
                        );
                      })
                    )}
                  </div>
                  <div className="max-h-64 overflow-auto space-y-2 pr-1">
                    {filteredRestaurants.map((restaurant) => {
                      const active = form.manualRestaurantIds.includes(restaurant.id);
                      return (
                        <button
                          key={restaurant.id}
                          onClick={() => toggleRestaurant(restaurant.id)}
                          className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                            active
                              ? "bg-emerald-500/10 border-emerald-500/20"
                              : "bg-[var(--bg-primary)] border-[var(--border-subtle)] hover:border-emerald-500/20"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <div className="text-xs font-black uppercase tracking-wide text-[var(--text-primary)]">{restaurant.name}</div>
                              <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)] mt-1">{restaurant.cuisine || "Restaurang"}{restaurant.city ? ` · ${restaurant.city}` : ""}</div>
                            </div>
                            <div className={`w-4 h-4 rounded-full border ${active ? "bg-emerald-400 border-emerald-400" : "border-[var(--border-subtle)]"}`} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={resetForm} className="px-6 py-3 bg-[var(--border-subtle)] hover:bg-white/10 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all">
                Avbryt
              </button>
              <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-8 py-3 bg-gold-500 hover:bg-gold-400 text-[#0d0d0d] font-black uppercase tracking-widest text-[10px] rounded-2xl transition-all shadow-xl shadow-gold-500/20 disabled:opacity-60">
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                {editId ? "Uppdatera kategori" : "Spara kategori"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-gold-500" /></div>
      ) : sortedCategories.length === 0 ? (
        <div className="py-20 text-center border border-dashed border-[var(--border-subtle)] rounded-3xl">
          <Filter size={32} className="text-[var(--text-secondary)] opacity-20 mx-auto mb-3" />
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] opacity-30">
            Inga kategorier ännu — klicka "Ny kategori" för att skapa den första
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedCategories.map((section, index) => {
            const summary = formatFilterSummary(section);
            return (
              <motion.div
                key={section.id}
                layout
                className={`panel-muted rounded-[28px] p-6 transition-all ${
                  section.isActive ? "" : "opacity-60"
                }`}
              >
                <div className="flex items-center gap-5 flex-wrap">
                  <div className="shrink-0 w-20 h-20 rounded-[1.7rem] bg-gold-500/10 border border-gold-500/20 flex items-center justify-center text-gold-500">
                    <Filter size={22} />
                  </div>

                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-base font-black uppercase tracking-tight">{section.title}</p>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border uppercase ${section.isActive ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border-rose-500/20"}`}>{section.isActive ? "Aktiv" : "Dold"}</span>
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full border bg-sky-500/10 text-sky-400 border-sky-500/20 uppercase">{section.filterMode}</span>
                      {section.schedule.enabled && <span className="text-[10px] font-black px-2 py-0.5 rounded-full border bg-violet-500/10 text-violet-300 border-violet-500/20 uppercase">Schema</span>}
                    </div>
                    {!!section.subtitle && <p className="text-[11px] font-bold text-[var(--text-secondary)] truncate">{section.subtitle}</p>}
                    <div className="flex gap-2 flex-wrap">
                      {summary.map((item) => (
                        <span key={item} className="px-2 py-1 rounded-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)]">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex flex-col gap-1">
                      <button onClick={() => moveCategory(section, "up")} disabled={index === 0} className="p-1.5 rounded-lg disabled:opacity-20 hover:bg-white/10 transition-all text-[var(--text-secondary)]"><ArrowUp size={12} /></button>
                      <button onClick={() => moveCategory(section, "down")} disabled={index === sortedCategories.length - 1} className="p-1.5 rounded-lg disabled:opacity-20 hover:bg-white/10 transition-all text-[var(--text-secondary)]"><ArrowDown size={12} /></button>
                    </div>
                    <button onClick={() => toggleActive(section)} className={`p-2 rounded-xl border transition-all ${section.isActive ? "bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"}`}>
                      {section.isActive ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <button onClick={() => handleEdit(section)} className="p-2 rounded-xl bg-sky-500/5 border border-sky-500/10 text-sky-400 hover:bg-sky-500/15 transition-all">
                      <Save size={14} />
                    </button>
                    <button onClick={() => setDeleteTarget(section)} className="p-2 rounded-xl bg-rose-500/5 border border-rose-500/10 text-rose-400 hover:bg-rose-500/15 transition-all">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        title="Radera kategori?"
        message={deleteTarget ? `"${deleteTarget.title}" tas bort från både webb och app.` : ""}
        confirmLabel="Radera"
        danger
      />
    </div>
  );
}
