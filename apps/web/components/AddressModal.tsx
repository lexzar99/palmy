"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, X, ArrowRight, Truck, Store, AlertCircle, Loader2, CheckCircle2 } from "lucide-react";

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || "";

interface PlacePrediction {
  description: string;
  place_id: string;
}

interface AddressModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (address: string, orderType: "DELIVERY" | "PICKUP", coords?: { lat: number; lng: number }) => void;
  onFail?: (reason: string) => void;
  orderType: "DELIVERY" | "PICKUP";
  setOrderType: (type: "DELIVERY" | "PICKUP") => void;
}

// Minimal geocoding: use Places Autocomplete session tokens to save $$$
const AddressModal = ({ isOpen, onClose, onConfirm, onFail, orderType, setOrderType }: AddressModalProps) => {
  const [input, setInput] = useState("");
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [selectedCoords, setSelectedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<any>(null);
  const sessionToken = useRef<string>("");

  // Generate session token (reduces billing: groups autocomplete + geocode into 1 session)
  useEffect(() => {
    sessionToken.current = crypto.randomUUID();
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      const stored = localStorage.getItem("platform_address") || "";
      const storedCoords = localStorage.getItem("platform_coords");
      setInput(stored);
      setSelectedAddress(stored || null);
      if (storedCoords) {
        try { setSelectedCoords(JSON.parse(storedCoords)); } catch {}
      }
      setPredictions([]);
      setError(null);
    }
  }, [isOpen]);

  const fetchPredictions = useCallback(async (text: string) => {
    if (text.length < 3) { setPredictions([]); return; }
    setLoading(true);
    try {
      // Google Places Autocomplete — costs ~$2.83 per 1000 requests
      // Session tokens group autocomplete calls, so the final geocode is the only billable event
      const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(text)}&components=country:se&sessiontoken=${sessionToken.current}&key=${MAPS_KEY}&language=sv`;
      // NOTE: Direct calls to Places API from browser are blocked by CORS for this endpoint.
      // We proxy via our own backend to avoid exposing key and bypass CORS.
      const res = await fetch(`/api/places/autocomplete?input=${encodeURIComponent(text)}&sessiontoken=${sessionToken.current}`);
      if (!res.ok) throw new Error("Autocomplete failed");
      const data = await res.json();
      setPredictions(data.predictions || []);
    } catch {
      setPredictions([]);
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

  const handleSelect = async (pred: PlacePrediction) => {
    setPredictions([]);
    setInput(pred.description);
    setLoading(true);
    try {
      // Geocode the selected place — bundled into same session token = 1 billing event
      const res = await fetch(`/api/places/geocode?place_id=${pred.place_id}&sessiontoken=${sessionToken.current}`);
      if (!res.ok) throw new Error("Geocode failed");
      const data = await res.json();
      const loc = data.location;
      if (loc) {
        setSelectedCoords({ lat: loc.lat, lng: loc.lng });
        setSelectedAddress(pred.description);
        // Rotate session token after completing a selection
        sessionToken.current = crypto.randomUUID();
      }
    } catch {
      setError("Kunde inte hämta koordinater för adressen.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = () => {
    if (!input.trim()) {
      setError(orderType === "DELIVERY" ? "Ange din leveransadress." : "Ange din stad.");
      return;
    }
    if (orderType === "DELIVERY" && !selectedCoords) {
      setError("Välj en adress från listan för att vi ska kunna kontrollera leveranszonen.");
      return;
    }
    onConfirm(selectedAddress || input.trim(), orderType, selectedCoords || undefined);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-zinc-950/85 backdrop-blur-md px-4 pb-6 sm:pb-0"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ scale: 0.96, y: 30 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, y: 30 }}
            className="w-full max-w-md bg-zinc-900 border border-white/10 rounded-[2rem] p-6 shadow-2xl relative"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gold-600 mb-1">Innan du beställer</p>
                <h2 className="text-xl font-black uppercase tracking-tight text-zinc-100">
                  {orderType === "DELIVERY" ? "Din leveransadress" : "Hämtplats"}
                </h2>
              </div>
              <button onClick={onClose} className="p-2 rounded-full bg-zinc-800 hover:bg-zinc-700 transition-colors text-zinc-400">
                <X size={18} />
              </button>
            </div>

            {/* Order Type Toggle */}
            <div className="flex gap-2 mb-5 p-1 bg-zinc-800/70 rounded-xl border border-white/5">
              {(["DELIVERY", "PICKUP"] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => { setOrderType(type); setError(null); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all ${
                    orderType === type
                      ? "bg-gold-500 text-white shadow-lg shadow-gold-500/20"
                      : "text-zinc-400 hover:text-zinc-100"
                  }`}
                >
                  {type === "DELIVERY" ? <Truck size={14} /> : <Store size={14} />}
                  {type === "DELIVERY" ? "Leverans" : "Avhämtning"}
                </button>
              ))}
            </div>

            {/* Address Input */}
            <div className="mb-4 relative">
              <div className={`flex items-center gap-3 rounded-xl bg-zinc-800 border px-4 py-3.5 transition-all ${
                error ? "border-red-500/50" : selectedCoords ? "border-emerald-500/40" : "border-white/5 focus-within:border-gold-500"
              }`}>
                {selectedCoords
                  ? <CheckCircle2 className="text-emerald-400 shrink-0" size={18} />
                  : <MapPin className="text-gold-500 shrink-0" size={18} />
                }
                <input
                  type="text"
                  value={input}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && predictions.length === 0 && handleSubmit()}
                  placeholder={orderType === "DELIVERY" ? "Gatuadress, postnummer..." : "Stad eller område..."}
                  className="w-full bg-transparent text-sm font-bold text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
                  autoFocus
                />
                {loading && <Loader2 size={16} className="animate-spin text-gold-500 shrink-0" />}
              </div>

              {/* Predictions Dropdown */}
              <AnimatePresence>
                {predictions.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="absolute top-full left-0 right-0 mt-2 bg-zinc-800 border border-white/10 rounded-2xl overflow-hidden z-[210] shadow-2xl"
                  >
                    {predictions.map((pred, i) => (
                      <button
                        key={pred.place_id}
                        onClick={() => handleSelect(pred)}
                        className="w-full text-left px-5 py-4 hover:bg-white/5 transition-all flex items-start gap-3 border-b border-white/5 last:border-none"
                      >
                        <MapPin size={14} className="text-gold-500 mt-0.5 shrink-0" />
                        <div>
                          <span className="text-[11px] font-bold text-zinc-100 block">{pred.description.split(",")[0]}</span>
                          <span className="text-[10px] text-zinc-500">{pred.description.split(",").slice(1).join(",").trim()}</span>
                        </div>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-2 flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold"
                >
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  {error}
                </motion.div>
              )}
            </div>

            {selectedCoords && (
              <div className="mb-4 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-400" />
                <span className="text-[10px] font-bold text-emerald-400">Adress verifierad – kontrollerar leveranszon...</span>
              </div>
            )}

            <p className="text-[10px] text-zinc-500 font-bold mb-5">
              Vi visar bara restauranger som levererar till din adress. Zonerna uppdateras löpande.
            </p>

            <button
              onClick={handleSubmit}
              className="w-full flex items-center justify-between px-6 py-4 bg-gold-500 hover:bg-gold-400 text-white font-black rounded-2xl transition-all shadow-lg shadow-gold-500/20 group"
            >
              <span className="uppercase tracking-widest text-sm">
                {orderType === "DELIVERY" ? "Visa restauranger" : "Hitta avhämtning"}
              </span>
              <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AddressModal;
