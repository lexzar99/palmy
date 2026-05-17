"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { Gift, Share2, Copy, Check, Truck, CalendarDays, Wallet, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

/**
 * ShareInviteCard — visas på order tracking-sidan mellan tracker och
 * receipt. Triggar share-impulsen medan kunden väntar på maten (peak
 * emotional moment efter checkout).
 *
 * Visar dealen dynamiskt (samma som /invite-sidans deal-hero).
 * När user just har lagt sin första betalda order → referral-koden är
 * nyss genererad och vi visar en "Du har låst upp!"-rubrik. För senare
 * ordrar visar vi mer dämpad "Tipsa en vän"-text.
 */

type DealInfo = {
  title: string;
  discountType: string;
  discountPercent: number | null;
  amountKr: number | null;
  freeDelivery: boolean;
  minOrderKr: number;
  validUntil: string | null;
};

type ReferralData = {
  locked: boolean;
  code: string | null;
  shareUrl: string | null;
  enabled: boolean;
  deal: DealInfo | null;
  rewardLabel: string;
  stats: {
    invited: number;
    registered: number;
    ordered: number;
    totalEarnedKr: number;
  };
};

export default function ShareInviteCard() {
  const [data, setData] = useState<ReferralData | null>(null);
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);

  useEffect(() => {
    let cancelled = false;
    axios
      .get<ReferralData>("/api/platform/account/referral")
      .then((r) => {
        if (!cancelled) setData(r.data);
      })
      .catch(() => {
        // Tyst — kort visas inte om fetch failar
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Visa inte om: data saknas, referral inte enabled, eller fortfarande
  // locked (om denna order är PAID bör backend ha unlockat — men i edge-
  // cases där svaret kommer innan order är PAID hoppar vi).
  if (!data || !data.enabled || data.locked || !data.code || !data.deal) {
    return null;
  }

  // "Du har låst upp"-rubrik när detta är användarens FÖRSTA bekräftade
  // order (stats.invited === 0 = ingen har delats än → första gången).
  const isFirstUnlock = data.stats.invited === 0;

  const handleCopy = async () => {
    if (!data.code) return;
    try {
      await navigator.clipboard.writeText(data.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleShare = async () => {
    if (!data.code || !data.shareUrl) return;
    const shareText = `Kom till FoodGo med min kod ${data.code} — vi får båda ${data.rewardLabel} på nästa beställning! ${data.shareUrl}`;
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share({
          title: "FoodGo",
          text: shareText,
          url: data.shareUrl,
        });
        setShared(true);
        setTimeout(() => setShared(false), 2000);
        return;
      } catch (err: any) {
        if (err?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(shareText);
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    } catch {
      // ignore
    }
  };

  const deal = data.deal;
  const hasDiscount =
    (deal.discountType === "PERCENTAGE" && (deal.discountPercent ?? 0) > 0) ||
    (deal.discountType === "FIXED" && (deal.amountKr ?? 0) > 0);
  const isPercent = deal.discountType === "PERCENTAGE";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="rounded-[2rem] p-7 mb-10 relative overflow-hidden"
      style={{
        backgroundColor: "var(--bg-secondary)",
        border: "1px solid rgba(231,178,75,0.3)",
        boxShadow: "0 0 24px rgba(231,178,75,0.08)",
      }}
    >
      {/* Gold-glow accent */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 90% 20%, rgba(231,178,75,0.12) 0%, transparent 60%)",
        }}
      />

      <div className="relative">
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          {isFirstUnlock ? (
            <Sparkles size={14} className="text-gold-500" />
          ) : (
            <Gift size={14} className="text-gold-500" />
          )}
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gold-500">
            {isFirstUnlock ? "🎉 Du har låst upp referral!" : "Tipsa en vän"}
          </p>
        </div>

        <h3
          className="text-2xl font-black uppercase italic tracking-tight leading-tight mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          {isFirstUnlock ? (
            <>
              Bjud in en vän medan du väntar —{" "}
              <span className="text-gold-500">{data.rewardLabel}</span>{" "}åt båda
            </>
          ) : (
            <>
              Tipsa en vän — <span className="text-gold-500">{data.rewardLabel}</span> åt båda
            </>
          )}
        </h3>

        <p
          className="text-[11px] font-bold mb-5 leading-relaxed"
          style={{ color: "var(--text-secondary)" }}
        >
          Dela din kod medan du väntar på maten — ni får båda {data.rewardLabel} på er nästa
          beställning när vännen gör sin första order.
        </p>

        {/* Mini deal-hero */}
        <div
          className="rounded-2xl p-4 mb-5 flex items-center justify-center gap-4"
          style={{
            backgroundColor: "var(--bg-deep)",
            border: "1px solid rgba(231,178,75,0.25)",
          }}
        >
          {hasDiscount && (
            <div className="flex flex-col items-center">
              <p className="text-3xl font-black italic tracking-tighter text-gold-500 leading-[1.15]">
                {isPercent ? deal.discountPercent : deal.amountKr}
                <span className="text-lg align-top ml-0.5">
                  {isPercent ? "%" : "kr"}
                </span>
              </p>
              <p
                className="text-[8px] font-black uppercase tracking-[0.3em] mt-1"
                style={{ color: "var(--text-secondary)" }}
              >
                Rabatt
              </p>
            </div>
          )}

          {hasDiscount && deal.freeDelivery && (
            <p
              className="text-2xl font-black"
              style={{ color: "var(--text-secondary)", opacity: 0.4 }}
            >
              +
            </p>
          )}

          {deal.freeDelivery && (
            <div className="flex flex-col items-center">
              <div className="w-10 h-10 rounded-xl bg-gold-500/15 border border-gold-500/30 flex items-center justify-center">
                <Truck size={20} className="text-gold-500" strokeWidth={2.5} />
              </div>
              <p
                className="text-[8px] font-black uppercase tracking-[0.3em] mt-1 text-center"
                style={{ color: "var(--text-secondary)" }}
              >
                Fri leverans
              </p>
            </div>
          )}
        </div>

        {/* Kod + actions */}
        <div className="flex items-center gap-3">
          <div
            className="flex-1 rounded-xl px-4 py-3 border"
            style={{
              backgroundColor: "var(--bg-deep)",
              borderColor: "rgba(231,178,75,0.35)",
            }}
          >
            <p
              className="text-[8px] font-black uppercase tracking-[0.3em] mb-0.5"
              style={{ color: "var(--text-secondary)" }}
            >
              Din kod
            </p>
            <p className="font-mono font-black text-lg tracking-[0.2em] text-gold-500">
              {data.code}
            </p>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopy}
              aria-label="Kopiera kod"
              title="Kopiera kod"
              className="w-10 h-10 rounded-xl flex items-center justify-center transition-all active:scale-90 hover:bg-gold-500/10"
              style={{
                backgroundColor: "var(--bg-deep)",
                border: "1px solid var(--border-muted)",
                color: copied ? "#10b981" : "var(--text-primary)",
              }}
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
            </button>
            <button
              type="button"
              onClick={handleShare}
              aria-label="Dela inbjudan"
              title="Dela inbjudan"
              className="w-10 h-10 rounded-xl flex items-center justify-center transition-all active:scale-90 bg-gold-500 text-zinc-950 hover:bg-gold-400"
            >
              {shared ? <Check size={15} /> : <Share2 size={15} />}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
