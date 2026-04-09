"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Gift, Sparkles, X, ArrowRight, Tag, Check } from "lucide-react";
import { formatDealReward } from "@/lib/deals";

export interface FlipDeal {
  id: string;
  title: string;
  description?: string;
  badgeText?: string;
  isPersonal?: boolean;
  isWelcome?: boolean;
  code?: string;
  discount?: number;
  minOrder?: number;
  comboProductNames?: string[];
  validUntil?: string;
  restaurantId?: string;
  restaurant?: { name: string; slug: string };
  isGlobal?: boolean;
}

interface DealFlipCardProps {
  deals: FlipDeal[];
  personalDeals: FlipDeal[];
  onUseDeal: (deal: FlipDeal) => void;
}

export default function DealFlipCard({ deals, personalDeals, onUseDeal }: DealFlipCardProps) {
  const [flippedId, setFlippedId] = useState<string | null>(null);

  const welcomeDeals = deals.filter(d => d.isWelcome || d.badgeText?.toLowerCase().includes("välkomst"));
  const globalDeals = deals.filter(d => d.isGlobal && !d.isWelcome && !d.isPersonal);
  const restDeals = deals.filter(d => !d.isGlobal && !d.isWelcome && !d.isPersonal);
  const allDeals = [...welcomeDeals, ...personalDeals, ...globalDeals, ...restDeals].slice(0, 4);

  if (allDeals.length === 0) return null;

  const handleFlip = (deal: FlipDeal) => {
    if (flippedId === deal.id) {
      setFlippedId(null);
    } else {
      setFlippedId(deal.id);
    }
  };

  const handleUseNow = (e: React.MouseEvent, deal: FlipDeal) => {
    e.stopPropagation();
    e.preventDefault();
    onUseDeal(deal);
    setFlippedId(null);
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {allDeals.map((deal, index) => (
        <motion.div
          key={deal.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
          className="relative h-56"
          onClick={() => handleFlip(deal)}
        >
          <AnimatePresence mode="wait">
            {flippedId === deal.id ? (
              <motion.div
                key={`back-${deal.id}`}
                initial={{ opacity: 0, x: 100 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 100 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="absolute inset-0 rounded-[2rem] border border-gold-500/30 bg-obsidian p-5 cursor-pointer"
              >
                <div className="h-full flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[8px] font-black uppercase tracking-widest text-gold-500">
                      DETALJER
                    </span>
                    <button onClick={(e) => { e.stopPropagation(); setFlippedId(null); }}>
                      <X size={16} className="text-zinc-600 hover:text-white transition-colors" />
                    </button>
                  </div>

                  <div className="flex-1 space-y-2 py-2">
                    {deal.description && (
                      <p className="text-xs text-zinc-400 font-medium">{deal.description}</p>
                    )}
                    
                    <div className="flex flex-wrap gap-1.5">
                      {deal.minOrder && deal.minOrder > 0 && (
                        <span className="px-2 py-1 rounded-full bg-white/5 text-[9px] font-black uppercase text-zinc-500">
                          Min {deal.minOrder} Kr
                        </span>
                      )}
                      {deal.comboProductNames?.slice(0, 3).map((name) => (
                        <span key={name} className="px-2 py-1 rounded-full bg-gold-500/10 text-[9px] font-black uppercase text-gold-500">
                          {name}
                        </span>
                      ))}
                    </div>

                    {deal.validUntil && (
                      <p className="text-[9px] font-black uppercase text-zinc-600">
                        Gäller t.o.m {new Date(deal.validUntil).toLocaleDateString("sv-SE")}
                      </p>
                    )}
                  </div>

                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    whileHover={{ scale: 1.02 }}
                    onClick={(e) => handleUseNow(e, deal)}
                    className="w-full py-3 bg-gold-500 text-zinc-950 rounded-xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 shadow-lg shadow-gold-500/20"
                  >
                    <Check size={14} />
                    Utnyttja Nu
                  </motion.button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key={`front-${deal.id}`}
                initial={{ opacity: 0, x: -100 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -100 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="absolute inset-0 rounded-[2rem] border border-white/10 bg-gradient-to-br from-zinc-900 to-obsidian p-5 cursor-pointer hover:border-gold-500/30"
              >
                <div className="absolute top-0 right-0 w-20 h-20 bg-gold-500/10 rounded-full blur-xl" />
                <div className="relative h-full flex flex-col justify-between">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-1.5">
                      {deal.isWelcome ? (
                        <Sparkles size={12} className="text-gold-500" />
                      ) : deal.isPersonal ? (
                        <Tag size={12} className="text-emerald-500" />
                      ) : (
                        <Gift size={12} className="text-gold-500" />
                      )}
                      <span className="text-[7px] font-black uppercase tracking-widest text-gold-500">
                        {deal.isWelcome ? "VÄLKOMST" : deal.isPersonal ? "PERSONLIGT" : "ERBJUDANDE"}
                      </span>
                    </div>
                    <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center">
                      <ArrowRight size={12} className="rotate-90" />
                    </div>
                  </div>

                  <div>
                    <h3 className="text-base font-black uppercase italic tracking-tight text-white">
                      {deal.title}
                    </h3>
                    <p className="text-[9px] text-zinc-600 font-medium mt-1">
                      {deal.isPersonal 
                        ? "Ditt personliga erbjudande" 
                        : deal.isGlobal 
                          ? "Gäller alla restauranger" 
                          : deal.restaurant?.name || "Gäller utvalda"}
                    </p>
                  </div>

                  <div className="flex items-end justify-between">
                    <div className="text-lg font-black text-gold-500">
                      {formatDealReward(deal as any)}
                    </div>
                    <div className="text-[8px] font-black uppercase tracking-widest text-zinc-700">
                      Tryck för info
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      ))}
    </div>
  );
}