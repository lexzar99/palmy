"use client";

import { useState } from "react";
import { formatCurrency, formatNumber } from "@/shared/utils/format";

export interface TrendPoint {
  label: string;
  revenue: number;
  orders: number;
}

/**
 * Beroendefritt stapeldiagram för omsättning per dag (handoff-design):
 * varma tint-staplar, dagens topp i orange, hover lyfter fram dagen och
 * visar omsättning + ordrar. Tema-säker via CSS-variabler.
 */
export function TrendChart({ points }: { points: TrendPoint[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (points.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-[var(--text-muted)]">
        Ingen försäljningsdata för perioden
      </div>
    );
  }

  const max = Math.max(1, ...points.map((p) => p.revenue));
  const peakIdx = points.reduce((best, p, i) => (p.revenue > points[best].revenue ? i : best), 0);
  const active = hoverIdx ?? peakIdx;
  const hovered = points[active];

  return (
    <div>
      {/* Läsare — fast höjd så grafen inte hoppar */}
      <div className="mb-3 flex h-5 items-center gap-3 text-[12px]">
        <span className="font-bold text-[var(--text-primary)]">{hovered.label}</span>
        <span className="text-[var(--text-secondary)]">{formatCurrency(hovered.revenue)}</span>
        <span className="text-[var(--text-muted)]">{formatNumber(hovered.orders)} ordrar</span>
      </div>

      <div className="flex h-[188px] items-end gap-[2%] px-1">
        {points.map((p, i) => {
          const h = Math.max(4, (p.revenue / max) * 100);
          const isActive = i === active;
          return (
            <button
              key={i}
              type="button"
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              onFocus={() => setHoverIdx(i)}
              onBlur={() => setHoverIdx(null)}
              className="flex min-w-0 flex-1 flex-col items-center gap-[9px]"
              aria-label={`${p.label}: ${formatCurrency(p.revenue)}`}
            >
              <span
                className="w-full rounded-t-lg transition-colors"
                style={{
                  height: `${h}%`,
                  background: isActive ? "var(--accent)" : "var(--accent-tintbar)",
                }}
              />
              <span
                className="truncate text-[11px]"
                style={{
                  color: isActive ? "var(--text-primary)" : "var(--text-muted)",
                  fontWeight: isActive ? 800 : 600,
                }}
              >
                {p.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
