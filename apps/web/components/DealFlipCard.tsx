"use client";

import { useState } from "react";
import { Sparkles, Tag, X, ArrowRight, Copy, Check } from "lucide-react";

export type DealTone = "gold" | "orange" | "purple";

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
  gold:   { accent: "#EAB545", soft: "rgba(234,181,69,0.12)", border: "rgba(234,181,69,0.25)" },
  orange: { accent: "#F07A13", soft: "rgba(240,122,19,0.12)", border: "rgba(240,122,19,0.25)" },
  purple: { accent: "#A855F7", soft: "rgba(168,85,247,0.12)", border: "rgba(168,85,247,0.25)" },
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
    <div className="relative shrink-0" style={{ width: 260, height: 150 }}>
      {/* ── Front ── */}
      <div
        className="absolute inset-0 rounded-[1.5rem] p-[14px] border flex flex-col cursor-pointer transition-all duration-300 overflow-hidden"
        style={{
          borderColor: tone.border,
          backgroundColor: "#211C19",
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
            <div className="w-6 h-6 rounded-[8px] flex items-center justify-center" style={{ backgroundColor: tone.soft }}>
              {deal.tone === "purple"
                ? <Tag size={11} style={{ color: tone.accent }} />
                : <Sparkles size={11} style={{ color: tone.accent }} />}
            </div>
            <span className="text-[7px] font-black uppercase tracking-[0.15em]" style={{ color: tone.accent }}>
              {deal.badgeLabel}
            </span>
          </div>
          <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(255,248,234,0.05)" }}>
            <ArrowRight size={11} style={{ color: "#B8AA95" }} />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 flex flex-col justify-center mt-2 min-h-0">
          <p className="text-[14px] font-black italic uppercase leading-[1.05] line-clamp-2" style={{ color: "#FFF8EA" }}>{deal.title}</p>
          <p className="text-[8px] font-bold uppercase mt-1 line-clamp-2 leading-snug" style={{ color: "#B8AA95" }}>{deal.subtitle}</p>
        </div>

        {/* Footer */}
        <div className="flex items-end justify-between mt-auto">
          <span className="text-[13px] font-black uppercase leading-none max-w-[60%] line-clamp-1" style={{ color: tone.accent }}>{deal.rewardLabel}</span>
          <span className="text-[7px] font-black uppercase tracking-wider shrink-0" style={{ color: "#8D7C67" }}>Tryck</span>
        </div>
      </div>

      {/* ── Back ── */}
      <div
        className="absolute inset-0 rounded-[1.5rem] p-[14px] border flex flex-col overflow-hidden"
        style={{
          borderColor: tone.border,
          backgroundColor: "#171513",
          opacity: flipped ? 1 : 0,
          transform: flipped ? "scale(1) translateX(0)" : "scale(0.96) translateX(10px)",
          pointerEvents: flipped ? "auto" : "none",
          transitionProperty: "opacity, transform",
          transition: "all 0.3s ease",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-[7px] font-black uppercase tracking-[0.15em]" style={{ color: tone.accent }}>Mer info</span>
          <button onClick={() => setFlipped(false)} className="w-6 h-6 rounded-full flex items-center justify-center transition-colors" style={{ backgroundColor: "rgba(255,248,234,0.05)", color: "#B8AA95" }}>
            <X size={11} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 flex flex-col justify-center gap-1.5 mt-2 min-h-0">
          {deal.description && (
            <p className="text-[9px] font-bold leading-snug line-clamp-2" style={{ color: "#D7CBB8" }}>{deal.description}</p>
          )}

          {/* Code pill */}
          {deal.code && (
            <button onClick={copy}
              className="self-start flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[8px] font-black uppercase tracking-widest transition-all hover:border-white/20"
              style={{ borderColor: "rgba(255,248,234,0.08)", backgroundColor: "rgba(255,248,234,0.05)" }}>
              {copied ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} style={{ color: "#B8AA95" }} />}
              <span style={{ color: "#FFF8EA" }}>KOD: {deal.code}</span>
            </button>
          )}

          {/* Tags */}
          <div className="flex flex-wrap gap-1.5">
            {deal.minOrderText && (
              <span className="px-2 py-1 rounded-full text-[7px] font-black uppercase" style={{ backgroundColor: "rgba(255,248,234,0.05)", color: "#B8AA95" }}>
                {deal.minOrderText}
              </span>
            )}
            {(deal.tags || []).slice(0, 1).map(tag => (
              <span key={tag} className="px-2 py-1 rounded-full text-[7px] font-black uppercase line-clamp-1"
                style={{ backgroundColor: tone.soft, color: tone.accent }}>
                {tag}
              </span>
            ))}
          </div>

          {deal.validUntil && (
            <p className="text-[7px] font-black uppercase tracking-widest line-clamp-1" style={{ color: "#8D7C67" }}>
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
            className="mt-auto pt-2 w-full py-2.5 rounded-[12px] text-[9px] font-black uppercase tracking-widest text-[#09090b] transition-all hover:opacity-90"
            style={{ backgroundColor: tone.accent }}>
            Utnyttja nu
          </button>
        )}
      </div>
    </div>
  );
}
