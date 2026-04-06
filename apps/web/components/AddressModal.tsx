"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, X, ArrowRight, Truck, Store, AlertCircle, Loader2 } from "lucide-react";

interface AddressModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (address: string, orderType: "DELIVERY" | "PICKUP", coords?: {lat: number, lng: number}) => void;
  onFail?: (reason: string) => void;
  orderType: "DELIVERY" | "PICKUP";
  setOrderType: (type: "DELIVERY" | "PICKUP") => void;
}

const AddressModal = ({ isOpen, onClose, onConfirm, onFail, orderType, setOrderType }: AddressModalProps) => {
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [selectedCoords, setSelectedCoords] = useState<{lat: number, lng: number} | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<any>(null);

  useEffect(() => {
    if (isOpen) {
      const storedAddress = localStorage.getItem("platform_address") || "";
      const storedCoords = localStorage.getItem("platform_coords");
      setInput(storedAddress);
      if (storedCoords) setSelectedCoords(JSON.parse(storedCoords));
    }
  }, [isOpen]);

  const fetchSuggestions = async (text: string) => {
    if (text.length < 3) {
      setSuggestions([]);
      return;
    }

    setLoading(true);
    try {
      const apiKey = process.env.NEXT_PUBLIC_GEOAPIFY_KEY || "1ec4188b70ae4a56a1061b9b861f5464"; // Default key for immediate use
      const response = await fetch(
        `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(text)}&filter=countrycode:se&bias=proximity:13.19,55.70&limit=5&apiKey=${apiKey}`
      );
      const data = await response.json();
      setSuggestions(data.features || []);
    } catch (err) {
      console.error("Autocomplete error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (val: string) => {
    setInput(val);
    setError(null);
    setSelectedCoords(null);
    
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 300);
  };

  const handleSelect = (s: any) => {
    const formatted = s.properties.formatted;
    const [lng, lat] = s.geometry.coordinates;
    setInput(formatted);
    setSelectedCoords({ lat, lng });
    setSuggestions([]);
  };

  const handleSubmit = () => {
    if (!input.trim()) {
      setError(orderType === "DELIVERY" ? "Ange din leveransadress." : "Ange din stad eller område.");
      return;
    }

    // Logic for Lund check could be expanded here using the coordinates
    onConfirm(input.trim(), orderType, selectedCoords || undefined);
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
                  {orderType === "DELIVERY" ? "Din leveransadress" : "Din stad"}
                </h2>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-full bg-zinc-800 hover:bg-zinc-700 transition-colors text-zinc-400"
              >
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

            {/* Address input */}
            <div className="mb-4 relative">
              <div className={`flex items-center gap-3 rounded-xl bg-zinc-800 border px-4 py-3.5 transition-all ${error ? "border-red-500/50" : "border-white/5 focus-within:border-gold-500"}`}>
                <MapPin className="text-gold-500 shrink-0" size={18} />
                <input
                  type="text"
                  value={input}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  placeholder={orderType === "DELIVERY" ? "Gatuadress, postnummer..." : "Stad eller område..."}
                  className="w-full bg-transparent text-sm font-bold text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
                  autoFocus
                />
                {loading && <Loader2 size={16} className="animate-spin text-gold-500" />}
              </div>

              {/* Suggestions Dropdown */}
              {suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-800 border border-white/10 rounded-2xl overflow-hidden z-[210] shadow-2xl">
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => handleSelect(s)}
                      className="w-full text-left px-5 py-4 hover:bg-white/5 transition-all flex items-start gap-3 border-b border-white/5 last:border-none"
                    >
                      <MapPin size={14} className="text-gold-500 mt-1 shrink-0" />
                      <span className="text-[11px] font-bold text-zinc-100">{s.properties.formatted}</span>
                    </button>
                  ))}
                </div>
              )}

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-2 flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold"
                >
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  {error}
                </motion.div>
              )}
            </div>

            <p className="text-[10px] text-zinc-500 font-bold mb-5">
              Vi levererar för tillfället i <span className="text-gold-500 uppercase">Lund och närliggande zoner</span>. Ange din adress för att se alternativ.
            </p>

            <button
              onClick={handleSubmit}
              className="w-full flex items-center justify-between px-6 py-4 bg-gold-500 hover:bg-gold-400 text-white font-black rounded-2xl transition-all shadow-lg shadow-gold-500/20 group"
            >
              <span className="uppercase tracking-widest text-sm">Fortsätt</span>
              <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AddressModal;
