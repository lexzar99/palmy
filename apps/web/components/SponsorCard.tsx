"use client";

import { useRouter } from "next/navigation";
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

/**
 * SponsorCard – Ren annons/partnerkort i "Aktuellt"-sektionen.
 *
 * Viktigt: Kortet flippar INTE längre. Om sponsorn är markerad som interaktiv i admin
 * (isClickable = true) tar hela kortet användaren direkt till det som är konfigurerat
 * (extern länk, restaurang eller deal). Om den inte är interaktiv visas kortet som
 * en statisk banner utan klickbeteende.
 */
export default function SponsorCard({ sponsor }: { sponsor: SponsorData }) {
  const router = useRouter();

  const target = sponsor.linkTarget || sponsor.ctaLink;
  const isInteractive = sponsor.isClickable && sponsor.linkType !== 'NONE' && !!target;

  const handleClick = () => {
    if (!isInteractive || !target) return;
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
    <motion.div
      whileTap={isInteractive ? { scale: 0.98 } : undefined}
      onClick={handleClick}
      className={`relative shrink-0 rounded-[1.8rem] overflow-hidden border shadow-xl group ${isInteractive ? 'cursor-pointer' : 'cursor-default'}`}
      style={{ width: 260, height: 150, borderColor: "rgba(255,248,234,0.08)", backgroundColor: "#171513" }}
    >
      <img
        src={sponsor.imageUrl}
        alt={sponsor.name}
        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
      />
      {showName && (
        <div className="absolute inset-0 flex flex-col justify-end p-4" style={{ background: "linear-gradient(to top, rgba(28,28,30,0.8), rgba(28,28,30,0.1), transparent)" }}>
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0">
              <div className="inline-block px-2 py-0.5 rounded-full border mb-1.5" style={{ backgroundColor: "rgba(234,181,69,0.18)", borderColor: "rgba(234,181,69,0.22)" }}>
                <span className="text-[7px] font-black uppercase tracking-[0.2em] text-gold-400">Partner</span>
              </div>
              <h3 className="text-sm font-black uppercase tracking-tight leading-none italic truncate" style={{ color: "white" }}>{sponsor.name}</h3>
            </div>
            {isInteractive && (
              <div className="w-8 h-8 rounded-full bg-gold-500 text-zinc-950 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                {sponsor.linkType === 'EXTERNAL' ? <ExternalLink size={12} /> : <ArrowRight size={14} />}
              </div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}
