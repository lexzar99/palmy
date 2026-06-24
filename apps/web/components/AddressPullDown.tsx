"use client";

import { ChevronDown } from "lucide-react";
import type { QuickAddress } from "@/lib/quickAddresses";

interface Props {
  currentAddress: string;
  // Behålls för bakåtkompatibilitet med anroparen (oanvänd i single-address-läget).
  onSelect?: (addr: QuickAddress) => void;
  onOpenFull: () => void;
  zoneStatus?: "ok" | "error" | null;
  orderType?: "DELIVERY" | "PICKUP";
  cityName?: string | null;
}

/**
 * Single-address: EN adress (leverans) eller EN stad (avhämtning). Ingen lista
 * och ingen dropdown med flera sparade adresser — klick öppnar fullmodalen
 * ("Var ska vi leverera?") där adressen ändras via sök/karta.
 */
export default function AddressPullDown({ currentAddress, onOpenFull, zoneStatus, orderType, cityName }: Props) {
  const isPickup = orderType === "PICKUP";
  const label = isPickup ? "Hämtas i" : "Levereras till";
  const value = isPickup ? (cityName || "Välj stad") : (currentAddress || "Välj adress");

  return (
    <div className="relative z-30">
      <div
        onClick={onOpenFull}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenFull(); } }}
        className="flex flex-col cursor-pointer select-none min-w-0 active:opacity-80 transition-opacity"
      >
        <span className="text-[12px] font-medium leading-tight" style={{ color: "var(--text-secondary)" }}>{label}</span>
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="text-[16px] font-bold tracking-tight truncate leading-snug" style={{ color: "var(--text-primary)" }}>
            {value}
          </span>
          {!isPickup && zoneStatus === "ok" && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: "var(--success-ink)" }} />}
          {!isPickup && zoneStatus === "error" && <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-rose-500" />}
          <ChevronDown size={15} className="shrink-0" style={{ color: "var(--text-secondary)" }} />
        </span>
      </div>
    </div>
  );
}
