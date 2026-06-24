"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { ArrowLeft, Share2, Check } from "lucide-react";

// Bjud in-sida — monokrom med touch av guld. Brand-loggan (ingen ikon-ruta),
// belöning, och EN dela-knapp. Ingen synlig länk; länken bärs i share-payloaden.
// Attribution kopplas via det nya tracking-systemet (token i delningslänken).
export default function InvitePage() {
  const [shared, setShared] = useState(false);
  const [inviteUrl, setInviteUrl] = useState("");
  const REWARD_POINTS = 200;

  // Hämta den attribuerade delningslänken (/i/<token>) för inloggad användare.
  // Faller tillbaka till app-länken om utloggad / om hämtning misslyckas.
  useEffect(() => {
    if (typeof window !== "undefined") setInviteUrl(window.location.origin);
    axios
      .get("/api/platform/account/invite/link")
      .then((r) => { if (r.data?.url) setInviteUrl(r.data.url); })
      .catch(() => {});
  }, []);

  const buildShare = () => {
    const url = inviteUrl || (typeof window !== "undefined" ? window.location.origin : "");
    const message = `Häng med mig på Delívera, mat hemkört. ${url}`;
    return { url, message };
  };

  const handleShare = async () => {
    const { url, message } = buildShare();
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share({ title: "Delívera", text: message, url });
        setShared(true);
        setTimeout(() => setShared(false), 2000);
        return;
      } catch (e: any) {
        if (e?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(message);
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="min-h-screen pt-[calc(env(safe-area-inset-top,0px)+1.5rem)] md:pt-16 pb-32 px-5" style={{ backgroundColor: "var(--bg-primary)" }}>
      <div className="mx-auto max-w-md space-y-8">
        <Link
          href="/profile"
          aria-label="Tillbaka"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors"
          style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)", color: "var(--text-secondary)" }}
        >
          <ArrowLeft size={16} />
        </Link>

        {/* Brand-logga — ingen ikon-ruta, bara loggan */}
        <div className="flex justify-center pt-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/delivera-lockup.png" alt="Delívera" style={{ height: 40, width: "auto" }} />
        </div>

        <div className="space-y-2 text-center">
          <h1 className="text-[24px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>Bjud in vänner</h1>
          <p className="text-[14px] leading-snug" style={{ color: "var(--text-secondary)" }}>
            Dela Delívera med en vän. Ni får båda Dpoints när hen gör sin första beställning.
          </p>
        </div>

        {/* Belöning — den enda starka guld-accenten */}
        <div className="flex flex-col items-center gap-1.5 rounded-2xl py-6" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
          <span className="rounded-full px-4 py-1.5 text-[15px] font-bold" style={{ backgroundColor: "var(--color-gold-500, #E7B24B)", color: "#141416", fontVariantNumeric: "tabular-nums" }}>
            +{REWARD_POINTS} Dpoints
          </span>
          <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>till er båda</span>
        </div>

        {/* Dela — monokrom knapp med guld-touch (ikonen) */}
        <button
          type="button"
          onClick={handleShare}
          className="flex h-[54px] w-full items-center justify-center gap-2.5 rounded-2xl text-[15px] font-semibold transition-all active:scale-[0.99]"
          style={{ backgroundColor: "var(--text-primary)", color: "var(--bg-primary)" }}
        >
          {shared ? <Check size={18} /> : <Share2 size={18} style={{ color: "var(--color-gold-500, #E7B24B)" }} />}
          {shared ? "Delat" : "Dela"}
        </button>
      </div>
    </div>
  );
}
