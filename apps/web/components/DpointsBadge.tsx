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

export function calcDpointsPrice(priceKr: number, multiplier?: number | null, override?: number | null, valuePerKr = 10) {
  if (override != null && Number.isFinite(Number(override)) && Number(override) > 0) {
    return Math.ceil(Number(override));
  }
  const factor = multiplier != null && Number.isFinite(Number(multiplier)) && Number(multiplier) > 0
    ? Number(multiplier)
    : valuePerKr;
  return Math.ceil(Math.max(0, priceKr) * factor);
}

export default function DpointsBadge({
  priceKr,
  className,
  rewardable,
  rewardPointsMultiplier,
  rewardPointsPrice,
}: {
  priceKr: number;
  className?: string;
  rewardable?: boolean;
  rewardPointsMultiplier?: number | null;
  rewardPointsPrice?: number | null;
}) {
  const [rate, setRate] = useState<{ enabled: boolean; valuePerKr: number } | null>(null);
  useEffect(() => {
    getDpointsRate().then(setRate);
  }, []);

  // Poäng-pris visas ENDAST för rewardable-varor (de man kan köpa med poäng).
  // Övriga varor visar bara kr-priset — ingen poäng-etikett.
  if (!rewardable) return null;
  if (!rate || !rate.enabled || !priceKr || priceKr <= 0) return null;
  const points = calcDpointsPrice(priceKr, rewardPointsMultiplier, rewardPointsPrice, rate.valuePerKr);
  return (
    <span
      className={`inline-flex items-center gap-1 text-[12.5px] font-medium ${className || ""}`}
      style={{ color: "var(--gold-ink)", fontVariantNumeric: "tabular-nums" }}
    >
      <Coins className="h-3 w-3" /> eller {points.toLocaleString("sv-SE")} poäng
    </span>
  );
}
