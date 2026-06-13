"use client";

import { useRouter } from "next/navigation";
import { Coins, ArrowRight } from "lucide-react";
import type { SponsorCardData } from "@/lib/dpoints";

// Dpoints-registreringskort i hemsidans sponsor-rail ("tyst & direkt"):
// ren yta med guld-tonad ram, sentence case, och poäng-belöningen som enda
// starka guld-accent. Ersätter det tidigare mörka font-black/versal-kortet.
export default function DpointsHomeCard({ card }: { card: SponsorCardData }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push("/register")}
      aria-label={card.title}
      className="group relative shrink-0 overflow-hidden rounded-2xl text-left flex flex-col justify-between p-5 w-[88vw] max-w-[460px] sm:w-[460px] h-[184px] sm:h-[200px]"
      style={{
        backgroundColor: "var(--bg-secondary)",
        border: "1px solid color-mix(in srgb, var(--gold-ink) 28%, transparent)",
      }}
    >
      {/* Samma STANDARD-höjd som sponsorkorten (enhetlig rail) */}
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: "var(--gold-ink)" }}>
          <Coins size={14} strokeWidth={2} /> Dpoints
        </span>
        <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" style={{ color: "var(--text-secondary)" }} />
      </div>

      <div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[34px] sm:text-[38px] font-bold leading-none tracking-tight" style={{ color: "var(--gold-ink)", fontVariantNumeric: "tabular-nums" }}>
            +{card.bonusPoints}
          </span>
          <span className="text-[15px] font-semibold" style={{ color: "var(--gold-ink)" }}>poäng</span>
        </div>
        <p className="text-[12.5px] leading-snug mt-1 truncate" style={{ color: "var(--text-secondary)" }}>{card.title}</p>
      </div>

      <span
        className="inline-flex w-fit items-center gap-1.5 rounded-xl h-10 px-4 text-[13.5px] font-semibold transition-transform group-hover:scale-[1.02]"
        style={{ backgroundColor: "var(--color-gold-500, #E7B24B)", color: "#141416" }}
      >
        {card.ctaLabel || "Skapa konto"}
        <ArrowRight size={14} strokeWidth={2.5} />
      </span>
    </button>
  );
}


