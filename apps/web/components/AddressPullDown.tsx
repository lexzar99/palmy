"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  // Position för dropdown (portal:as till body så den inte cuttas av
  // sticky-headerns overflow-hidden).
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => { setMounted(true); }, []);

  const computePos = () => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    // Panelen har EGEN bredd (triggern är numera ett smalt textblock) och
    // clampas mot viewporten så den aldrig klipps utanför skärmen.
    const vw = window.innerWidth;
    const width = Math.min(360, vw - 24);
    const left = Math.max(12, Math.min(r.left, vw - width - 12));
    setPos({ top: r.bottom + 8, left, width });
  };
  const openMenu = () => { computePos(); setOpen(true); };

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
    if (info.offset.y > 30 && !open) openMenu();
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
        {/* Adressblock som primärkontroll: liten label + stad i fetstil. */}
        <div
          onClick={onOpenFull}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenFull(); } }}
          className="flex flex-col cursor-pointer select-none min-w-0 active:opacity-80 transition-opacity"
        >
          <span className="text-[12px] font-medium leading-tight" style={{ color: "var(--text-secondary)" }}>Hämtas i</span>
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="text-[16px] font-bold tracking-tight truncate leading-snug" style={{ color: "var(--text-primary)" }}>
              {cityName || "Välj stad"}
            </span>
            <ChevronDown size={15} className="shrink-0" style={{ color: "var(--text-secondary)" }} />
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative z-30">
      {/* Adressblock som primärkontroll ("Levereras till / Storgatan 5 ⌄").
          Drag-gesten (öppna/stäng) och dropdown-logiken är oförändrade. */}
      <motion.div
        ref={triggerRef}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.2}
        onDrag={handleDrag}
        onClick={() => { if (open) setOpen(false); else openMenu(); }}
        className="flex flex-col cursor-pointer select-none min-w-0 active:opacity-80"
      >
        <span className="text-[12px] font-medium leading-tight" style={{ color: "var(--text-secondary)" }}>Levereras till</span>
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="text-[16px] font-bold tracking-tight truncate leading-snug" style={{ color: "var(--text-primary)" }}>
            {currentAddress || "Välj adress"}
          </span>
          {zoneStatus === "ok" && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: "var(--success-ink)" }} />}
          {zoneStatus === "error" && <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-rose-500" />}
          <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }} className="shrink-0 inline-flex">
            <ChevronDown size={15} style={{ color: "var(--text-secondary)" }} />
          </motion.span>
        </span>
      </motion.div>

      {mounted && createPortal(
        <AnimatePresence>
          {open && pos && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 bg-black/50 z-[120]"
            />
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="fixed rounded-2xl border p-2 shadow-2xl z-[121]"
              style={{ top: pos.top, left: pos.left, width: pos.width, backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-muted)", boxShadow: "var(--card-shadow)" }}
            >
              <p className="text-[12.5px] font-medium px-3 pt-1.5 pb-2" style={{ color: "var(--text-secondary)" }}>
                Mina adresser ({addresses.length}/{MAX_ADDRESSES})
              </p>
              {addresses.length === 0 && (
                <p className="text-[13px] px-3 py-2" style={{ color: "var(--text-secondary)" }}>Inga sparade adresser än.</p>
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
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: "var(--gold-soft)", color: "var(--gold-ink)" }}>
                    {pickIcon(a.label)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                      {a.label || "Adress"}
                    </div>
                    <div className="text-[12.5px] leading-snug break-words" style={{ color: "var(--text-secondary)" }}>{formatQuickAddress(a)}</div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {a.isDefault && (
                      <span className="text-[11px] font-semibold" style={{ color: "var(--gold-ink)" }}>Standard</span>
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
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors mt-1 hover:bg-[var(--bg-deep)]"
                style={{ border: "1px solid var(--line-strong)", color: "var(--text-primary)" }}
              >
                <Plus size={15} strokeWidth={2} />
                <span className="text-[13.5px] font-semibold">
                  {addresses.length >= MAX_ADDRESSES ? "Ändra adress" : "Lägg till ny adress"}
                </span>
              </button>
            </motion.div>
          </>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
