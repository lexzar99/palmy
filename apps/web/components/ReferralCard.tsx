"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { Copy, Share2, Gift, Loader2, Check, Truck, Percent, Tag, CalendarDays, Wallet } from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/components/Toast";

// ReferralCard — visas på Profile-sidan. Hämtar referral-data från
// `/api/platform/account/referral` och låter användaren kopiera koden eller
// dela länken. Share-text matchar RN-appens motsvarighet så meddelandet ser
// likadant ut oavsett plattform.

type DealInfo = {
  title: string;
  discountType: string; // NONE | PERCENTAGE | FIXED
  discountPercent: number | null;
  amountKr: number | null;
  freeDelivery: boolean;
  minOrderKr: number;
  validUntil: string | null; // null = tills vidare
};

type ReferralData = {
  code: string;
  shareUrl: string;
  enabled: boolean;
  deal: DealInfo | null;
  discountType?: string | null;
  rewardPercent?: number | null;
  rewardKr?: number | null;
  rewardLabel: string;
  couponsPerSide?: number;
  stats: {
    invited: number;
    registered: number;
    ordered: number;
    totalEarnedKr: number;
  };
};

export default function ReferralCard() {
  const { toast } = useToast();
  const [data, setData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    axios
      .get<ReferralData>("/api/platform/account/referral")
      .then((res) => {
        if (cancelled) return;
        setData(res.data);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setError(err?.response?.data?.error || "Kunde inte hämta referral-data");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCopy = async () => {
    if (!data?.code) return;
    try {
      await navigator.clipboard.writeText(data.code);
      setCopied(true);
      toast("Koden kopierad!", "success");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast("Kunde inte kopiera koden", "error");
    }
  };

  const handleShare = async () => {
    if (!data) return;
    // Texten anpassar sig efter deal-typen: "20% rabatt" / "50 kr rabatt"
    // / "fri leverans". rewardLabel kommer färdigformaterad från backend.
    const shareText = `Kom till FoodGo med min kod ${data.code} — vi får båda ${data.rewardLabel} på nästa beställning! ${data.shareUrl}`;
    // Native share om tillgängligt (mobil-Safari, Chrome-Android)
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share({
          title: "FoodGo - 50 kr rabatt",
          text: shareText,
          url: data.shareUrl,
        });
        return;
      } catch (err: any) {
        // AbortError = användaren stängde share-sheet — tyst ignorera
        if (err?.name === "AbortError") return;
        // Annars fall vidare till clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(shareText);
      toast("Inbjudan kopierad — klistra in i ett meddelande!", "success");
    } catch {
      toast("Kunde inte dela", "error");
    }
  };

  if (loading) {
    return (
      <div
        className="rounded-[2rem] p-8 flex items-center justify-center"
        style={{
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border-muted)",
        }}
      >
        <Loader2 className="animate-spin text-gold-500" size={28} />
      </div>
    );
  }

  // Visa alltid koden om vi har data — `data.enabled` styr bara om
  // belöningen triggas server-side vid invitee:s första betalda order
  // (admin-toggle). Användaren ska alltid kunna se och dela sin kod.
  // Tidigare gömde vi kortet helt → användare trodde funktionen var trasig.
  if (error || !data) {
    return null;
  }

  // Format-helper för expiry-display: "Gäller till 15 dec" istället för ISO.
  const formatExpiry = (iso: string): string | null => {
    try {
      const d = new Date(iso);
      if (!Number.isFinite(d.getTime())) return null;
      return d.toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
    } catch {
      return null;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative rounded-[2rem] overflow-hidden"
      style={{
        backgroundColor: "var(--bg-secondary)",
        border: "1px solid rgba(231,178,75,0.25)",
        boxShadow: "0 0 24px rgba(231,178,75,0.08)",
      }}
    >
      {/* Subtle gold-glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 80% 20%, rgba(231,178,75,0.12) 0%, transparent 60%)",
        }}
      />

      <div className="relative p-7 space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Gift size={14} className="text-gold-500" />
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-gold-500">
              Bjud in vänner
            </p>
          </div>
          <h3
            className="text-xl font-black uppercase italic tracking-tight leading-tight"
            style={{ color: "var(--text-primary)" }}
          >
            Få <span className="text-gold-500">{data.rewardLabel}</span> åt båda
          </h3>
          <p
            className="text-[11px] font-bold mt-2 leading-relaxed"
            style={{ color: "var(--text-secondary)" }}
          >
            När din vän gör sin första beställning får ni{" "}
            <span className="text-gold-500 font-black">båda {data.rewardLabel}</span>{" "}
            på nästa order.
          </p>
        </div>

        {/* Deal-hero — visuell display av den konfigurerade rabatten.
            Anpassar sig efter typen: stort tal för procent/kr, lastbil-ikon
            för fri leverans, kombinerad layout för stack. Visas bara om
            referral är aktivt + en Deal är vald. */}
        {data.enabled && data.deal && <DealHero deal={data.deal} formatExpiry={formatExpiry} />}

        {/* Kod + actions */}
        <div className="flex items-center gap-3">
          <div
            className="flex-1 rounded-2xl px-5 py-4 border-2"
            style={{
              backgroundColor: "var(--bg-deep)",
              borderColor: "rgba(231,178,75,0.4)",
              boxShadow: "0 0 16px rgba(231,178,75,0.1)",
            }}
          >
            <p
              className="text-[8px] font-black uppercase tracking-[0.3em] mb-1"
              style={{ color: "var(--text-secondary)" }}
            >
              Din kod
            </p>
            <p className="font-mono font-black text-xl tracking-[0.2em] text-gold-500">
              {data.code}
            </p>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopy}
              aria-label="Kopiera kod"
              title="Kopiera kod"
              className="w-11 h-11 rounded-2xl flex items-center justify-center transition-all active:scale-90 hover:bg-gold-500/10"
              style={{
                backgroundColor: "var(--bg-deep)",
                border: "1px solid var(--border-muted)",
                color: copied ? "#10b981" : "var(--text-primary)",
              }}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
            <button
              type="button"
              onClick={handleShare}
              aria-label="Dela inbjudan"
              title="Dela inbjudan"
              className="w-11 h-11 rounded-2xl flex items-center justify-center transition-all active:scale-90 bg-gold-500 text-zinc-950 hover:bg-gold-400"
            >
              <Share2 size={16} />
            </button>
          </div>
        </div>

        {/* Stats */}
        <div
          className="grid grid-cols-3 gap-3 pt-2"
          style={{ borderTop: "1px solid var(--border-muted)" }}
        >
          <Stat label="Bjudit in" value={data.stats.invited} />
          <Stat label="Registrerade" value={data.stats.registered} />
          <Stat label="Kuponger" value={data.stats.ordered} />
        </div>
      </div>
    </motion.div>
  );
}

/**
 * DealHero — visuell display av den konfigurerade rabatten. Anpassar sig
 * efter dealtypen:
 *   - PERCENTAGE → BIG "25%" med procent-symbol
 *   - FIXED → BIG "50 KR"
 *   - FREE_DELIVERY (ensam) → Lastbil-ikon + "FRI LEVERANS"
 *   - Stack (t.ex. 25% + Fri leverans) → Båda visas sida vid sida
 * Plus footer-rad med min-order + expiry.
 */
function DealHero({
  deal,
  formatExpiry,
}: {
  deal: DealInfo;
  formatExpiry: (iso: string) => string | null;
}) {
  const hasDiscount =
    (deal.discountType === "PERCENTAGE" && (deal.discountPercent ?? 0) > 0) ||
    (deal.discountType === "FIXED" && (deal.amountKr ?? 0) > 0);
  const isPercent = deal.discountType === "PERCENTAGE";
  // validUntil = null betyder "tills vidare". Annars formatera till "15 dec".
  const expiryDate = deal.validUntil ? formatExpiry(deal.validUntil) : null;
  const expiryLabel = deal.validUntil
    ? expiryDate
      ? `Gäller till ${expiryDate}`
      : null
    : "Gäller tills vidare";

  return (
    <div
      className="rounded-[1.5rem] p-5 border"
      style={{
        backgroundColor: "var(--bg-deep)",
        borderColor: "rgba(231,178,75,0.3)",
      }}
    >
      {/* Deal-titel */}
      <p
        className="text-[9px] font-black uppercase tracking-[0.3em] mb-3"
        style={{ color: "var(--text-secondary)" }}
      >
        {deal.title}
      </p>

      {/* Visuell hero-display — stort tal eller lastbil-ikon */}
      <div className="flex items-center justify-center gap-5 py-3">
        {hasDiscount && (
          <div className="flex flex-col items-center">
            <p className="text-5xl md:text-6xl font-black italic tracking-tighter text-gold-500 leading-none">
              {isPercent ? deal.discountPercent : deal.amountKr}
              <span className="text-2xl md:text-3xl align-top ml-0.5">
                {isPercent ? "%" : "kr"}
              </span>
            </p>
            <p
              className="text-[9px] font-black uppercase tracking-[0.3em] mt-1.5"
              style={{ color: "var(--text-secondary)" }}
            >
              Rabatt
            </p>
          </div>
        )}

        {/* Plus-symbol om båda stackar */}
        {hasDiscount && deal.freeDelivery && (
          <p
            className="text-3xl font-black"
            style={{ color: "var(--text-secondary)", opacity: 0.4 }}
          >
            +
          </p>
        )}

        {deal.freeDelivery && (
          <div className="flex flex-col items-center">
            <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-gold-500/15 border border-gold-500/30 flex items-center justify-center">
              <Truck size={28} className="text-gold-500" strokeWidth={2.5} />
            </div>
            <p
              className="text-[9px] font-black uppercase tracking-[0.3em] mt-1.5 text-center"
              style={{ color: "var(--text-secondary)" }}
            >
              Fri leverans
            </p>
          </div>
        )}
      </div>

      {/* Villkor-rad: min-order + expiry. Visar alltid expiry-status —
          "Gäller till X" om datum satt, "Gäller tills vidare" om null. */}
      {(deal.minOrderKr > 0 || expiryLabel) && (
        <div
          className="flex flex-wrap items-center gap-4 mt-4 pt-3 text-[10px] font-bold"
          style={{
            borderTop: "1px solid var(--border-muted)",
            color: "var(--text-secondary)",
          }}
        >
          {deal.minOrderKr > 0 && (
            <span className="flex items-center gap-1.5">
              <Wallet size={11} /> Min {deal.minOrderKr} kr
            </span>
          )}
          {expiryLabel && (
            <span className="flex items-center gap-1.5">
              <CalendarDays size={11} /> {expiryLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  suffix = "",
}: {
  label: string;
  value: number;
  suffix?: string;
}) {
  return (
    <div className="text-center">
      <p
        className="text-2xl font-black italic tracking-tight"
        style={{ color: "var(--text-primary)" }}
      >
        {value}
        {suffix && (
          <span
            className="text-xs font-bold not-italic ml-0.5"
            style={{ color: "var(--text-secondary)" }}
          >
            {suffix}
          </span>
        )}
      </p>
      <p
        className="text-[8px] font-black uppercase tracking-[0.2em] mt-1"
        style={{ color: "var(--text-secondary)" }}
      >
        {label}
      </p>
    </div>
  );
}
