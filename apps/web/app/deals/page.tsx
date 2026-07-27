"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { ArrowRight, BadgePercent, Gift, Truck } from "lucide-react";

type PublicDeal = {
  id: string;
  title: string;
  description?: string | null;
  badgeText?: string | null;
  isActive?: boolean;
  showOnSite?: boolean;
  discountType?: string | null;
  discountValue?: number | null;
  freeDelivery?: boolean;
  minOrder?: number | null;
  restaurant?: { name: string; slug: string } | null;
};

type AppDeal = {
  id: string;
  title: string;
  subtitle?: string | null;
  badge?: string | null;
  discountPercent?: number | null;
  amountKr?: number | null;
  freeDelivery?: boolean;
  minOrderKr?: number | null;
  restaurant?: { name: string; slug: string } | null;
};

type DealCard = {
  id: string;
  href: string | null;
  title: string;
  subtitle: string | null;
  badge: string | null;
  reward: string | null;
  freeDelivery: boolean;
  minOrder: number | null;
  restaurantName: string | null;
  tone: "orange" | "blue";
};

function publicReward(deal: PublicDeal) {
  if (deal.discountType === "PERCENTAGE" && Number(deal.discountValue) > 0) {
    return `${Number(deal.discountValue)}% rabatt`;
  }
  if (["FIXED", "FIXED_PRICE"].includes(deal.discountType || "") && Number(deal.discountValue) > 0) {
    return `${Number(deal.discountValue)} kr rabatt`;
  }
  return null;
}

