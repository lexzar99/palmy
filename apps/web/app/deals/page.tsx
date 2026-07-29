"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { ArrowRight, Gift, Truck } from "lucide-react";
import SmartImage from "@/components/SmartImage";

// Deals = rabatterade rätter från restaurangernas menyer (/api/menu/discounted).
// Sidan hämtade tidigare bara kampanj-endpointsen, som normalt är tomma — därför
// såg sidan tom ut trots att det fanns riktiga fynd. Rätterna grupperas per
// restaurang i varsin räls, med dyrast först eftersom det är där kunden sparar
// mest kronor.
type DiscountedProduct = {
  id: string;
  name: string;
  description?: string | null;
  originalPrice: number;
  discountPrice: number;
  discountPercent?: number | null;
  discountLabel?: string | null;
  imageUrl?: string | null;
  category?: string | null;
  restaurant: {
    id: string;
    slug: string;
    name: string;
    imageUrl?: string | null;
    heroImageUrl?: string | null;
    city?: string | null;
    cuisine?: string | null;
  };
};

type PublicDeal = {
  id: string;
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  badgeText?: string | null;
  isActive?: boolean;
  showOnSite?: boolean;
  discountType?: string | null;
  discountValue?: number | null;
  freeDelivery?: boolean;
  minOrder?: number | null;
  restaurant?: {
    name: string;
    slug: string;
    imageUrl?: string | null;
    heroImageUrl?: string | null;
  } | null;
};

type RestaurantRail = {
  slug: string;
  name: string;
  products: DiscountedProduct[];
  topPrice: number;
};

