"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { motion } from "framer-motion";

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
      <div className="shrink-0 w-80 h-44 rounded-[2.5rem] overflow-hidden border border-white/5 bg-zinc-900 shadow-2xl">
        <img src={sponsor.imageUrl} alt={sponsor.name} className="w-full h-full object-cover" />
      </div>
    );
  }

  return (
    <div 
      className="relative shrink-0 w-80 h-44 perspective-1000 group cursor-pointer"
      onMouseEnter={() => {/* Optional hover hint */}}
      onClick={() => setFlipped(!flipped)}
    >
      <motion.div
        className="relative w-full h-full transition-all duration-700 preserve-3d"
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
      >
        {/* Front */}
        <div className="absolute inset-0 w-full h-full backface-hidden rounded-[2.5rem] overflow-hidden border border-white/10 bg-zinc-900 shadow-xl">
          <img src={sponsor.imageUrl} alt={sponsor.name} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-6">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black uppercase tracking-[0.3em] text-gold-500/80">Sponsrad</span>
              <p className="text-[10px] font-black uppercase tracking-widest text-white animate-pulse">Tryck för mer</p>
            </div>
          </div>
        </div>

        {/* Back */}
        <div 
          className="absolute inset-0 w-full h-full backface-hidden rounded-[2.5rem] border border-gold-500/40 bg-[#121214] p-8 flex flex-col justify-between shadow-2xl shadow-gold-500/10"
          style={{ transform: "rotateY(180deg)" }}
        >
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-full bg-gold-500/10 border border-gold-500/20 flex items-center justify-center text-gold-500">
                <SponsorIcon />
              </div>
              <h4 className="text-sm font-black text-white uppercase italic tracking-tight">{sponsor.name}</h4>
            </div>
            {sponsor.infoText && (
              <p className="text-xs font-bold text-zinc-400 leading-relaxed line-clamp-4">{sponsor.infoText}</p>
            )}
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-white/5">
             <span className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Sponsor</span>
             {sponsor.ctaLink && (
               <a 
                 href={sponsor.ctaLink} 
                 target="_blank" 
                 rel="noopener noreferrer" 
                 onClick={(e) => e.stopPropagation()}
                 className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gold-500 text-zinc-950 text-[9px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-lg"
               >
                 {sponsor.ctaText || "Besök"} <ExternalLink size={10} />
               </a>
             )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function SponsorIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  );
}
