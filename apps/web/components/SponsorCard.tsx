"use client";

import { useRouter } from "next/navigation";
import { ExternalLink, ArrowRight, Crown, Tag, Flame, Sparkles } from "lucide-react";
import { optimizedImageUrl } from "@/lib/imageOptimization";
import { API_URL } from "@/lib/api";

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
  headline?: string;
  bodyText?: string;
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

const sponsorThemeGradients: Record<string, string> = {
  sunrise: "linear-gradient(135deg,#F47721 0%,#FFB156 48%,#FFE3BA 100%)",
  fresh: "linear-gradient(135deg,#0F8A4B 0%,#32C879 52%,#D9F7E7 100%)",
  sky: "linear-gradient(135deg,#1769D1 0%,#59B8FF 55%,#DDF2FF 100%)",
  berry: "linear-gradient(135deg,#7A1D68 0%,#E24A8D 54%,#FFE0EF 100%)",
  charcoal: "linear-gradient(135deg,#151518 0%,#3A3A40 55%,#8D8D96 100%)",
  gold: "linear-gradient(135deg,#8A5A00 0%,#D89B1D 48%,#FFE4A1 100%)",
};

function sponsorBackground(color?: string) {
  if (!color) return sponsorThemeGradients.sunrise;
  return sponsorThemeGradients[color] || color;
}

function sponsorImageUrl(path?: string | null) {
  if (!path) return "";
  if (path.startsWith("/")) return `${API_URL}${path}`;
  return path;
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
  const isTextCard = sponsor.cardType === "TEXT" || !sponsor.imageUrl;
  const headline = sponsor.headline || sponsor.name;
  const bodyText = sponsor.bodyText || sponsor.tagline;
  const imageUrl = sponsorImageUrl(sponsor.imageUrl);

  if (isTextCard) {
    return (
      <div
        onClick={handleClick}
        className={`swift-promo-card group active:scale-[0.99] ${isInteractive ? "cursor-pointer" : "cursor-default"}`}
        style={{ background: sponsorBackground(sponsor.color) }}
      >
        <span className="absolute inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(255,255,255,0.36),transparent_34%),linear-gradient(to_top,rgba(0,0,0,0.28),rgba(0,0,0,0.02))]" />
        <span className="absolute inset-0 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.08)_0_16px,rgba(255,255,255,0)_16px_32px)]" />
        <div className="absolute inset-0 flex flex-col justify-between p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex rounded-full bg-white/92 px-3 py-1 text-[10.5px] font-black uppercase tracking-wide text-[#141416] shadow-sm">
              {sponsor.category || "Aktuellt"}
            </span>
            {isInteractive && (
              <span className="grid h-9 w-9 place-items-center rounded-full bg-white text-[#141416] shadow-sm">
                {sponsor.linkType === "EXTERNAL" ? <ExternalLink size={14} /> : <ArrowRight size={16} />}
              </span>
            )}
          </div>
          <div className="max-w-[86%]">
            <h3 className="line-clamp-2 text-[25px] font-black leading-[0.98] tracking-tight text-white [text-shadow:0_2px_10px_rgba(0,0,0,0.26)]">
              {headline}
            </h3>
            {bodyText ? (
              <p className="mt-2 line-clamp-2 text-[13px] font-bold leading-snug text-white/92">
                {bodyText}
              </p>
            ) : null}
            {sponsor.infoText ? (
              <p className="mt-2 line-clamp-1 text-[11.5px] font-semibold text-white/78">
                {sponsor.infoText}
              </p>
            ) : null}
            {sponsor.ctaText ? (
              <span className="mt-3 inline-flex rounded-full bg-white px-3 py-1.5 text-[12px] font-black text-[#141416] shadow-sm">
                {sponsor.ctaText}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  // Dynamiskt showcase-kort (rabatt/trendar/ny): bild-hero med scrim och pill,
  // exakt samma look som Trendar/Ny i stan-korten. Samma mått/aspect som bild-
  // kortet så raden förblir enhetlig.
  if (sponsor.cardType === "SHOWCASE") {
    return (
      <div
        onClick={handleClick}
        className={`swift-promo-card group active:scale-[0.99] ${isInteractive ? "cursor-pointer" : "cursor-default"}`}
      >
        {/* Restaurangens hero-bild fyller hela kortet. */}
        <span
          role="img"
          aria-label={sponsor.name}
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url("${optimizedImageUrl(imageUrl, 1800, 90)}")` }}
        />

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
      </div>
    );
  }

  return (
    <div
      onClick={handleClick}
      // STANDARD-format för alla promo-kort: samma bredd
      // OCH samma bildförhållande (banner ~1.9:1). Bilden fyller HELA kortet
      // kant-till-kant via object-cover — eftersom kortets aspect matchar
      // bannerns blir det ingen tom letterbox (desktop) och ingen hård crop
      // (mobil). Bredden: ~full på mobil, fast på sm+; höjden följer aspect.
      className={`swift-promo-card group active:scale-[0.99] ${isInteractive ? "cursor-pointer" : "cursor-default"}`}
    >
      {/* Bilden fyller kortet (aspect matchar banner → ingen tom yta/crop). */}
      <span
        role="img"
        aria-label={sponsor.name}
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url("${optimizedImageUrl(imageUrl, 1800, 90)}")` }}
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
    </div>
  );
}
