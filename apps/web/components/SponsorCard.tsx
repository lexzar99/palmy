"use client";

import { useState } from "react";
import { X, ExternalLink } from "lucide-react";

export interface SponsorData {
  id: string;
  name: string;
  imageUrl: string;
  isClickable: boolean;
  infoText?: string;
  ctaText?: string;
  ctaLink?: string;
}

export default function SponsorCard({ sponsor }: { sponsor: SponsorData }) {
  const [flipped, setFlipped] = useState(false);

  if (!sponsor.isClickable) {
    return (
      <div className="shrink-0 w-48 h-24 rounded-2xl overflow-hidden border border-white/5 bg-zinc-900">
        <img src={sponsor.imageUrl} alt={sponsor.name} className="w-full h-full object-cover" />
      </div>
    );
  }

  return (
    <div className="relative shrink-0 w-48 h-24">
      {/* Front */}
      <div
        className="absolute inset-0 rounded-2xl overflow-hidden border border-white/10 bg-zinc-900 cursor-pointer transition-all duration-300"
        style={{
          opacity: flipped ? 0 : 1,
          transform: flipped ? "scale(0.95)" : "scale(1)",
          pointerEvents: flipped ? "none" : "auto",
        }}
        onClick={() => setFlipped(true)}
      >
        <img src={sponsor.imageUrl} alt={sponsor.name} className="w-full h-full object-cover" />
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent px-3 py-2">
          <p className="text-[8px] font-black uppercase tracking-widest text-white/70">Klicka för mer</p>
        </div>
      </div>

      {/* Back */}
      <div
        className="absolute inset-0 rounded-2xl border border-gold-500/30 bg-zinc-900 p-3 flex flex-col transition-all duration-300"
        style={{
          opacity: flipped ? 1 : 0,
          transform: flipped ? "scale(1)" : "scale(0.95)",
          pointerEvents: flipped ? "auto" : "none",
        }}
      >
        <button onClick={() => setFlipped(false)} className="self-end mb-1 text-zinc-600 hover:text-zinc-300 transition-colors">
          <X size={12} />
        </button>
        {sponsor.infoText && (
          <p className="text-[9px] font-bold text-zinc-300 leading-tight flex-1 line-clamp-3">{sponsor.infoText}</p>
        )}
        {sponsor.ctaLink && (
          <a href={sponsor.ctaLink} target="_blank" rel="noopener noreferrer"
            className="mt-1 flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-gold-500 hover:text-gold-400 transition-colors">
            {sponsor.ctaText || "Läs mer"} <ExternalLink size={9} />
          </a>
        )}
      </div>
    </div>
  );
}
