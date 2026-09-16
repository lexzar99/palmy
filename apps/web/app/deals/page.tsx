"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { ArrowRight, Bike, ChevronRight, Tag } from "lucide-react";
import PlainImage from "@/components/restaurant/PlainImage";
import { useDesignBackground } from "@/components/restaurant/useDesignBackground";
import "@/components/restaurant/restaurant.css";

// Deals = rabatterade rätter från restaurangernas menyer (/api/menu/discounted)
// plus aktiva kampanjer (/api/deals). Rätterna grupperas per restaurang i
// varsin räls, dyrast först eftersom det är där kunden sparar mest kronor.
// Formgivning enligt docs/DESIGN_SYSTEM.md: grå sida, vita kort, bläck som
// enda textfärg, orange bara som liten rabattmarkering.
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
  restaurant: DiscountedProduct["restaurant"];
  products: DiscountedProduct[];
  topPrice: number;
};

const kr = (value: number) => `${Number.isInteger(value) ? value : value.toFixed(2).replace(".", ",")} kr`;

function percentOff(product: DiscountedProduct) {
  if (typeof product.discountPercent === "number" && product.discountPercent > 0) return Math.round(product.discountPercent);
  if (!product.originalPrice) return 0;
  return Math.max(0, Math.round(((product.originalPrice - product.discountPrice) / product.originalPrice) * 100));
}

function publicReward(deal: PublicDeal) {
  if (deal.discountType === "PERCENTAGE" && Number(deal.discountValue) > 0) return `${Math.round(Number(deal.discountValue))} % rabatt`;
  if (["FIXED", "FIXED_PRICE"].includes(deal.discountType || "") && Number(deal.discountValue) > 0) return `${kr(Number(deal.discountValue))} rabatt`;
  return null;
}

const hairline = "inset 0 0 0 0.5px var(--ve-line)";

