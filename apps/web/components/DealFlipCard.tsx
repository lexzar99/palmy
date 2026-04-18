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

const TONES: Record<DealTone, { accent: string }> = {
  gold:   { accent: "#EAB545" },
  orange: { accent: "#F07A13" },
  purple: { accent: "#A855F7" },
};

export default function DealFlipCard({ deal }: { deal: DealCardData }) {
  const [flipped, setFlipped] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!deal) return null;
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
          borderColor: "var(--border-muted)",
          backgroundColor: "var(--bg-secondary)",
          boxShadow: "var(--card-shadow)",
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
            <div className="w-6 h-6 rounded-[8px] flex items-center justify-center" style={{ backgroundColor: tone.accent, opacity: 0.1 }}>
              {deal.tone === "purple"
                ? <Tag size={11} style={{ color: tone.accent }} />
                : <Sparkles size={11} style={{ color: tone.accent }} />}
            </div>
            <span className="text-[7px] font-bold uppercase tracking-[0.15em]" style={{ color: tone.accent }}>
              {deal.badgeLabel}
            </span>
          </div>
          <div className="w-6 h-6 rounded-[8px] flex items-center justify-center" style={{ backgroundColor: tone.accent, opacity: 0.1 }}>
            <ArrowRight size={11} style={{ color: tone.accent }} />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 flex-col gap-2">
          <h3 className="text-sm font-black uppercase tracking-[0.1em]" style={{ color: tone.accent }}>
            {deal.title}
          </h3>
          <p className="text-[8px] text-zinc-400 tracking-[0.05em]">
            {deal.subtitle}
          </p>
          <div className="flex-1 flex-col gap-1">
            <p className="text-[8px] font-black" style={{ color: "var(--text-primary)" }}>
              {deal.description}
            </p>
            {deal.code && (
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-[8px] font-black" style={{ color: "var(--text-primary)" }}>
                  Din kod:
                </span>
                <span className="text-[8px] font-mono" style={{ color: tone.accent }}>
                  {deal.code}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Back ── */}
      <div
        className="absolute inset-0 rounded-[1.5rem] p-[14px] border flex flex-col cursor-pointer transition-all duration-300 overflow-hidden"
        style={{
          borderColor: "var(--border-muted)",
          backgroundColor: "var(--bg-deep)",
          boxShadow: "var(--card-shadow)",
          opacity: flipped ? 1 : 0,
          transform: flipped ? "scale(1) translateX(0)" : "scale(0.96) translateX(10px)",
          pointerEvents: flipped ? "auto" : "none",
          transitionProperty: "opacity, transform",
        }}
        onClick={() => setFlipped(false)}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="w-6 h-6 rounded-[8px] flex items-center justify-center" style={{ backgroundColor: tone.accent, opacity: 0.1 }}>
            {deal.tone === "purple"
              ? <Tag size={11} style={{ color: tone.accent }} />
              : <Sparkles size={11} style={{ color: tone.accent }} />}
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-black uppercase tracking-[0.1em]" style={{ color: tone.accent }}>
              {deal.title}
            </h3>
          </div>
          <div className="w-6 h-6 rounded-[8px] flex items-center justify-center" style={{ backgroundColor: tone.accent, opacity: 0.1 }}>
            <Check size={11} style={{ color: tone.accent }} />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 flex-col gap-2">
          <p className="text-[9px] font-black" style={{ color: "var(--text-primary)" }}>
            {deal.rewardLabel}
          </p>
          {deal.minOrderText && (
            <p className="text-[8px] font-black" style={{ color: "var(--text-secondary)" }}>
              {deal.minOrderText}
            </p>
          )}
          {deal.validUntil && (
            <p className="text-[8px] font-black" style={{ color: "var(--text-secondary)" }}>
              Giltig t.o.m. {new Date(deal.validUntil).toLocaleDateString('sv-SE')}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-[8px] flex items-center justify-center" style={{ backgroundColor: tone.accent, opacity: 0.1 }}>
              <Check size={11} style={{ color: tone.accent }} />
            </div>
            <p className="text-[8px] font-black" style={{ color: "var(--text-primary)" }}>
              Rabatt tillagd
            </p>
          </div>
          <button
            onClick={handleUse}
            className="px-4 py-2 rounded-[1rem] bg-gold-500 text-zinc-950 font-black text-xs"
          >
            Använd nu
          </button>
        </div>
      </div>
    </div>
  );
}
  };

  return (
    <div className="relative shrink-0" style={{ width: 260, height: 150 }}>
      {/* ── Front ── */}
      <div
        className="absolute inset-0 rounded-[1.5rem] p-[14px] border flex flex-col cursor-pointer transition-all duration-300 overflow-hidden"
        style={{
          borderColor: "var(--border-muted)",
          backgroundColor: "var(--bg-secondary)",
          boxShadow: "var(--card-shadow)",
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
          <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: "var(--bg-deep)" }}>
            <ArrowRight size={11} style={{ color: "var(--text-secondary)" }} />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 flex flex-col justify-center mt-2 min-h-0">
          <p className="text-[14px] font-black italic uppercase leading-[1.05] line-clamp-2" style={{ color: "var(--text-primary)" }}>{deal.title}</p>
          <p className="text-[8px] font-bold uppercase mt-1 line-clamp-2 leading-snug" style={{ color: "var(--text-secondary)" }}>{deal.subtitle}</p>
        </div>

        {/* Footer */}
        <div className="flex items-end justify-between mt-auto">
          <span className="text-[13px] font-black uppercase leading-none max-w-[60%] line-clamp-1" style={{ color: tone.accent }}>{deal.rewardLabel}</span>
          <span className="text-[7px] font-black uppercase tracking-wider shrink-0" style={{ color: "var(--text-secondary)" }}>Tryck</span>
        </div>
      </div>

      {/* ── Back ── */}
      <div
        className="absolute inset-0 rounded-[1.5rem] p-[14px] border flex flex-col overflow-hidden"
        style={{
          borderColor: "var(--border-muted)",
          backgroundColor: "var(--bg-deep)",
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
          <button onClick={() => setFlipped(false)} className="w-6 h-6 rounded-full flex items-center justify-center transition-colors" style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)" }}>
            <X size={11} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 flex flex-col justify-center gap-1.5 mt-2 min-h-0">
          {deal.description && (
            <p className="text-[9px] font-bold leading-snug line-clamp-2" style={{ color: "var(--text-primary)" }}>{deal.description}</p>
          )}

          {/* Code pill */}
          {deal.code && (
            <button onClick={copy}
              className="self-start flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[8px] font-black uppercase tracking-widest transition-all hover:border-gold-500/20"
              style={{ borderColor: "var(--border-muted)", backgroundColor: "var(--bg-secondary)" }}>
              {copied ? <Check size={10} className="text-emerald-500" /> : <Copy size={10} style={{ color: "var(--text-secondary)" }} />}
              <span style={{ color: "var(--text-primary)" }}>KOD: {deal.code}</span>
            </button>
          )}

          {/* Tags */}
          <div className="flex flex-wrap gap-1.5">
            {deal.minOrderText && (
              <span className="px-2 py-1 rounded-full text-[7px] font-black uppercase" style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)" }}>
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
            <p className="text-[7px] font-black uppercase tracking-widest line-clamp-1" style={{ color: "var(--text-secondary)" }}>
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
