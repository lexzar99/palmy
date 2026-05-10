"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Tag, Zap } from "lucide-react";
import axios from "axios";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://palmy-production-2021.up.railway.app";

interface BannerDeal {
  id: string;
  title: string;
  description?: string | null;
  badgeText?: string | null;
  imageUrl?: string | null;
  discountType: string;
  discountValue: number;
  minOrder: number;
  triggerType: string;
  scopeType: string;
}

const formatReward = (deal: BannerDeal) => {
  if (deal.triggerType === "BOGO_CATEGORY") return "1 gratis";
  if (deal.discountType === "FIXED") return `${deal.discountValue} kr`;
  return `${deal.discountValue}%`;
};

const STRIP_TONES = [
  { bg: "rgba(234,181,69,0.13)", border: "rgba(234,181,69,0.28)", text: "#EAB545", icon: "#EAB545" },
  { bg: "rgba(240,122,19,0.12)", border: "rgba(240,122,19,0.26)", text: "#F07A13", icon: "#F07A13" },
  { bg: "rgba(99,202,132,0.11)", border: "rgba(99,202,132,0.25)", text: "#63CA84", icon: "#63CA84" },
];

export default function DealBannerStrip({ slug }: { slug: string }) {
  const [deals, setDeals] = useState<BannerDeal[]>([]);

  useEffect(() => {
    if (!slug) return;
    axios
      .get(`${API_URL}/api/deals/banners`, { params: { slug } })
      .then((res) => setDeals(res.data || []))
      .catch(() => {});
  }, [slug]);

  if (deals.length === 0) return null;

  return (
    <div className="relative w-full overflow-x-auto pb-1 pt-1" style={{ scrollbarWidth: "none" }}>
      <div className="flex gap-3 px-4 sm:px-6" style={{ width: "max-content" }}>
        {deals.map((deal, i) => {
          const tone = STRIP_TONES[i % STRIP_TONES.length];
          const isBogo = deal.triggerType === "BOGO_CATEGORY";
          return (
            <motion.div
              key={deal.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07, duration: 0.25 }}
              className="flex shrink-0 items-center gap-3 rounded-2xl border px-4 py-3"
              style={{ background: tone.bg, borderColor: tone.border, minWidth: 220, maxWidth: 300 }}
            >
              {deal.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={deal.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
              ) : (
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: `${tone.icon}22` }}
                >
                  {isBogo ? (
                    <Zap size={16} style={{ color: tone.icon }} />
                  ) : (
                    <Tag size={16} style={{ color: tone.icon }} />
                  )}
                </div>
              )}
              <div className="min-w-0">
                {deal.badgeText ? (
                  <p className="mb-0.5 text-[10px] font-black uppercase tracking-widest" style={{ color: tone.text }}>
                    {deal.badgeText}
                  </p>
                ) : null}
                <p className="truncate text-[13px] font-black leading-tight" style={{ color: "var(--text-primary)" }}>
                  {deal.title}
                </p>
                <p className="mt-0.5 text-[11px] font-bold" style={{ color: tone.text }}>
                  {isBogo ? "Köp och få 1 gratis" : `Spara ${formatReward(deal)}`}
                  {deal.minOrder > 0 ? ` • min ${deal.minOrder} kr` : ""}
                </p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
