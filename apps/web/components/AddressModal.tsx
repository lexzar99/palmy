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
        try { setSelectedCoords(JSON.parse(storedCoords)); } catch {}
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
            className="w-full max-w-md bg-zinc-900 border border-white/10 rounded-[2rem] p-6 shadow-2xl relative"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-gold-600 mb-1">Innan du beställer</p>
                <h2 className="text-xl font-black uppercase tracking-tight text-zinc-100">
                  {orderType === "DELIVERY" ? "Din leveransadress" : "Välj stad"}
                </h2>
              </div>
              <button onClick={onClose} className="p-2 rounded-full bg-zinc-800 hover:bg-zinc-700 transition-colors text-zinc-400">
                <X size={17} />
              </button>
            </div>

            {/* Toggle */}
            <div className="flex gap-2 mb-5 p-1 bg-zinc-800/70 rounded-xl border border-white/5">
              {(["DELIVERY", "PICKUP"] as const).map(type => (
                <button key={type} onClick={() => { setOrderType(type); setError(null); setPredictions([]); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                    orderType === type ? "bg-gold-500 text-white shadow-lg shadow-gold-500/20" : "text-zinc-400 hover:text-zinc-100"
                  }`}>
                  {type === "DELIVERY" ? <Truck size={13} /> : <Store size={13} />}
                  {type === "DELIVERY" ? "Leverans" : "Avhämtning"}
                </button>
              ))}
            </div>

            {/* ── DELIVERY: address autocomplete ── */}
            {orderType === "DELIVERY" && (
              <div className="mb-4 relative">
                <div className={`flex items-center gap-3 rounded-xl bg-zinc-800 border px-4 py-3.5 transition-all ${
                  error ? "border-red-500/50" : selectedCoords ? "border-emerald-500/40" : "border-white/5 focus-within:border-gold-500"
                }`}>
                  {selectedCoords
                    ? <CheckCircle2 className="text-emerald-400 shrink-0" size={17} />
                    : <MapPin className="text-gold-500 shrink-0" size={17} />
                  }
                  <input
                    type="text" value={input} onChange={e => handleInputChange(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && predictions.length === 0 && handleSubmit()}
                    placeholder="Gatuadress, postnummer…"
                    className="w-full bg-transparent text-sm font-bold text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
                    autoFocus
                  />
                  {loading && <Loader2 size={15} className="animate-spin text-gold-500 shrink-0" />}
                  {!loading && input && (
                    <button onClick={() => { setInput(""); setPredictions([]); setSelectedCoords(null); }}>
                      <X size={13} className="text-zinc-500 hover:text-zinc-300" />
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
                      className="absolute top-full left-0 right-0 mt-2 bg-zinc-800 border border-white/10 rounded-2xl overflow-hidden z-[210] shadow-2xl">
                      {predictions.map(pred => (
                        <button key={pred.place_id} onClick={() => handleSelect(pred)}
                          className="w-full text-left px-5 py-3.5 hover:bg-white/5 transition-all flex items-start gap-3 border-b border-white/5 last:border-none">
                          <MapPin size={13} className="text-gold-500 mt-0.5 shrink-0" />
                          <div>
                            <span className="text-[11px] font-bold text-zinc-100 block">{pred.description.split(",")[0]}</span>
                            <span className="text-[10px] text-zinc-500">{pred.description.split(",").slice(1).join(",").trim()}</span>
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
                  <div className="flex items-center justify-center gap-3 py-8 bg-zinc-800 rounded-xl border border-white/5">
                    <Loader2 size={16} className="animate-spin text-gold-500" />
                    <span className="text-sm font-bold text-zinc-400">Hämtar städer…</span>
                  </div>
                ) : cities.length === 0 ? (
                  <div className="py-8 text-center bg-zinc-800 rounded-xl border border-white/5">
                    <Building2 size={24} className="text-zinc-600 mx-auto mb-2" />
                    <p className="text-sm font-bold text-zinc-500">Inga städer med avhämtning</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {cities.map(city => (
                      <button key={city.id} onClick={() => { setSelectedCity(city); setError(null); }}
                        className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-all text-left ${
                          selectedCity?.id === city.id
                            ? "bg-gold-500/15 border-gold-500/40"
                            : "bg-zinc-800 border-white/5 hover:bg-zinc-700/60"
                        }`}>
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          selectedCity?.id === city.id ? "border-gold-500 bg-gold-500" : "border-zinc-500"
                        }`}>
                          {selectedCity?.id === city.id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                        <div className="flex-1">
                          <span className="text-sm font-black text-zinc-100">{city.name}</span>
                          <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wide block mt-0.5">
                            {city.deliveryMode === "ALL" ? "Leverans & avhämtning" : "Endast avhämtning"}
                          </span>
                        </div>
                        <ChevronRight size={14} className={selectedCity?.id === city.id ? "text-gold-500" : "text-zinc-600"} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Error message */}
            {error && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                className="mb-4 flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold">
                <AlertCircle size={13} className="shrink-0 mt-0.5" />
                {error}
              </motion.div>
            )}

            {/* Confirmed address badge */}
            {selectedCoords && orderType === "DELIVERY" && (
              <div className="mb-4 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-2">
                <CheckCircle2 size={13} className="text-emerald-400" />
                <span className="text-[10px] font-bold text-emerald-400">Adress bekräftad – kontrollerar leveranszon…</span>
              </div>
            )}

            {/* Selected city badge (pickup) */}
            {selectedCity && orderType === "PICKUP" && (
              <div className="mb-4 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-2">
                <CheckCircle2 size={13} className="text-emerald-400" />
                <span className="text-[10px] font-bold text-emerald-400">{selectedCity.name} vald som hämtplats</span>
              </div>
            )}

            <p className="text-[9px] text-zinc-500 font-bold mb-5">
              {orderType === "DELIVERY"
                ? "Vi visar restauranger som levererar till din adress."
                : "Vi visar restauranger med avhämtning i vald stad."}
            </p>

            <button onClick={handleSubmit}
              className="w-full flex items-center justify-between px-6 py-4 bg-gold-500 hover:bg-gold-400 text-white font-black rounded-2xl transition-all shadow-lg shadow-gold-500/20 group">
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
