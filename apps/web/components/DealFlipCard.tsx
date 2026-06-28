"use client";

import { useState } from "react";
import { Sparkles, Tag, X, ArrowRight, Copy, Check } from "lucide-react";

export type DealTone = "gold" | "orange" | "purple" | "emerald";

export interface DealCardData {
  id: string;
  badgeLabel: string;
  title: string;
  subtitle: string;
  rewardLabel: string;
  isGlobal?: boolean;
  description?: string;
  code?: string;
  validUntil?: string | null;
  minOrderText?: string | null;
  tags?: string[];
  tone?: DealTone;
  variant?: "public" | "personal";
  relatedRestaurantIds?: string[];
  // BOGO-flag: påverkar både badge-text (1+1 GRATIS) och färg (emerald).
  isBogo?: boolean;
  // För att kunna välja högsta procent när flera regular-deals finns på samma restaurang.
  discountPercent?: number;
  onNavigateToFiltered?: (ids: string[], title: string) => void;
  onUseNow?: () => void;
}

const TONES: Record<DealTone, { accent: string }> = {
  gold:    { accent: "#F0531C" },
  orange:  { accent: "#F07A13" },
  purple:  { accent: "#A855F7" },
  emerald: { accent: "#10B981" },
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
    // Prio 1: navigera till dedikerad deal-sida om vi har deal-id (visar
    // alla restauranger som har erbjudandet + deal-info i toppen).
    if (deal.id && typeof window !== "undefined") {
      window.location.href = `/deals/${deal.id}`;
      return;
    }
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
              Giltig t.o.m. {new Date(deal.validUntil ?? "").toLocaleDateString('sv-SE')}
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
