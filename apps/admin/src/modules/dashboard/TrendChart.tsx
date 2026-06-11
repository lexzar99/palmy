"use client";

import { useMemo, useState } from "react";
import { formatCurrency, formatNumber } from "@/shared/utils/format";

export interface TrendPoint {
  label: string;
  revenue: number;
  orders: number;
}

/**
 * Beroendefri SVG-areagraf för omsättning per dag, med hover-läsare.
 * Tema-säker via CSS-variabler (--info för linjen — fungerar mot både
 * mörk och ljus panel; --accent är vit/svart i admin och syns inte mot
 * fyllningen). Y-axeln auto-skalar, x-etiketter glesas ut vid 30/90 dgr.
 */
export function TrendChart({ points }: { points: TrendPoint[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const W = 800;
  const H = 220;
  const PAD_X = 8;
  const PAD_TOP = 14;
  const PAD_BOTTOM = 26;

  const { path, area, coords, maxRevenue } = useMemo(() => {
    const max = Math.max(1, ...points.map((p) => p.revenue));
    const innerW = W - PAD_X * 2;
    const innerH = H - PAD_TOP - PAD_BOTTOM;
    const stepX = points.length > 1 ? innerW / (points.length - 1) : innerW;
    const xy = points.map((p, i) => ({
      x: PAD_X + i * stepX,
      y: PAD_TOP + innerH - (p.revenue / max) * innerH,
    }));
    const line = xy.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
    const fill = xy.length
      ? `${line} L${xy[xy.length - 1].x.toFixed(1)},${H - PAD_BOTTOM} L${xy[0].x.toFixed(1)},${H - PAD_BOTTOM} Z`
      : "";
    return { path: line, area: fill, coords: xy, maxRevenue: max };
  }, [points]);

  if (points.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-[var(--text-muted)]">
        Ingen försäljningsdata för perioden
      </div>
    );
  }

  // Glesa ut x-etiketter: visa max ~8 stycken oavsett fönster.
  const labelEvery = Math.max(1, Math.ceil(points.length / 8));
  const hovered = hoverIdx !== null ? points[hoverIdx] : null;
  const hoveredCoord = hoverIdx !== null ? coords[hoverIdx] : null;

  return (
    <div className="relative">
      {/* Hover-läsare — fast höjd så grafen inte hoppar */}
      <div className="mb-2 flex h-5 items-center gap-3 text-[12px]">
        {hovered ? (
          <>
            <span className="font-semibold text-[var(--text-primary)]">{hovered.label}</span>
            <span className="text-[var(--text-secondary)]">{formatCurrency(hovered.revenue)}</span>
            <span className="text-[var(--text-muted)]">{formatNumber(hovered.orders)} ordrar</span>
          </>
        ) : (
          <span className="text-[var(--text-muted)]">Hovra för detaljer · topp {formatCurrency(maxRevenue)}/dag</span>
        )}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Omsättning per dag"
        onMouseMove={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * W;
          const stepX = points.length > 1 ? (W - PAD_X * 2) / (points.length - 1) : 1;
          const idx = Math.round((x - PAD_X) / stepX);
          setHoverIdx(Math.min(points.length - 1, Math.max(0, idx)));
        }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* Horisontella stödlinjer (kvartiler) */}
        {[0.25, 0.5, 0.75].map((f) => {
          const y = PAD_TOP + (H - PAD_TOP - PAD_BOTTOM) * f;
          return <line key={f} x1={PAD_X} x2={W - PAD_X} y1={y} y2={y} stroke="var(--border-subtle)" strokeWidth={1} />;
        })}
        <path d={area} fill="var(--info)" opacity={0.12} />
        <path d={path} fill="none" stroke="var(--info)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {/* Hover-markör */}
        {hoveredCoord && (
          <>
            <line x1={hoveredCoord.x} x2={hoveredCoord.x} y1={PAD_TOP} y2={H - PAD_BOTTOM} stroke="var(--border-strong)" strokeWidth={1} />
            <circle cx={hoveredCoord.x} cy={hoveredCoord.y} r={4} fill="var(--info)" stroke="var(--bg-panel)" strokeWidth={2} />
          </>
        )}
        {/* X-etiketter */}
        {points.map((p, i) =>
          i % labelEvery === 0 ? (
            <text key={i} x={coords[i].x} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--text-muted)">
              {p.label}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}
