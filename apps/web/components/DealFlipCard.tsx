"use client";

import { useState } from "react";
import { Sparkles, Tag, X, ArrowRight, Copy, Check } from "lucide-react";

export type DealTone = "gold" | "emerald" | "purple";

export interface DealCardData {
  id: string;
  badgeLabel: string;
  title: string;
  subtitle: string;
  rewardLabel: string;
  description?: string;
  code?: string;
  validUntil?: string | null;
  minOrderText?: string | null;
  tags?: string[];
  tone?: DealTone;
  variant?: "public" | "personal";
  relatedRestaurantIds?: string[];
  onNavigateToFiltered?: (ids: string[], title: string) => void;
  onUseNow?: () => void;
}

const TONES: Record<DealTone, { accent: string; soft: string; border: string }> = {
  gold:    { accent: "#d4a017", soft: "rgba(212,160,23,0.12)",  border: "rgba(212,160,23,0.25)" },
  emerald: { accent: "#22c55e", soft: "rgba(34,197,94,0.12)",   border: "rgba(34,197,94,0.25)" },
  purple:  { accent: "#a855f7", soft: "rgba(168,85,247,0.12)",  border: "rgba(168,85,247,0.25)" },
};

export default function DealFlipCard({ deal }: { deal: DealCardData }) {
  const [flipped, setFlipped] = useState(false);
  const [copied, setCopied] = useState(false);
  const tone = TONES[deal.tone ?? "gold"];

  const copy = () => {
    if (!deal.code) return;
    navigator.clipboard.writeText(deal.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleUse = () => {
    if (deal.relatedRestaurantIds?.length && deal.onNavigateToFiltered) {
      deal.onNavigateToFiltered(deal.relatedRestaurantIds, deal.title);
    } else if (deal.onUseNow) {
      deal.onUseNow();
    }
  };

  return (
    <div className="relative shrink-0" style={{ width: 292, height: 210 }}>
      {/* ── Front ── */}
      <div
        className="absolute inset-0 rounded-[1.75rem] p-[18px] border flex flex-col cursor-pointer transition-all duration-300"
        style={{
          borderColor: tone.border,
          backgroundColor: "#17151d",
          opacity: flipped ? 0 : 1,
          transform: flipped ? "scale(0.96) translateX(-10px)" : "scale(1) translateX(0)",
          pointerEvents: flipped ? "none" : "auto",
          transitionProperty: "opacity, transform",
        }}
        onClick={() => setFlipped(true)}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-[9px] flex items-center justify-center" style={{ backgroundColor: tone.soft }}>
              {deal.tone === "emerald"
                ? <Tag size={13} style={{ color: tone.accent }} />
                : <Sparkles size={13} style={{ color: tone.accent }} />}
            </div>
            <span className="text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: tone.accent }}>
              {deal.badgeLabel}
            </span>
          </div>
          <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.05)" }}>
            <ArrowRight size={13} className="text-zinc-500" />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 flex flex-col justify-center mt-3">
          <p className="text-[18px] font-black italic uppercase text-zinc-100 leading-tight line-clamp-2">{deal.title}</p>
          <p className="text-[10px] font-bold uppercase text-zinc-500 mt-2 line-clamp-2 leading-snug">{deal.subtitle}</p>
        </div>

        {/* Footer */}
        <div className="flex items-end justify-between mt-auto">
          <span className="text-[18px] font-black uppercase" style={{ color: tone.accent }}>{deal.rewardLabel}</span>
          <span className="text-[8px] font-black uppercase tracking-wider text-zinc-700">Tryck för info</span>
        </div>
      </div>

      {/* ── Back ── */}
      <div
        className="absolute inset-0 rounded-[1.75rem] p-[18px] border flex flex-col"
        style={{
          borderColor: tone.border,
          backgroundColor: "#110f16",
          opacity: flipped ? 1 : 0,
          transform: flipped ? "scale(1) translateX(0)" : "scale(0.96) translateX(10px)",
          pointerEvents: flipped ? "auto" : "none",
          transitionProperty: "opacity, transform",
          transition: "all 0.3s ease",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: tone.accent }}>Mer info</span>
          <button onClick={() => setFlipped(false)} className="w-7 h-7 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition-colors" style={{ backgroundColor: "rgba(255,255,255,0.05)" }}>
            <X size={13} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 flex flex-col justify-center gap-2 mt-3">
          {deal.description && (
            <p className="text-[11px] font-bold text-zinc-400 leading-snug line-clamp-3">{deal.description}</p>
          )}

          {/* Code pill */}
          {deal.code && (
            <button onClick={copy}
              className="self-start flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all hover:border-white/20"
              style={{ borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(255,255,255,0.04)" }}>
              {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} className="text-zinc-500" />}
              <span className="text-zinc-200">KOD: {deal.code}</span>
            </button>
          )}

          {/* Tags */}
          <div className="flex flex-wrap gap-1.5">
            {deal.minOrderText && (
              <span className="px-2 py-1 rounded-full text-[8px] font-black uppercase text-zinc-500" style={{ backgroundColor: "rgba(255,255,255,0.05)" }}>
                {deal.minOrderText}
              </span>
            )}
            {(deal.tags || []).slice(0, 2).map(tag => (
              <span key={tag} className="px-2 py-1 rounded-full text-[8px] font-black uppercase"
                style={{ backgroundColor: tone.soft, color: tone.accent }}>
                {tag}
              </span>
            ))}
          </div>

          {deal.validUntil && (
            <p className="text-[8px] font-black uppercase tracking-widest text-zinc-700">
              Gäller t.o.m {new Date(deal.validUntil).toLocaleDateString("sv-SE")}
            </p>
          )}
        </div>

        {/* CTA */}
        {deal.variant === "personal" ? (
          <div className="mt-auto pt-3 flex items-center justify-center py-3 rounded-[14px] border"
            style={{ borderColor: "rgba(34,197,94,0.3)", backgroundColor: "rgba(34,197,94,0.1)" }}>
            <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400">Används automatiskt i kassan</span>
          </div>
        ) : (
          <button onClick={handleUse}
            className="mt-auto pt-3 w-full py-3 rounded-[14px] text-[10px] font-black uppercase tracking-widest text-[#09090b] transition-all hover:opacity-90"
            style={{ backgroundColor: tone.accent }}>
            Utnyttja nu
          </button>
        )}
      </div>
    </div>
  );
}
