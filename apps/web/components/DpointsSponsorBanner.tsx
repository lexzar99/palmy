"use client";

import { useEffect, useState } from "react";
import { Coins } from "lucide-react";
import { fetchSponsorCard, type SponsorCardData } from "@/lib/dpoints";

// Sponsor-banner som visas för UTLOGGADE besökare: "registrera & få X Dpoints".
// Göms automatiskt om inget aktivt kort finns. När kunden loggat in renderas
// den inte alls (anroparen visar bannern bara i utloggat läge).
export default function DpointsSponsorBanner({ onRegister }: { onRegister?: () => void }) {
  const [card, setCard] = useState<SponsorCardData | null>(null);

  useEffect(() => {
    // Anti-farming: visa inte signup-erbjudandet om enheten redan haft ett konto.
    try {
      if (localStorage.getItem("dp_hadAccount")) return;
    } catch {
      /* noop */
    }
    fetchSponsorCard()
      .then(setCard)
      .catch(() => {});
  }, []);

  if (!card) return null;

  return (
    <button
      type="button"
      onClick={onRegister}
      className="block w-full overflow-hidden rounded-2xl p-4 text-left transition active:scale-[0.99]"
      style={{
        backgroundColor: "var(--bg-secondary)",
        border: "1px solid var(--border-muted)",
        boxShadow: "var(--card-shadow)",
      }}
    >
      <div className="flex items-center gap-3.5">
        {card.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.imageUrl} alt="" className="h-12 w-12 rounded-xl object-cover shrink-0" />
        ) : (
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl shrink-0"
            style={{ backgroundColor: "var(--gold-soft)", color: "var(--gold-ink)" }}
          >
            <Coins className="h-6 w-6" strokeWidth={1.8} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>{card.title}</p>
          {card.description && (
            <p className="mt-0.5 text-[13px] leading-snug" style={{ color: "var(--text-secondary)" }}>{card.description}</p>
          )}
          {card.sponsorName && (
            <p className="mt-0.5 text-[11.5px]" style={{ color: "var(--text-secondary)", opacity: 0.7 }}>{card.sponsorName}</p>
          )}
        </div>
        {/* Poäng-belöningen är den enda starka guld-accenten */}
        <div
          className="shrink-0 rounded-full px-3 py-1.5 text-[14px] font-bold"
          style={{ backgroundColor: "var(--color-gold-500, #F0531C)", color: "#141416", fontVariantNumeric: "tabular-nums" }}
        >
          +{card.bonusPoints} p
        </div>
      </div>
      <div
        className="mt-3.5 flex items-center justify-center gap-1.5 h-11 rounded-xl text-[14px] font-semibold"
        style={{ backgroundColor: "var(--color-gold-500, #F0531C)", color: "#141416" }}
      >
        {card.ctaLabel || `Skapa konto & få ${card.bonusPoints} Dpoints`}
      </div>
    </button>
  );
}
