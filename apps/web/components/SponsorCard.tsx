"use client";

import { useRouter } from "next/navigation";
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
  linkType?: 'EXTERNAL' | 'DEAL' | 'RESTAURANT' | 'NONE';
  linkTarget?: string;
  showName?: boolean;
}

export default function SponsorCard({ sponsor }: { sponsor: SponsorData }) {
  const [flipped, setFlipped] = useState(false);
  const router = useRouter();

  const handleFlip = () => {
    setFlipped(!flipped);
  };

  const handleCTAClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!sponsor.isClickable || sponsor.linkType === 'NONE') return;

    let target = sponsor.linkTarget || sponsor.ctaLink;
    if (!target) return;
    
    // Clean target if it has a leading slash for internal types
    const cleanTarget = target.startsWith('/') ? target.slice(1) : target;

    if (sponsor.linkType === 'DEAL') {
      router.push(`/search?deal=${cleanTarget}`);
    } else if (sponsor.linkType === 'RESTAURANT') {
      router.push(`/restaurants/${cleanTarget}`);
    } else {
      window.open(target, '_blank', 'noopener,noreferrer');
    }
  };

  const showName = sponsor.showName !== false;

  return (
    <div 
      className="relative shrink-0 perspective-1000 group"
      style={{ width: 300, height: 210 }}
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
        <div className="absolute inset-0 w-full h-full backface-hidden rounded-[2.5rem] overflow-hidden border shadow-2xl" style={{ borderColor: "rgba(255,248,234,0.08)", backgroundColor: "#171513" }}>
          <img 
            src={sponsor.imageUrl} 
            alt={sponsor.name} 
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" 
          />
          {showName && (
            <div className="absolute inset-0 flex flex-col justify-end p-6" style={{ background: "linear-gradient(to top, rgba(23,21,19,0.95), rgba(23,21,19,0.08), transparent)" }}>
              <div className="flex items-center justify-between">
                <div className="px-3 py-1 backdrop-blur-md rounded-full border" style={{ backgroundColor: "rgba(234,181,69,0.18)", borderColor: "rgba(234,181,69,0.22)" }}>
                  <span className="text-[8px] font-black uppercase tracking-[0.2em] text-gold-400">Partner Spotlight</span>
                </div>
                <motion.div 
                  animate={{ x: [0, 4, 0] }} 
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="text-white/40 group-hover:text-white/80 transition-colors"
                >
                  <div className="p-2 rounded-full backdrop-blur-sm" style={{ backgroundColor: "rgba(255,248,234,0.08)" }}>
                    <ChevronRight size={12} />
                  </div>
                </motion.div>
              </div>
              <h3 className="text-lg font-black mt-2 uppercase tracking-tight leading-none italic" style={{ color: "#FFF8EA" }}>{sponsor.name}</h3>
            </div>
          )}
        </div>

        {/* Back Side */}
        <div 
          className="absolute inset-0 w-full h-full backface-hidden rounded-[2.5rem] border p-6 flex flex-col justify-between shadow-2xl shadow-gold-500/20"
          style={{ borderColor: "rgba(234,181,69,0.4)", backgroundColor: "#211C19", transform: "rotateY(180deg)" }}
        >
          <div className="relative z-10 min-w-0">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-[1rem] bg-gold-500/10 border border-gold-500/20 flex items-center justify-center text-gold-500 shrink-0">
                <SponsorIcon />
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-black text-white uppercase italic tracking-wider leading-none truncate">{sponsor.name}</h4>
                <p className="text-[8px] font-black uppercase tracking-[0.2em] text-zinc-600 mt-1">Partner</p>
              </div>
            </div>
            
            {sponsor.infoText && (
              <p className="text-[10px] font-bold text-zinc-300 leading-relaxed italic line-clamp-2">
                {sponsor.infoText}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-white/5 relative z-10">
             <div className="flex flex-col">
               <span className="text-[7px] font-black uppercase tracking-[0.3em] text-zinc-700">Information</span>
               <span className="text-[9px] font-black text-white uppercase">MATGO DEALS</span>
             </div>
             
             {sponsor.isClickable && sponsor.ctaText && sponsor.linkType !== 'NONE' && (
               <button 
                 onClick={handleCTAClick}
                 className="group/btn flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gold-500 text-zinc-950 text-[9px] font-black uppercase tracking-widest hover:bg-white hover:scale-105 transition-all shadow-xl shadow-gold-500/20"
               >
                 {sponsor.ctaText} 
                 <ArrowRight size={10} className="group-hover/btn:translate-x-1 transition-transform" />
               </button>
             )}
          </div>

          {/* Abstract Back Design */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-gold-500/5 blur-3xl rounded-full -translate-y-12 translate-x-12 pointer-events-none" />
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
