"use client";

import { useId, useMemo, useState } from "react";
import { formatCurrency, formatNumber } from "@/shared/utils/format";

export interface TrendPoint {
  label: string;
  revenue: number;
  orders: number;
}

const W = 600;
const H = 170;
const PAD_X = 6;
const PAD_TOP = 14;
const PAD_BOTTOM = 8;

/**
 * Beroendefri area-graf (Velora-stil): mjuk kurva, gradientfyllnad och
 * orange peak-punkt. Fast höjd och max ~6 glesa datumetiketter så
 * layouten aldrig hoppar när perioden byts. Tema-säker via CSS-variabler
 * — inuti .hero-card blir linjen cream och peaken orange.
 */
export function TrendChart({ points }: { points: TrendPoint[] }) {
  const gradientId = useId();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const geometry = useMemo(() => {
    if (points.length === 0) return null;
    const max = Math.max(1, ...points.map((p) => p.revenue));
    const stepX = points.length > 1 ? (W - PAD_X * 2) / (points.length - 1) : 0;
    const coords = points.map((p, i) => ({
      x: points.length > 1 ? PAD_X + i * stepX : W / 2,
      y: PAD_TOP + (1 - p.revenue / max) * (H - PAD_TOP - PAD_BOTTOM),
    }));

    // Catmull-Rom → kubisk bezier för en mjuk kurva utan bibliotek.
    let path = `M ${coords[0].x} ${coords[0].y}`;
    for (let i = 0; i < coords.length - 1; i += 1) {
      const p0 = coords[Math.max(0, i - 1)];
      const p1 = coords[i];
      const p2 = coords[i + 1];
      const p3 = coords[Math.min(coords.length - 1, i + 2)];
      const c1x = p1.x + (p2.x - p0.x) / 6;
      const c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6;
      const c2y = p2.y - (p3.y - p1.y) / 6;
      path += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
    }
    const area = `${path} L ${coords[coords.length - 1].x} ${H} L ${coords[0].x} ${H} Z`;
    const peakIdx = points.reduce((best, p, i) => (p.revenue > points[best].revenue ? i : best), 0);
    return { coords, path, area, peakIdx };
  }, [points]);

  if (!geometry) {
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-[var(--text-muted)]">
        Ingen försäljning i perioden
      </div>
    );
  }

  const { coords, path, area, peakIdx } = geometry;
  const active = hoverIdx ?? peakIdx;
  const activePoint = points[active];

  // Max ~6 etiketter, alltid första och sista — resten döljs i stället för
  // att trunkeras sönder.
  const tickEvery = Math.max(1, Math.ceil(points.length / 6));
  const ticks = coords
    .map((c, i) => ({ x: c.x, label: points[i].label, index: i }))
    .filter((t) => t.index % tickEvery === 0 || t.index === points.length - 1);

  const handleMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * W;
    let nearest = 0;
    let best = Infinity;
    coords.forEach((c, i) => {
      const d = Math.abs(c.x - x);
      if (d < best) {
        best = d;
        nearest = i;
      }
    });
    setHoverIdx(nearest);
  };

  return (
    <div>
      {/* Läsare — fast höjd så grafen inte hoppar */}
      <div className="mb-2 flex h-5 items-center gap-3 text-[12px]">
        <span className="font-bold text-[var(--text-primary)]">{activePoint.label}</span>
        <span className="text-[var(--text-secondary)]">{formatCurrency(activePoint.revenue)}</span>
        <span className="text-[var(--text-muted)]">{formatNumber(activePoint.orders)} ordrar</span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-[150px] w-full sm:h-[170px]"
        preserveAspectRatio="none"
        onPointerMove={handleMove}
        onPointerLeave={() => setHoverIdx(null)}
        role="img"
        aria-label="Omsättning per dag"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradientId})`} />
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {/* Aktiv punkt — orange, med vit ring så den syns på navy */}
        <circle cx={coords[active].x} cy={coords[active].y} r="5" fill="var(--brand-orange)" stroke="#fff" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>

      {/* Glesa etiketter positionerade i procent — trunkeras aldrig */}
      <div className="relative mt-1.5 h-4">
        {ticks.map((t) => (
          <span
            key={t.index}
            className="absolute top-0 whitespace-nowrap text-[10.5px] font-semibold"
            style={{
              left: `${(t.x / W) * 100}%`,
              // Kantetiketter kläms in så de aldrig kapas av containern.
              transform: t.x / W < 0.06 ? "none" : t.x / W > 0.94 ? "translateX(-100%)" : "translateX(-50%)",
              color: t.index === active ? "var(--text-primary)" : "var(--text-muted)",
            }}
          >
            {t.label}
          </span>
        ))}
      </div>
    </div>
  );
}
