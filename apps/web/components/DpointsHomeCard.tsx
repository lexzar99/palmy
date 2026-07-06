"use client";

import { useRouter } from "next/navigation";
import { Coins, ArrowRight } from "lucide-react";
import type { SponsorCardData } from "@/lib/dpoints";

// Vpoints-registreringskort i hemsidans sponsor-rail ("tyst & direkt"):
// ren yta med guld-tonad ram, sentence case, och poäng-belöningen som enda
// starka guld-accent. Ersätter det tidigare mörka font-black/versal-kortet.
export default function DpointsHomeCard({ card }: { card: SponsorCardData }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push("/register")}
      aria-label={card.title}
      className="group relative shrink-0 overflow-hidden rounded-2xl text-left flex flex-col justify-between p-4 w-[88vw] max-w-[460px] sm:w-[460px]"
      style={{
        aspectRatio: "1.9 / 1",
        backgroundColor: "var(--bg-secondary)",
        border: "1px solid color-mix(in srgb, var(--gold-ink) 28%, transparent)",
      }}
    >
      {/* Beskrivningstexten är huvudsaken och får ta plats (flex-1 + line-clamp
          så den fyller höjden men aldrig svämmar över). Den redundanta titeln
          ("110 För Nya") är borttagen — poäng-chippen säger redan +X p. */}
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: "var(--gold-ink)" }}>
          <Coins size={14} strokeWidth={2} /> Vpoints
        </span>
        <span
          className="shrink-0 rounded-full px-2.5 py-1 text-[13px] font-bold leading-none"
          style={{ backgroundColor: "var(--color-gold-500, #F0531C)", color: "#141416", fontVariantNumeric: "tabular-nums" }}
        >
          +{card.bonusPoints} p
        </span>
      </div>

      <p
        className="flex-1 min-h-0 mt-1.5 text-[13.5px] font-semibold leading-snug overflow-hidden line-clamp-2"
        style={{ color: "var(--text-primary)", display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2 }}
      >
        {card.description || card.title}
      </p>

      <span
        className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-xl h-10 px-4 text-[13.5px] font-semibold transition-transform group-hover:scale-[1.02]"
        style={{ backgroundColor: "var(--color-gold-500, #F0531C)", color: "#141416" }}
      >
        {card.ctaLabel || "Skapa konto"}
        <ArrowRight size={14} strokeWidth={2.5} />
      </span>
    </button>
  );
}