export default function DealsPage() {
  useDesignBackground();
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
    return () => { cancelled = true; };
  }, []);

  const rails = useMemo<RestaurantRail[]>(() => {
    const byRestaurant = new Map<string, RestaurantRail>();
    for (const product of products) {
      if (!product?.restaurant?.slug) continue;
      const existing = byRestaurant.get(product.restaurant.slug) || {
        slug: product.restaurant.slug,
        name: product.restaurant.name,
        restaurant: product.restaurant,
        products: [],
        topPrice: 0,
      };
      existing.products.push(product);
      byRestaurant.set(product.restaurant.slug, existing);
    }
    return [...byRestaurant.values()]
      .map((rail) => {
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

  const dealCount = products.length;

  return (
    <div className="ve-root min-h-screen pb-32 md:pt-20">
      <div className="mx-auto max-w-[680px] px-4 pt-[calc(env(safe-area-inset-top,0px)+16px)] md:pt-8">
        <header className="px-1">
          <h1 className="m-0 text-[28px] font-semibold leading-[1.1]" style={{ letterSpacing: "-0.025em", color: "var(--ve-ink)" }}>Deals</h1>
          <p className="m-0 mt-1.5 text-[15px]" style={{ color: "var(--ve-ink-2)" }}>
            {loading
              ? "Sänkta priser från restaurangerna nära dig."
              : dealCount > 0
                ? `${dealCount} ${dealCount === 1 ? "rätt" : "rätter"} till sänkt pris just nu.`
                : "Sänkta priser från restaurangerna nära dig."}
          </p>
        </header>

        {loading ? (
          <div className="mt-6 space-y-8">
            {[0, 1].map((i) => (
              <div key={i}>
                <div className="flex items-center gap-3 px-1 mb-3">
                  <div className="ve-skeleton h-10 w-10 rounded-[12px]" />
                  <div className="ve-skeleton h-5 w-40 rounded-md" />
                </div>
                <div className="ve-no-scrollbar -mx-4 px-4 flex gap-3 overflow-hidden">
                  {[0, 1, 2].map((j) => <div key={j} className="ve-skeleton h-[212px] w-[156px] shrink-0 rounded-[18px]" />)}
                </div>
              </div>
            ))}
          </div>
        ) : rails.length === 0 && campaignCards.length === 0 ? (
          <section className="ve-card mt-6 px-6 py-12 text-center">
            <div className="mx-auto w-14 h-14 rounded-full grid place-items-center mb-4" style={{ backgroundColor: "var(--ve-fill)" }}>
              <Tag size={22} strokeWidth={2} style={{ color: "var(--ve-ink-3)" }} />
            </div>
            <h2 className="m-0 text-[20px] font-semibold" style={{ letterSpacing: "-0.02em", color: "var(--ve-ink)" }}>Inga deals just nu</h2>
            <p className="m-0 mt-1.5 text-[15px] max-w-xs mx-auto" style={{ color: "var(--ve-ink-2)" }}>
              Så fort en restaurang sänker priset på en rätt dyker den upp här.
            </p>
            <Link href="/" className="ve-press mt-6 inline-flex h-12 items-center gap-2 rounded-full px-6 text-[16px] font-semibold" style={{ backgroundColor: "var(--ve-cta)", color: "var(--ve-cta-ink)" }}>
              Hitta mat <ArrowRight size={16} />
            </Link>
          </section>
        ) : (
          <div className="mt-6 space-y-9">
            {campaignCards.length > 0 && (
              <section>
                <h2 className="m-0 px-1 mb-3 text-[17px] font-semibold" style={{ letterSpacing: "-0.015em", color: "var(--ve-ink)" }}>Kampanjer</h2>
                <div className="ve-no-scrollbar -mx-4 px-4 flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory">
                  {campaignCards.map((deal) => {
                    const image = deal.imageUrl || deal.restaurant?.heroImageUrl || deal.restaurant?.imageUrl;
                    const reward = publicReward(deal);
                    return (
                      <Link
                        key={deal.id}
                        href={`/deals/${deal.id}`}
                        className="ve-press ve-card w-[248px] shrink-0 snap-start overflow-hidden flex flex-col"
                        style={{ boxShadow: `${hairline}, var(--ve-shadow-card)` }}
                      >
                        <span className="relative block w-full overflow-hidden" style={{ aspectRatio: "16 / 9", backgroundColor: "var(--ve-fill)" }}>
                          {image ? <PlainImage src={image} alt="" width={640} className="absolute inset-0 h-full w-full object-cover" /> : null}
                          <span className="absolute left-2.5 top-2.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold" style={{ backgroundColor: "rgba(255,255,255,0.92)", color: "var(--ve-ink)" }}>
                            {deal.badgeText || "Kampanj"}
                          </span>
                        </span>
                        <span className="flex flex-col gap-1.5 px-4 pt-3 pb-3.5">
                          <span className="line-clamp-2 text-[16px] font-semibold leading-snug" style={{ letterSpacing: "-0.015em", color: "var(--ve-ink)" }}>{deal.title}</span>
                          {deal.restaurant?.name && <span className="text-[13px] truncate" style={{ color: "var(--ve-ink-3)" }}>{deal.restaurant.name}</span>}
                          {(reward || deal.freeDelivery) && (
                            <span className="mt-1 flex flex-wrap gap-1.5">
                              {reward && <span className="rounded-full px-2.5 py-1 text-[12px] font-semibold" style={{ backgroundColor: "var(--ve-accent-soft)", color: "var(--ve-accent)" }}>{reward}</span>}
                              {deal.freeDelivery && <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold" style={{ backgroundColor: "var(--ve-success-soft)", color: "var(--ve-success)" }}><Bike size={12} strokeWidth={2.2} /> Fri leverans</span>}
                            </span>
                          )}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}

            {rails.map((rail) => {
              const logo = rail.restaurant.imageUrl || rail.restaurant.heroImageUrl || "";
              const subtitle = [rail.restaurant.cuisine, rail.restaurant.city].map((part) => (part || "").trim()).filter(Boolean).join(" · ");
              return (
                <section key={rail.slug}>
                  {/* Restaurangrad: logga · namn + kök/stad · "Se menyn" */}
                  <Link href={`/restaurants/${rail.slug}`} className="ve-press flex items-center gap-3 px-1 mb-3">
                    <span className="relative w-11 h-11 rounded-[13px] overflow-hidden shrink-0 grid place-items-center" style={{ backgroundColor: "#fff", boxShadow: hairline }}>
                      {logo ? <PlainImage src={logo} alt="" width={128} className="absolute inset-0 w-full h-full object-cover" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[17px] font-semibold truncate" style={{ letterSpacing: "-0.015em", color: "var(--ve-ink)" }}>{rail.name}</span>
                      {subtitle && <span className="block text-[13px] truncate" style={{ color: "var(--ve-ink-3)" }}>{subtitle}</span>}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[14px] font-medium shrink-0" style={{ color: "var(--ve-ink-2)" }}>
                      Se menyn <ChevronRight size={16} strokeWidth={2.2} />
                    </span>
                  </Link>

                  <div className="ve-no-scrollbar -mx-4 px-4 flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory">
                    {rail.products.map((product) => {
                      const off = percentOff(product);
                      const image = product.imageUrl || product.restaurant.heroImageUrl || product.restaurant.imageUrl;
                      return (
                        <Link
                          key={product.id}
                          href={`/restaurants/${rail.slug}?product=${product.id}`}
                          className="ve-press ve-card w-[156px] shrink-0 snap-start overflow-hidden flex flex-col"
                          style={{ boxShadow: `${hairline}, var(--ve-shadow-card)` }}
                        >
                          <span className="relative block w-full overflow-hidden" style={{ aspectRatio: "4 / 3", backgroundColor: "#EBEBEE" }}>
                            {image ? <PlainImage src={image} alt={product.name} width={384} className="absolute inset-0 h-full w-full object-cover" /> : null}
                            {off > 0 && (
                              <span className="ve-tabular absolute left-2 top-2 rounded-full px-2 py-[3px] text-[11.5px] font-semibold" style={{ backgroundColor: "rgba(255,255,255,0.92)", color: "var(--ve-accent)" }}>
                                −{off} %
                              </span>
                            )}
                          </span>
                          <span className="flex flex-col gap-1 px-3 pt-2.5 pb-3">
                            <span className="line-clamp-2 min-h-[36px] text-[13.5px] font-semibold leading-[18px]" style={{ letterSpacing: "-0.01em", color: "var(--ve-ink)" }}>{product.name}</span>
                            <span className="ve-tabular flex items-baseline gap-1.5">
                              <span className="text-[14px] font-semibold" style={{ color: "var(--ve-ink)" }}>{kr(product.discountPrice)}</span>
                              <span className="text-[12px] line-through" style={{ color: "var(--ve-ink-3)" }}>{kr(product.originalPrice)}</span>
                            </span>
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
