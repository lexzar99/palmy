"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import "@/components/restaurant/restaurant.css";
import { Gift, X } from "lucide-react";
import {
  getPlatformSessionStatus,
  LAST_CUSTOMER_ID_KEY,
  PLATFORM_SESSION_CHANGED_EVENT,
} from "@/lib/platformSessionClient";

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
  const pathname = usePathname();
  const [deal, setDeal] = useState<any | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [sessionRevision, setSessionRevision] = useState(0);

  // Popupen visas bara på hemsidan. Om användaren är inne i kassan/order/
  // restaurang och något triggar pop refetcha — vänta tills hen kommer
  // tillbaka till "/" innan vi visar.
  const isHome = pathname === "/" || pathname === "";

  const findCandidate = useCallback(async () => {
    try {
      if (!(await getPlatformSessionStatus())) return null;
      const dismissedAt = Number(localStorage.getItem("viaeats_claim_dismissed_at") || 0);
      if (dismissedAt && Date.now() - dismissedAt < 24 * 60 * 60 * 1000) return null;

      const [allRes, claimedRes] = await Promise.all([
        axios.get("/api/platform/deals").catch(() => ({ data: [] })),
        axios.get("/api/platform/profile/claimed-deals").catch(() => ({ data: { claimed: [], global: [] } })),
      ]);

      const claimedIds = new Set<string>(
        ((claimedRes.data?.claimed || []) as any[]).map((d: any) => d.id),
      );
      const all = Array.isArray(allRes.data) ? allRes.data : (allRes.data?.deals || []);
      const candidate = all.find((d: any) => {
        if (!d?.isActive || claimedIds.has(d.id)) return false;
        const hasPopupContent = Boolean(
          (d.popupHeadline && String(d.popupHeadline).trim()) ||
            (d.popupBody && String(d.popupBody).trim()) ||
            (d.popupCode && String(d.popupCode).trim()),
        );
        return hasPopupContent && d.popupEnabled !== false;
      });
      return candidate || null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    const onSessionChanged = () => {
      setDeal(null);
      setClaimed(false);
      setClaiming(false);
      setSessionRevision((current) => current + 1);
    };
    const onCustomerStorage = (event: StorageEvent) => {
      if (event.key === LAST_CUSTOMER_ID_KEY || event.key === "dlv_logged_out") onSessionChanged();
    };
    window.addEventListener(PLATFORM_SESSION_CHANGED_EVENT, onSessionChanged);
    window.addEventListener("storage", onCustomerStorage);
    return () => {
      window.removeEventListener(PLATFORM_SESSION_CHANGED_EVENT, onSessionChanged);
      window.removeEventListener("storage", onCustomerStorage);
    };
  }, []);

  useEffect(() => {
    if (!isHome) return; // Bara visa på hemsidan
    let cancelled = false;
    findCandidate().then((c) => {
      if (!cancelled && c) setDeal(c);
    });
    return () => {
      cancelled = true;
    };
  }, [isHome, findCandidate, sessionRevision]);

  // Refetch när fönstret återfår fokus (kund öppnar tab eller switchar
  // tillbaka till appen) — så att en popup som admin skickade medan
  // appen var i bakgrunden plockas upp direkt utan att man behöver
  // ladda om sidan.
  useEffect(() => {
    if (!isHome) return;
    const onFocus = () => {
      if (!deal) findCandidate().then((c) => c && setDeal(c));
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) onFocus(); });
    return () => {
      window.removeEventListener("focus", onFocus);
    };
  }, [isHome, deal, findCandidate]);

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
    localStorage.setItem("viaeats_claim_dismissed_at", String(Date.now()));
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
        className="ve-root fixed inset-0 z-[1500] flex items-end justify-center sm:items-center"
        style={{ backgroundColor: "rgba(0,0,0,0.42)" }}
        onClick={handleDismiss}
      >
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", stiffness: 380, damping: 38, mass: 0.9 }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={headline}
          className="relative w-full max-w-[480px] overflow-hidden rounded-t-[26px] sm:rounded-[26px]"
          style={{ backgroundColor: "var(--ve-bg)", boxShadow: "0 -8px 40px rgba(0,0,0,0.18)" }}
        >
          <div className="flex justify-center pt-2.5"><span className="ve-sheet-handle" /></div>
          <button
            type="button"
            onClick={handleDismiss}
            className="ve-press absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full"
            style={{ backgroundColor: "var(--ve-fill)", color: "var(--ve-ink)" }}
            aria-label="Stäng"
          >
            <X size={16} strokeWidth={2.6} />
          </button>

          <div className="px-5 pb-5 pt-3" style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 20px)" }}>
            {deal.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={deal.imageUrl} alt="" className="mt-6 h-44 w-full rounded-[20px] object-cover" style={{ backgroundColor: "#EBEBEE" }} />
            ) : (
              <div className="mt-6 grid h-32 w-full place-items-center rounded-[20px]" style={{ backgroundColor: "var(--ve-accent-soft)", color: "var(--ve-accent)" }}>
                <Gift size={40} strokeWidth={2} />
              </div>
            )}

            {badge ? (
              <span className="mt-4 inline-flex rounded-full px-2.5 py-1 text-[12px] font-semibold" style={{ backgroundColor: "var(--ve-accent-soft)", color: "var(--ve-accent)" }}>
                {badge}
              </span>
            ) : null}

            <h3 className="m-0 mt-2 text-[24px] font-semibold leading-[1.12]" style={{ letterSpacing: "-0.022em", color: "var(--ve-ink)" }}>{headline}</h3>
            {body ? <p className="m-0 mt-2 text-[15px] leading-[1.45]" style={{ color: "var(--ve-ink-2)" }}>{body}</p> : null}

            {(deal.minOrder && deal.minOrder > 0) || deal.validUntil ? (
              <p className="m-0 mt-3 text-[13px]" style={{ color: "var(--ve-ink-3)" }}>
                {[deal.minOrder && deal.minOrder > 0 ? `Minsta order ${deal.minOrder} kr` : null, deal.validUntil ? `Gäller till ${String(deal.validUntil).slice(0, 10)}` : null].filter(Boolean).join(" · ")}
              </p>
            ) : null}

            {deal.popupCode ? (
              <div className="ve-card mt-4 px-4 py-3 text-center">
                <p className="m-0 text-[12.5px]" style={{ color: "var(--ve-ink-3)" }}>Använd kod</p>
                <p className="ve-tabular m-0 mt-0.5 text-[20px] font-semibold" style={{ letterSpacing: "0.06em", color: "var(--ve-ink)" }}>{deal.popupCode}</p>
              </div>
            ) : null}

            {deal.popupOkOnly ? (
              <button
                type="button"
                onClick={handleDismiss}
                className="ve-press mt-5 h-[52px] w-full rounded-full text-[16px] font-semibold"
                style={{ backgroundColor: "var(--ve-cta)", color: "var(--ve-cta-ink)" }}
              >
                OK
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleClaim}
                  disabled={claiming || claimed}
                  className="ve-press mt-5 h-[52px] w-full rounded-full text-[16px] font-semibold disabled:opacity-60"
                  style={{ backgroundColor: claimed ? "var(--ve-success)" : "var(--ve-cta)", color: "#fff" }}
                >
                  {claimed ? "Sparat" : claiming ? "Sparar…" : ctaLabel}
                </button>
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="mt-1.5 h-11 w-full rounded-full text-[15px] font-medium"
                  style={{ color: "var(--ve-ink-2)" }}
                >
                  Inte just nu
                </button>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
