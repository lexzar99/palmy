"use client";

import { useRouter } from "next/navigation";
import { ExternalLink, ChevronRight, ArrowRight, Crown } from "lucide-react";
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
  imageOnly?: boolean;
  // Dynamiska rabatt-kort (cardType === "DISCOUNT") ritas som tema-gradient
  // istället för bild-banner. Fälten kommer från GET /api/sponsors.
  cardType?: string;
  tagline?: string;
  category?: string;
  theme?: string;
  color?: string;
  featuredClass?: number;
  percent?: number | null;
  restaurantSlug?: string;
}

// Spegel av pulseGradient i HomeClient.tsx — samma tema→gradient så rabatt-
// korten matchar puls-modulernas ton (ember/forest/midnight/gold, sky=default).
function themeGradient(theme?: string | null) {
  switch (theme) {
    case "ember":
      return "linear-gradient(135deg, #F0601F 0%, #B8291A 100%)";
    case "forest":
      return "linear-gradient(135deg, #21945C 0%, #0D5C3D 100%)";
    case "midnight":
      return "linear-gradient(135deg, #292E4D 0%, #0D1024 100%)";
    case "gold":
      return "linear-gradient(135deg, #DEA128 0%, #9E660D 100%)";
    default:
      return "linear-gradient(135deg, var(--deal-blue) 0%, var(--deal-blue-deep) 100%)";
  }
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

  const showName = !sponsor.imageOnly && sponsor.showName !== false;

  const isFeatured = sponsor.featuredClass === 1 || sponsor.featuredClass === 2;
  const featuredGold = sponsor.featuredClass === 1;

  // Dynamiskt rabatt-kort: platt tema-gradient med vit text istället för bild.
  // Behåller EXAKT samma mått/aspect som bild-kortet så raden förblir enhetlig.
  if (sponsor.cardType === "DISCOUNT") {
    return (
      <motion.div
        whileTap={isInteractive ? { scale: 0.99 } : undefined}
        transition={{ type: "spring", stiffness: 320, damping: 22 }}
        onClick={handleClick}
        className={`relative shrink-0 rounded-2xl overflow-hidden group w-[88vw] max-w-[460px] sm:w-[460px] ${
          isInteractive ? "cursor-pointer" : "cursor-default"
        }`}
        style={{
          aspectRatio: "1.9 / 1",
          background: themeGradient(sponsor.theme || sponsor.color),
          border: "1px solid var(--border-muted)",
        }}
      >
        {/* Utvald-badge (guld/silver) i övre hörnet — matchar FeaturedBadge. */}
        {isFeatured && (
          <span
            className="absolute right-4 top-4 z-10 inline-flex items-center gap-1 text-[12px] font-semibold px-2 py-0.5 rounded-md text-white"
            style={{ backgroundColor: featuredGold ? "#B7800D" : "#868A94" }}
          >
            <Crown size={11} strokeWidth={2.6} />
            Utvald
          </span>
        )}

        <div className="absolute inset-0 flex flex-col p-4 sm:p-5">
          {typeof sponsor.percent === "number" && sponsor.percent > 0 && (
            <span className="self-start inline-flex items-center rounded-full bg-white/90 px-2.5 py-1 text-[13px] font-black text-[var(--ink)]">
              -{sponsor.percent}%
            </span>
          )}
          <div className="mt-auto min-w-0 pr-11">
            <h3 className="text-[22px] sm:text-[24px] font-black leading-tight tracking-tight text-white line-clamp-2">
              {sponsor.name}
            </h3>
            {!!sponsor.tagline && (
              <p className="mt-1 text-[13px] font-semibold leading-snug text-white/85 truncate">
                {sponsor.tagline}
              </p>
            )}
            {!!sponsor.category && (
              <p className="mt-2 text-[11px] font-bold text-white/70">{sponsor.category}</p>
            )}
          </div>
        </div>

        {isInteractive && (
          <div
            className="absolute bottom-4 right-4 w-9 h-9 rounded-full bg-white flex items-center justify-center shrink-0"
            style={{ color: "#141416" }}
          >
            <ArrowRight size={16} />
          </div>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      whileTap={isInteractive ? { scale: 0.99 } : undefined}
      transition={{ type: "spring", stiffness: 320, damping: 22 }}
      onClick={handleClick}
      // STANDARD-format för alla promo-kort: samma bredd
      // OCH samma bildförhållande (banner ~1.9:1). Bilden fyller HELA kortet
      // kant-till-kant via object-cover — eftersom kortets aspect matchar
      // bannerns blir det ingen tom letterbox (desktop) och ingen hård crop
      // (mobil). Bredden: ~full på mobil, fast på sm+; höjden följer aspect.
      className={`relative shrink-0 rounded-2xl overflow-hidden group w-[88vw] max-w-[460px] sm:w-[460px] ${
        isInteractive ? "cursor-pointer" : "cursor-default"
      }`}
      style={{
        aspectRatio: "1.9 / 1",
        backgroundColor: "var(--bg-deep)",
        border: "1px solid var(--border-muted)",
      }}
    >
      {/* Bilden fyller kortet (aspect matchar banner → ingen tom yta/crop). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={sponsor.imageUrl}
        alt={sponsor.name}
        loading="lazy"
        decoding="async"
        className="absolute inset-0 w-full h-full object-cover"
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
              style={{ backgroundColor: "rgba(20,20,22,0.55)", border: "1px solid rgba(240,83,28,0.5)" }}
            >
              <span className="text-[10.5px] font-semibold tracking-wide" style={{ color: "#FFFFFF" }}>Partner</span>
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