export default function DealsPage() {
  const [publicDeals, setPublicDeals] = useState<PublicDeal[]>([]);
  const [appDeals, setAppDeals] = useState<AppDeal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      axios.get("/api/deals"),
      axios.get("/api/deals/app?placement=DEALS&limit=24&loggedIn=0"),
    ]).then(([publicResult, appResult]) => {
      if (cancelled) return;
      if (publicResult.status === "fulfilled") {
        setPublicDeals(Array.isArray(publicResult.value.data) ? publicResult.value.data : []);
      }
      if (appResult.status === "fulfilled") {
        setAppDeals(Array.isArray(appResult.value.data?.deals) ? appResult.value.data.deals : []);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const cards = useMemo<DealCard[]>(() => {
    const publicCards = publicDeals
      .filter((deal) => deal.isActive !== false && deal.showOnSite !== false)
      .map((deal): DealCard => ({
        id: `public-${deal.id}`,
        href: `/deals/${deal.id}`,
        title: deal.title,
        subtitle: deal.description || null,
        badge: deal.badgeText || null,
        reward: publicReward(deal),
        freeDelivery: Boolean(deal.freeDelivery || deal.discountType === "FREE_DELIVERY"),
        minOrder: typeof deal.minOrder === "number" ? deal.minOrder : null,
        restaurantName: deal.restaurant?.name || null,
        tone: "orange",
      }));
    const appCards = appDeals.map((deal, index): DealCard => ({
      id: `app-${deal.id}`,
      href: deal.restaurant?.slug ? `/restaurants/${deal.restaurant.slug}` : null,
      title: deal.title,
      subtitle: deal.subtitle || null,
      badge: deal.badge || null,
      reward:
        typeof deal.discountPercent === "number" && deal.discountPercent > 0
          ? `${deal.discountPercent}% rabatt`
          : typeof deal.amountKr === "number" && deal.amountKr > 0
            ? `${deal.amountKr} kr rabatt`
            : null,
      freeDelivery: Boolean(deal.freeDelivery),
      minOrder: typeof deal.minOrderKr === "number" ? deal.minOrderKr : null,
      restaurantName: deal.restaurant?.name || null,
      tone: index % 2 === 0 ? "blue" : "orange",
    }));
    return [...publicCards, ...appCards];
  }, [publicDeals, appDeals]);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] pb-32 text-[var(--ink)] md:pt-20">
      <div className="mx-auto max-w-6xl px-5 pb-8 pt-8 sm:px-6 lg:px-10">
        <header>
          <p className="text-[12px] font-black text-[var(--orange)]">VIAEATS DEALS</p>
          <h1 className="mt-1 text-[34px] font-black leading-none tracking-tight sm:text-5xl">Mer mat. Bättre pris.</h1>
          <p className="mt-3 max-w-xl text-[14px] font-semibold text-[var(--muted)]">
            Aktiva erbjudanden från ViaEats och restaurangerna.
          </p>
        </header>

        {loading ? (
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[1, 2, 3, 4].map((index) => <div key={index} className="skeleton h-56 rounded-[24px]" />)}
          </div>
        ) : cards.length === 0 ? (
          <section className="relative mt-8 overflow-hidden rounded-[28px] bg-[#EAF4FF] px-6 py-12 sm:px-10">
            <div className="absolute -right-10 -top-14 h-36 w-36 rounded-full bg-white/55" />
            <div className="relative max-w-md">
              <Gift size={28} strokeWidth={2.25} className="text-[#125B9D]" />
              <h2 className="mt-4 text-[25px] font-black leading-tight text-[#113A5C]">Inga deals just nu</h2>
              <p className="mt-2 text-[14px] font-semibold leading-relaxed text-[#41647E]">
                Nya erbjudanden landar här — titta in snart igen.
              </p>
              <Link href="/" className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-[var(--orange)] px-5 text-[14px] font-black text-white">
                Hitta mat <ArrowRight size={16} />
              </Link>
            </div>
          </section>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((card) => {
              const blue = card.tone === "blue";
              const content = (
                <article
                  className="relative flex min-h-[230px] flex-col overflow-hidden rounded-[24px] p-5 text-white shadow-[0_12px_28px_rgba(17,17,19,0.1)]"
                  style={{
                    background: blue
                      ? "linear-gradient(145deg,#1678D4 0%,#0D54A4 100%)"
                      : "linear-gradient(145deg,#F36A2E 0%,#C83F12 100%)",
                  }}
                >
                  <div className="absolute -right-9 -top-10 h-28 w-28 rounded-full bg-white/15" />
                  <div className="relative flex items-start justify-between gap-3">
                    <span className="inline-flex min-h-7 items-center rounded-full bg-white/92 px-3 text-[10px] font-black uppercase text-[var(--ink)]">
                      {card.badge || "Deal"}
                    </span>
                    {card.reward && <span className="rounded-full bg-white px-3 py-1.5 text-[12px] font-black text-[var(--ink)]">{card.reward}</span>}
                  </div>
                  <div className="relative mt-auto pt-8">
                    <h2 className="text-[22px] font-black leading-[1.05]">{card.title}</h2>
                    {card.subtitle && <p className="mt-2 line-clamp-2 text-[13px] font-semibold text-white/85">{card.subtitle}</p>}
                    <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] font-black">
                      {card.freeDelivery && <span className="inline-flex items-center gap-1 rounded-full bg-white/16 px-2.5 py-1.5"><Truck size={12} /> Fri leverans</span>}
                      {card.restaurantName && <span className="rounded-full bg-white/16 px-2.5 py-1.5">{card.restaurantName}</span>}
                      {typeof card.minOrder === "number" && card.minOrder > 0 && <span className="rounded-full bg-white/16 px-2.5 py-1.5">Min. {card.minOrder} kr</span>}
                      <ArrowRight size={19} className="ml-auto shrink-0 text-white" strokeWidth={2.7} />
                    </div>
                  </div>
                </article>
              );
              return card.href ? <Link key={card.id} href={card.href}>{content}</Link> : <div key={card.id}>{content}</div>;
            })}
          </div>
        )}

        {!loading && cards.length > 0 && (
          <div className="mt-6 flex items-center gap-2 rounded-[16px] bg-white px-4 py-3 text-[12px] font-bold text-[var(--muted)]">
            <BadgePercent size={16} className="text-[var(--orange)]" />
            Villkor och giltighet visas när du öppnar erbjudandet.
          </div>
        )}
      </div>
    </div>
  );
}
