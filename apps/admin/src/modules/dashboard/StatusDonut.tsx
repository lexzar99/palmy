"use client";

import { formatNumber, orderStatusLabel, orderStatusTone } from "@/shared/utils/format";

/**
 * Beroendefri donut över liveordrarnas status. Segmentfärger följer
 * status-tonen (semantiska tokens) med navy som neutral bas, så den
 * fungerar i båda teman utan hårdkodade färger.
 */
const TONE_COLOR: Record<string, string> = {
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
  info: "var(--brand-navy-bar)",
  neutral: "var(--brand-navy-bar)",
};

const RADIUS = 15.915; // omkrets 100 → dasharray i procent
const STROKE = 4.4;

export function StatusDonut({ counts, compact = false }: { counts: Record<string, number>; compact?: boolean }) {
  const entries = Object.entries(counts).filter(([, count]) => count > 0);
  const total = entries.reduce((sum, [, count]) => sum + count, 0);

  if (total === 0) {
    return (
      <div className={`flex items-center justify-center text-sm text-[var(--text-muted)] ${compact ? "h-[150px]" : "h-[180px]"}`}>
        Inga aktiva ordrar
      </div>
    );
  }

  let offset = 25; // startar kl 12
  const segments = entries.map(([status, count]) => {
    const pct = (count / total) * 100;
    const segment = { status, count, pct, offset };
    offset -= pct;
    return segment;
  });

  return (
    <div className={compact ? "flex flex-col items-center gap-4" : "flex flex-wrap items-center gap-6"}>
      <div className={`relative flex-none ${compact ? "h-[112px] w-[112px]" : "h-[132px] w-[132px]"}`}>
        <svg viewBox="0 0 42 42" className="h-full w-full" aria-hidden>
          <circle
            cx="21" cy="21" r={RADIUS} fill="none"
            stroke="var(--bg-hover)" strokeWidth={STROKE}
          />
          {segments.map((s) => (
            <circle
              key={s.status}
              cx="21" cy="21" r={RADIUS} fill="none"
              stroke={TONE_COLOR[orderStatusTone(s.status)] ?? "var(--brand-navy-bar)"}
              strokeWidth={STROKE}
              strokeLinecap="butt"
              strokeDasharray={`${Math.max(0, s.pct - 1)} ${100 - Math.max(0, s.pct - 1)}`}
              strokeDashoffset={s.offset}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[22px] font-extrabold leading-none text-[var(--text-primary)]">{formatNumber(total)}</span>
          <span className="mt-1 text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">ordrar</span>
        </div>
      </div>
      <ul className={compact ? "w-full space-y-1.5" : "min-w-0 flex-1 space-y-2"}>
        {(compact ? segments.slice(0, 4) : segments).map((s) => (
          <li key={s.status} className="flex items-center gap-2.5 text-[12.5px]">
            <span
              className="h-[9px] w-[9px] flex-none rounded-full"
              style={{ background: TONE_COLOR[orderStatusTone(s.status)] ?? "var(--brand-navy-bar)" }}
            />
            <span className="min-w-0 flex-1 truncate font-semibold text-[var(--text-secondary)]">
              {orderStatusLabel(s.status)}
            </span>
            <span className="font-bold text-[var(--text-primary)]">{formatNumber(s.count)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
