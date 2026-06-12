"use client";

import SmartImage from "@/components/SmartImage";

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
      whileHover={isInteractive ? { y: -3 } : undefined}
      whileTap={isInteractive ? { scale: 0.98 } : undefined}
      transition={{ type: "spring", stiffness: 320, damping: 22 }}
      onClick={handleClick}
      // Stora banner-kort (matchar referensbilden) — nästan full bredd på
      // mobil med en liten peek av nästa kort, fast bredd på sm+.
      className={`relative shrink-0 rounded-3xl overflow-hidden group w-[86vw] max-w-[460px] h-[200px] sm:w-[460px] sm:h-[230px] ${
        isInteractive ? "cursor-pointer" : "cursor-default"
      }`}
      style={{
        backgroundColor: "#171513",
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 20px -8px rgba(0,0,0,0.4), 0 3px 8px -3px rgba(234,181,69,0.15)",
      }}
    >
      {/* Tunn gradient-ram med gold-tint upptill */}
      <div
        className="pointer-events-none absolute inset-0 rounded-3xl"
        style={{
          padding: 1,
          background:
            "linear-gradient(160deg, rgba(234,181,69,0.55), rgba(255,248,234,0.06) 40%, rgba(255,248,234,0.02))",
          WebkitMask:
            "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
        }}
      />

      <SmartImage
        src={sponsor.imageUrl}
        alt={sponsor.name}
        sizes="(max-width: 768px) 86vw, 460px"
        className="w-full h-full object-cover"
      />

      {/* Bottom gradient + content */}
      {showName && (
        <div
          className="absolute inset-0 flex flex-col justify-end p-5 sm:p-6"
          style={{
            background:
              "linear-gradient(to top, rgba(15,15,15,0.92) 0%, rgba(15,15,15,0.55) 38%, rgba(15,15,15,0) 70%)",
          }}
        >
          <div className="flex items-end justify-between gap-2">
            <div className="min-w-0">
              <div
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border mb-1.5 backdrop-blur-sm"
                style={{
                  backgroundColor: "rgba(234,181,69,0.20)",
                  borderColor: "rgba(234,181,69,0.32)",
                }}
              >
                <span className="w-1 h-1 rounded-full bg-gold-400 animate-pulse" />
                <span className="text-[7px] font-black uppercase tracking-[0.22em] text-gold-300">
                  Partner
                </span>
              </div>
              <h3
                className="text-xl sm:text-2xl font-black uppercase tracking-tight leading-[1.1] italic truncate"
                style={{
                  color: "white",
                  textShadow: "0 2px 8px rgba(0,0,0,0.45)",
                }}
              >
                {sponsor.name}
              </h3>
            </div>
            {isInteractive && (
              <div
                className="w-9 h-9 rounded-full bg-gold-500 text-zinc-950 flex items-center justify-center shrink-0 transition-all duration-300 group-hover:scale-110 group-hover:rotate-[-8deg]"
                style={{ boxShadow: "0 6px 14px -4px rgba(234,181,69,0.55)" }}
              >
                {sponsor.linkType === "EXTERNAL" ? (
                  <ExternalLink size={13} />
                ) : (
                  <ArrowRight size={15} />
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}
