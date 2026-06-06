"use client";

import { useEffect, useState } from "react";
import { Coins } from "lucide-react";
import axios from "axios";

// Liten "kostar X poäng"-etikett nära produkter. Läser den publika
// dpoints-raten (poäng per 1 kr) en gång och cachar promisen på modulnivå
// så vi inte hämtar settings per produktkort.
let cached: Promise<{ enabled: boolean; valuePerKr: number }> | null = null;
function getDpointsRate() {
  if (!cached) {
    cached = axios
      .get("/api/platform/settings")
      .then((r) => ({
        enabled: !!r.data?.dpoints?.enabled,
        valuePerKr: Number(r.data?.dpoints?.valuePerKr ?? 10),
      }))
      .catch(() => ({ enabled: false, valuePerKr: 10 }));
  }
  return cached;
}

export default function DpointsBadge({ priceKr, className, rewardable }: { priceKr: number; className?: string; rewardable?: boolean }) {
  const [rate, setRate] = useState<{ enabled: boolean; valuePerKr: number } | null>(null);
  useEffect(() => {
    getDpointsRate().then(setRate);
  }, []);

  // Poäng-pris visas ENDAST för rewardable-varor (de man kan köpa med poäng).
  // Övriga varor visar bara kr-priset — ingen poäng-etikett.
  if (!rewardable) return null;
  if (!rate || !rate.enabled || !priceKr || priceKr <= 0) return null;
  const points = Math.round(priceKr * rate.valuePerKr);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-gold-500/20 px-2 py-0.5 text-[10px] font-black text-gold-700 ring-1 ring-gold-500/30 ${className || ""}`}>
      <Coins className="h-3 w-3" /> eller {points} p
    </span>
  );
}