const formatNumber = (value: number) => value.toLocaleString("sv-SE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const kr = (value: number) => `${formatNumber(value)} kr`;

function percentOff(product: DiscountedProduct) {
  if (typeof product.discountPercent === "number" && product.discountPercent > 0) {
    return Math.round(product.discountPercent);
  }
  if (!product.originalPrice) return 0;
  return Math.max(0, Math.round(((product.originalPrice - product.discountPrice) / product.originalPrice) * 100));
}

function publicReward(deal: PublicDeal) {
  if (deal.discountType === "PERCENTAGE" && Number(deal.discountValue) > 0) {
    return `${formatNumber(Number(deal.discountValue))}% rabatt`;
  }
  if (["FIXED", "FIXED_PRICE"].includes(deal.discountType || "") && Number(deal.discountValue) > 0) {
    return `${kr(Number(deal.discountValue))} rabatt`;
  }
  return null;
}

export default function DealsPage() {
  const [products, setProducts] = useState<DiscountedProduct[]>([]);
  const [publicDeals, setPublicDeals] = useState<PublicDeal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      axios.get("/api/menu/discounted", { params: { _t: Date.now() } }),
      axios.get("/api/deals"),
    ]).then(([discountedResult, publicResult]) => {
      if (cancelled) return;
      if (discountedResult.status === "fulfilled") {
        setProducts(Array.isArray(discountedResult.value.data) ? discountedResult.value.data : []);
      }
      if (publicResult.status === "fulfilled") {
        setPublicDeals(Array.isArray(publicResult.value.data) ? publicResult.value.data : []);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const rails = useMemo<RestaurantRail[]>(() => {
    const byRestaurant = new Map<string, RestaurantRail>();
    for (const product of products) {
      if (!product?.restaurant?.slug) continue;
      const existing = byRestaurant.get(product.restaurant.slug) || {
        slug: product.restaurant.slug,
        name: product.restaurant.name,
        products: [],
        topPrice: 0,
      };
      existing.products.push(product);
      byRestaurant.set(product.restaurant.slug, existing);
    }
    return [...byRestaurant.values()]
      .map((rail) => {
        // Dyrast först: den rätten är det mest attraktiva fyndet i rälsen.
        rail.products.sort((a, b) => b.discountPrice - a.discountPrice || percentOff(b) - percentOff(a));
        rail.topPrice = rail.products[0]?.discountPrice ?? 0;
        return rail;
      })
      .sort((a, b) => b.topPrice - a.topPrice || a.name.localeCompare(b.name, "sv"));
  }, [products]);

  const campaignCards = useMemo(
    () => publicDeals.filter((deal) => deal.isActive !== false && deal.showOnSite !== false),
    [publicDeals],
  );

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] pb-32 text-[var(--ink)] md:pt-20">
      <div className="mx-auto max-w-6xl px-5 pb-8 pt-8 sm:px-6 lg:px-10">
        <header>
          <p className="text-[12px] font-black text-[var(--orange)]">VIAEATS DEALS</p>
          <h1 className="mt-1 text-[34px] font-black leading-none tracking-tight sm:text-5xl">Mer mat. Bättre pris.</h1>
        </header>

        {loading ? (
          <div className="mt-8 flex gap-4 overflow-hidden">
            {[1, 2, 3, 4].map((index) => <div key={index} className="skeleton h-56 w-[200px] shrink-0 rounded-[18px]" />)}
          </div>
        ) : rails.length === 0 && campaignCards.length === 0 ? (
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
          <div className="mt-8 space-y-9">
            {campaignCards.length > 0 && (
              <section>
                <h2 className="text-[20px] font-black">Kampanjer</h2>
                <div className="mt-3 flex gap-3 overflow-x-auto pb-2 no-scrollbar">
                  {campaignCards.map((deal) => {
                    const campaignImage = deal.restaurant?.heroImageUrl || deal.restaurant?.imageUrl || deal.imageUrl;
                    return (
                      <Link
                        key={deal.id}
                        href={`/deals/${deal.id}`}
                        className="relative flex min-h-[164px] w-[220px] shrink-0 flex-col overflow-hidden rounded-[20px] p-4 text-white"
                        style={{ background: campaignImage ? "#113A5C" : "linear-gradient(145deg,#F36A2E 0%,#C83F12 100%)" }}
                      >
                        {campaignImage ? <SmartImage src={campaignImage} alt={deal.restaurant?.name || deal.title} sizes="220px" className="absolute inset-0 h-full w-full object-cover" loading="lazy" /> : null}
                        {campaignImage ? <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/10" /> : null}
                        <span className="relative inline-flex min-h-7 w-fit items-center rounded-full bg-white/92 px-3 text-[10px] font-black uppercase text-[var(--ink)]">
                          {deal.badgeText || "Deal"}
                        </span>
                        <div className="relative mt-auto pt-5">
                          <h3 className="text-[18px] font-black leading-tight">{deal.title}</h3>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-black">
                            {publicReward(deal) && <span className="rounded-full bg-white/16 px-2.5 py-1.5">{publicReward(deal)}</span>}
                            {deal.freeDelivery && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-white/16 px-2.5 py-1.5">
                                <Truck size={12} /> Fri leverans
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}

            {rails.map((rail) => (
              <section key={rail.slug}>
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <h2 className="text-[20px] font-black leading-tight">{rail.name}</h2>
                  </div>
                  <Link
                    href={`/restaurants/${rail.slug}`}
                    className="inline-flex shrink-0 items-center gap-1 text-[13px] font-black text-[var(--orange)]"
                  >
                    Se menyn <ArrowRight size={15} />
                  </Link>
                </div>

                <div className="mt-3 flex gap-3 overflow-x-auto pb-2 no-scrollbar">
                  {rail.products.map((product) => {
                    const off = percentOff(product);
                    const restaurantImage = product.restaurant.heroImageUrl || product.restaurant.imageUrl || product.imageUrl;
                    const productImage = product.imageUrl || restaurantImage;
                    return (
                      <Link
                        key={product.id}
                        href={`/restaurants/${rail.slug}?product=${product.id}`}
                        className="w-[200px] shrink-0 overflow-hidden rounded-[18px] bg-white shadow-[0_8px_20px_rgba(17,17,19,0.08)]"
                      >
                        <div className="relative h-[116px] bg-[var(--cream,#FEF7F0)]">
                          {productImage ? (
                            <SmartImage src={productImage} alt={product.name} sizes="200px" className="h-full w-full object-cover" loading="lazy" />
                          ) : null}
                          {off > 0 && (
                            <span className="absolute left-3 top-3 rounded-full bg-[var(--orange)] px-2.5 py-1 text-[12px] font-black text-white">
                              −{off}%
                            </span>
                          )}
                        </div>
                        <div className="p-3">
                          <h3 className="line-clamp-2 min-h-[34px] text-[13px] font-black leading-tight">{product.name}</h3>
                          <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
                            {restaurantImage ? (
                              <span className="relative h-6 w-6 shrink-0 overflow-hidden rounded-full bg-[var(--bg-deep)]">
                                <SmartImage src={restaurantImage} alt="" sizes="24px" className="h-full w-full object-cover" loading="lazy" />
                              </span>
                            ) : null}
                            <span className="truncate text-[11px] font-bold text-[var(--muted)]">{rail.name}</span>
                          </div>
                          <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-[15px] font-black text-[var(--orange)]">{kr(product.discountPrice)}</span>
                            <span className="text-[11px] font-bold text-[var(--muted)] line-through">{kr(product.originalPrice)}</span>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
