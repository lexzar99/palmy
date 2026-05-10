"use client";

import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  MapPin, Trash2, Plus, Check, X, Bike, Store, Navigation,
  Layers, Info, ShieldCheck, ChevronRight, Loader2, Save,
  Globe, Target, DollarSign, AlertTriangle, RotateCcw,
  Circle, PenLine, Settings,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/components/Toast";
import { ConfirmModal } from "@/components/Modal";
import dynamic from "next/dynamic";
import { API_URL } from "@/lib/api";
import type { Zone } from "@/components/ZoneEditor";

const ZoneEditor = dynamic(() => import("@/components/ZoneEditor"), { ssr: false });
const ZoneTestTool = dynamic(() => import("@/components/ZoneTestTool"), { ssr: false });
const MapsUsageWidget = dynamic(() => import("@/components/MapsUsageWidget"), { ssr: false });

// ── Money helpers ─────────────────────────────────────────────────────────────
const toKr = (v: any): number => {
  const n = Number(v || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.abs(n) >= 1000 ? n / 100 : n;
};
const toOre = (kr: number) => Math.round(kr * 100);

// ── Parse zones from DB → UI ──────────────────────────────────────────────────
// Only keeps zones that can actually be rendered on the map.
// Legacy "radius-only" zones (no centerLat/centerLng, no polygon) are silently
// dropped — they were invisible anyway and would confuse the admin UI.
function parseZones(raw: any): Zone[] {
  try {
    const arr = typeof raw === "string" ? JSON.parse(raw) : (Array.isArray(raw) ? raw : []);
    return arr
      .filter((z: any) => z?.id)
      .map((z: any): Zone | null => {  
        const type: "circle" | "polygon" = z.type === "polygon" ? "polygon" : "circle";

        // Validate geometry exists
        if (type === "polygon") {
          if (!Array.isArray(z.polygon) || z.polygon.length < 3) return null;
        } else {
          // Circle must have both a center AND a radius to be renderable
          if (z.centerLat == null || z.centerLng == null) return null;
          const r = Number(z.radiusKm ?? 0);
          if (!r || r <= 0) return null;
        }

        return {
          id:          String(z.id),
          name:        String(z.name),
          type,
          centerLat:   z.centerLat  != null ? Number(z.centerLat)  : undefined,
          centerLng:   z.centerLng  != null ? Number(z.centerLng)  : undefined,
          radiusKm:    z.radiusKm   != null ? Number(z.radiusKm)   : 0,
          polygon:     Array.isArray(z.polygon) ? z.polygon : undefined,
          deliveryFee: toKr(z.fee ?? z.deliveryFee ?? 0),
          minOrder:    toKr(z.minOrder ?? 0),
          etaMinutes:  z.etaMinutes != null ? Number(z.etaMinutes) : undefined,
          isActive:    z.isActive !== false,
          color:       z.color ?? "",
        };
      })
      .filter((z: Zone | null): z is Zone => z !== null);
  } catch {
    return [];
  }
}

// ── Serialize zones UI → DB ───────────────────────────────────────────────────
function serializeZones(zones: Zone[]): object[] {
  return zones.map(z => ({
    id: z.id,
    name: z.name || "Namnlös Zon",
    type: z.type,
    centerLat:   z.centerLat,
    centerLng:   z.centerLng,
    radiusKm:    z.radiusKm ?? 0,
    polygon:     z.polygon,
    fee:         toOre(z.deliveryFee),
    minOrder:    toOre(z.minOrder),
    etaMinutes:  z.etaMinutes ?? null,
    isActive:    z.isActive,
    color:       z.color,
  }));
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface Restaurant {
  id: string;
  name: string;
  slug: string;
  isOpen: boolean;
  deliveryZones?: any;
  freeDeliveryAbove?: number;
  latitude?: number | null;
  longitude?: number | null;
}

interface City {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  deliveryMode: "ALL" | "ONLY_PICKUP" | "ONLY_DELIVERY";
  zones: any;
  latitude?: number | null;
  longitude?: number | null;
  centerLat?: number | null;
  centerLng?: number | null;
  radiusKm?: number;
  polygon?: string | null;
  freeDeliveryAbove: number;
  restaurants: Restaurant[];
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function CitiesPage() {
  const { success, error: toastErr } = useToast();
  const [cities, setCities] = useState<City[]>([]);
  const [allRestaurants, setAllRestaurants] = useState<Restaurant[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<City | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCityName, setNewCityName] = useState("");

  // Per-restaurant zone override editing
  const [editingRestId, setEditingRestId] = useState<string | null>(null);
  const [restZonesModal, setRestZonesModal] = useState(false);

  const selectedCity = cities.find(c => c.id === selectedId);
  const editingRest = selectedCity?.restaurants.find(r => r.id === editingRestId);

  // ── Zone state derived from city (lifted) ─────────────────────────────────
  const cityZones = selectedCity ? parseZones(selectedCity.zones) : [];
  const restZones = editingRest ? parseZones(editingRest.deliveryZones) : [];

  const setCityZones = (zones: Zone[]) => {
    if (!selectedId) return;
    setCities(prev => prev.map(c =>
      c.id === selectedId ? { ...c, zones: JSON.stringify(serializeZones(zones)) } : c
    ));
  };

  const setRestZones = (zones: Zone[]) => {
    if (!selectedId || !editingRestId) return;
    setCities(prev => prev.map(c => {
      if (c.id !== selectedId) return c;
      return {
        ...c,
        restaurants: c.restaurants.map(r =>
          r.id === editingRestId
            ? { ...r, deliveryZones: JSON.stringify(serializeZones(zones)) }
            : r
        ),
      };
    }));
  };

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, rRes] = await Promise.all([
        axios.get(`${API_URL}/api/cities?all=true`),
        axios.get(`${API_URL}/api/restaurants`),
      ]);
      const normalised = (cRes.data || []).map((c: any) => ({
        ...c,
        freeDeliveryAbove: toKr(c.freeDeliveryAbove),
        restaurants: (c.restaurants || []).map((r: any) => ({
          ...r,
          freeDeliveryAbove: toKr(r.freeDeliveryAbove),
        })),
      }));
      setCities(normalised);
      setAllRestaurants(rRes.data || []);
      if (normalised.length > 0 && !selectedId) setSelectedId(normalised[0].id);
    } catch {
      toastErr("Kunde inte hämta stadsdata");
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => { fetchData(); }, []);

  // ── Add city ─────────────────────────────────────────────────────────────────
  const handleAddCity = async () => {
    if (!newCityName.trim()) return;
    setSaving(true);
    try {
      const res = await axios.post(`${API_URL}/api/cities`, {
        name: newCityName.trim(),
        slug: newCityName.trim().toLowerCase().replace(/\s+/g, "-"),
        deliveryMode: "ALL",
        zones: [],
        isActive: true,
      });
      setCities(prev => [...prev, { ...res.data, freeDeliveryAbove: 0, restaurants: [] }]);
      setSelectedId(res.data.id);
      setNewCityName("");
      setShowAddModal(false);
      success("Stad tillagd!");
    } catch { toastErr("Kunde inte skapa stad"); }
    finally { setSaving(false); }
  };

  // ── Save city ─────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!selectedCity) return;
    setSaving(true);
    try {
      const restaurantIds = selectedCity.restaurants.map(r => r.id);

      // Build per-restaurant zone overrides
      const restaurantZones: Record<string, any> = {};
      selectedCity.restaurants.forEach(r => {
        const rz = parseZones(r.deliveryZones);
        restaurantZones[r.id] = {
          zones: serializeZones(rz),
          freeDeliveryAbove: toOre(r.freeDeliveryAbove ?? 0),
        };
      });

      await axios.post(`${API_URL}/api/cities`, {
        id: selectedCity.id,
        name: selectedCity.name,
        slug: selectedCity.slug,
        deliveryMode: selectedCity.deliveryMode,
        isActive: selectedCity.isActive,
        latitude: selectedCity.centerLat ?? selectedCity.latitude,
        longitude: selectedCity.centerLng ?? selectedCity.longitude,
        centerLat: selectedCity.centerLat ?? selectedCity.latitude,
        centerLng: selectedCity.centerLng ?? selectedCity.longitude,
        radiusKm: selectedCity.radiusKm,
        polygon: selectedCity.polygon,
        freeDeliveryAbove: toOre(selectedCity.freeDeliveryAbove),
        zones: serializeZones(cityZones),
        restaurantIds,
        restaurantZones,
      });
      success("Ändringar sparade!");
    } catch {
      toastErr("Kunde inte spara ändringar.");
    } finally {
      setSaving(false);
    }
  };

  // ── Delete city ───────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    try {
      await axios.delete(`${API_URL}/api/cities/${id}`);
      setCities(prev => prev.filter(c => c.id !== id));
      if (selectedId === id) setSelectedId(null);
      setDeleteConfirm(null);
      success("Stad raderad");
    } catch { toastErr("Kunde inte radera stad"); }
  };

  // ── Update city field ─────────────────────────────────────────────────────────
  const updateCity = (field: string, value: any) => {
    if (!selectedId) return;
    setCities(prev => prev.map(c => c.id === selectedId ? { ...c, [field]: value } : c));
  };

  // ── Toggle restaurant link ────────────────────────────────────────────────────
  const toggleRestaurant = (rId: string) => {
    if (!selectedId) return;
    setCities(prev => prev.map(c => {
      if (c.id !== selectedId) return c;
      const linked = c.restaurants.some(r => r.id === rId);
      if (linked) return { ...c, restaurants: c.restaurants.filter(r => r.id !== rId) };
      const full = allRestaurants.find(r => r.id === rId);
      return full ? { ...c, restaurants: [...c.restaurants, { ...full, freeDeliveryAbove: 0 }] } : c;
    }));
  };

  // ── Render ─────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 pb-16">
      <section className="panel rounded-[32px] px-6 py-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <span className="control-chip">City ops</span>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.06em] text-[var(--text-primary)] sm:text-4xl">Städer, zoner och leveranslogik</h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-[var(--text-secondary)]">Hantera stadstäckning, kopplade restauranger och leveranszoner på ett ställe istället för spridda specialfall.</p>
          </div>
          <button onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 rounded-2xl bg-gold-gradient px-4 py-3 text-[11px] font-black uppercase tracking-[0.22em] text-[#091018]">
            <Plus size={16} /> Ny stad
          </button>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-4">
        <article className="metric-card panel-muted">
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[var(--text-muted)]">Städer</p>
          <p className="mt-3 text-3xl font-black tracking-[-0.05em] text-[var(--text-primary)]">{cities.length}</p>
          <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">Totalt i leveransnätet</p>
        </article>
        <article className="metric-card panel-muted">
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[var(--text-muted)]">Aktiva</p>
          <p className="mt-3 text-3xl font-black tracking-[-0.05em] text-[var(--text-primary)]">{cities.filter((city) => city.isActive).length}</p>
          <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">Öppna för kunder</p>
        </article>
        <article className="metric-card panel-muted">
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[var(--text-muted)]">Kopplade restauranger</p>
          <p className="mt-3 text-3xl font-black tracking-[-0.05em] text-[var(--text-primary)]">{cities.reduce((sum, city) => sum + city.restaurants.length, 0)}</p>
          <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">Placeringar i stadsnätet</p>
        </article>
        <article className="metric-card panel-muted">
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[var(--text-muted)]">Zoner</p>
          <p className="mt-3 text-3xl font-black tracking-[-0.05em] text-[var(--text-primary)]">{cities.reduce((sum, city) => sum + parseZones(city.zones).length, 0)}</p>
          <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">Ritade områden totalt</p>
        </article>
      </div>

      <MapsUsageWidget />

      <div className="grid grid-cols-1 lg:grid-cols-[340px,1fr] gap-8">
        {/* ── Sidebar: city list ── */}
        <div className="space-y-4">
          <div className="panel rounded-[32px] p-5 space-y-2.5">
            <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-primary)]/20">Städer</div>
            {loading ? (
              <div className="py-10 flex justify-center"><Loader2 className="animate-spin text-[var(--text-primary)]/30" /></div>
            ) : cities.length === 0 ? (
              <div className="py-10 text-center space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] opacity-40">Inga städer</p>
                <button onClick={() => setShowAddModal(true)}
                  className="w-full py-3 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 text-[10px] font-black uppercase tracking-widest hover:bg-sky-500/20 transition-all">
                  + Lägg till Lund
                </button>
              </div>
            ) : cities.map(city => (
              <div key={city.id} className="relative group/item">
                <button onClick={() => setSelectedId(city.id)}
                  className={`w-full flex items-center justify-between p-5 rounded-3xl border-2 transition-all ${
                    selectedId === city.id
                      ? "bg-sky-500/10 border-sky-500/40"
                      : "bg-[var(--panel-muted)] border-transparent hover:bg-white/8"
                  }`}>
                  <div className="text-left">
                    <div className="text-base font-black uppercase tracking-tight mb-1 flex items-center gap-2">
                      {city.name}
                      {!city.isActive && <span className="text-[10px] px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded-full font-black">INAKTIV</span>}
                    </div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/30 flex items-center gap-1.5">
                      {parseZones(city.zones).length} zoner
                      <span className="opacity-20">·</span>
                      {(city.restaurants || []).length} rest.
                    </div>
                  </div>
                  <ChevronRight size={16} className={selectedId === city.id ? "text-sky-500" : "text-[var(--text-primary)]/10"} />
                </button>
                <button onClick={() => setDeleteConfirm(city)}
                  className="absolute top-3.5 right-3.5 opacity-0 group-hover/item:opacity-100 p-1.5 text-red-400 hover:scale-110 transition-all">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>

          {/* Info card */}
          <div className="panel rounded-[32px] p-6 space-y-3">
            <div className="flex items-center gap-2 text-sky-400">
              <Info size={14} />
              <span className="text-[10px] font-black uppercase tracking-widest">Hur fungerar zoner?</span>
            </div>
            <p className="text-[10px] text-[var(--text-primary)]/40 leading-relaxed uppercase font-bold">
              Rita cirklar eller polygoner direkt på kartan. Varje zon har egen avgift och minimiorder. Kunder valideras mot den minsta zon de befinner sig i. Restauranger kan ha egna zoner som ersätter stadens.
            </p>
          </div>
        </div>

        {/* ── Main area ── */}
        <AnimatePresence mode="wait">
          {!selectedCity ? (
            <div className="flex flex-col items-center justify-center py-32 text-[var(--text-primary)]/10 gap-4">
              <MapPin size={56} />
              <p className="font-black uppercase tracking-[0.4em] text-sm">Välj en stad</p>
            </div>
          ) : (
            <motion.div key={selectedCity.id}
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="space-y-8">

              {/* ── City settings ── */}
              <div className="panel rounded-[32px] p-8 space-y-8">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <h2 className="text-2xl font-black uppercase tracking-tight flex items-center gap-3">
                      <ShieldCheck className="text-sky-500" size={26} />
                      {selectedCity.name}
                    </h2>
                    <p className="text-[var(--text-primary)]/30 text-[10px] font-black uppercase tracking-widest mt-1">Övergripande inställningar</p>
                  </div>
                  {/* Active toggle */}
                  <div className="flex items-center gap-2 p-1 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl">
                    {[{ v: true, label: "Aktiv", cls: "bg-emerald-500 text-white" }, { v: false, label: "Inaktiv", cls: "bg-red-500 text-white" }].map(opt => (
                      <button key={String(opt.v)} onClick={() => updateCity("isActive", opt.v)}
                        className={`px-5 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${selectedCity.isActive === opt.v ? opt.cls : "text-[var(--text-primary)]/20 hover:text-[var(--text-primary)]/40"}`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Delivery mode */}
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { id: "ALL",           label: "Full Service",        desc: "Utkörning + Avhämtning", Icon: Navigation },
                    { id: "ONLY_DELIVERY", label: "Endast Utkörning",    desc: "Ingen avhämtning",       Icon: Bike },
                    { id: "ONLY_PICKUP",   label: "Endast Avhämtning",   desc: "Ingen utkörning",        Icon: Store },
                  ].map(m => (
                    <button key={m.id} onClick={() => updateCity("deliveryMode", m.id)}
                      className={`p-5 rounded-[2rem] border-2 text-left transition-all ${selectedCity.deliveryMode === m.id ? "bg-sky-500/10 border-sky-500/40" : "bg-[var(--border-subtle)] border-[var(--border-subtle)] hover:border-sky-500/20"}`}>
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${selectedCity.deliveryMode === m.id ? "bg-sky-500 text-white" : "bg-[var(--border-subtle)] text-[var(--text-primary)]/30"}`}>
                        <m.Icon size={20} />
                      </div>
                      <div className="font-black uppercase tracking-widest text-[10px] mb-0.5">{m.label}</div>
                      <div className="text-[10px] font-bold text-[var(--text-primary)]/20 uppercase tracking-wide">{m.desc}</div>
                    </button>
                  ))}
                </div>

                {/* Free delivery + GPS coords */}
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/20 ml-1">Gratis leverans över (kr) — 0 = ej aktivt</label>
                    <input type="number" min={0}
                      className="w-full bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-2xl py-3.5 px-5 outline-none focus:ring-2 focus:ring-emerald-500/30 font-black text-sm text-emerald-400"
                      value={selectedCity.freeDeliveryAbove || 0}
                      onChange={e => updateCity("freeDeliveryAbove", Number(e.target.value) || 0)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/20 ml-1">GPS Centrum (sätts automatiskt från kartan)</label>
                    <div className="flex items-center gap-2 bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-2xl py-3.5 px-5">
                      <MapPin size={14} className="text-gold-500 shrink-0" />
                      <span className="text-xs font-mono text-[var(--text-secondary)]">
                        {(selectedCity.centerLat ?? selectedCity.latitude)?.toFixed(5) ?? "—"},{" "}
                        {(selectedCity.centerLng ?? selectedCity.longitude)?.toFixed(5) ?? "—"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Zone Editor ── */}
              <div className="panel rounded-[32px] p-8 space-y-6">
                <div>
                  <h2 className="text-2xl font-black uppercase tracking-tight flex items-center gap-3">
                    <MapPin className="text-gold-500" size={26} />
                    Leveranszoner
                  </h2>
                  <p className="text-[var(--text-primary)]/30 text-[10px] font-black uppercase tracking-widest mt-1">
                    Rita cirklar och polygoner — varje zon har sin egen form, avgift och minimiorder
                  </p>
                </div>

                <ZoneEditor
                  cityName={selectedCity.name}
                  zones={cityZones}
                  onChange={setCityZones}
                  centerLat={selectedCity.centerLat ?? selectedCity.latitude}
                  centerLng={selectedCity.centerLng ?? selectedCity.longitude}
                  onCenterChange={(lat, lng) => {
                    updateCity("centerLat", lat);
                    updateCity("centerLng", lng);
                    updateCity("latitude", lat);
                    updateCity("longitude", lng);
                  }}
                  mapHeight={500}
                />

                {/* Zone stats */}
                {cityZones.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                    <div className="p-4 bg-[var(--bg-primary)]/60 border border-[var(--border-subtle)] rounded-2xl text-center">
                      <div className="text-2xl font-black text-sky-400">{cityZones.length}</div>
                      <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] mt-0.5">Zoner totalt</div>
                    </div>
                    <div className="p-4 bg-[var(--bg-primary)]/60 border border-[var(--border-subtle)] rounded-2xl text-center">
                      <div className="text-2xl font-black text-emerald-400">{cityZones.filter(z => z.isActive).length}</div>
                      <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] mt-0.5">Aktiva</div>
                    </div>
                    <div className="p-4 bg-[var(--bg-primary)]/60 border border-[var(--border-subtle)] rounded-2xl text-center">
                      <div className="text-2xl font-black text-amber-400">{cityZones.filter(z => z.type === "circle").length}</div>
                      <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] mt-0.5">Cirklar</div>
                    </div>
                    <div className="p-4 bg-[var(--bg-primary)]/60 border border-[var(--border-subtle)] rounded-2xl text-center">
                      <div className="text-2xl font-black text-violet-400">{cityZones.filter(z => z.type === "polygon").length}</div>
                      <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] mt-0.5">Polygoner</div>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Zone Test Tool ── */}
              <ZoneTestTool />

              {/* ── Restaurants ── */}
              <div className="panel rounded-[32px] p-8 space-y-8">
                <div>
                  <h2 className="text-2xl font-black uppercase tracking-tight flex items-center gap-3">
                    <Store className="text-gold-500" size={26} />
                    Kopplade Restauranger
                  </h2>
                  <p className="text-[var(--text-primary)]/30 text-[10px] font-black uppercase tracking-widest mt-1">
                    Välj restauranger och konfigurera deras leveranszoner
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-gold-500/5 border border-gold-500/20 flex items-start gap-3">
                  <Info size={14} className="text-gold-500 shrink-0 mt-0.5" />
                  <p className="text-[10px] font-bold text-gold-400 leading-relaxed">
                    <strong>Standard:</strong> Restaurangen ärver stadens zoner. <strong>Anpassad:</strong> Restaurangen har egna zoner (ersätter stadens). Perfekt när t.ex. en restaurang i Malmö inte levererar till hela staden.
                  </p>
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {allRestaurants.map(r => {
                    const isLinked = selectedCity.restaurants.some(cr => cr.id === r.id);
                    const cityRest = selectedCity.restaurants.find(cr => cr.id === r.id);
                    const hasCustomZones = cityRest ? parseZones(cityRest.deliveryZones).length > 0 : false;

                    return (
                      <div key={r.id} className={`p-5 rounded-3xl border-2 transition-all ${isLinked ? "bg-gold-500/8 border-gold-500/30" : "bg-[var(--border-subtle)] border-transparent hover:border-[var(--border-subtle)]"}`}>
                        <div className="flex items-center gap-3 mb-3">
                          <button onClick={() => toggleRestaurant(r.id)}
                            className={`w-8 h-8 rounded-xl flex items-center justify-center border transition-all shrink-0 ${isLinked ? "bg-gold-500 border-gold-500 text-[#0d0d0d]" : "bg-[var(--border-subtle)] border-[var(--border-subtle)] text-[var(--text-primary)]/20"}`}>
                            {isLinked ? <Check size={15} /> : <Plus size={15} />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-black uppercase tracking-tight truncate">{r.name}</div>
                            <div className="text-[10px] font-bold text-[var(--text-primary)]/20 uppercase tracking-widest">
                              {r.isOpen ? "🟢 Öppen" : "⚪ Stängd"}
                              {hasCustomZones && " · ✏️ Egna zoner"}
                            </div>
                          </div>
                        </div>

                        {isLinked && (
                          <div className="flex flex-col gap-2 pt-2 border-t border-white/5">
                            {/* Free delivery for this restaurant */}
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] shrink-0">Gratis fr.</span>
                              <input type="number" min={0}
                                className="flex-1 bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-xl px-2.5 py-1.5 text-[10px] font-black outline-none focus:border-gold-500/30 text-emerald-400 text-right"
                                value={cityRest?.freeDeliveryAbove ?? 0}
                                onChange={e => setCities(prev => prev.map(c => {
                                  if (c.id !== selectedId) return c;
                                  return { ...c, restaurants: c.restaurants.map(rr => rr.id === r.id ? { ...rr, freeDeliveryAbove: Number(e.target.value) || 0 } : rr) };
                                }))}
                                placeholder="0 kr"
                              />
                              <span className="text-[10px] font-bold text-[var(--text-secondary)]">kr</span>
                            </div>

                            {/* Edit restaurant zones */}
                            <button
                              onClick={() => { setEditingRestId(r.id); setRestZonesModal(true); }}
                              className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${hasCustomZones ? "bg-sky-500/20 border border-sky-500/30 text-sky-400" : "bg-white/5 text-[var(--text-secondary)] hover:text-white hover:bg-white/10"}`}>
                              <Settings size={11} />
                              {hasCustomZones ? `${parseZones(cityRest?.deliveryZones).length} egna zoner` : "Konfigurera zoner"}
                            </button>

                            {hasCustomZones && (
                              <button
                                onClick={() => setRestZones([])}
                                className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-rose-400 hover:text-rose-300 transition-all">
                                <RotateCcw size={9} /> Återställ till stadszon
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {allRestaurants.length === 0 && (
                    <div className="col-span-full py-10 text-center opacity-20 font-black text-xs uppercase tracking-widest border border-dashed border-white/10 rounded-3xl">
                      Inga restauranger att koppla
                    </div>
                  )}
                </div>
              </div>

              {/* ── Save ── */}
              <div className="flex justify-end pt-6 border-t border-[var(--border-subtle)]">
                <button onClick={handleSave} disabled={saving}
                  className={`flex items-center gap-3 px-10 py-4 rounded-[2rem] font-black uppercase tracking-[0.2em] transition-all shadow-2xl text-sm ${saving ? "bg-emerald-500 text-white scale-95" : "bg-sky-500 hover:bg-sky-400 text-white hover:scale-[1.02]"}`}>
                  {saving ? <><Check size={18} /> Sparat!</> : <><Save size={18} /> Spara alla ändringar</>}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Restaurant zone editor modal ── */}
      <AnimatePresence>
        {restZonesModal && editingRest && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center p-6"
            onClick={() => setRestZonesModal(false)}>
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
              className="w-full max-w-5xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-[2.5rem] p-8 space-y-6 overflow-y-auto max-h-[90vh]"
              onClick={e => e.stopPropagation()}>

              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
                    <Settings className="text-sky-400" size={22} />
                    {editingRest.name} — Egna Zoner
                  </h2>
                  <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mt-1">
                    Dessa zoner ersätter stadens zoner för just denna restaurang
                  </p>
                </div>
                <button onClick={() => setRestZonesModal(false)}
                  className="p-2.5 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all">
                  <X size={16} />
                </button>
              </div>

              <div className="p-4 bg-sky-500/5 border border-sky-500/20 rounded-2xl flex items-start gap-3">
                <Info size={14} className="text-sky-400 shrink-0 mt-0.5" />
                <p className="text-[10px] font-bold text-sky-400 leading-relaxed">
                  Rita restaurangens egna leveranszoner. Kunder valideras mot DESSA zoner — inte stadens — för den här restaurangen.
                  Töm zonerna (ta bort alla) för att återgå till stadens zoner.
                </p>
              </div>

              <ZoneEditor
                cityName={editingRest.name}
                zones={restZones}
                onChange={zones => setRestZones(zones)}
                centerLat={
                  // Use first non-null, non-zero coordinate available
                  (editingRest.latitude  && editingRest.latitude  !== 0  ? editingRest.latitude  : null) ??
                  (selectedCity?.centerLat && selectedCity.centerLat !== 0 ? selectedCity.centerLat : null) ??
                  (selectedCity?.latitude  && selectedCity.latitude  !== 0 ? selectedCity.latitude  : null) ??
                  // Derive from city zones centroid
                  (() => { const z = parseZones(selectedCity?.zones).find(z => z.centerLat); return z?.centerLat ?? null; })()
                }
                centerLng={
                  (editingRest.longitude && editingRest.longitude !== 0 ? editingRest.longitude : null) ??
                  (selectedCity?.centerLng && selectedCity.centerLng !== 0 ? selectedCity.centerLng : null) ??
                  (selectedCity?.longitude && selectedCity.longitude !== 0 ? selectedCity.longitude : null) ??
                  (() => { const z = parseZones(selectedCity?.zones).find(z => z.centerLng); return z?.centerLng ?? null; })()
                }
                mapHeight={440}
              />

              <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border-subtle)]">
                <button onClick={() => { setRestZones([]); setRestZonesModal(false); }}
                  className="px-6 py-3 rounded-2xl bg-[var(--border-subtle)] hover:bg-white/10 font-black uppercase tracking-widest text-[10px] transition-all text-rose-400">
                  <RotateCcw size={13} className="inline mr-1.5" />Rensa & använd stadszon
                </button>
                <button onClick={() => setRestZonesModal(false)}
                  className="px-8 py-3 rounded-2xl bg-sky-500 hover:bg-sky-400 text-white font-black uppercase tracking-widest text-[10px] transition-all shadow-lg shadow-sky-500/20">
                  <Check size={13} className="inline mr-1.5" />Klar — spara via knappen nedan
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Add city modal ── */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-6"
            onClick={() => setShowAddModal(false)}>
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-sm bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-[2rem] p-8 space-y-6"
              onClick={e => e.stopPropagation()}>
              <div className="text-center space-y-2">
                <div className="w-14 h-14 bg-sky-500/10 rounded-3xl flex items-center justify-center text-sky-500 mx-auto mb-3"><MapPin size={28} /></div>
                <h2 className="text-xl font-black uppercase tracking-tight">Ny Stad</h2>
                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/20">Ange stadens namn</p>
              </div>
              <input autoFocus value={newCityName} onChange={e => setNewCityName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAddCity()}
                className="w-full bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-2xl py-4 px-5 outline-none focus:ring-2 focus:ring-sky-500/50 font-bold text-lg"
                placeholder="t.ex. Stockholm" />
              <div className="flex gap-3">
                <button onClick={() => setShowAddModal(false)}
                  className="flex-1 py-3.5 bg-[var(--border-subtle)] hover:bg-white/10 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all">
                  Avbryt
                </button>
                <button onClick={handleAddCity} disabled={saving}
                  className="flex-1 py-3.5 bg-sky-500 hover:bg-sky-400 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all shadow-xl shadow-sky-500/20">
                  {saving ? <Loader2 size={14} className="animate-spin mx-auto" /> : "Spara stad"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmModal
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm.id)}
        title="Radera stad"
        message={`Är du säker på att du vill radera ${deleteConfirm?.name} permanent?`}
        confirmLabel="Radera"
        danger
      />
    </div>
  );
}
