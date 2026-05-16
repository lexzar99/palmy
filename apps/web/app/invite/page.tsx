"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import ReferralCard from "@/components/ReferralCard";

/**
 * Dedikerad invite-sida. Hämtar referral-config från backend så headern
 * + "Så funkar det"-texten anpassar sig efter den konfigurerade dealen
 * (procent / kr / fri leverans). ReferralCard hanterar kod-display +
 * share-funktionalitet.
 */

type ReferralConfig = {
  enabled: boolean;
  discountType?: string | null;
  rewardLabel?: string;
  couponsPerSide?: number;
};

export default function InvitePage() {
  const [config, setConfig] = useState<ReferralConfig | null>(null);

  useEffect(() => {
    let cancelled = false;
    axios
      .get<ReferralConfig>("/api/platform/account/referral")
      .then((r) => {
        if (!cancelled) setConfig(r.data);
      })
      .catch(() => {
        // Tyst — header faller tillbaka till generisk text
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // rewardLabel kommer grammatiskt komplett från backend ("20% rabatt" /
  // "Fri leverans" / "20% rabatt + Fri leverans"). Splice rakt av.
  const rewardLabel = config?.rewardLabel || "rabatt";
  const coupons = config?.couponsPerSide ?? 1;

  const headerLine2 = `Få ${rewardLabel} båda`;
  const subline = `Skicka din kod till en vän. När de gör sin första beställning får ni båda ${rewardLabel} att använda i kassan.`;
  const couponsWord = coupons > 1 ? `${coupons}st kuponger med ${rewardLabel}` : `en kupong med ${rewardLabel}`;
  const step3 = `När vännen gör sin första betalda beställning får ni båda ${couponsWord} i kassan.`;

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <div className="max-w-xl mx-auto px-6 pt-8 pb-24">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] mb-8 hover:opacity-80 transition-opacity"
          style={{ color: "var(--text-secondary)" }}
        >
          <ArrowLeft size={14} /> Tillbaka
        </Link>

        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 mb-3">
            <Sparkles size={14} className="text-gold-500" />
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gold-500">
              Värva en vän
            </p>
          </div>
          <h1
            className="text-3xl md:text-4xl font-black uppercase italic tracking-tight leading-tight mb-3"
            style={{ color: "var(--text-primary)" }}
          >
            Bjud in vänner.
            <br />
            <span className="text-gold-500">{headerLine2}.</span>
          </h1>
          <p
            className="text-[13px] font-bold leading-relaxed"
            style={{ color: "var(--text-secondary)" }}
          >
            {subline}
          </p>
        </div>

        <ReferralCard />

        <div
          className="mt-8 rounded-2xl p-5 text-[11px] font-bold leading-relaxed"
          style={{
            backgroundColor: "var(--bg-secondary)",
            border: "1px solid var(--border-muted)",
            color: "var(--text-secondary)",
          }}
        >
          <p className="font-black uppercase tracking-wider text-[10px] mb-2" style={{ color: "var(--text-primary)" }}>
            Så funkar det
          </p>
          <ol className="list-decimal pl-4 space-y-1.5">
            <li>Dela din kod med en vän via knappen ovan.</li>
            <li>Vännen registrerar sig på FoodGo med din kod.</li>
            <li>{step3}</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
