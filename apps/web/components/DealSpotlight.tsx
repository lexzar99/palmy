"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Gift, Sparkles, X } from "lucide-react";
import { PublicDeal, evaluateDeal, formatDealReward, pickBestDeal } from "@/lib/deals";

type DealSpotlightProps = {
  deals: PublicDeal[];
  subtotal: number;
  productIds: string[];
  floating?: boolean;
};

const DealSpotlight = ({ deals, subtotal, productIds, floating = false }: DealSpotlightProps) => {
  const [dismissed, setDismissed] = useState(false);
  const hasFloatingContent = !(floating && subtotal <= 0 && productIds.length === 0);

  const spotlight = useMemo(() => {
    if (deals.length === 0) return null;
    const best = pickBestDeal(deals.filter((deal) => deal.showOnSite), subtotal, productIds);
    return best.deal || deals[0];
  }, [deals, subtotal, productIds]);

  if (!hasFloatingContent || !spotlight || (floating && dismissed)) return null;

  const evaluation = evaluateDeal(spotlight, subtotal, productIds);

  const body = (
    <div className={`relative overflow-hidden rounded-[2rem] border ${floating ? "border-white/5 bg-white/95 shadow-xl backdrop-blur-xl" : "border-white/5 bg-zinc-900"} p-6`}>
      {floating && (
        <button onClick={() => setDismissed(true)} className="absolute right-4 top-4 text-zinc-400/30 hover:text-zinc-100 transition-colors">
          <X size={16} />
        </button>
      )}

      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-gold-400/20 bg-gold-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.3em] text-gold-600">
            <Sparkles size={12} />
            {spotlight.badgeText || "Deal just nu"}
          </div>
          <h3 className="text-xl font-black tracking-tight text-zinc-100">{spotlight.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">{spotlight.description || formatDealReward(spotlight)}</p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-500 text-white shadow-xl">
          <Gift size={20} />
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between gap-4 text-sm">
        <div className="text-zinc-400">{evaluation.progress.message}</div>
        <div className="font-bold text-gold-600">{formatDealReward(spotlight)}</div>
      </div>

      <div className="h-3 w-full overflow-hidden rounded-full border border-white/5 bg-zinc-800/50">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${evaluation.progress.percentage}%` }}
          className={`h-full ${evaluation.eligible ? "bg-emerald-500" : "bg-gradient-to-r from-gold-500/50 to-gold-500"}`}
        />
      </div>

      {spotlight.comboProductNames.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {spotlight.comboProductNames.map((name) => (
            <span key={name} className="rounded-full bg-zinc-800/50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">
              {name}
            </span>
          ))}
        </div>
      )}

      {spotlight.validUntil && (
        <div className="mt-4 text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-400/40">
          Gäller till {new Date(spotlight.validUntil).toLocaleDateString("sv-SE")}
        </div>
      )}
    </div>
  );

  if (!floating) {
    return body;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, x: -24, y: 12 }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        exit={{ opacity: 0, x: -16, y: 8 }}
        className="fixed bottom-6 left-6 z-50 hidden max-w-sm lg:block"
      >
        {body}
      </motion.div>
    </AnimatePresence>
  );
};

export default DealSpotlight;
