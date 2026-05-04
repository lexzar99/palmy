"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

/**
 * Claim-popup som visas första gången en inloggad användare öppnar
 * webappen efter att admin skapat en popup-deal i Popup Builder.
 *
 * Logik:
 *   - Hämtar /api/platform/profile/deals för att se vilka deals som är
 *     popupEnabled och INTE redan claimade av användaren.
 *   - Visar den första matchande som modal.
 *   - "Spara erbjudandet" → POST /api/platform/profile/deals/:id/claim →
 *     Deal-id läggs i User.claimedDealIds.
 *   - "Inte just nu" → sparar dismissal i localStorage så vi inte spammer
 *     vid varje sidladdning. Visas igen efter 24h om kund inte claimat.
 */
export default function ClaimDealPopup() {
  const [deal, setDeal] = useState<any | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const dismissedAt = Number(localStorage.getItem("matgo_claim_dismissed_at") || 0);
        if (dismissedAt && Date.now() - dismissedAt < 24 * 60 * 60 * 1000) return;

        // Hämta publika deals (inkluderar popup-deals) parallellt med
        // användarens redan claimade så vi vet vilka som ska visas.
        const [allRes, claimedRes] = await Promise.all([
          axios.get("/api/platform/deals").catch(() => ({ data: [] })),
          axios.get("/api/platform/profile/claimed-deals").catch(() => ({ data: { claimed: [], global: [] } })),
        ]);
        if (cancelled) return;

        const claimedIds = new Set<string>(
          ((claimedRes.data?.claimed || []) as any[]).map((d: any) => d.id),
        );
        const all = Array.isArray(allRes.data) ? allRes.data : (allRes.data?.deals || []);
        const candidate = all.find(
          (d: any) => d?.popupEnabled && d?.isActive && !claimedIds.has(d.id),
        );
        if (candidate) setDeal(candidate);
      } catch {
        // Tyst fail — popup är inte kritisk.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleClaim = async () => {
    if (!deal || claiming) return;
    setClaiming(true);
    try {
      await axios.post(`/api/platform/profile/deals/${deal.id}/claim`);
      setClaimed(true);
      setTimeout(() => setDeal(null), 1500);
    } catch (e: any) {
      alert(e?.response?.data?.error || "Kunde inte spara erbjudandet.");
    } finally {
      setClaiming(false);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem("matgo_claim_dismissed_at", String(Date.now()));
    setDeal(null);
  };

  if (!deal) return null;

  const headline = deal.popupHeadline || deal.title || "Erbjudande";
  const body = deal.popupBody || deal.description || "";
  const ctaLabel = deal.popupCtaLabel || "Spara erbjudande";
  const badge = deal.badgeText || (deal.discountType === "PERCENTAGE" ? `-${deal.discountValue}%` : "");

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-end justify-center px-4 pb-6 sm:items-center sm:pb-0"
        style={{ backgroundColor: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}
        onClick={handleDismiss}
      >
        <motion.div
          initial={{ y: 80, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 80, opacity: 0, scale: 0.95 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-sm rounded-[28px] p-6 shadow-2xl"
          style={{
            background: "linear-gradient(180deg, #1a1f29 0%, #11151b 100%)",
            border: "1px solid rgba(243,191,87,0.3)",
            color: "#fff",
          }}
        >
          <button
            type="button"
            onClick={handleDismiss}
            className="absolute right-4 top-4 rounded-full p-2 text-white/60 hover:bg-white/10 hover:text-white transition-colors"
            aria-label="Stäng"
          >
            <X size={18} />
          </button>

          {deal.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={deal.imageUrl} alt="" className="mb-4 h-40 w-full rounded-2xl object-cover" />
          ) : (
            <div className="mb-4 flex h-40 w-full items-center justify-center rounded-2xl bg-[rgba(243,191,87,0.1)] text-5xl">
              🎁
            </div>
          )}

          {badge ? (
            <div className="mb-3 inline-block rounded-full bg-[#f3bf57] px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#11151b]">
              {badge}
            </div>
          ) : null}

          <h3 className="text-2xl font-black tracking-[-0.04em]">{headline}</h3>
          {body ? <p className="mt-3 text-sm leading-6 text-white/80">{body}</p> : null}

          {deal.minOrder && deal.minOrder > 0 ? (
            <p className="mt-3 text-xs font-bold uppercase tracking-wider text-white/50">
              Minsta order {deal.minOrder} kr
            </p>
          ) : null}
          {deal.validUntil ? (
            <p className="mt-1 text-xs font-bold uppercase tracking-wider text-white/50">
              Gäller t.o.m. {String(deal.validUntil).slice(0, 10)}
            </p>
          ) : null}

          {deal.popupCode ? (
            <div className="mt-4 rounded-2xl border border-dashed border-[#f3bf57]/40 bg-[#f3bf57]/10 px-4 py-3 text-center">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#f3bf57]">Använd kod</p>
              <p className="mt-1 text-lg font-black tracking-wider text-white">{deal.popupCode}</p>
            </div>
          ) : null}

          <button
            type="button"
            onClick={handleClaim}
            disabled={claiming || claimed}
            className="mt-5 w-full rounded-2xl bg-[#f3bf57] py-4 text-sm font-black uppercase tracking-[0.2em] text-[#11151b] transition-all active:scale-[0.98] disabled:opacity-60"
          >
            {claimed ? "Sparat ✓" : claiming ? "Sparar..." : ctaLabel}
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="mt-2 w-full rounded-2xl py-3 text-xs font-bold uppercase tracking-[0.2em] text-white/50 hover:text-white/80 transition-colors"
          >
            Inte just nu
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
