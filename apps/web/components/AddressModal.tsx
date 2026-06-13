"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin, X, ArrowRight, Truck, Store, AlertCircle,
  Loader2, CheckCircle2, Building2, ChevronRight, Search, LocateFixed, RotateCw, Home, Briefcase,
} from "lucide-react";
import { loadLeaflet, CARTO_LIGHT, CARTO_ATTRIBUTION, DEFAULT_MAP_CENTER } from "@/lib/leaflet";
import { readQuickAddresses, formatQuickAddress, type QuickAddress } from "@/lib/quickAddresses";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// Liten cookie-hjälpare — kommer ihåg om användaren nekat GPS, så vi inte
// auto-promptar plats varje omstart.
const getCookie = (name: string): string | null => {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return m ? decodeURIComponent(m[1]) : null;
};
const setCookie = (name: string, value: string, days = 365) => {
  if (typeof document === "undefined") return;
  const exp = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${exp}; path=/; SameSite=Lax`;
};

interface PlacePrediction {
  description: string;
  place_id: string;
}

interface CityOption {
  id: string;
  name: string;
  slug: string;
  deliveryMode: string;
  parentCityId?: string | null;
}

interface CityGroup {
  parent: CityOption;
  children: CityOption[];
}

interface AddressModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (address: string, orderType: "DELIVERY" | "PICKUP", coords?: { lat: number; lng: number }, postalCode?: string, city?: string) => void;
  onFail?: (reason: string) => void;
  orderType: "DELIVERY" | "PICKUP";
  setOrderType: (type: "DELIVERY" | "PICKUP") => void;
}

export default function AddressModal({
  isOpen,
  onClose,
  onConfirm,
  orderType,
  setOrderType,
}: AddressModalProps) {
  // Portal-mount-flagga (SSR-säker) — modalen renderas till document.body så
  // dess z-index inte fångas av HomeClients sticky-header-stacking och därför
  // alltid ligger ÖVER BottomNav (z-100).
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  // ── Delivery state ──────────────────────────────────────────────────────────
  const [input, setInput] = useState("");
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [selectedCoords, setSelectedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [selectedPostalCode, setSelectedPostalCode] = useState<string | null>(null);
  const [selectedDeliveryCity, setSelectedDeliveryCity] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autocompleteError, setAutocompleteError] = useState(false);

  // ── Map state ────────────────────────────────────────────────────────────────
  const [mapError, setMapError] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapKey, setMapKey] = useState(0); // bumpa för att tvinga om-init (retry)
  const [locating, setLocating] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<QuickAddress[]>([]);
  const autoLocatedRef = useRef(false);
  const mapRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const userMovedRef = useRef(false); // true när användaren själv pannat kartan
  const selectedCoordsRef = useRef<{ lat: number; lng: number } | null>(null);

  // ── Pickup state ────────────────────────────────────────────────────────────
  const [cityGroups, setCityGroups] = useState<CityGroup[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [selectedCity, setSelectedCity] = useState<CityOption | null>(null);
  const [citySearch, setCitySearch] = useState("");

  const debounceRef = useRef<any>(null);
  const sessionToken = useRef<string>("");

  useEffect(() => { selectedCoordsRef.current = selectedCoords; }, [selectedCoords]);

  // ── On open ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) { autoLocatedRef.current = false; return; }
    sessionToken.current = crypto.randomUUID();

    if (orderType === "DELIVERY") {
      const stored = localStorage.getItem("platform_address") || "";
      const storedCoords = localStorage.getItem("platform_coords");
      setInput(stored);
      setSelectedAddress(stored || null);
      if (storedCoords) {
        try { setSelectedCoords(JSON.parse(storedCoords)); } catch (err) {
          console.warn("Failed to parse stored coords:", err);
        }
      }
      try { setSavedAddresses(readQuickAddresses()); } catch { /* noop */ }
    }

    setPredictions([]);
    setError(null);
    setAutocompleteError(false);
    setMapError(false);
    setSelectedCity(null);
    setCitySearch("");
  }, [isOpen]);

  // ── Reverse-geocoda en kart-position via backend (keyless) → adressfält ───────
  const handleMapPosition = useCallback(async (lat: number, lng: number) => {
    setSelectedCoords({ lat, lng });
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/places/reverse?lat=${lat}&lng=${lng}`);
      const data = await res.json();
      if (data?.address) {
        setSelectedAddress(data.address);
        setInput(data.address);
        setSelectedPostalCode(data.postalCode ?? null);
        setSelectedDeliveryCity(data.city ?? null);
      }
    } catch { /* behåll koordinaterna även om reverse failar */ }
    finally { setLoading(false); }
  }, []);

  // ── Callback-ref: initierar Leaflet-kartan (keyless CARTO-tiles) när div:en
  //    monteras. Fast nål i mitten — man flyttar KARTAN för att välja plats. ──
  const initMap = useCallback((node: HTMLDivElement | null) => {
    if (!node) { mapRef.current = null; tileLayerRef.current = null; setMapReady(false); return; }
    if (node.dataset.gmInit === "1") return;
    node.dataset.gmInit = "1";
    setMapError(false);
    loadLeaflet()
      .then((L) => {
        if (!node.isConnected) return;
        const start = selectedCoordsRef.current || DEFAULT_MAP_CENTER;
        const map = L.map(node, { zoomControl: false, attributionControl: true })
          .setView([start.lat, start.lng], selectedCoordsRef.current ? 16 : 12);
        const tile = L.tileLayer(CARTO_LIGHT, {
          attribution: CARTO_ATTRIBUTION,
          maxZoom: 19,
          subdomains: "abcd",
        }).addTo(map);
        mapRef.current = map;
        tileLayerRef.current = tile;
        setMapReady(true);
        // Bottom-sheet animerar in → säkerställ korrekt tile-storlek efteråt.
        setTimeout(() => { try { map.invalidateSize(); } catch { /* noop */ } }, 300);

        // Fast nål: när användaren själv drar kartan (dragstart) reverse-geocodar
        // vi mittpunkten på moveend. Programmatiska setView (sök/sparad/GPS)
        // fyller redan i adressen → hoppas över via userMovedRef.
        map.on("dragstart", () => { userMovedRef.current = true; });
        map.on("moveend", () => {
          if (!userMovedRef.current) return;
          userMovedRef.current = false;
          const c = map.getCenter();
          if (c) handleMapPosition(c.lat, c.lng);
        });
      })
      .catch(() => { node.dataset.gmInit = ""; setMapError(true); });
  }, [handleMapPosition]);

  // Säkerställ rätt storlek när modalen öppnas (container var 0 under animation).
  useEffect(() => {
    if (isOpen && mapReady && mapRef.current) {
      const t = setTimeout(() => { try { mapRef.current.invalidateSize(); } catch { /* noop */ } }, 320);
      return () => clearTimeout(t);
    }
  }, [isOpen, mapReady]);

  // Panna kartan till en ny position (fast nål följer mitten). Programmatisk
  // → triggar INTE reverse-geocode (userMovedRef förblir false).
  const recenterMap = useCallback((lat: number, lng: number) => {
    userMovedRef.current = false;
    if (mapRef.current) {
      mapRef.current.setView([lat, lng], 16);
    }
  }, []);

  // ── "Använd min plats" ───────────────────────────────────────────────────────
  const useMyLocation = useCallback((opts?: { silent?: boolean }) => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setCookie("delivera_gps", "1"); // kom ihåg att GPS funkar → ingen onödig prompt-ångest
        const { latitude, longitude } = pos.coords;
        recenterMap(latitude, longitude);
        handleMapPosition(latitude, longitude);
      },
      (err) => {
        setLocating(false);
        // Nekad → kom ihåg så vi inte auto-promptar varje omstart.
        if (err && err.code === 1) setCookie("delivera_gps", "denied");
        if (!opts?.silent) setError("Kunde inte hämta din plats. Tillåt platsåtkomst eller välj på kartan.");
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, [recenterMap, handleMapPosition]);

  // ── GPS auto-locate ──────────────────────────────────────────────────────────
  // När modalen öppnas i DELIVERY utan sparad adress: använd GPS för att direkt
  // bestämma adressen (man finjusterar sen med nålen). Hoppar över om användaren
  // tidigare nekat (cookie) — så vi inte tjatar om plats varje omstart.
  useEffect(() => {
    if (!isOpen || orderType !== "DELIVERY") return;
    if (autoLocatedRef.current) return;
    if (!mapReady) return; // vänta tills kartan finns så recenter funkar
    const hasStored = typeof window !== "undefined" && !!localStorage.getItem("platform_coords");
    if (hasStored) return; // redan en vald adress → ingen GPS
    if (getCookie("delivera_gps") === "denied") return; // användaren nekade tidigare
    autoLocatedRef.current = true;
    useMyLocation({ silent: true });
  }, [isOpen, orderType, mapReady, useMyLocation]);

  // ── Fetch cities for pickup ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || orderType !== "PICKUP") return;
    if (cityGroups.length > 0) return;
    setCitiesLoading(true);
    fetch(`${API_BASE}/api/cities`)
      .then(r => r.json())
      .then((data: any[]) => {
        const all: CityOption[] = (Array.isArray(data) ? data : [])
          .filter(c => c.isActive && c.deliveryMode !== "ONLY_DELIVERY")
          .map(c => ({ id: c.id, name: c.name, slug: c.slug, deliveryMode: c.deliveryMode, parentCityId: c.parentCityId || null }));
        const parentMap = new Map<string, CityGroup>();
        const standalone: CityGroup[] = [];
        for (const c of all) {
          if (!c.parentCityId) {
            const group = parentMap.get(c.id) || { parent: c, children: [] };
            group.parent = c;
            parentMap.set(c.id, group);
          }
        }
        for (const c of all) {
          if (c.parentCityId) {
            let group = parentMap.get(c.parentCityId);
            if (!group) {
              const ghost: CityOption = { id: c.parentCityId, name: c.name, slug: c.slug, deliveryMode: c.deliveryMode };
              group = { parent: ghost, children: [] };
              parentMap.set(c.parentCityId, group);
            }
            group.children.push(c);
          }
        }
        for (const g of parentMap.values()) standalone.push(g);
        standalone.sort((a, b) => a.parent.name.localeCompare(b.parent.name, "sv"));
        setCityGroups(standalone);
      })
      .catch(() => {})
      .finally(() => setCitiesLoading(false));
  }, [isOpen, orderType]);

  // ── Autocomplete (proxied through Next.js → server-side key) ─────────────────
  const fetchPredictions = useCallback(async (text: string) => {
    if (text.length < 3) { setPredictions([]); return; }
    setLoading(true);
    setAutocompleteError(false);
    try {
      const res = await fetch(
        `/api/places/autocomplete?input=${encodeURIComponent(text)}&sessiontoken=${sessionToken.current}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPredictions(data.predictions || []);
    } catch {
      setPredictions([]);
      setAutocompleteError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = (val: string) => {
    setInput(val);
    setSelectedAddress(null);
    setSelectedPostalCode(null);
    setSelectedDeliveryCity(null);
    setError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchPredictions(val), 350);
  };

  // ── Geocode selected prediction → flytta kartans nål dit (ingen auto-confirm) ─
  const handleSelect = async (pred: PlacePrediction) => {
    setPredictions([]);
    setInput(pred.description);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/places/geocode?place_id=${pred.place_id}&sessiontoken=${sessionToken.current}`
      );
      if (!res.ok) throw new Error("Geocode failed");
      const data = await res.json();
      if (data.location) {
        const zip = data.postalCode ?? null;
        const city = data.city ?? null;
        const street = pred.description.split(",")[0].trim();
        const zipCity = zip && city ? `${zip} ${city}` : zip || city;
        const cleanAddr = [street, zipCity].filter(Boolean).join(", ");
        setSelectedCoords({ lat: data.location.lat, lng: data.location.lng });
        setSelectedAddress(cleanAddr);
        setSelectedPostalCode(zip);
        setSelectedDeliveryCity(city);
        setInput(cleanAddr);
        sessionToken.current = crypto.randomUUID();
        // Flytta kartans nål till den valda adressen så användaren kan
        // finjustera exakt position innan bekräftelse.
        recenterMap(data.location.lat, data.location.lng);
      } else {
        setError("Kunde inte hämta koordinater för adressen.");
      }
    } catch {
      setError("Kunde inte hämta koordinater. Försök igen.");
    } finally {
      setLoading(false);
    }
  };

  // ── Confirm ──────────────────────────────────────────────────────────────────
  const handleSubmit = () => {
    if (loading) return;
    if (orderType === "PICKUP") {
      if (!selectedCity) {
        setError("Välj en stad för avhämtning.");
        return;
      }
      onConfirm(selectedCity.name, "PICKUP", undefined, undefined, selectedCity.name);
      return;
    }
    // DELIVERY
    if (!selectedCoords) {
      setError("Välj din plats på kartan eller sök upp adressen.");
      return;
    }
    onConfirm(
      selectedAddress || input.trim(),
      "DELIVERY",
      selectedCoords,
      selectedPostalCode ?? undefined,
      selectedDeliveryCity ?? undefined,
    );
  };

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[300] flex items-end justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "tween", ease: "easeOut", duration: 0.3 }}
            className="w-full max-w-lg rounded-t-2xl relative flex flex-col"
            style={{
              backgroundColor: "var(--bg-secondary)",
              borderTop: "1px solid var(--border-muted)",
              boxShadow: "0 -8px 40px rgba(20,20,22,0.18)",
              maxHeight: "92vh",
              paddingBottom: "env(safe-area-inset-bottom, 0px)",
            }}
          >
            {/* Grab handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full" style={{ backgroundColor: "var(--border-muted)" }} />
            </div>

            <div className="px-6 pt-2 pb-5 overflow-y-auto flex-1 flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between mb-4 shrink-0">
                <div>
                  <p className="text-[12.5px] font-medium mb-0.5" style={{ color: "var(--gold-ink)" }}>Innan du beställer</p>
                  <h2 className="text-[20px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
                    {orderType === "DELIVERY" ? "Var ska vi leverera?" : "Välj stad"}
                  </h2>
                </div>
                <button onClick={onClose} aria-label="Stäng" className="w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-95" style={{ backgroundColor: "var(--bg-deep)", border: "1px solid var(--border-muted)", color: "var(--text-secondary)" }}>
                  <X size={17} />
                </button>
              </div>

              {/* Toggle */}
              <div className="flex gap-2 mb-4 p-1 rounded-xl border shrink-0" style={{ backgroundColor: "var(--bg-deep)", borderColor: "var(--border-muted)" }}>
                {(["DELIVERY", "PICKUP"] as const).map(type => (
                  <button key={type} onClick={() => { setOrderType(type); setError(null); setPredictions([]); }}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-[13px] font-semibold transition-all"
                    style={{ backgroundColor: orderType === type ? "var(--color-gold-500, #E7B24B)" : "transparent", color: orderType === type ? "#141416" : "var(--text-secondary)" }}
                  >
                    {type === "DELIVERY" ? <Truck size={14} strokeWidth={2} /> : <Store size={14} strokeWidth={2} />}
                    {type === "DELIVERY" ? "Leverans" : "Avhämtning"}
                  </button>
                ))}
              </div>

              {/* ── DELIVERY: address autocomplete + interaktiv karta ── */}
              {orderType === "DELIVERY" && (
                <div className="flex flex-col flex-1 min-h-0">
                  {/* z-[60]: lyfter input + dess overflow:ande förslag-lista ÖVER
                      kart-syskonet nedanför. Utan detta hamnar förslagen bakom
                      Leaflets paneler (egna z-index upp till 1000) och går inte
                      att klicka. Kartan får z-0 så dess interna z-index stannar
                      i sin egen stacking-kontext. */}
                  <div className="mb-3 relative shrink-0 z-[60]">
                    <div
                      className="flex items-center gap-3 rounded-xl border px-4 py-3.5 transition-all"
                      style={{
                        backgroundColor: "var(--bg-deep)",
                        borderColor: error ? "rgba(239,68,68,0.38)" : selectedCoords ? "rgba(16,185,129,0.32)" : "var(--border-muted)",
                      }}
                    >
                      {selectedCoords
                        ? <CheckCircle2 className="text-emerald-400 shrink-0" size={17} />
                        : <MapPin className="text-gold-500 shrink-0" size={17} />}
                      <input
                        type="text" value={input} onChange={e => handleInputChange(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && predictions.length === 0 && handleSubmit()}
                        placeholder="Sök gatuadress, postnummer…"
                        className="w-full bg-transparent font-medium focus:outline-none"
                        style={{ color: "var(--text-primary)", fontSize: "16px" }}
                        autoComplete="off"
                      />
                      {loading && <Loader2 size={15} className="animate-spin text-gold-500 shrink-0" />}
                      {!loading && input && (
                        <button onClick={() => { setInput(""); setPredictions([]); }}>
                          <X size={13} style={{ color: "var(--text-secondary)" }} />
                        </button>
                      )}
                    </div>

                    {autocompleteError && !loading && (
                      <p className="mt-1.5 text-[12px] font-medium px-1" style={{ color: "#b45309" }}>
                        ⚠ Söktjänsten är tillfälligt otillgänglig — välj din plats på kartan istället.
                      </p>
                    )}

                    {/* Predictions */}
                    <AnimatePresence>
                      {predictions.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ duration: 0.18, ease: "easeOut" }}
                          className="absolute top-full left-0 right-0 mt-2 rounded-xl overflow-y-auto z-[210] shadow-xl"
                          style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)", maxHeight: "40vh" }}
                        >
                          {predictions.map((pred) => (
                            <button
                              key={pred.place_id}
                              onClick={() => handleSelect(pred)}
                              className="w-full text-left px-5 py-3.5 transition-all flex items-start gap-3 border-b last:border-none hover:bg-gold-500/5"
                              style={{ borderColor: "var(--border-muted)" }}
                            >
                              <MapPin size={13} className="text-gold-500 mt-0.5 shrink-0" />
                              <div>
                                <span className="text-[13.5px] font-semibold block" style={{ color: "var(--text-primary)" }}>{pred.description.split(",")[0]}</span>
                                <span className="text-[10px]" style={{ color: "var(--text-secondary)" }}>{pred.description.split(",").slice(1).join(",").trim()}</span>
                              </div>
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Sparade adresser — snabbval (man kan också söka eller pinna). */}
                  {savedAddresses.length > 0 && (
                    <div className="mb-3 flex gap-2 overflow-x-auto no-scrollbar shrink-0 -mx-1 px-1">
                      {savedAddresses.slice(0, 6).map((a) => (
                        <button
                          key={`${a.street}-${a.zip || ""}-${a.city || ""}`}
                          type="button"
                          onClick={() => {
                            const label = formatQuickAddress(a);
                            setInput(label);
                            setSelectedAddress(label);
                            setSelectedPostalCode(a.zip ?? null);
                            setSelectedDeliveryCity(a.city ?? null);
                            if (a.latitude != null && a.longitude != null) {
                              setSelectedCoords({ lat: a.latitude, lng: a.longitude });
                              recenterMap(a.latitude, a.longitude);
                            }
                            setPredictions([]);
                          }}
                          className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12.5px] font-medium border transition-all active:scale-95"
                          style={{ backgroundColor: "var(--bg-deep)", borderColor: "var(--border-muted)", color: "var(--text-secondary)" }}
                        >
                          {a.label === "Hem" ? <Home size={12} className="text-gold-500" /> : a.label === "Jobb" ? <Briefcase size={12} className="text-gold-500" /> : <MapPin size={12} className="text-gold-500" />}
                          <span className="truncate max-w-[140px]">{formatQuickAddress(a)}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Karta — flytta kartan (fast nål i mitten) för att välja exakt plats.
                      z-0 håller Leaflets interna z-index inom denna stacking-kontext
                      så sök-förslagen (z-[60]-wrappern ovan) alltid ligger överst. */}
                  <div className="relative z-0 rounded-2xl overflow-hidden border flex-1 min-h-[240px]" style={{ borderColor: "var(--border-muted)", backgroundColor: "var(--bg-deep)" }}>
                    <div key={mapKey} ref={initMap} className="absolute inset-0" />

                    {/* Fast center-nål — sitter still mitt på kartan. Man flyttar
                        KARTAN under nålen för att välja exakt plats. */}
                    {!mapError && (
                      <>
                        <div className="pointer-events-none absolute left-1/2 top-1/2 z-[1000] -translate-x-1/2 -translate-y-full -mt-1">
                          <MapPin size={40} strokeWidth={2.5} fill="#EAB545" className="text-gold-600" style={{ filter: "drop-shadow(0 5px 6px rgba(0,0,0,0.45))" }} />
                        </div>
                        <div className="pointer-events-none absolute left-1/2 top-1/2 z-[1000] -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-zinc-900/40" />
                      </>
                    )}
                    {mapError && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center" style={{ backgroundColor: "var(--bg-deep)" }}>
                        <AlertCircle size={22} className="text-amber-500" />
                        <p className="text-[13px] font-medium" style={{ color: "var(--text-secondary)" }}>
                          Kartan kunde inte laddas just nu.
                        </p>
                        <button
                          type="button"
                          onClick={() => { setMapError(false); setMapKey((k) => k + 1); }}
                          className="inline-flex items-center gap-1.5 px-4 h-10 rounded-xl text-[13.5px] font-semibold bg-gold-500 active:scale-95 transition-all" style={{ color: "#141416" }}
                        >
                          <RotateCw size={13} /> Försök igen
                        </button>
                      </div>
                    )}
                    {/* Use-my-location knapp */}
                    {!mapError && (
                      <button
                        onClick={() => useMyLocation()}
                        aria-label="Använd min plats"
                        className="absolute bottom-3 right-3 z-[1000] w-11 h-11 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-all bg-white text-zinc-900"
                      >
                        {locating ? <Loader2 size={18} className="animate-spin" /> : <LocateFixed size={18} />}
                      </button>
                    )}
                    {/* Hint-chip */}
                    {!mapError && (
                      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] px-3 py-1.5 rounded-full bg-zinc-950/75 backdrop-blur-md pointer-events-none">
                        <span className="text-[12px] font-medium text-white flex items-center gap-1.5">
                          <MapPin size={12} className="text-gold-400" /> Flytta kartan för exakt plats
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Vald adress-rad */}
                  {selectedAddress && (
                    <div className="mt-3 flex items-center gap-2 shrink-0">
                      <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
                      <span className="text-[13.5px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>{selectedAddress}</span>
                    </div>
                  )}
                </div>
              )}

              {/* ── PICKUP: city selector ── */}
              {orderType === "PICKUP" && (
                <div className="mb-2">
                  {citiesLoading ? (
                    <div className="flex items-center justify-center gap-3 py-8 rounded-xl border" style={{ backgroundColor: "var(--bg-deep)", borderColor: "var(--border-muted)" }}>
                      <Loader2 size={16} className="animate-spin text-gold-500" />
                      <span className="text-[14px] font-medium" style={{ color: "var(--text-secondary)" }}>Hämtar städer…</span>
                    </div>
                  ) : cityGroups.length === 0 ? (
                    <div className="py-8 text-center rounded-xl border" style={{ backgroundColor: "var(--bg-deep)", borderColor: "var(--border-muted)" }}>
                      <Building2 size={24} className="text-zinc-300 mx-auto mb-2" />
                      <p className="text-[14px] font-medium" style={{ color: "var(--text-secondary)" }}>Inga städer med avhämtning</p>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3 rounded-xl border px-4 py-3 mb-3" style={{ backgroundColor: "var(--bg-deep)", borderColor: "var(--border-muted)" }}>
                        <Search size={15} className="text-gold-500 shrink-0" />
                        <input
                          type="text"
                          value={citySearch}
                          onChange={e => setCitySearch(e.target.value)}
                          placeholder="Sök stad…"
                          className="w-full bg-transparent font-medium focus:outline-none"
                          style={{ color: "var(--text-primary)", fontSize: "16px" }}
                        />
                        {citySearch && (
                          <button onClick={() => setCitySearch("")}>
                            <X size={13} style={{ color: "var(--text-secondary)" }} />
                          </button>
                        )}
                      </div>
                      <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                        {(() => {
                          const q = citySearch.toLowerCase().trim();
                          const filtered = q
                            ? cityGroups.filter(g =>
                                g.parent.name.toLowerCase().includes(q) ||
                                g.children.some(c => c.name.toLowerCase().includes(q))
                              )
                            : cityGroups;
                          if (filtered.length === 0) return (
                            <p className="text-[13px] font-medium text-center py-4" style={{ color: "var(--text-secondary)" }}>Ingen stad hittades</p>
                          );
                          return filtered.map(group => {
                            const isSelected = selectedCity?.id === group.parent.id ||
                              group.children.some(c => c.id === selectedCity?.id);
                            const allNames = [group.parent.name, ...group.children.map(c => c.name)];
                            const subtitle = group.children.length > 0 ? allNames.join(", ") : undefined;
                            return (
                              <button
                                key={group.parent.id}
                                onClick={() => { setSelectedCity(group.parent); setError(null); }}
                                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-all text-left"
                                style={{
                                  backgroundColor: isSelected ? "rgba(234,181,69,0.05)" : "var(--bg-deep)",
                                  borderColor: isSelected ? "rgba(234,181,69,0.4)" : "var(--border-muted)",
                                }}
                              >
                                <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                                  style={{ borderColor: isSelected ? "#EAB545" : "var(--border-muted)", backgroundColor: isSelected ? "#EAB545" : "transparent" }}>
                                  {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-black" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <span className="text-[14.5px] font-semibold" style={{ color: isSelected ? "var(--gold-ink)" : "var(--text-primary)" }}>
                                    {group.parent.name}
                                  </span>
                                  {subtitle && (
                                    <span className="text-[12px] font-normal block mt-0.5 truncate" style={{ color: "var(--text-secondary)" }}>
                                      {subtitle}
                                    </span>
                                  )}
                                </div>
                                <ChevronRight size={14} style={{ color: isSelected ? "#EAB545" : "var(--text-secondary)" }} />
                              </button>
                            );
                          });
                        })()}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Error message */}
              {error && (
                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                  className="mt-3 flex items-start gap-2 p-3 rounded-xl text-[13px] font-medium shrink-0"
                  style={{ backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#dc2626" }}>
                  <AlertCircle size={13} className="shrink-0 mt-0.5" />
                  {error}
                </motion.div>
              )}

              <button onClick={handleSubmit}
                className="mt-4 w-full flex items-center justify-between px-6 h-[52px] rounded-xl transition-all group bg-gold-500 active:scale-[0.99] shrink-0"
                style={{ color: "#141416" }}>
                <span className="text-[15.5px] font-semibold">
                  {orderType === "DELIVERY" ? "Visa restauranger" : "Hitta avhämtning"}
                </span>
                <ArrowRight size={19} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

