"use client";

import { ChevronDown, Store, Truck } from "lucide-react";
import type { QuickAddress } from "@/lib/quickAddresses";

interface Props {
  currentAddress: string;
  // Behålls för bakåtkompatibilitet med anroparen (oanvänd i single-address-läget).
  onSelect?: (addr: QuickAddress) => void;
  onOpenFull: () => void;
  zoneStatus?: "ok" | "error" | null;
  orderType?: "DELIVERY" | "PICKUP";
  cityName?: string | null;
  compact?: boolean;
}

/**
 * Single-address: EN adress (leverans) eller EN stad (avhämtning). Ingen lista
 * och ingen dropdown med flera sparade adresser — klick öppnar fullmodalen
 * ("Var ska vi leverera?") där adressen ändras via sök/karta.
 */
export default function AddressPullDown({ currentAddress, onOpenFull, zoneStatus, orderType, cityName, compact = false }: Props) {
  const isPickup = orderType === "PICKUP";
  const label = isPickup ? "Hämtas i" : "Levereras till";
  const value = isPickup ? (cityName || "Välj stad") : (currentAddress || "Välj adress");
  const ModeIcon = isPickup ? Store : Truck;

  return (
    <div className="relative z-30">
      <div
        onClick={onOpenFull}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenFull(); } }}
        className="flex flex-col cursor-pointer select-none min-w-0 active:opacity-80 transition-opacity"
      >
        <span className={`${compact ? "text-[11px]" : "text-[12px]"} inline-flex items-center gap-1.5 font-semibold leading-tight`} style={{ color: "var(--color-gold-500)" }}>
          <ModeIcon size={compact ? 12 : 13} strokeWidth={2} />
          {label}
        </span>
        <span className="flex items-center gap-1.5 min-w-0">
          <span className={`${compact ? "text-[14px]" : "text-[16px]"} font-bold tracking-tight truncate leading-snug`} style={{ color: "var(--text-primary)" }}>
            {value}
          </span>
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{
              backgroundColor: !isPickup && zoneStatus === "ok"
                ? "var(--success-ink)"
                : !isPickup && zoneStatus === "error"
                  ? "#F43F5E"
                  : "transparent",
            }}
          />
          <ChevronDown size={15} className="shrink-0" style={{ color: "var(--text-secondary)" }} />
        </span>
      </div>
    </div>
  );
}
