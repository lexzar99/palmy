"use client";

import { useRouter } from "next/navigation";
import { Coins, ArrowRight } from "lucide-react";
import type { SponsorCardData } from "@/lib/dpoints";

// Dpoints-registreringskort i hemsidans sponsor-rail. Samma mått som
// SponsorCard så det ligger snyggt bland sponsorerna. Klick → registrering.
export default function DpointsHomeCard({ card }: { card: SponsorCardData }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push("/register")}
      className="relative shrink-0 overflow-hidden rounded-3xl text-left w-[86vw] max-w-[460px] h-[200px] sm:w-[460px] sm:h-[230px]"
    >
      {card.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={card.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-gold-400 via-gold-500 to-gold-600" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/85 via-zinc-950/35 to-transparent" />
      <div className="absolute inset-0 flex flex-col justify-end p-5 sm:p-6">
        <div className="mb-2 inline-flex items-center gap-1.5 self-start rounded-full bg-gold-500/90 px-2.5 py-1">
          <Coins size={12} className="text-zinc-950" />
          <span className="text-[9px] font-black uppercase tracking-widest text-zinc-950">Dpoints</span>
        </div>
        <h3 className="text-xl font-black uppercase italic leading-[1.1] tracking-tight text-white sm:text-2xl">{card.title}</h3>
        {!!card.description && <p className="mt-1 line-clamp-2 text-sm text-white/80">{card.description}</p>}
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm font-black text-zinc-950">
            +{card.bonusPoints} poäng
          </span>
          <span className="inline-flex items-center gap-1.5 text-sm font-bold text-white">
            {card.ctaLabel || "Skapa konto"} <ArrowRight size={16} />
          </span>
        </div>
      </div>
    </button>
  );
}
