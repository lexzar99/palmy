"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin, X, ArrowRight, Truck, Store, AlertCircle,
  Loader2, CheckCircle2, Building2, ChevronRight,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface PlacePrediction {
  description: string;
  place_id: string;
}

interface CityOption {
  id: string;
  name: string;
  slug: string;
  deliveryMode: string;
}

interface AddressModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (address: string, orderType: "DELIVERY" | "PICKUP", coords?: { lat: number; lng: number }) => void;
  onFail?: (reason: string) => void;
  orderType: "DELIVERY" | "PICKUP";
  setOrderType: (type: "DELIVERY" | "PICKUP") => void;
}

export default function AddressModal({
  isOpen,
  onClose,
  onConfirm,
  onFail,
  orderType,
  setOrderType,
}: AddressModalProps) {
  // ── Delivery state ──────────────────────────────────────────────────────────
  const [input, setInput] = useState("");
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [selectedCoords, setSelectedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autocompleteError, setAutocompleteError] = useState(false);

  // ── Pickup state ────────────────────────────────────────────────────────────
  const [cities, setCities] = useState<CityOption[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [selectedCity, setSelectedCity] = useState<CityOption | null>(null);

  const debounceRef = useRef<any>(null);
  const sessionToken = useRef<string>("");

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
  }, [isOpen]);

  // ── Fetch cities for pickup ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || orderType !== "PICKUP") return;
    if (cities.length > 0) return;
    setCitiesLoading(true);
    fetch(`${API_BASE}/api/cities`)
      .then(r => r.json())
      .then((data: any[]) => {
        const list: CityOption[] = (Array.isArray(data) ? data : [])
          .filter(c => c.isActive && c.deliveryMode !== "ONLY_DELIVERY")
          .map(c => ({ id: c.id, name: c.name, slug: c.slug, deliveryMode: c.deliveryMode }));
        setCities(list);
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
    setSelectedCoords(null);
    setError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchPredictions(val), 350);
  };

  // ── Geocode selected prediction ──────────────────────────────────────────────
  const handleSelect = async (pred: PlacePrediction) => {
    setPredictions([]);
    setInput(pred.description);
    setLoading(true);
    try {
      const res = await fetch(
        `/api/places/geocode?place_id=${pred.place_id}&sessiontoken=${sessionToken.current}`
      );
      if (!res.ok) throw new Error("Geocode failed");
      const data = await res.json();
      if (data.location) {
        setSelectedCoords({ lat: data.location.lat, lng: data.location.lng });
        setSelectedAddress(pred.description);
        sessionToken.current = crypto.randomUUID();
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
    if (orderType === "PICKUP") {
      if (!selectedCity) {
        setError("Välj en stad för avhämtning.");
        return;
      }
      onConfirm(selectedCity.name, "PICKUP");
      return;
    }
    // DELIVERY
    if (!input.trim()) {
      setError("Ange din leveransadress.");
      return;
    }
    if (!selectedCoords) {
      setError("Välj en adress från listan för att vi ska kunna kontrollera leveranszonen.");
      return;
    }
    onConfirm(selectedAddress || input.trim(), "DELIVERY", selectedCoords);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-zinc-950/88 backdrop-blur-md px-4 pb-6 sm:pb-0"
          onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ scale: 0.96, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 30 }}
            className="w-full max-w-md rounded-[2rem] p-6 shadow-2xl relative"
            style={{ backgroundColor: "#211C19", border: "1px solid rgba(255,248,234,0.10)" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-gold-600 mb-1">Innan du beställer</p>
                <h2 className="text-xl font-black uppercase tracking-tight" style={{ color: "#FFF8EA" }}>
                  {orderType === "DELIVERY" ? "Din leveransadress" : "Välj stad"}
                </h2>
              </div>
              <button onClick={onClose} className="p-2 rounded-full transition-colors" style={{ backgroundColor: "#2A241F", color: "#B8AA95" }}>
                <X size={17} />
              </button>
            </div>

            {/* Toggle */}
            <div className="flex gap-2 mb-5 p-1 rounded-xl border" style={{ backgroundColor: "#2A241F", borderColor: "rgba(255,248,234,0.08)" }}>
              {(["DELIVERY", "PICKUP"] as const).map(type => (
                <button key={type} onClick={() => { setOrderType(type); setError(null); setPredictions([]); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                    orderType === type ? "bg-gold-500 text-black shadow-lg shadow-gold-500/20" : ""
                  }`}
                  style={{ color: orderType === type ? "#000" : "#B8AA95" }}
                >
                  {type === "DELIVERY" ? <Truck size={13} /> : <Store size={13} />}
                  {type === "DELIVERY" ? "Leverans" : "Avhämtning"}
                </button>
              ))}
            </div>

            {/* ── DELIVERY: address autocomplete ── */}
            {orderType === "DELIVERY" && (
              <div className="mb-4 relative">
                <div
                  className="flex items-center gap-3 rounded-xl border px-4 py-3.5 transition-all"
                  style={{
                    backgroundColor: "#2A241F",
                    borderColor: error
                      ? "rgba(239,68,68,0.38)"
                      : selectedCoords
                        ? "rgba(16,185,129,0.32)"
                        : "rgba(255,248,234,0.08)",
                  }}
                >
                  {selectedCoords
                    ? <CheckCircle2 className="text-emerald-400 shrink-0" size={17} />
                    : <MapPin className="text-gold-500 shrink-0" size={17} />
                  }
                  <input
                    type="text" value={input} onChange={e => handleInputChange(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && predictions.length === 0 && handleSubmit()}
                    placeholder="Gatuadress, postnummer…"
                    className="w-full bg-transparent text-sm font-bold focus:outline-none"
                    style={{ color: "#FFF8EA" }}
                    autoFocus
                  />
                  {loading && <Loader2 size={15} className="animate-spin text-gold-500 shrink-0" />}
                  {!loading && input && (
                    <button onClick={() => { setInput(""); setPredictions([]); setSelectedCoords(null); }}>
                      <X size={13} style={{ color: "#B8AA95" }} />
                    </button>
                  )}
                </div>

                {/* Autocomplete error hint */}
                {autocompleteError && !loading && (
                  <p className="mt-1.5 text-[10px] font-bold text-amber-400/80 px-1">
                    ⚠ Söktjänsten är tillfälligt otillgänglig. Kontrollera att Google Maps API är konfigurerat på servern.
                  </p>
                )}

                {/* Predictions */}
                <AnimatePresence>
                  {predictions.length > 0 && (
                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                      className="absolute top-full left-0 right-0 mt-2 rounded-2xl overflow-hidden z-[210] shadow-2xl"
                      style={{ backgroundColor: "#2A241F", border: "1px solid rgba(255,248,234,0.08)" }}>
                      {predictions.map(pred => (
                        <button key={pred.place_id} onClick={() => handleSelect(pred)}
                          className="w-full text-left px-5 py-3.5 transition-all flex items-start gap-3 border-b last:border-none"
                          style={{ borderColor: "rgba(255,248,234,0.05)" }}>
                          <MapPin size={13} className="text-gold-500 mt-0.5 shrink-0" />
                          <div>
                            <span className="text-[11px] font-bold block" style={{ color: "#FFF8EA" }}>{pred.description.split(",")[0]}</span>
                            <span className="text-[10px]" style={{ color: "#B8AA95" }}>{pred.description.split(",").slice(1).join(",").trim()}</span>
                          </div>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* ── PICKUP: city selector ── */}
            {orderType === "PICKUP" && (
              <div className="mb-4">
                {citiesLoading ? (
                  <div className="flex items-center justify-center gap-3 py-8 rounded-xl border" style={{ backgroundColor: "#2A241F", borderColor: "rgba(255,248,234,0.08)" }}>
                    <Loader2 size={16} className="animate-spin text-gold-500" />
                    <span className="text-sm font-bold text-zinc-400">Hämtar städer…</span>
                  </div>
                ) : cities.length === 0 ? (
                  <div className="py-8 text-center rounded-xl border" style={{ backgroundColor: "#2A241F", borderColor: "rgba(255,248,234,0.08)" }}>
                    <Building2 size={24} className="text-zinc-600 mx-auto mb-2" />
                    <p className="text-sm font-bold text-zinc-500">Inga städer med avhämtning</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {cities.map(city => (
                      <button key={city.id} onClick={() => { setSelectedCity(city); setError(null); }}
                        className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-all text-left"
                        style={{
                          backgroundColor: selectedCity?.id === city.id ? "rgba(234,181,69,0.1)" : "#2A241F",
                          borderColor: selectedCity?.id === city.id ? "rgba(234,181,69,0.4)" : "rgba(255,248,234,0.08)",
                        }}>
                        <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                          style={{ borderColor: selectedCity?.id === city.id ? "#EAB545" : "#B8AA95", backgroundColor: selectedCity?.id === city.id ? "#EAB545" : "transparent" }}>
                          {selectedCity?.id === city.id && <div className="w-1.5 h-1.5 rounded-full bg-black" />}
                        </div>
                        <div className="flex-1">
                          <span className="text-sm font-black" style={{ color: selectedCity?.id === city.id ? "#EAB545" : "#FFF8EA" }}>{city.name}</span>
                          <span className="text-[9px] font-bold uppercase tracking-wide block mt-0.5" style={{ color: "#B8AA95" }}>
                            {city.deliveryMode === "ALL" ? "Leverans & avhämtning" : "Endast avhämtning"}
                          </span>
                        </div>
                        <ChevronRight size={14} className={selectedCity?.id === city.id ? "text-gold-500" : ""} style={{ color: selectedCity?.id === city.id ? "#EAB545" : "#B8AA95" }} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Error message */}
            {error && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                className="mb-4 flex items-start gap-2 p-3 rounded-xl text-red-400 text-xs font-bold"
                style={{ backgroundColor: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
                <AlertCircle size={13} className="shrink-0 mt-0.5" />
                {error}
              </motion.div>
            )}

            {/* Confirmed address badge */}
            {selectedCoords && orderType === "DELIVERY" && (
              <div className="mb-4 px-3 py-2 rounded-xl flex items-center gap-2" style={{ backgroundColor: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)" }}>
                <CheckCircle2 size={13} className="text-emerald-400" />
                <span className="text-[10px] font-bold text-emerald-400">Adress är verifierad.</span>
              </div>
            )}

            {/* Selected city badge (pickup) */}
            {selectedCity && orderType === "PICKUP" && (
              <div className="mb-4 px-3 py-2 rounded-xl flex items-center gap-2" style={{ backgroundColor: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)" }}>
                <CheckCircle2 size={13} className="text-emerald-400" />
                <span className="text-[10px] font-bold text-emerald-400">{selectedCity.name} vald som hämtplats</span>
              </div>
            )}

            <p className="text-[9px] font-bold mb-5" style={{ color: "#B8AA95" }}>
              {orderType === "DELIVERY"
                ? "Vi visar restauranger som levererar till din adress."
                : "Vi visar restauranger med avhämtning i vald stad."}
            </p>

            <button onClick={handleSubmit}
              className="w-full flex items-center justify-between px-6 py-4 font-black rounded-2xl transition-all shadow-lg shadow-gold-500/20 group"
              style={{ backgroundColor: "#EAB545", color: "#000" }}>
              <span className="uppercase tracking-widest text-sm">
                {orderType === "DELIVERY" ? "Visa restauranger" : "Hitta avhämtning"}
              </span>
              <ArrowRight size={19} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
