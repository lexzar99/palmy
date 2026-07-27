"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { ArrowRight, BadgePercent, Gift, Truck } from "lucide-react";

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
    city?: string | null;
    cuisine?: string | null;
  };
};

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

type RestaurantRail = {
  slug: string;
  name: string;
  cuisine: string | null;
  products: DiscountedProduct[];
  topPrice: number;
  totalSaved: number;
};

const kr = (value: number) => `${Math.round(value)} kr`;

function percentOff(product: DiscountedProduct) {
  if (typeof product.discountPercent === "number" && product.discountPercent > 0) {
    return Math.round(product.discountPercent);
  }
  if (!product.originalPrice) return 0;
  return Math.max(0, Math.round(((product.originalPrice - product.discountPrice) / product.originalPrice) * 100));
}

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
        cuisine: product.restaurant.cuisine || null,
        products: [],
        topPrice: 0,
        totalSaved: 0,
      };
      existing.products.push(product);
      byRestaurant.set(product.restaurant.slug, existing);
    }
    return [...byRestaurant.values()]
      .map((rail) => {
        // Dyrast först: den rätten är det mest attraktiva fyndet i rälsen.
        rail.products.sort((a, b) => b.discountPrice - a.discountPrice || percentOff(b) - percentOff(a));
        rail.topPrice = rail.products[0]?.discountPrice ?? 0;
        rail.totalSaved = rail.products.reduce((sum, p) => sum + Math.max(0, p.originalPrice - p.discountPrice), 0);
        return rail;
      })
      .sort((a, b) => b.topPrice - a.topPrice || a.name.localeCompare(b.name, "sv"));
  }, [products]);

  const campaignCards = useMemo(
    () => publicDeals.filter((deal) => deal.isActive !== false && deal.showOnSite !== false),
    [publicDeals],
  );

  const totalSaved = useMemo(
    () => rails.reduce((sum, rail) => sum + rail.totalSaved, 0),
    [rails],
  );

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] pb-32 text-[var(--ink)] md:pt-20">
      <div className="mx-auto max-w-6xl px-5 pb-8 pt-8 sm:px-6 lg:px-10">
        <header>
          <p className="text-[12px] font-black text-[var(--orange)]">VIAEATS DEALS</p>
          <h1 className="mt-1 text-[34px] font-black leading-none tracking-tight sm:text-5xl">Mer mat. Bättre pris.</h1>
          <p className="mt-3 max-w-xl text-[14px] font-semibold text-[var(--muted)]">
            Rabatterade rätter från lokala restauranger — just nu.
          </p>
          {!loading && totalSaved > 0 && (
            <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#12855A] px-3.5 py-2 text-[12px] font-black text-white">
              <BadgePercent size={14} /> Spara upp till {kr(totalSaved)}
            </span>
          )}
        </header>

        {loading ? (
          <div className="mt-8 flex gap-4 overflow-hidden">
            {[1, 2, 3, 4].map((index) => <div key={index} className="skeleton h-64 w-[240px] shrink-0 rounded-[24px]" />)}
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
                <div className="mt-3 flex gap-4 overflow-x-auto pb-2 no-scrollbar">
                  {campaignCards.map((deal) => (
                    <Link
                      key={deal.id}
                      href={`/deals/${deal.id}`}
                      className="relative flex min-h-[190px] w-[280px] shrink-0 flex-col overflow-hidden rounded-[24px] p-5 text-white"
                      style={{ background: "linear-gradient(145deg,#F36A2E 0%,#C83F12 100%)" }}
                    >
                      <span className="inline-flex min-h-7 w-fit items-center rounded-full bg-white/92 px-3 text-[10px] font-black uppercase text-[var(--ink)]">
                        {deal.badgeText || "Deal"}
                      </span>
                      <div className="mt-auto pt-6">
                        <h3 className="text-[20px] font-black leading-tight">{deal.title}</h3>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-black">
                          {publicReward(deal) && <span className="rounded-full bg-white/16 px-2.5 py-1.5">{publicReward(deal)}</span>}
                          {deal.freeDelivery && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-white/16 px-2.5 py-1.5">
                              <Truck size={12} /> Fri leverans
                            </span>
                          )}
                          {deal.restaurant?.name && <span className="rounded-full bg-white/16 px-2.5 py-1.5">{deal.restaurant.name}</span>}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {rails.map((rail) => (
              <section key={rail.slug}>
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <h2 className="text-[20px] font-black leading-tight">{rail.name}</h2>
                    <p className="text-[13px] font-semibold text-[var(--muted)]">
                      {rail.products.length} {rail.products.length === 1 ? "rätt" : "rätter"} till rabatterat pris
                      {rail.cuisine ? ` · ${rail.cuisine}` : ""}
                    </p>
                  </div>
                  <Link
                    href={`/restaurants/${rail.slug}`}
                    className="inline-flex shrink-0 items-center gap-1 text-[13px] font-black text-[var(--orange)]"
                  >
                    Se menyn <ArrowRight size={15} />
                  </Link>
                </div>

                <div className="mt-3 flex gap-4 overflow-x-auto pb-2 no-scrollbar">
                  {rail.products.map((product) => {
                    const off = percentOff(product);
                    return (
                      <Link
                        key={product.id}
                        href={`/restaurants/${rail.slug}?product=${product.id}`}
                        className="w-[240px] shrink-0 overflow-hidden rounded-[24px] bg-white shadow-[0_12px_28px_rgba(17,17,19,0.08)]"
                      >
                        <div className="relative h-[150px] bg-[var(--cream,#FEF7F0)]">
                          {product.imageUrl ? (
                            // Rätterna ligger på R2 i olika format; vanlig img undviker
                            // loader-konfiguration för varje ny bucket-domän.
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" loading="lazy" />
                          ) : null}
                          {off > 0 && (
                            <span className="absolute left-3 top-3 rounded-full bg-[var(--orange)] px-2.5 py-1 text-[12px] font-black text-white">
                              −{off}%
                            </span>
                          )}
                        </div>
                        <div className="p-3.5">
                          <h3 className="line-clamp-2 min-h-[38px] text-[14px] font-black leading-tight">{product.name}</h3>
                          <p className="mt-1 truncate text-[11.5px] font-bold text-[var(--muted)]">{rail.name}</p>
                          <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-[16px] font-black text-[var(--orange)]">{kr(product.discountPrice)}</span>
                            <span className="text-[12px] font-bold text-[var(--muted)] line-through">{kr(product.originalPrice)}</span>
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

        {!loading && (rails.length > 0 || campaignCards.length > 0) && (
          <div className="mt-8 flex items-center gap-2 rounded-[16px] bg-white px-4 py-3 text-[12px] font-bold text-[var(--muted)]">
            <BadgePercent size={16} className="text-[var(--orange)]" />
            Priser gäller så länge restaurangen har erbjudandet aktivt.
          </div>
        )}
      </div>
    </div>
  );
}
