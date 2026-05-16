"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

// Stripe PaymentSheet returnURL-landing.
//
// När mobil-appen kör Klarna/BankID/Swish (eller andra redirect-baserade
// betalmetoder) skickas användaren ut till betalleverantörens domän.
// Efter signering navigerar betal-flöden till en `returnURL` som Stripe
// SDK satt — vi använder Universal Link så iOS öppnar appen DIREKT
// istället för att visa "Öppna i FoodGo?"-prompten (= sämre UX när man
// just gjort BankID och har en open tab).
//
// När den här sidan faktiskt LADDAS innebär det att Universal Link
// INTE matchade (Associated Domains-entitlement saknas i Xcode, eller
// AASA hade inte fastnat i CDN än, eller browsern är desktop). Då
// faller vi tillbaka på custom URL-schemat foodgo:// för att försöka
// öppna appen. Om även det misslyckas (desktop/icke-installerat app)
// får användaren en hjälpsam "betalning slutförd"-vy.
//
// VIKTIGT: vi LOGGAR INGEN PII här. URL:en kan innehålla
// PaymentIntent-id i hash — vi vidarebefordrar det till appen men
// sparar inget i analytics/Sentry. Stripe-flöden hanterar id:t själv.
export default function StripeRedirectPage() {
  const [appOpenAttempted, setAppOpenAttempted] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Bygg foodgo://-URL och inkludera hash + search-params så Stripe
    // SDK kan plocka ut state:n den behöver när appen vaknar.
    const search = window.location.search || "";
    const hash = window.location.hash || "";
    const target = `foodgo://stripe-redirect${search}${hash}`;

    // Försök öppna appen via custom scheme. På iOS visar detta
    // "Öppna i FoodGo?"-prompt om Universal Link inte gick igenom.
    // På desktop händer ingenting (browsern känner inte schemat).
    try {
      window.location.href = target;
    } catch {
      // ignorerar — visar fallback-vyn
    }
    setAppOpenAttempted(true);
  }, []);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm text-center space-y-8"
      >
        <div className="w-20 h-20 bg-gold-500/10 rounded-[2rem] border border-gold-500/20 flex items-center justify-center text-gold-500 mx-auto shadow-2xl shadow-gold-500/10">
          <Loader2 size={32} className="animate-spin" />
        </div>

        <div className="space-y-3">
          <h1 className="text-2xl font-black uppercase tracking-tight">
            Betalning <span className="text-gold-500">slutförd</span>
          </h1>
          <p
            className="text-[11px] font-black uppercase tracking-[0.2em]"
            style={{ color: "var(--text-secondary)" }}
          >
            Återvänder till appen
          </p>
        </div>

        {appOpenAttempted && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.4 }}
            className="space-y-3 pt-4"
          >
            <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Om appen inte öppnas automatiskt, gå tillbaka manuellt — din
              betalning är registrerad. Ordern slutförs när du är tillbaka i
              FoodGo-appen.
            </p>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
