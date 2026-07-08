"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, ArrowRight, Crown, Tag, Flame, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import SmartImage from "@/components/SmartImage";

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
  // Dynamiska showcase-kort (cardType === "SHOWCASE") ritas som bild-hero med
  // scrim och pill, precis som Trendar/Ny i stan. Fälten kommer från GET /api/sponsors.
  cardType?: string;
  showcaseKind?: string;
  badge?: string;
  tagline?: string;
  category?: string;
  theme?: string;
  color?: string;
  featuredClass?: number;
  percent?: number | null;
  restaurantSlug?: string;
}

type SponsorCardProps = {
  sponsor: SponsorData;
  imagePriority?: boolean;
  imageLoading?: "eager" | "lazy";
  imageFetchPriority?: "high" | "low" | "auto";
  imageSizes?: string;
};

function useDesktopPromoImage() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px)");
    const update = () => setEnabled(query.matches);

    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return enabled;
}

function sponsorGradient(sponsor: SponsorData) {
  if (sponsor.color) {
    return `linear-gradient(135deg, ${sponsor.color} 0%, #141416 100%)`;
  }
  if (sponsor.showcaseKind === "discount") {
    return "linear-gradient(135deg, #F04F1A 0%, #8F2D15 100%)";
  }
  if (sponsor.showcaseKind === "trending") {
    return "linear-gradient(135deg, #15151A 0%, #F04F1A 100%)";
  }
  return "linear-gradient(135deg, #141416 0%, #415A77 100%)";
}

/**
 * SponsorCard – Ren annons/partnerkort i "Aktuellt"-sektionen.
 *
 * Viktigt: Kortet flippar INTE längre. Om sponsorn är markerad som interaktiv i admin
 * (isClickable = true) tar hela kortet användaren direkt till det som är konfigurerat
 * (extern länk, restaurang eller deal). Om den inte är interaktiv visas kortet som
 * en statisk banner utan klickbeteende.
 */
export default function SponsorCard({
  sponsor,
  imagePriority = false,
  imageLoading = "lazy",
  imageFetchPriority = "auto",
  imageSizes = "(max-width: 640px) 88vw, 460px",
}: SponsorCardProps) {
  const router = useRouter();
  const showDesktopImage = useDesktopPromoImage();

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

  // Dynamiskt showcase-kort (rabatt/trendar/ny): bild-hero med scrim och pill,
  // exakt samma look som Trendar/Ny i stan-korten. Samma mått/aspect som bild-
  // kortet så raden förblir enhetlig.
  if (sponsor.cardType === "SHOWCASE") {
    return (
      <motion.div
        whileTap={isInteractive ? { scale: 0.99 } : undefined}
        transition={{ type: "spring", stiffness: 320, damping: 22 }}
        onClick={handleClick}
        className={`swift-promo-card group ${isInteractive ? "cursor-pointer" : "cursor-default"}`}
      >
        <span className="absolute inset-0" style={{ background: sponsorGradient(sponsor) }} />
        <span className="absolute -right-10 -top-12 h-36 w-36 rounded-full bg-white/20 blur-2xl" />

        {/* Restaurangens hero-bild fyller kortet på desktop. Mobil får en lätt metadata-card utan bildrequest. */}
        {sponsor.imageUrl && showDesktopImage ? (
          <SmartImage
            src={sponsor.imageUrl}
            alt={sponsor.name}
            sizes={imageSizes}
            priority={imagePriority}
            loading={imageLoading}
            fetchPriority={imageFetchPriority}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : null}

        {/* Mörk botten-scrim för läsbarhet, som champion-kortet. */}
        <span className="absolute inset-0 bg-gradient-to-b from-black/0 via-black/10 to-black/75" />

        {/* Utvald-pill (guld/silver) uppe till höger — enda flytande pillen. */}
        {isFeatured && (
          <span
            className="absolute right-4 top-4 z-10 inline-flex items-center gap-1 text-[12px] font-semibold px-2 py-0.5 rounded-md text-white"
            style={{ backgroundColor: featuredGold ? "#B7800D" : "#868A94" }}
          >
            <Crown size={11} strokeWidth={2.6} />
            Utvald
          </span>
        )}

        {/* Ett textkluster nere till vänster: orange badge, namn, undertext. */}
        <div className="absolute inset-x-0 bottom-0 p-4">
          {!!sponsor.badge && (
            <span className="mb-1.5 inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[10px] font-black uppercase text-white" style={{ backgroundColor: "var(--orange)" }}>
              {sponsor.showcaseKind === "discount" ? (
                <Tag size={11} fill="currentColor" />
              ) : sponsor.showcaseKind === "trending" ? (
                <Flame size={11} fill="currentColor" />
              ) : (
                <Sparkles size={11} fill="currentColor" />
              )}
              {sponsor.badge}
            </span>
          )}
          <span className="block truncate text-[24px] font-black leading-tight text-white">
            {sponsor.name}
          </span>
          {(!!sponsor.tagline || !!sponsor.category) && (
            <span className="mt-1 flex items-center gap-2 text-[12px] font-bold text-white/90">
              {!!sponsor.tagline && <span className="truncate">{sponsor.tagline}</span>}
              {!!sponsor.category && <span className="shrink-0 text-white/70">{sponsor.category}</span>}
            </span>
          )}
        </div>
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
      className={`swift-promo-card group ${isInteractive ? "cursor-pointer" : "cursor-default"}`}
    >
      <span className="absolute inset-0" style={{ background: sponsorGradient(sponsor) }} />
      <span className="absolute -right-10 -top-12 h-36 w-36 rounded-full bg-white/20 blur-2xl" />

      {/* Bilden fyller kortet på desktop. Mobil får en metadata-card utan bildrequest. */}
      {sponsor.imageUrl && showDesktopImage ? (
        <SmartImage
          src={sponsor.imageUrl}
          alt={sponsor.name}
          sizes={imageSizes}
          priority={imagePriority}
          loading={imageLoading}
          fetchPriority={imageFetchPriority}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : null}

      <span className="absolute inset-0 bg-gradient-to-b from-black/0 via-black/10 to-black/70" />

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
      {!showName && (
        <div className="absolute inset-x-0 bottom-0 p-4 md:hidden">
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md mb-1.5" style={{ backgroundColor: "rgba(20,20,22,0.55)", border: "1px solid rgba(255,255,255,0.24)" }}>
            <span className="text-[10.5px] font-semibold tracking-wide text-white">Partner</span>
          </div>
          <h3 className="truncate text-[20px] font-black leading-tight text-white">
            {sponsor.name}
          </h3>
          {(!!sponsor.tagline || !!sponsor.category || isInteractive) && (
            <div className="mt-1 flex items-center gap-2 text-[12px] font-bold text-white/90">
              {!!sponsor.tagline && <span className="truncate">{sponsor.tagline}</span>}
              {!!sponsor.category && <span className="shrink-0 text-white/75">{sponsor.category}</span>}
              {isInteractive && (
                <span className="ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[var(--ink)]">
                  {sponsor.linkType === "EXTERNAL" ? <ExternalLink size={13} /> : <ArrowRight size={15} />}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
