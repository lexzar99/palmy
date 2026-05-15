"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { Copy, Share2, Gift, Loader2, Check } from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/components/Toast";

// ReferralCard — visas på Profile-sidan. Hämtar referral-data från
// `/api/platform/account/referral` och låter användaren kopiera koden eller
// dela länken. Share-text matchar RN-appens motsvarighet så meddelandet ser
// likadant ut oavsett plattform.

type ReferralData = {
  code: string;
  shareUrl: string;
  enabled: boolean;
  rewardKr: number;
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
    const shareText = `Kom till FoodGo med min kod ${data.code} — vi får båda ${data.rewardKr} kr rabatt på nästa beställning! ${data.shareUrl}`;
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
            Tjäna{" "}
            <span className="text-gold-500">{data.rewardKr} kr</span> åt båda
          </h3>
          <p
            className="text-[11px] font-bold mt-2 leading-relaxed"
            style={{ color: "var(--text-secondary)" }}
          >
            När din vän gör sin första beställning får ni{" "}
            <span className="text-gold-500 font-black">båda {data.rewardKr} kr</span>{" "}
            rabatt på nästa order.
          </p>
        </div>

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
          <Stat label="Klart" value={data.stats.ordered} />
          <Stat
            label="Tjänat"
            value={data.stats.totalEarnedKr}
            suffix=" kr"
          />
        </div>
      </div>
    </motion.div>
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
