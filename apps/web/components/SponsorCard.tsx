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
      // Tar kunden till dedikerad deal-sida som listar alla restauranger
      // som har erbjudandet, plus deal-info i toppen.
      router.push(`/deals/${cleanTarget}`);
    } else if (sponsor.linkType === 'RESTAURANT') {
      router.push(`/restaurants/${cleanTarget}`);
    } else {
      window.open(target, '_blank', 'noopener,noreferrer');
    }
  };

  const showName = sponsor.showName !== false;

  return (
    <motion.div
      whileTap={isInteractive ? { scale: 0.99 } : undefined}
      transition={{ type: "spring", stiffness: 320, damping: 22 }}
      onClick={handleClick}
      // STANDARD-storlek för alla promo-kort (sponsor + dpoints) — samma
      // bredd OCH höjd så railen är enhetlig. Bilden visas HEL via object-
      // contain (ingen crop → in-bakad text klipps aldrig); letterboxen fylls
      // av en suddig cover-kopia av samma bild så kanterna ser polerade ut.
      className={`relative shrink-0 rounded-2xl overflow-hidden group w-[88vw] max-w-[460px] sm:w-[460px] h-[184px] sm:h-[200px] ${
        isInteractive ? "cursor-pointer" : "cursor-default"
      }`}
      style={{
        backgroundColor: "var(--bg-deep)",
        border: "1px solid var(--border-muted)",
      }}
    >
      {/* Suddig cover-bakgrund som fyller letterboxen */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={sponsor.imageUrl}
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-50"
      />
      {/* Skarp, HEL bild (ingen crop) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={sponsor.imageUrl}
        alt={sponsor.name}
        loading="lazy"
        decoding="async"
        className="absolute inset-0 w-full h-full object-contain"
      />

      {/* Namn-overlay (valfri, admin-styrd). Visas bara om sponsorn INTE redan
          har in-bakad text → annars dubblerar den. Diskret guld-partner-chip
          + namn nederst, ingen versal/italic. */}
      {showName && (
        <div
          className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-4 sm:p-5"
          style={{
            background:
              "linear-gradient(to top, rgba(15,15,15,0.88) 0%, rgba(15,15,15,0.45) 42%, rgba(15,15,15,0) 72%)",
          }}
        >
          <div className="min-w-0">
            <div
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md mb-1.5"
              style={{ backgroundColor: "rgba(234,181,69,0.22)" }}
            >
              <span className="text-[10px] font-semibold tracking-wide text-gold-300">Partner</span>
            </div>
            <h3
              className="text-[18px] sm:text-[20px] font-bold tracking-tight leading-tight truncate"
              style={{ color: "white", textShadow: "0 2px 8px rgba(0,0,0,0.4)" }}
            >
              {sponsor.name}
            </h3>
          </div>
          {isInteractive && (
            <div className="w-9 h-9 rounded-full bg-gold-500 flex items-center justify-center shrink-0" style={{ color: "#141416" }}>
              {sponsor.linkType === "EXTERNAL" ? <ExternalLink size={14} /> : <ArrowRight size={16} />}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

