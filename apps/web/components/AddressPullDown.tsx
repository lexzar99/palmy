"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence, PanInfo } from "framer-motion";
import { MapPin, ChevronDown, Plus, Trash2, Home, Briefcase, Star } from "lucide-react";
import axios from "axios";
import { API_URL } from "@/lib/api";

export interface QuickAddress {
  id?: string;          // SavedAddress.id om sparad på konto
  label?: string;       // "Hem", "Jobb", "Annat"
  street: string;
  city?: string;
  zip?: string;
  latitude?: number;
  longitude?: number;
  isDefault?: boolean;
}

/**
 * AddressPullDown – Kompakt adressväljare i toppen av appen.
 *
 * En knapp högst upp visar aktuell adress. När man drar ner / klickar öppnas en
 * sheet med upp till 3 snabbadresser samt en knapp för att lägga till ny.
 * För inloggade användare hämtas adresser från `/api/profile/addresses`.
 * För gäster lagras lokalt i localStorage under nyckeln `platform_quick_addresses`.
 */
interface Props {
  currentAddress: string;
  onSelect: (addr: QuickAddress) => void;
  onOpenFull: () => void;
}

const LOCAL_KEY = "platform_quick_addresses";
const MAX_ADDRESSES = 3;

export default function AddressPullDown({ currentAddress, onSelect, onOpenFull }: Props) {
  const [open, setOpen] = useState(false);
  const [addresses, setAddresses] = useState<QuickAddress[]>([]);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("platform_user_token") : null;
    if (token) {
      axios
        .get(`${API_URL}/api/profile/addresses`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => setAddresses((r.data || []).slice(0, MAX_ADDRESSES)))
        .catch(() => {
          try {
            const raw = localStorage.getItem(LOCAL_KEY);
            if (raw) setAddresses(JSON.parse(raw).slice(0, MAX_ADDRESSES));
          } catch {}
        });
    } else {
      try {
        const raw = localStorage.getItem(LOCAL_KEY);
        if (raw) setAddresses(JSON.parse(raw).slice(0, MAX_ADDRESSES));
      } catch {}
    }
  }, [open]);

  const handleDrag = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 30 && !open) setOpen(true);
    if (info.offset.y < -30 && open) setOpen(false);
  };

  const pickIcon = (label?: string) => {
    const l = (label || "").toLowerCase();
    if (l.includes("hem") || l.includes("home")) return <Home size={14} />;
    if (l.includes("jobb") || l.includes("work")) return <Briefcase size={14} />;
    return <Star size={14} />;
  };

  return (
    <div className="relative z-30">
      <motion.div
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.2}
        onDrag={handleDrag}
        onClick={() => setOpen((o) => !o)}
        whileTap={{ scale: 0.98 }}
        className="flex items-center gap-2 px-4 py-2.5 rounded-full border cursor-pointer select-none"
        style={{ backgroundColor: "#211C19", borderColor: "rgba(255,248,234,0.08)" }}
      >
        <MapPin size={14} className="text-gold-500 shrink-0" />
        <span className="text-[11px] font-bold truncate flex-1" style={{ color: currentAddress ? "#FFF8EA" : "#B8AA95" }}>
          {currentAddress || "Välj adress"}
        </span>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={14} className="text-zinc-500" />
        </motion.div>
        {/* Drag handle */}
        <div className="w-6 h-1 bg-zinc-700 rounded-full" />
      </motion.div>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 bg-black/50 z-20"
            />
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute top-full left-0 right-0 mt-2 rounded-2xl border p-2 shadow-2xl z-30"
              style={{ backgroundColor: "#211C19", borderColor: "rgba(255,248,234,0.08)" }}
            >
              <p className="text-[8px] font-black uppercase tracking-[0.3em] text-zinc-600 px-3 pt-1 pb-2">
                Mina adresser ({addresses.length}/{MAX_ADDRESSES})
              </p>
              {addresses.length === 0 && (
                <p className="text-[10px] text-zinc-500 px-3 py-2">Inga sparade adresser än.</p>
              )}
              {addresses.map((a, i) => (
                <button
                  key={a.id || i}
                  onClick={() => {
                    onSelect(a);
                    setOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors text-left"
                >
                  <div className="w-7 h-7 rounded-lg bg-gold-500/10 text-gold-500 flex items-center justify-center">
                    {pickIcon(a.label)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-black uppercase tracking-wider text-white truncate">
                      {a.label || "Adress"}
                    </div>
                    <div className="text-[10px] text-zinc-500 truncate">{a.street}{a.city ? `, ${a.city}` : ""}</div>
                  </div>
                  {a.isDefault && (
                    <span className="text-[8px] font-black uppercase tracking-widest text-gold-500">Standard</span>
                  )}
                </button>
              ))}
              <button
                onClick={() => {
                  setOpen(false);
                  onOpenFull();
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-dashed border-gold-500/30 text-gold-500 hover:bg-gold-500/5 transition-colors mt-1"
              >
                <Plus size={14} />
                <span className="text-[10px] font-black uppercase tracking-widest">
                  {addresses.length >= MAX_ADDRESSES ? "Ändra adress" : "Lägg till / ny adress"}
                </span>
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
