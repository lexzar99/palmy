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
  onConfirm: (address: string, orderType: "DELIVERY" | "PICKUP", coords?: { lat: number; lng: number }, postalCode?: string, city?: string) => void;
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
  const [selectedPostalCode, setSelectedPostalCode] = useState<string | null>(null);
  const [selectedDeliveryCity, setSelectedDeliveryCity] = useState<string | null>(null);
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
    setSelectedPostalCode(null);
    setSelectedDeliveryCity(null);
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
        setSelectedPostalCode(data.postalCode ?? null);
        setSelectedDeliveryCity(data.city ?? null);
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
          className="fixed inset-0 z-[200] flex items-start justify-center backdrop-blur-md"
          style={{ backgroundColor: "rgba(0,0,0,0.4)", paddingTop: "max(1rem, env(safe-area-inset-top, 1rem))" }}
          onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ y: "-100%", opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: "-100%", opacity: 0 }}
            transition={{ type: "spring", bounce: 0.1, duration: 0.4 }}
            className="w-full max-w-lg rounded-b-[2rem] p-6 shadow-2xl relative overflow-y-auto"
            style={{
              backgroundColor: "var(--bg-secondary)",
              border: "1px solid var(--border-muted)",
              borderTop: "none",
              maxHeight: "90dvh",
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-gold-600 mb-1">Innan du beställer</p>
                <h2 className="text-xl font-black uppercase tracking-tight" style={{ color: "var(--text-primary)" }}>
                   {orderType === "DELIVERY" ? "Din leveransadress" : "Välj stad"}
                </h2>
              </div>
               <button onClick={onClose} className="p-2 rounded-full transition-all hover:bg-zinc-100" style={{ backgroundColor: "var(--bg-deep)", border: "1px solid var(--border-muted)", color: "var(--text-secondary)" }}>
                <X size={17} />
              </button>
            </div>

            {/* Toggle */}
            <div className="flex gap-2 mb-5 p-1 rounded-xl border" style={{ backgroundColor: "var(--bg-deep)", borderColor: "var(--border-muted)" }}>
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

            {/* ── DELIVERY: address autocomplete ── */}
            {orderType === "DELIVERY" && (
              <div className="mb-4 relative">
                <div
                  className="flex items-center gap-3 rounded-xl border px-4 py-3.5 transition-all"
                  style={{
                    backgroundColor: "var(--bg-deep)",
                    borderColor: error
                      ? "rgba(239,68,68,0.38)"
                      : selectedCoords
                        ? "rgba(16,185,129,0.32)"
                        : "var(--border-muted)",
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
                    style={{ color: "var(--text-primary)" }}
                    autoFocus
                  />
                  {loading && <Loader2 size={15} className="animate-spin text-gold-500 shrink-0" />}
                  {!loading && input && (
                    <button onClick={() => { setInput(""); setPredictions([]); setSelectedCoords(null); }}>
                      <X size={13} style={{ color: "var(--text-secondary)" }} />
                    </button>
                  )}
                </div>

                {/* Postal code confirmation after geocode */}
                {selectedCoords && selectedPostalCode && (
                  <p className="mt-1.5 text-[10px] font-black px-1 flex items-center gap-1.5 text-emerald-600">
                    <CheckCircle2 size={11} />
                    {selectedPostalCode}{selectedDeliveryCity ? ` ${selectedDeliveryCity}` : ""}
                  </p>
                )}

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
                      style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
                      {predictions.map(pred => (
                        <button key={pred.place_id} onClick={() => handleSelect(pred)}
                          className="w-full text-left px-5 py-3.5 transition-all flex items-start gap-3 border-b last:border-none"
                          style={{ borderColor: "rgba(255,248,234,0.05)" }}>
                          <MapPin size={13} className="text-gold-500 mt-0.5 shrink-0" />
                          <div>
                            <span className="text-[11px] font-bold block" style={{ color: "var(--text-primary)" }}>{pred.description.split(",")[0]}</span>
                            <span className="text-[10px]" style={{ color: "var(--text-secondary)" }}>{pred.description.split(",").slice(1).join(",").trim()}</span>
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
                  <div className="flex items-center justify-center gap-3 py-8 rounded-xl border" style={{ backgroundColor: "var(--bg-deep)", borderColor: "var(--border-muted)" }}>
                    <Loader2 size={16} className="animate-spin text-gold-500" />
                    <span className="text-sm font-bold" style={{ color: "var(--text-secondary)" }}>Hämtar städer…</span>
                  </div>
                ) : cities.length === 0 ? (
                  <div className="py-8 text-center rounded-xl border" style={{ backgroundColor: "var(--bg-deep)", borderColor: "var(--border-muted)" }}>
                    <Building2 size={24} className="text-zinc-300 mx-auto mb-2" />
                    <p className="text-sm font-bold text-zinc-400">Inga städer med avhämtning</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {cities.map(city => (
                      <button key={city.id} onClick={() => { setSelectedCity(city); setError(null); }}
                        className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-all text-left"
                        style={{
                          backgroundColor: selectedCity?.id === city.id ? "rgba(234,181,69,0.05)" : "var(--bg-deep)",
                          borderColor: selectedCity?.id === city.id ? "rgba(234,181,69,0.4)" : "var(--border-muted)",
                        }}>
                        <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                          style={{ borderColor: selectedCity?.id === city.id ? "#EAB545" : "var(--border-muted)", backgroundColor: selectedCity?.id === city.id ? "#EAB545" : "transparent" }}>
                          {selectedCity?.id === city.id && <div className="w-1.5 h-1.5 rounded-full bg-black" />}
                        </div>
                        <div className="flex-1">
                          <span className="text-sm font-black" style={{ color: selectedCity?.id === city.id ? "#EAB545" : "var(--text-primary)" }}>{city.name}</span>
                          <span className="text-[9px] font-bold uppercase tracking-wide block mt-0.5" style={{ color: "var(--text-secondary)" }}>
                            {city.deliveryMode === "ALL" ? "Leverans & avhämtning" : "Endast avhämtning"}
                          </span>
                        </div>
                        <ChevronRight size={14} className={selectedCity?.id === city.id ? "text-gold-500" : ""} style={{ color: selectedCity?.id === city.id ? "#EAB545" : "var(--text-secondary)" }} />
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

            {/* Verifierad = bara en liten grön prick. Felaktig = liten röd. Ingen text. */}
            {selectedCoords && orderType === "DELIVERY" && (
              <div className="mb-4 flex items-center justify-end">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.6)]" />
              </div>
            )}

            {/* Selected city badge (pickup) */}
            {selectedCity && orderType === "PICKUP" && (
              <div className="mb-4 px-3 py-2 rounded-xl flex items-center gap-2" style={{ backgroundColor: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)" }}>
                <CheckCircle2 size={13} className="text-emerald-400" />
                <span className="text-[10px] font-bold text-emerald-400">{selectedCity.name} vald som hämtplats</span>
              </div>
            )}

            <p className="text-[9px] font-bold mb-5" style={{ color: "var(--text-secondary)" }}>
              {orderType === "DELIVERY"
                ? "Vi visar restauranger som levererar till din adress."
                : "Vi visar restauranger med avhämtning i vald stad."}
            </p>

            <button onClick={handleSubmit}
              className="w-full flex items-center justify-between px-6 py-4 font-black rounded-2xl transition-all shadow-lg shadow-gold-500/20 group bg-gold-500 hover:bg-gold-400 text-zinc-950">
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
