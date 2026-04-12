"use client";

import { useState } from "react";
import { ExternalLink, ChevronRight, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

export interface SponsorData {
  id: string;
  name: string;
  imageUrl: string;
  isClickable: boolean;
  infoText?: string;
  ctaText?: string;
  ctaLink?: string;
  linkType?: 'EXTERNAL' | 'DEAL' | 'RESTAURANT';
  linkTarget?: string;
}

export default function SponsorCard({ sponsor }: { sponsor: SponsorData }) {
  const [flipped, setFlipped] = useState(false);

  const handleFlip = () => {
    // We allow flipping even if not clickable for a better UI experience, 
    // but the CTA button on the back only works if isClickable is true.
    setFlipped(!flipped);
  };

  const handleCTAClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!sponsor.isClickable) return;

    const target = sponsor.linkTarget || sponsor.ctaLink;
    if (!target) return;

    if (sponsor.linkType === 'DEAL') {
      window.location.href = `/search?deal=${target}`;
    } else if (sponsor.linkType === 'RESTAURANT') {
      window.location.href = `/restaurants/${target}`;
    } else {
      window.open(target, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div 
      className="relative shrink-0 w-80 h-44 perspective-1000 group"
      onClick={handleFlip}
    >
      <motion.div
        className="relative w-full h-full preserve-3d cursor-pointer"
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ 
          type: "spring", 
          stiffness: 140, 
          damping: 18,
          mass: 0.8
        }}
      >
        {/* Front Side */}
        <div 
          className="absolute inset-0 w-full h-full backface-hidden rounded-[2.5rem] overflow-hidden border border-white/10 bg-zinc-950 shadow-2xl"
        >
          <img 
            src={sponsor.imageUrl} 
            alt={sponsor.name} 
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/20 to-transparent flex flex-col justify-end p-6">
            <div className="flex items-center justify-between">
              <div className="px-3 py-1 bg-gold-500/20 backdrop-blur-md rounded-full border border-gold-500/30">
                <span className="text-[8px] font-black uppercase tracking-[0.2em] text-gold-400">Partner Spotlight</span>
              </div>
              <motion.div 
                animate={{ x: [0, 4, 0] }} 
                transition={{ repeat: Infinity, duration: 2 }}
                className="text-white/40 group-hover:text-white/80 transition-colors"
              >
                <div className="bg-white/10 p-2 rounded-full backdrop-blur-sm">
                   <ChevronRight size={12} />
                </div>
              </motion.div>
            </div>
            <h3 className="text-lg font-black text-white mt-2 uppercase tracking-tight leading-none italic">{sponsor.name}</h3>
          </div>
        </div>

        {/* Back Side */}
        <div 
          className="absolute inset-0 w-full h-full backface-hidden rounded-[2.5rem] border border-gold-500/40 bg-zinc-950 p-8 flex flex-col justify-between shadow-2xl shadow-gold-500/20"
          style={{ transform: "rotateY(180deg)" }}
        >
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-2xl bg-gold-500/10 border border-gold-500/20 flex items-center justify-center text-gold-500 shadow-inner">
                <SponsorIcon />
              </div>
              <div>
                <h4 className="text-sm font-black text-white uppercase italic tracking-wider leading-none">{sponsor.name}</h4>
                <p className="text-[8px] font-black uppercase tracking-[0.2em] text-zinc-600 mt-1">Exklusiv Partner</p>
              </div>
            </div>
            
            <p className="text-[11px] font-bold text-zinc-400 leading-relaxed italic line-clamp-3">
              {sponsor.infoText || "Upptäck fantastiska erbjudanden och nyheter från vår samarbetspartner. Klicka nedan för att se mer!"}
            </p>
          </div>

          <div className="flex items-center justify-between pt-5 border-t border-white/5 relative z-10">
             <div className="flex flex-col">
               <span className="text-[8px] font-black uppercase tracking-[0.3em] text-zinc-700">Information</span>
               <span className="text-[10px] font-black text-zinc-500">MATGO SPOTLIGHT</span>
             </div>
             
             {sponsor.isClickable && (
               <button 
                 onClick={handleCTAClick}
                 className="group/btn flex items-center gap-2.5 px-6 py-3 rounded-2xl bg-gold-500 text-zinc-950 text-[10px] font-black uppercase tracking-widest hover:bg-white hover:scale-105 active:scale-95 transition-all shadow-xl shadow-gold-500/20"
               >
                 {sponsor.ctaText || "Utforska"} 
                 <ArrowRight size={12} className="group-hover/btn:translate-x-1 transition-transform" />
               </button>
             )}
          </div>

          {/* Abstract Back Design */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-gold-500/5 blur-3xl rounded-full -translate-y-12 translate-x-12" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-gold-500/5 blur-2xl rounded-full translate-y-8 -translate-x-8" />
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
