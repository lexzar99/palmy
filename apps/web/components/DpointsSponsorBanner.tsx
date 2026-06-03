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
      className="block w-full overflow-hidden rounded-3xl bg-gradient-to-br from-gold-500 to-gold-600 p-5 text-left text-zinc-950 shadow-lg transition hover:brightness-105"
    >
      <div className="flex items-center gap-4">
        {card.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.imageUrl} alt="" className="h-14 w-14 rounded-2xl object-cover" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-950/10">
            <Coins className="h-7 w-7" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-base font-black leading-tight">{card.title}</p>
          {card.description && <p className="mt-0.5 text-sm font-medium opacity-80">{card.description}</p>}
          {card.sponsorName && <p className="mt-0.5 text-xs opacity-70">{card.sponsorName}</p>}
        </div>
        <div className="shrink-0 rounded-full bg-zinc-950 px-4 py-2 text-sm font-bold text-gold-400">
          +{card.bonusPoints} p
        </div>
      </div>
      <p className="mt-3 text-center text-sm font-bold">
        {card.ctaLabel || `Skapa konto & få ${card.bonusPoints} Dpoints`}
      </p>
    </button>
  );
}
