"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import axios from "axios";
import { motion } from "framer-motion";
import { ArrowLeft, Clock, Loader2, Star, Tag, Ticket } from "lucide-react";

type DealRestaurant = {
  id: string;
  slug: string;
  name: string;
  cuisine: string;
  city: string | null;
  imageUrl: string | null;
  heroImageUrl: string | null;
  rating: number | null;
  ratingCount: number | null;
  deliveryFee: number;
  etaMinutes: number | null;
  isOpen: boolean;
  pausedUntil: string | null;
};

type DealDetail = {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  badgeText: string | null;
  popupHeadline: string | null;
  popupBody: string | null;
  popupCode: string | null;
  discountType: "PERCENTAGE" | "FIXED" | "FIXED_PRICE";
  discountValue: number;
  minOrder: number;
  validUntil: string | null;
  isGlobal: boolean;
  restaurantId: string | null;
  restaurant: { id: string; name: string; slug: string } | null;
};

export default function DealDetailPage() {
  const params = useParams();
  const id = String(params?.id || "");

  const [deal, setDeal] = useState<DealDetail | null>(null);
  const [restaurants, setRestaurants] = useState<DealRestaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    axios
      .get(`/api/platform/deals/${id}/restaurants`)
      .then((res) => {
        if (cancelled) return;
        setDeal(res.data?.deal || null);
        setRestaurants(res.data?.restaurants || []);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setError(e?.response?.data?.error || "Kunde inte hämta erbjudandet");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--bg-primary)" }}>
        <Loader2 className="animate-spin text-gold-500" size={36} />
      </div>
    );
  }

  if (error || !deal) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center" style={{ backgroundColor: "var(--bg-primary)" }}>
        <p className="text-2xl font-black uppercase italic" style={{ color: "var(--text-primary)" }}>
          Erbjudandet hittades inte
        </p>
        <Link href="/" className="mt-8 px-8 py-4 bg-gold-500 text-zinc-950 rounded-2xl font-black uppercase tracking-widest text-[10px]">
          Till startsidan
        </Link>
      </div>
    );
  }

  const headline = deal.popupHeadline || deal.title;
  const body = deal.popupBody || deal.description || "";
  const badge = deal.badgeText || (deal.discountType === "PERCENTAGE" ? `-${deal.discountValue}%` : `${deal.discountValue} kr`);
  const scopeLabel = deal.isGlobal
    ? "Gäller alla restauranger"
    : deal.restaurantId
      ? `Endast ${deal.restaurant?.name || "vald restaurang"}`
      : `Gäller ${restaurants.length} restauranger`;

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: "var(--bg-primary)" }}>
      <div className="mx-auto max-w-3xl px-4 pt-6 sm:px-6 sm:pt-8">
        <Link href="/" className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
          <ArrowLeft size={14} /> Tillbaka
        </Link>

        {/* Hero-card */}
        <div
          className="mt-6 rounded-[32px] overflow-hidden shadow-2xl"
          style={{
            background: "linear-gradient(180deg, #1a1f29 0%, #11151b 100%)",
            border: "1px solid rgba(243,191,87,0.3)",
          }}
        >
          {deal.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={deal.imageUrl} alt="" className="h-56 w-full object-cover" />
          ) : (
            <div className="h-56 w-full flex items-center justify-center text-7xl bg-[rgba(243,191,87,0.1)]">🎁</div>
          )}

          <div className="p-6 sm:p-8 text-white">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="rounded-full bg-[#f3bf57] px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#11151b]">
                {badge}
              </span>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">{scopeLabel}</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-[-0.04em]">{headline}</h1>
            {body ? <p className="mt-4 text-sm leading-7 text-white/80">{body}</p> : null}

            <div className="mt-5 flex flex-wrap gap-3">
              {deal.minOrder > 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-bold">
                  <Tag size={12} /> Min order {deal.minOrder} kr
                </span>
              ) : null}
              {deal.validUntil ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-bold">
                  <Clock size={12} /> T.o.m. {new Date(deal.validUntil).toLocaleDateString("sv-SE")}
                </span>
              ) : null}
            </div>

            {deal.popupCode ? (
              <div className="mt-5 rounded-2xl border border-dashed border-[#f3bf57]/40 bg-[#f3bf57]/10 px-4 py-3 text-center">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#f3bf57]">Använd kod</p>
                <p className="mt-1 text-xl font-black tracking-wider">{deal.popupCode}</p>
              </div>
            ) : null}
          </div>
        </div>

        {/* Restauranger som har dealen */}
        <div className="mt-10">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-500">Restauranger med detta erbjudande</p>
          <h2 className="mt-2 text-2xl font-black tracking-[-0.04em]" style={{ color: "var(--text-primary)" }}>
            {restaurants.length} {restaurants.length === 1 ? "restaurang" : "restauranger"}
          </h2>
        </div>

        {restaurants.length === 0 ? (
          <div className="mt-6 rounded-[24px] border border-dashed border-zinc-700/40 px-6 py-12 text-center text-sm text-zinc-400">
            Inga restauranger matchar erbjudandet just nu.
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {restaurants.map((r, index) => (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.04, 0.3) }}
              >
                <Link
                  href={`/r/${r.slug}`}
                  className="block relative h-full rounded-[24px] overflow-hidden transition-all hover:scale-[1.02]"
                  style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}
                >
                  {/* Deal-badge i hörnet — samma stil som på home */}
                  <div className="absolute top-4 -left-7 -rotate-45 z-10 bg-gold-500 text-zinc-950 px-9 py-1 shadow-lg">
                    <p className="text-[8px] font-black uppercase tracking-widest">{badge}</p>
                  </div>

                  <div className="h-32 w-full bg-zinc-900 relative">
                    {r.heroImageUrl || r.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.heroImageUrl || r.imageUrl || ""} alt={r.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-3xl">🍴</div>
                    )}
                  </div>
                  <div className="p-4">
                    <p className="text-base font-black tracking-[-0.02em]" style={{ color: "var(--text-primary)" }}>
                      {r.name}
                    </p>
                    <div className="mt-1 flex items-center gap-3 text-xs font-bold text-zinc-500">
                      {r.rating ? (
                        <span className="inline-flex items-center gap-1">
                          <Star size={11} className="fill-gold-500 text-gold-500" /> {r.rating.toFixed(1)}
                        </span>
                      ) : null}
                      {r.etaMinutes ? <span>~{r.etaMinutes} min</span> : null}
                      {r.cuisine ? <span>• {r.cuisine}</span> : null}
                    </div>
                    {!r.isOpen ? (
                      <span className="mt-2 inline-block rounded-full bg-rose-500/10 text-rose-400 px-2 py-1 text-[9px] font-black uppercase tracking-wider">
                        Stängd
                      </span>
                    ) : null}
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
