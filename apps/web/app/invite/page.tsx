"use client";

import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import ReferralCard from "@/components/ReferralCard";

/**
 * Dedikerad invite-sida. ReferralCard finns redan på /profile, men det är
 * gömt långt ner. Den här sidan är en direkt-länk så "Bjud in vänner"-
 * knappen på startsidan tar användaren rakt till delningsfunktionen utan
 * att de behöver hitta vägen till profil-sidan.
 */
export default function InvitePage() {
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
            <span className="text-gold-500">Få 50 kr båda.</span>
          </h1>
          <p
            className="text-[13px] font-bold leading-relaxed"
            style={{ color: "var(--text-secondary)" }}
          >
            Skicka din kod till en vän. När de gör sin första beställning
            får ni båda 50 kr rabatt att använda i kassan.
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
            <li>När vännen gör sin första betalda beställning får ni båda en 50 kr-rabattkupong i kassan.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
