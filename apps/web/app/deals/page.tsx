"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { ArrowRight, Percent, Sparkles, Store, Tag } from "lucide-react";
import { API_URL } from "@/lib/api";
import { formatDealReward } from "@/lib/deals";

type PublicDealRow = {
  id: string;
  title: string;
  description?: string | null;
  badgeText?: string | null;
  discountType: "PERCENTAGE" | "FIXED";
  discountValue: number;
  minOrder: number;
  comboProductNames: string[];
  validUntil?: string | null;
  restaurant?: { id: string; name: string; slug: string } | null;
  applicableRestaurantIds?: string[];
};

export default function DealsPage() {
  const [deals, setDeals] = useState<PublicDealRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    axios
      .get(`${API_URL}/api/deals`)
      .then((res) => {
        if (active) setDeals(res.data || []);
      })
      .catch(() => {
        if (active) setDeals([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const comboDeals = useMemo(
    () => deals.filter((deal) => (deal.comboProductNames || []).length > 0),
    [deals],
  );
  const otherDeals = useMemo(
    () => deals.filter((deal) => (deal.comboProductNames || []).length === 0),
    [deals],
  );

  const renderDealCard = (deal: PublicDealRow) => {
    const targetCount = deal.applicableRestaurantIds?.length || (deal.restaurant ? 1 : 0);

    return (
      <div
        key={deal.id}
        className="rounded-[2rem] border p-5"
        style={{ backgroundColor: "#211C19", borderColor: "rgba(255,248,234,0.08)" }}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-gold-500/10 text-gold-500 text-[8px] font-black uppercase tracking-[0.2em] mb-2">
              {(deal.comboProductNames || []).length > 0 ? <Tag size={10} /> : <Sparkles size={10} />}
              {deal.badgeText || ((deal.comboProductNames || []).length > 0 ? "Produktdeal" : "Kampanj")}
            </div>
            <h1 className="text-lg font-black text-white uppercase tracking-tight leading-tight">{deal.title}</h1>
            {deal.description && <p className="text-sm text-zinc-400 mt-2 max-w-2xl">{deal.description}</p>}
          </div>
          <div className="text-right shrink-0">
            <div className="text-gold-500 text-lg font-black leading-none">{formatDealReward(deal as any)}</div>
            {deal.minOrder > 0 && <div className="text-[9px] text-zinc-500 font-black uppercase tracking-widest mt-1">Min {deal.minOrder} kr</div>}
          </div>
        </div>

        {(deal.comboProductNames || []).length > 0 && (
          <div className="mb-4">
            <div className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500 mb-2">Gäller dessa produkter</div>
            <div className="flex flex-wrap gap-2">
              {deal.comboProductNames.map((name) => (
                <span
                  key={name}
                  className="px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wide border"
                  style={{ backgroundColor: "rgba(168,85,247,0.12)", color: "#c084fc", borderColor: "rgba(168,85,247,0.2)" }}
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-4 pt-4 border-t border-white/5">
          <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider flex items-center gap-2 min-w-0">
            <Store size={12} className="shrink-0" />
            <span className="truncate">
              {deal.restaurant?.name
                ? deal.restaurant.name
                : targetCount > 1
                  ? `${targetCount} restauranger`
                  : "Tillgänglig i appen"}
            </span>
          </div>

          {deal.restaurant?.slug ? (
            <Link
              href={`/restaurants/${deal.restaurant.slug}`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gold-500 text-zinc-950 text-[9px] font-black uppercase tracking-widest shrink-0"
            >
              Öppna <ArrowRight size={12} />
            </Link>
          ) : (
            <Link
              href="/discover"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 text-white text-[9px] font-black uppercase tracking-widest shrink-0"
            >
              Utforska <ArrowRight size={12} />
            </Link>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#171513] text-zinc-100 px-4 lg:px-10 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gold-500/10 border border-gold-500/20 text-gold-500 text-[9px] font-black uppercase tracking-[0.25em] mb-3">
            <Percent size={12} /> Alla deals
          </div>
          <h1 className="text-3xl lg:text-4xl font-black tracking-tight text-white">Erbjudanden & produktdeals</h1>
          <p className="text-sm text-zinc-500 mt-2 max-w-2xl">
            Här syns kampanjerna som tidigare var utspridda eller dolda. Produkt-specifika deals visas först.
          </p>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-44 rounded-[2rem] glass-panel animate-pulse" />
            ))}
          </div>
        ) : deals.length === 0 ? (
          <div className="rounded-[2rem] border border-white/5 p-10 text-center text-zinc-500">
            Inga publika deals hittades just nu.
          </div>
        ) : (
          <div className="space-y-10">
            {comboDeals.length > 0 && (
              <section>
                <div className="mb-4">
                  <h2 className="text-xl font-black uppercase tracking-tight text-white">Produktdeals</h2>
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-zinc-600 mt-1">
                    Deals kopplade till specifika rätter eller combos
                  </p>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {comboDeals.map(renderDealCard)}
                </div>
              </section>
            )}

            {otherDeals.length > 0 && (
              <section>
                <div className="mb-4">
                  <h2 className="text-xl font-black uppercase tracking-tight text-white">Övriga deals</h2>
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-zinc-600 mt-1">
                    Generella och restaurangspecifika kampanjer
                  </p>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {otherDeals.map(renderDealCard)}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
