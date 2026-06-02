"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin, X, ArrowRight, Truck, Store, AlertCircle,
  Loader2, CheckCircle2, Building2, ChevronRight, Search, LocateFixed,
} from "lucide-react";
import { loadGoogleMaps, DEFAULT_MAP_CENTER } from "@/lib/googleMaps";
import { useTheme } from "@/app/providers";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// Rena, moderna kart-stilar som matchar appens ljusa/mörka tema. Döljer POI:er
// och transit för en lugn, minimalistisk look.
const LIGHT_MAP_STYLE: any[] = [
  { elementType: "geometry", stylers: [{ color: "#f4f4f2" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#6b6b70" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#f0f0ee" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#ece6da" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#cfe3e6" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#eaece4" }] },
];
const DARK_MAP_STYLE: any[] = [
  { elementType: "geometry", stylers: [{ color: "#1d1d20" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#9aa0a6" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1d1d20" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2a2a2e" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#37373d" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#141619" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#212124" }] },
];

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

// Plocka ut ren gatuadress + postnummer + stad ur ett Geocoder-resultat.
function parseGeocode(result: any): { clean: string; zip: string | null; city: string | null } {
  const comp: any[] = result.address_components || [];
  const get = (type: string) => comp.find((c) => c.types?.includes(type))?.long_name as string | undefined;
  const route = get("route");
  const num = get("street_number");
  const zip = get("postal_code") || null;
  const city = get("postal_town") || get("locality") || get("sublocality") || null;
  const street = [route, num].filter(Boolean).join(" ") || (result.formatted_address || "").split(",")[0];
  const zipCity = [zip, city].filter(Boolean).join(" ");
  const clean = [street, zipCity].filter(Boolean).join(", ");
  return { clean, zip, city };
}

export default function AddressModal({
  isOpen,
  onClose,
  onConfirm,
  orderType,
  setOrderType,
}: AddressModalProps) {
  const { theme } = useTheme();
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
  const [locating, setLocating] = useState(false);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const geocoderRef = useRef<any>(null);
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
    if (!isOpen) return;
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
    }

    setPredictions([]);
    setError(null);
    setAutocompleteError(false);
    setSelectedCity(null);
    setCitySearch("");
  }, [isOpen]);

  // ── Reverse-geocoda en kart-position → uppdatera adressfälten ─────────────────
  const handleMapPosition = useCallback((lat: number, lng: number) => {
    setSelectedCoords({ lat, lng });
    setError(null);
    if (!geocoderRef.current) return;
    setLoading(true);
    geocoderRef.current.geocode({ location: { lat, lng } }, (results: any[], status: string) => {
      setLoading(false);
      if (status === "OK" && results?.[0]) {
        const { clean, zip, city } = parseGeocode(results[0]);
        setSelectedAddress(clean);
        setInput(clean);
        setSelectedPostalCode(zip);
        setSelectedDeliveryCity(city);
      }
    });
  }, []);

  // ── Callback-ref: initierar kartan exakt när div:en monteras (undviker
  //    race mellan effekt och ref som lämnade kartan tom). dataset-flaggan
  //    skyddar mot dubbel-init (React StrictMode kör ref-callbacken två ggr). ──
  const initMap = useCallback((node: HTMLDivElement | null) => {
    if (!node) { mapRef.current = null; markerRef.current = null; geocoderRef.current = null; setMapReady(false); return; }
    if (node.dataset.gmInit === "1") return;
    node.dataset.gmInit = "1";
    setMapError(false);
    loadGoogleMaps()
      .then((maps) => {
        if (!node.isConnected) return;
        const start = selectedCoordsRef.current || DEFAULT_MAP_CENTER;
        const map = new maps.Map(node, {
          center: start,
          zoom: selectedCoordsRef.current ? 16 : 12,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
          clickableIcons: false,
          styles: (typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "dark") ? DARK_MAP_STYLE : LIGHT_MAP_STYLE,
        });
        const marker = new maps.Marker({
          position: start,
          map,
          draggable: true,
          animation: maps.Animation.DROP,
        });
        mapRef.current = map;
        markerRef.current = marker;
        geocoderRef.current = new maps.Geocoder();
        setMapReady(true);

        marker.addListener("dragend", () => {
          const p = marker.getPosition();
          if (p) handleMapPosition(p.lat(), p.lng());
        });
        map.addListener("click", (e: any) => {
          if (!e.latLng) return;
          marker.setPosition(e.latLng);
          handleMapPosition(e.latLng.lat(), e.latLng.lng());
        });
      })
      .catch(() => { node.dataset.gmInit = ""; setMapError(true); });
  }, [handleMapPosition]);

  // Applicera rätt kart-stil när kartan blivit redo OCH varje gång temat
  // ändras — så stilen alltid matchar aktivt ljust/mörkt läge oavsett när
  // kartan hann initieras.
  useEffect(() => {
    if (mapReady && mapRef.current) {
      mapRef.current.setOptions({ styles: theme === "dark" ? DARK_MAP_STYLE : LIGHT_MAP_STYLE });
    }
  }, [theme, mapReady]);

  // Flytta kartan + nålen till en ny position (utan reverse-geocode).
  const recenterMap = useCallback((lat: number, lng: number) => {
    if (mapRef.current) {
      mapRef.current.setCenter({ lat, lng });
      mapRef.current.setZoom(16);
    }
    if (markerRef.current) markerRef.current.setPosition({ lat, lng });
  }, []);

  // ── "Använd min plats" ───────────────────────────────────────────────────────
  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { latitude, longitude } = pos.coords;
        recenterMap(latitude, longitude);
        handleMapPosition(latitude, longitude);
      },
      () => { setLocating(false); setError("Kunde inte hämta din plats. Tillåt platsåtkomst eller välj på kartan."); },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

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

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-end justify-center backdrop-blur-md"
          style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
          onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "tween", ease: "easeOut", duration: 0.3 }}
            className="w-full max-w-lg rounded-t-[2rem] shadow-2xl relative flex flex-col"
            style={{
              backgroundColor: "var(--bg-secondary)",
              border: "1px solid var(--border-muted)",
              borderBottom: "none",
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
                  <p className="text-[9px] font-black uppercase tracking-[0.3em] text-gold-600 mb-1">Innan du beställer</p>
                  <h2 className="text-xl font-black uppercase tracking-tight" style={{ color: "var(--text-primary)" }}>
                    {orderType === "DELIVERY" ? "Var ska vi leverera?" : "Välj stad"}
                  </h2>
                </div>
                <button onClick={onClose} className="p-2 rounded-full transition-all" style={{ backgroundColor: "var(--bg-deep)", border: "1px solid var(--border-muted)", color: "var(--text-secondary)" }}>
                  <X size={17} />
                </button>
              </div>

              {/* Toggle */}
              <div className="flex gap-2 mb-4 p-1 rounded-xl border shrink-0" style={{ backgroundColor: "var(--bg-deep)", borderColor: "var(--border-muted)" }}>
                {(["DELIVERY", "PICKUP"] as const).map(type => (
                  <button key={type} onClick={() => { setOrderType(type); setError(null); setPredictions([]); }}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                      orderType === type ? "bg-gold-500 text-zinc-950 shadow-sm" : ""
                    }`}
                    style={{ color: orderType === type ? undefined : "var(--text-secondary)" }}
                  >
                    {type === "DELIVERY" ? <Truck size={13} /> : <Store size={13} />}
                    {type === "DELIVERY" ? "Leverans" : "Avhämtning"}
                  </button>
                ))}
              </div>

              {/* ── DELIVERY: address autocomplete + interaktiv karta ── */}
              {orderType === "DELIVERY" && (
                <div className="flex flex-col flex-1 min-h-0">
                  <div className="mb-3 relative shrink-0">
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
                        className="w-full bg-transparent font-bold focus:outline-none"
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
                      <p className="mt-1.5 text-[10px] font-bold text-amber-400/80 px-1">
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
                          className="absolute top-full left-0 right-0 mt-2 rounded-2xl overflow-y-auto z-[210] shadow-2xl"
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
                                <span className="text-[12px] font-bold block" style={{ color: "var(--text-primary)" }}>{pred.description.split(",")[0]}</span>
                                <span className="text-[10px]" style={{ color: "var(--text-secondary)" }}>{pred.description.split(",").slice(1).join(",").trim()}</span>
                              </div>
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Karta — dra nålen eller tryck för att välja exakt plats */}
                  <div className="relative rounded-2xl overflow-hidden border flex-1 min-h-[240px]" style={{ borderColor: "var(--border-muted)", backgroundColor: "var(--bg-deep)" }}>
                    <div ref={initMap} className="absolute inset-0" />
                    {mapError && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
                        <AlertCircle size={22} className="text-amber-500" />
                        <p className="text-[11px] font-bold" style={{ color: "var(--text-secondary)" }}>
                          Kartan kunde inte laddas. Sök upp din adress ovan istället.
                        </p>
                      </div>
                    )}
                    {/* Use-my-location knapp */}
                    {!mapError && (
                      <button
                        onClick={useMyLocation}
                        aria-label="Använd min plats"
                        className="absolute bottom-3 right-3 z-10 w-11 h-11 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-all bg-white text-zinc-900"
                      >
                        {locating ? <Loader2 size={18} className="animate-spin" /> : <LocateFixed size={18} />}
                      </button>
                    )}
                    {/* Hint-chip */}
                    {!mapError && (
                      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-full bg-zinc-950/75 backdrop-blur-md pointer-events-none">
                        <span className="text-[10px] font-black uppercase tracking-wider text-white flex items-center gap-1.5">
                          <MapPin size={11} className="text-gold-400" /> Dra nålen för exakt plats
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Vald adress-rad */}
                  {selectedAddress && (
                    <div className="mt-3 flex items-center gap-2 shrink-0">
                      <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
                      <span className="text-[12px] font-bold truncate" style={{ color: "var(--text-primary)" }}>{selectedAddress}</span>
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
                      <span className="text-sm font-bold" style={{ color: "var(--text-secondary)" }}>Hämtar städer…</span>
                    </div>
                  ) : cityGroups.length === 0 ? (
                    <div className="py-8 text-center rounded-xl border" style={{ backgroundColor: "var(--bg-deep)", borderColor: "var(--border-muted)" }}>
                      <Building2 size={24} className="text-zinc-300 mx-auto mb-2" />
                      <p className="text-sm font-bold text-zinc-400">Inga städer med avhämtning</p>
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
                          className="w-full bg-transparent font-bold focus:outline-none"
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
                            <p className="text-[11px] font-bold text-center py-4" style={{ color: "var(--text-secondary)" }}>Ingen stad hittades</p>
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
                                  <span className="text-sm font-black" style={{ color: isSelected ? "#EAB545" : "var(--text-primary)" }}>
                                    {group.parent.name}
                                  </span>
                                  {subtitle && (
                                    <span className="text-[9px] font-bold block mt-0.5 truncate" style={{ color: "var(--text-secondary)" }}>
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
                  className="mt-3 flex items-start gap-2 p-3 rounded-xl text-red-400 text-xs font-bold shrink-0"
                  style={{ backgroundColor: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
                  <AlertCircle size={13} className="shrink-0 mt-0.5" />
                  {error}
                </motion.div>
              )}

              <button onClick={handleSubmit}
                className="mt-4 w-full flex items-center justify-between px-6 py-4 font-black rounded-2xl transition-all shadow-lg shadow-gold-500/20 group bg-gold-500 hover:bg-gold-400 text-zinc-950 shrink-0">
                <span className="uppercase tracking-widest text-sm">
                  {orderType === "DELIVERY" ? "Visa restauranger" : "Hitta avhämtning"}
                </span>
                <ArrowRight size={19} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
