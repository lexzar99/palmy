"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence, PanInfo } from "framer-motion";
import { MapPin, ChevronDown, Plus, Trash2, Home, Briefcase, Star, Pencil, Circle, Building2 } from "lucide-react";
import {
  type QuickAddress,
  ensureQuickAddress,
  formatQuickAddress,
  readQuickAddresses,
  removeQuickAddress,
  setDefaultQuickAddress,
} from "@/lib/quickAddresses";

interface Props {
  currentAddress: string;
  onSelect: (addr: QuickAddress) => void;
  onOpenFull: () => void;
  zoneStatus?: "ok" | "error" | null;
  orderType?: "DELIVERY" | "PICKUP";
  cityName?: string | null;
}

const MAX_ADDRESSES = 3;

export default function AddressPullDown({ currentAddress, onSelect, onOpenFull, zoneStatus, orderType, cityName }: Props) {
  const isPickup = orderType === "PICKUP";
  const [open, setOpen] = useState(false);
  const [addresses, setAddresses] = useState<QuickAddress[]>([]);

  useEffect(() => {
    if (isPickup) return;
    const load = async () => {
      if (currentAddress && typeof window !== "undefined") {
        const rawCoords = localStorage.getItem("platform_coords");
        let coords: { lat: number; lng: number } | null = null;
        try {
          coords = rawCoords ? JSON.parse(rawCoords) : null;
        } catch {
          coords = null;
        }
        ensureQuickAddress({
          street: currentAddress,
          latitude: coords?.lat,
          longitude: coords?.lng,
        });
      }

      setAddresses(readQuickAddresses().slice(0, MAX_ADDRESSES));
    };

    void load();
  }, [open, currentAddress, isPickup]);

  const handleDrag = (_: unknown, info: PanInfo) => {
    if (isPickup) return;
    if (info.offset.y > 30 && !open) setOpen(true);
    if (info.offset.y < -30 && open) setOpen(false);
  };

  const pickIcon = (label?: string) => {
    const l = (label || "").toLowerCase();
    if (l.includes("hem") || l.includes("home")) return <Home size={14} />;
    if (l.includes("jobb") || l.includes("work")) return <Briefcase size={14} />;
    return <Star size={14} />;
  };

  if (isPickup) {
    return (
      <div className="relative z-30">
        <motion.div
          onClick={onOpenFull}
          whileTap={{ scale: 0.98 }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-full border cursor-pointer select-none"
          style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-muted)" }}
        >
          <Building2 size={14} className="text-gold-500 shrink-0" />
          <span className="text-[11px] font-bold truncate flex-1" style={{ color: "var(--text-primary)" }}>
            {cityName || "Välj stad"}
          </span>
          <span className="text-[9px] font-black uppercase tracking-widest shrink-0" style={{ color: "var(--text-secondary)" }}>
            Byt stad
          </span>
          <ChevronDown size={14} style={{ color: "var(--text-secondary)" }} />
        </motion.div>
      </div>
    );
  }

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
        style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-muted)" }}
      >
        <MapPin size={14} className="text-gold-500 shrink-0" />
        <span className="text-[11px] font-bold truncate flex-1" style={{ color: "var(--text-primary)" }}>
          {currentAddress || "Välj adress"}
        </span>
        {zoneStatus === "ok" && <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.6)]" />}
        {zoneStatus === "error" && <span className="w-2 h-2 rounded-full bg-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.6)]" />}
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={14} style={{ color: "var(--text-secondary)" }} />
        </motion.div>
        <div className="w-6 h-1 rounded-full" style={{ backgroundColor: "var(--border-muted)" }} />
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
              style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-muted)", boxShadow: "var(--card-shadow)" }}
            >
              <p className="text-[8px] font-black uppercase tracking-[0.3em] px-3 pt-1 pb-2" style={{ color: "var(--text-secondary)" }}>
                Mina adresser ({addresses.length}/{MAX_ADDRESSES})
              </p>
              {addresses.length === 0 && (
                <p className="text-[10px] px-3 py-2" style={{ color: "var(--text-secondary)" }}>Inga sparade adresser än.</p>
              )}
              {addresses.map((a, i) => (
                <div
                  key={a.id || i}
                  onClick={() => {
                    onSelect(a);
                    setOpen(false);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(a);
                      setOpen(false);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[var(--bg-deep)] transition-colors text-left cursor-pointer"
                >
                  <div className="w-7 h-7 rounded-lg bg-gold-500/10 text-gold-500 flex items-center justify-center">
                    {pickIcon(a.label)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-black uppercase tracking-wider truncate" style={{ color: "var(--text-primary)" }}>
                      {a.label || "Adress"}
                    </div>
                    <div className="text-[10px] truncate" style={{ color: "var(--text-secondary)" }}>{formatQuickAddress(a)}</div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {a.isDefault && (
                      <span className="text-[8px] font-black uppercase tracking-widest text-gold-500">Standard</span>
                    )}
                    {!a.isDefault && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setAddresses(setDefaultQuickAddress(a).slice(0, MAX_ADDRESSES));
                        }}
                        className="w-7 h-7 rounded-lg border bg-[var(--bg-deep)] border-[var(--border-muted)] hover:border-gold-500/20 flex items-center justify-center text-zinc-500 hover:text-gold-500"
                        aria-label="Gör till standard"
                      >
                        <Circle size={12} />
                      </button>
                    )}
                    <button
                      type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setOpen(false);
                          onOpenFull();
                        }}
                       className="w-7 h-7 rounded-lg border bg-[var(--bg-deep)] border-[var(--border-muted)] hover:border-gold-500/20 flex items-center justify-center text-zinc-500 hover:text-gold-500"
                       aria-label="Ändra adress"
                     >
                       <Pencil size={12} />
                     </button>
                    <button
                      type="button"
                       onClick={(event) => {
                         event.preventDefault();
                         event.stopPropagation();
                         setAddresses(removeQuickAddress(a).slice(0, MAX_ADDRESSES));
                       }}
                       className="w-7 h-7 rounded-lg border bg-[var(--bg-deep)] border-[var(--border-muted)] hover:border-rose-500/20 hover:bg-rose-500/5 flex items-center justify-center text-zinc-500 hover:text-rose-400"
                       aria-label="Ta bort adress"
                     >
                       <Trash2 size={12} />
                     </button>
                  </div>
                </div>
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
