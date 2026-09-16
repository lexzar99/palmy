"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import "@/components/restaurant/restaurant.css";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin, X, ArrowRight, Truck, Store, AlertCircle,
  Loader2, CheckCircle2, Building2, ChevronRight, Search, LocateFixed, RotateCw,
} from "lucide-react";
import { loadLeaflet, CARTO_LIGHT, CARTO_ATTRIBUTION, DEFAULT_MAP_CENTER } from "@/lib/leaflet";
import { checkDeliveryStreet } from "@/lib/deliveryAddress";

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
  /** Embedded partner-lägen kan begränsa avhämtning till en restaurangstad. */
  pickupCityName?: string;
  /** Ersätter standardtexten när partnerläget använder en tydlig bekräftelse-CTA. */
  confirmLabel?: string;
}

export default function AddressModal({
  isOpen,
  onClose,
  onConfirm,
  orderType,
  setOrderType,
  pickupCityName,
  confirmLabel,
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
    }

    setPredictions([]);
    setError(null);
    setAutocompleteError(false);
    setMapError(false);
    setSelectedCity(null);
    setCitySearch("");
  }, [isOpen, orderType]);

  // ── Reverse-geocoda en kart-position via backend (keyless) → adressfält ───────
  const handleMapPosition = useCallback(async (lat: number, lng: number) => {
    setSelectedCoords({ lat, lng });
    // Nålen har flyttats: den tidigare adressen hör inte längre till de här
    // koordinaterna. Behåller vi den får kuriren en adress som pekar någon
    // annanstans än nålen.
    setSelectedAddress(null);
    setSelectedPostalCode(null);
    setSelectedDeliveryCity(null);
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/places/reverse?lat=${lat}&lng=${lng}`);
      const data = await res.json();
      // Servern svarar bara med en adress som har gata + husnummer. Allt annat
      // (postnummerområde, ortnamn) är inte leveransbart.
      if (data?.address && checkDeliveryStreet(String(data.address).split(",")[0]).ok) {
        setSelectedAddress(data.address);
        setInput(data.address);
        setSelectedPostalCode(data.postalCode ?? null);
        setSelectedDeliveryCity(data.city ?? null);
      } else {
        setError("Ingen gatuadress på den punkten. Dra nålen till en byggnad eller sök upp adressen.");
      }
    } catch {
      setError("Kunde inte hämta adressen för punkten. Försök igen eller sök upp adressen.");
    }
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
  const requestMyLocation = useCallback((opts?: { silent?: boolean }) => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setCookie("viaeats_gps", "1"); // kom ihåg att GPS funkar → ingen onödig prompt-ångest
        const { latitude, longitude } = pos.coords;
        recenterMap(latitude, longitude);
        handleMapPosition(latitude, longitude);
      },
      (err) => {
        setLocating(false);
        // Nekad → kom ihåg så vi inte auto-promptar varje omstart.
        if (err && err.code === 1) setCookie("viaeats_gps", "denied");
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
    if (getCookie("viaeats_gps") === "denied") return; // användaren nekade tidigare
    autoLocatedRef.current = true;
    requestMyLocation({ silent: true });
  }, [isOpen, orderType, mapReady, requestMyLocation]);

  // ── Fetch cities for pickup ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || orderType !== "PICKUP") return;
    if (pickupCityName) {
      setCitiesLoading(false);
      setSelectedCity({
        id: `embedded-${pickupCityName.toLowerCase()}`,
        name: pickupCityName,
        slug: pickupCityName.toLowerCase(),
        deliveryMode: "PICKUP",
      });
      return;
    }
    if (cityGroups.length > 0) return;
    setCitiesLoading(true);
    fetch("/api/cities")
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
  }, [isOpen, orderType, cityGroups.length, pickupCityName]);

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
    // Sista utvägen om en leverantör ändå returnerar ett postnummer eller en
    // ort som förslag: en sådan träff får inte bli en bekräftad adress.
    const predictedStreet = pred.description.split(",")[0].trim();
    const predictionCheck = checkDeliveryStreet(predictedStreet);
    if (!predictionCheck.ok) {
      setSelectedAddress(null);
      setSelectedCoords(null);
      setError(predictionCheck.message);
      setLoading(false);
      return;
    }
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
      if (pickupCityName) {
        onConfirm(pickupCityName, "PICKUP", undefined, undefined, pickupCityName);
        return;
      }
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
    // Fritexten i sökfältet får ALDRIG bli leveransadressen. Den vägen kunde
    // "224 76" bekräftas så länge kartan råkade ha koordinater sedan tidigare.
    // Bara en bekräftad träff (sökförslag eller nål på en gatuadress) duger.
    if (!selectedAddress) {
      setError("Välj din adress bland förslagen eller placera nålen på din gatuadress.");
      return;
    }
    const addressCheck = checkDeliveryStreet(selectedAddress.split(",")[0]);
    if (!addressCheck.ok) {
      setError(addressCheck.message);
      return;
    }
    onConfirm(
      selectedAddress,
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
          className="ve-root fixed inset-0 z-[1400] flex items-end justify-center sm:items-center"
          style={{ backgroundColor: "rgba(0,0,0,0.42)", background: "rgba(0,0,0,0.42)" }}
          onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 38, mass: 0.9 }}
            role="dialog"
            aria-modal="true"
            aria-label={orderType === "DELIVERY" ? "Välj leveransadress" : "Välj stad för avhämtning"}
            className="relative flex w-full max-w-[560px] flex-col overflow-hidden rounded-t-[26px] sm:rounded-[26px]"
            style={{
              backgroundColor: "var(--ve-bg)",
              boxShadow: "0 -8px 40px rgba(0,0,0,0.18)",
              height: "min(92dvh, 760px)",
              maxHeight: "calc(100dvh - env(safe-area-inset-top, 0px))",
            }}
          >
            <div className="flex shrink-0 justify-center pt-2.5"><span className="ve-sheet-handle" /></div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-4" style={{ overscrollBehavior: "contain" }}>
              <div className="mb-4 flex items-start justify-between gap-3 px-1">
                <div className="min-w-0">
                  <p className="m-0 text-[13px]" style={{ color: "var(--ve-ink-3)" }}>Innan du beställer</p>
                  <h2 className="m-0 mt-0.5 text-[22px] font-semibold leading-tight" style={{ letterSpacing: "-0.02em", color: "var(--ve-ink)" }}>
                    {orderType === "DELIVERY" ? "Var ska vi leverera?" : "Var vill du hämta?"}
                  </h2>
                </div>
                <button onClick={onClose} aria-label="Stäng" className="ve-press grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ backgroundColor: "var(--ve-fill)", color: "var(--ve-ink)" }}>
                  <X size={16} strokeWidth={2.6} />
                </button>
              </div>

              {/* Segmentkontroll — samma som på restaurangsidan */}
              <div className="mb-4 grid grid-cols-2 rounded-[12px] p-[3px]" style={{ backgroundColor: "var(--ve-fill)" }} role="tablist">
                {(["DELIVERY", "PICKUP"] as const).map((type) => {
                  const active = orderType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => { setOrderType(type); setError(null); setPredictions([]); }}
                      className="flex h-[38px] items-center justify-center gap-2 rounded-[10px] text-[14px] transition-colors"
                      style={{
                        color: active ? "var(--ve-ink)" : "var(--ve-ink-2)",
                        fontWeight: active ? 600 : 500,
                        backgroundColor: active ? "var(--ve-card)" : "transparent",
                        boxShadow: active ? "var(--ve-shadow-thumb)" : undefined,
                        letterSpacing: "-0.01em",
                      }}
                    >
                      {type === "DELIVERY" ? <Truck size={15} strokeWidth={2} /> : <Store size={15} strokeWidth={2} />}
                      {type === "DELIVERY" ? "Leverans" : "Avhämtning"}
                    </button>
                  );
                })}
              </div>

              {/* ── LEVERANS: adresssök + karta ── */}
              {orderType === "DELIVERY" && (
                <div className="flex min-h-0 flex-1 flex-col">
                  {/* z-[60] lyfter sökfältet och förslagen över kartans egna z-index. */}
                  <div className="relative z-[60] mb-3 shrink-0">
                    <div
                      className="flex h-12 items-center gap-3 rounded-full pl-4 pr-3"
                      style={{
                        backgroundColor: "var(--ve-card)",
                        boxShadow: error
                          ? "inset 0 0 0 1.5px var(--ve-danger), var(--ve-shadow-card)"
                          : selectedCoords
                            ? "inset 0 0 0 1.5px var(--ve-ink), var(--ve-shadow-card)"
                            : "inset 0 0 0 0.5px var(--ve-line), var(--ve-shadow-card)",
                      }}
                    >
                      {selectedCoords
                        ? <CheckCircle2 size={17} strokeWidth={2.2} className="shrink-0" style={{ color: "var(--ve-success)" }} />
                        : <MapPin size={17} strokeWidth={2.2} className="shrink-0" style={{ color: "var(--ve-accent)" }} />}
                      <input
                        type="text" value={input} onChange={e => handleInputChange(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && predictions.length === 0 && handleSubmit()}
                        placeholder="Gatuadress med husnummer"
                        className="ve-input w-full bg-transparent font-medium focus:outline-none"
                        style={{ color: "var(--ve-ink)" }}
                        autoComplete="off"
                      />
                      {loading && <Loader2 size={15} className="shrink-0 animate-spin" style={{ color: "var(--ve-ink-3)" }} />}
                      {!loading && input && (
                        <button onClick={() => { setInput(""); setPredictions([]); }} aria-label="Rensa" className="grid h-6 w-6 shrink-0 place-items-center rounded-full" style={{ backgroundColor: "var(--ve-ink-3)", color: "#fff" }}>
                          <X size={12} strokeWidth={3} />
                        </button>
                      )}
                    </div>

                    {autocompleteError && !loading && (
                      <p className="m-0 mt-2 px-1 text-[12.5px]" style={{ color: "var(--ve-ink-2)" }}>
                        Söktjänsten är tillfälligt otillgänglig. Välj din plats på kartan i stället.
                      </p>
                    )}

                    <AnimatePresence>
                      {predictions.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, y: -8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          transition={{ duration: 0.18, ease: "easeOut" }}
                          className="ve-card absolute left-0 right-0 top-full z-[210] mt-2 overflow-y-auto"
                          style={{ maxHeight: "40vh" }}
                        >
                          {predictions.map((pred, index) => (
                            <button
                              key={pred.place_id}
                              onClick={() => handleSelect(pred)}
                              className="ve-row-press flex w-full items-start gap-3 px-4 py-3 text-left"
                              style={{ boxShadow: index === 0 ? undefined : "inset 0 0.5px 0 var(--ve-line)" }}
                            >
                              <MapPin size={15} strokeWidth={2.2} className="mt-0.5 shrink-0" style={{ color: "var(--ve-ink-3)" }} />
                              <span className="min-w-0">
                                <span className="block truncate text-[15px] font-medium" style={{ color: "var(--ve-ink)" }}>{pred.description.split(",")[0]}</span>
                                <span className="block truncate text-[12.5px]" style={{ color: "var(--ve-ink-3)" }}>{pred.description.split(",").slice(1).join(",").trim()}</span>
                              </span>
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Karta — flytta kartan under den fasta nålen för exakt plats. */}
                  <div className="relative z-0 min-h-[240px] flex-1 overflow-hidden rounded-[20px]" style={{ backgroundColor: "#E5E5EA", boxShadow: "inset 0 0 0 0.5px var(--ve-line)" }}>
                    <div key={mapKey} ref={initMap} className="absolute inset-0" />
                    {!mapError && (
                      <>
                        <div className="pointer-events-none absolute left-1/2 top-1/2 z-[1000] -mt-1 -translate-x-1/2 -translate-y-full">
                          <MapPin size={40} strokeWidth={2.2} fill="#1D1D1F" style={{ color: "#1D1D1F", filter: "drop-shadow(0 5px 6px rgba(0,0,0,0.35))" }} />
                        </div>
                        <div className="pointer-events-none absolute left-1/2 top-1/2 z-[1000] h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ backgroundColor: "rgba(29,29,31,0.4)" }} />
                      </>
                    )}
                    {mapError && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center" style={{ backgroundColor: "var(--ve-fill)" }}>
                        <AlertCircle size={22} style={{ color: "var(--ve-ink-3)" }} />
                        <p className="m-0 text-[14px]" style={{ color: "var(--ve-ink-2)" }}>Kartan kunde inte laddas just nu.</p>
                        <button
                          type="button"
                          onClick={() => { setMapError(false); setMapKey((k) => k + 1); }}
                          className="ve-press inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-[14px] font-semibold"
                          style={{ backgroundColor: "var(--ve-cta)", color: "var(--ve-cta-ink)" }}
                        >
                          <RotateCw size={13} /> Försök igen
                        </button>
                      </div>
                    )}
                    {!mapError && (
                      <button
                        onClick={() => requestMyLocation()}
                        aria-label="Använd min plats"
                        className="ve-glass-btn absolute bottom-3 right-3 z-[1000] grid h-11 w-11 place-items-center rounded-full"
                      >
                        {locating ? <Loader2 size={18} className="animate-spin" /> : <LocateFixed size={18} strokeWidth={2.2} />}
                      </button>
                    )}
                    {!mapError && (
                      <div className="pointer-events-none absolute left-1/2 top-3 z-[1000] -translate-x-1/2 rounded-full px-3 py-1.5" style={{ backgroundColor: "rgba(29,29,31,0.78)", backdropFilter: "blur(10px)" }}>
                        <span className="flex items-center gap-1.5 text-[12px] font-medium text-white">
                          <MapPin size={12} /> Flytta kartan för exakt plats
                        </span>
                      </div>
                    )}
                  </div>

                  {selectedAddress && (
                    <div className="mt-3 flex shrink-0 items-center gap-2 px-1">
                      <CheckCircle2 size={15} strokeWidth={2.2} className="shrink-0" style={{ color: "var(--ve-success)" }} />
                      <span className="truncate text-[14px] font-medium" style={{ color: "var(--ve-ink)" }}>{selectedAddress}</span>
                    </div>
                  )}
                </div>
              )}

              {/* ── AVHÄMTNING: stad ── */}
              {orderType === "PICKUP" && (
                <div className="mb-2">
                  {pickupCityName ? (
                    <div className="ve-card flex items-center gap-3.5 px-4 py-3.5">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full" style={{ backgroundColor: "var(--ve-accent-soft)", color: "var(--ve-accent)" }}>
                        <Store size={17} strokeWidth={2.2} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[16px] font-semibold" style={{ color: "var(--ve-ink)", letterSpacing: "-0.01em" }}>{pickupCityName}</span>
                        <span className="block text-[13px]" style={{ color: "var(--ve-ink-3)" }}>Hämta själv i restaurangen</span>
                      </span>
                      <CheckCircle2 size={18} strokeWidth={2.2} className="shrink-0" style={{ color: "var(--ve-success)" }} />
                    </div>
                  ) : citiesLoading ? (
                    <div className="ve-card flex items-center justify-center gap-3 py-8">
                      <Loader2 size={16} className="animate-spin" style={{ color: "var(--ve-ink-3)" }} />
                      <span className="text-[14px]" style={{ color: "var(--ve-ink-2)" }}>Hämtar städer…</span>
                    </div>
                  ) : cityGroups.length === 0 ? (
                    <div className="ve-card py-8 text-center">
                      <Building2 size={24} className="mx-auto mb-2" style={{ color: "var(--ve-ink-3)" }} />
                      <p className="m-0 text-[14px]" style={{ color: "var(--ve-ink-2)" }}>Inga städer med avhämtning ännu</p>
                    </div>
                  ) : (
                    <>
                      <div className="mb-3 flex h-11 items-center gap-2.5 rounded-full pl-4 pr-2" style={{ backgroundColor: "var(--ve-card)", boxShadow: "inset 0 0 0 0.5px var(--ve-line)" }}>
                        <Search size={15} strokeWidth={2.4} className="shrink-0" style={{ color: "var(--ve-ink-3)" }} />
                        <input
                          type="text"
                          value={citySearch}
                          onChange={e => setCitySearch(e.target.value)}
                          placeholder="Sök stad"
                          className="ve-input w-full bg-transparent font-medium focus:outline-none"
                          style={{ color: "var(--ve-ink)" }}
                        />
                        {citySearch && (
                          <button onClick={() => setCitySearch("")} aria-label="Rensa" className="grid h-6 w-6 shrink-0 place-items-center rounded-full" style={{ backgroundColor: "var(--ve-ink-3)", color: "#fff" }}>
                            <X size={12} strokeWidth={3} />
                          </button>
                        )}
                      </div>
                      <div className="ve-card max-h-64 overflow-y-auto">
                        {(() => {
                          const q = citySearch.toLowerCase().trim();
                          const filtered = q
                            ? cityGroups.filter(g =>
                                g.parent.name.toLowerCase().includes(q) ||
                                g.children.some(c => c.name.toLowerCase().includes(q))
                              )
                            : cityGroups;
                          if (filtered.length === 0) return (
                            <p className="m-0 py-5 text-center text-[14px]" style={{ color: "var(--ve-ink-2)" }}>Ingen stad hittades</p>
                          );
                          return filtered.map((group, index) => {
                            const isSelected = selectedCity?.id === group.parent.id ||
                              group.children.some(c => c.id === selectedCity?.id);
                            const allNames = [group.parent.name, ...group.children.map(c => c.name)];
                            const subtitle = group.children.length > 0 ? allNames.join(", ") : undefined;
                            return (
                              <button
                                key={group.parent.id}
                                onClick={() => { setSelectedCity(group.parent); setError(null); }}
                                className="ve-row-press flex w-full items-center gap-3.5 px-4 py-3.5 text-left"
                                style={{ boxShadow: index === 0 ? undefined : "inset 0 0.5px 0 var(--ve-line)" }}
                              >
                                <span aria-hidden className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full transition-colors"
                                  style={isSelected ? { backgroundColor: "var(--ve-ink)" } : { boxShadow: "inset 0 0 0 1.5px var(--ve-line-2)" }}>
                                  {isSelected && <span className="h-2 w-2 rounded-full bg-white" />}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block text-[16px] font-medium" style={{ color: "var(--ve-ink)", letterSpacing: "-0.01em" }}>{group.parent.name}</span>
                                  {subtitle && <span className="block truncate text-[12.5px]" style={{ color: "var(--ve-ink-3)" }}>{subtitle}</span>}
                                </span>
                              </button>
                            );
                          });
                        })()}
                      </div>
                    </>
                  )}
                </div>
              )}

              {error && (
                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                  className="mt-3 flex shrink-0 items-start gap-2 rounded-[14px] px-3.5 py-3 text-[13.5px] font-medium"
                  style={{ backgroundColor: "var(--ve-danger-soft)", color: "var(--ve-danger)" }}>
                  <AlertCircle size={14} className="mt-0.5 shrink-0" />
                  {error}
                </motion.div>
              )}
            </div>

            <div
              className="ve-glass shrink-0 px-4 pt-3"
              style={{ boxShadow: "inset 0 0.5px 0 var(--ve-line)", paddingBottom: "max(env(safe-area-inset-bottom, 0px), 16px)" }}
            >
              <button onClick={handleSubmit}
                className="ve-press flex h-[54px] w-full items-center justify-between rounded-full px-6"
                style={{ backgroundColor: "var(--ve-cta)", color: "var(--ve-cta-ink)" }}>
                <span className="text-[16px] font-semibold" style={{ letterSpacing: "-0.01em" }}>
                  {confirmLabel ?? (orderType === "DELIVERY" ? "Visa restauranger" : "Hitta avhämtning")}
                </span>
                <ArrowRight size={19} strokeWidth={2.2} />
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
