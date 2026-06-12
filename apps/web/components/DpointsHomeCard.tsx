"use client";

import SmartImage from "@/components/SmartImage";

import { useRouter } from "next/navigation";
import { Coins, ArrowRight } from "lucide-react";
import type { SponsorCardData } from "@/lib/dpoints";

// Dpoints-registreringskort i hemsidans sponsor-rail. Ren, premium, enkel design.
// Samma mått som SponsorCard så det ligger snyggt bland sponsorerna.
export default function DpointsHomeCard({ card }: { card: SponsorCardData }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push("/register")}
      aria-label={card.title}
      className="group relative shrink-0 overflow-hidden rounded-3xl text-left w-[86vw] max-w-[460px] h-[200px] sm:w-[460px] sm:h-[230px]"
    >
      {/* Bakgrund: bild om satt, annars djup charcoal */}
      {card.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <SmartImage src={card.imageUrl} alt="" sizes="460px" className="absolute inset-0 h-full w-full object-cover" />
      ) : null}
      <div className="absolute inset-0" style={{ backgroundColor: card.imageUrl ? "rgba(9,9,11,0.72)" : "#0b0b0d" }} />
      {/* Mjuk guld-glöd uppe till höger för djup */}
      <div className="pointer-events-none absolute -right-12 -top-16 h-52 w-52 rounded-full bg-gold-500/20 blur-3xl" />

      <div className="relative flex h-full flex-col justify-between p-6">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.28em] text-gold-400">
            <Coins size={12} strokeWidth={2.5} /> Dpoints
          </span>
          <ArrowRight size={18} className="text-zinc-500 transition-colors group-hover:text-gold-400" />
        </div>

        <div>
          {card.sponsorName ? (
            <p className="text-[11px] font-semibold uppercase tracking-widest text-white/40">{card.sponsorName}</p>
          ) : null}
          <p className="text-sm font-medium text-white/70">{card.title}</p>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-[44px] font-black leading-none tracking-tight text-white sm:text-5xl">+{card.bonusPoints}</span>
            <span className="text-lg font-bold text-gold-400">poäng</span>
          </div>
        </div>

        <span className="inline-flex w-fit items-center gap-2 rounded-full bg-gold-500 px-4 py-2 text-sm font-black text-zinc-950 transition-transform group-hover:scale-[1.03]">
          {card.ctaLabel || "Skapa konto"}
          <ArrowRight size={15} strokeWidth={2.8} />
        </span>
      </div>
    </button>
  );
}
