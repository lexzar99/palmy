"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import axios from "axios";
import {
  ChevronRight,
  Clock,
  Search as SearchIcon,
  SearchX,
  Star,
  Store,
  Truck,
  Utensils,
  X,
} from "lucide-react";
import EmptyState from "@/components/EmptyState";
import SmartImage from "@/components/SmartImage";
import { API_URL } from "@/lib/api";

interface Restaurant {
  id: string;
  name: string;
  slug: string;
  cuisine?: string;
  description?: string;
  tags?: string[];
  tagIds?: string[];
  city?: string;
  imageUrl?: string;
  heroImageUrl?: string;
  rating?: number;
  ratingCount?: number;
  deliveryFee?: number;
  etaMinutes?: number;
  isOpen?: boolean;
  comingSoon?: boolean;
  pausedUntil?: string | null;
  homeDealMaxPercent?: number;
  homeFreeDelivery?: boolean;
  homeFreeDeliveryReason?: "BASE_FEE" | "ACTIVE_DEAL" | null;
}

interface PublicDeal {
  id: string;
  isActive?: boolean;
  showOnSite?: boolean;
  isGlobal?: boolean;
  restaurantId?: string | null;
  applicableRestaurantIds?: string[];
  discountType?: string | null;
  discountValue?: number | null;
  freeDelivery?: boolean;
  badgeText?: string | null;
}

type ZoneInfo = Record<string, { deliveryFee?: number; etaMinutes?: number | null }>;

type FeedTag = { id: string; name: string; slug: string };
type SearchHomeFeed = {
  version?: number;
  availableTags?: FeedTag[];
  sections?: {
    restaurants?: {
      id: string;
      tags?: FeedTag[];
      tagIds?: string[];
      metrics?: {
        actualAverageMinutesToday?: number | null;
        etaMinutes?: number | null;
        rating?: number | null;
        ratingCount?: number;
        deliveryFeeOre?: number;
        freeDelivery?: boolean;
        freeDeliveryReason?: "BASE_FEE" | "ACTIVE_DEAL" | null;
        dealMaxPercent?: number;
      };
    }[];
  }[];
};

function absoluteImage(path?: string) {
  if (!path) return "";
  return path.startsWith("/") ? `${API_URL}${path}` : path;
}

function titleCase(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(" ");
}

function restaurantTerms(restaurant: Restaurant) {
  const cuisineTerms = (restaurant.cuisine || "").split(/[,/&]+/);
  const city = (restaurant.city || "").trim().toLowerCase();
  return [...cuisineTerms, ...(restaurant.tags || [])]
    .map((term) => term.trim())
    .filter((term) => term.length > 2 && term.toLowerCase() !== city);
}

function isAvailableNow(restaurant: Restaurant, nowMs: number) {
  if (restaurant.comingSoon === true || restaurant.isOpen === false) return false;
  if (!restaurant.pausedUntil) return true;
  const pausedUntil = new Date(restaurant.pausedUntil).getTime();
  return !Number.isFinite(pausedUntil) || pausedUntil <= nowMs;
}

function dealForRestaurant(deals: PublicDeal[], restaurantId: string) {
  const eligible = deals.filter(
    (deal) =>
      deal.isActive !== false &&
      deal.showOnSite !== false &&
      (deal.isGlobal ||
        deal.restaurantId === restaurantId ||
        deal.applicableRestaurantIds?.includes(restaurantId)),
  );
  const maxPercent = eligible.reduce(
    (highest, deal) =>
      deal.discountType === "PERCENTAGE"
        ? Math.max(highest, Number(deal.discountValue) || 0)
        : highest,
    0,
  );
  const freeDelivery = eligible.some(
    (deal) =>
      deal.freeDelivery ||
      deal.discountType === "FREE_DELIVERY" ||
      (deal.badgeText || "").toLowerCase().includes("fri leverans"),
  );
  return { maxPercent, freeDelivery };
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [deals, setDeals] = useState<PublicDeal[]>([]);
  const [feedTags, setFeedTags] = useState<FeedTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [deliverableIds, setDeliverableIds] = useState<Set<string> | null>(null);
  const [zoneInfo, setZoneInfo] = useState<ZoneInfo>({});
  const [orderType, setOrderType] = useState<"DELIVERY" | "PICKUP">("DELIVERY");
  const [availabilityNow, setAvailabilityNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setAvailabilityNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      axios.get("/api/restaurants"),
      axios.get("/api/deals"),
      axios.get("/api/home-categories/feed"),
    ]).then(([restaurantResult, dealResult, feedResult]) => {
      if (cancelled) return;
      const baseRestaurants: Restaurant[] =
        restaurantResult.status === "fulfilled" && Array.isArray(restaurantResult.value.data)
          ? restaurantResult.value.data
          : [];
      const feed: SearchHomeFeed | null =
        feedResult.status === "fulfilled" && feedResult.value.data?.version === 1
          ? feedResult.value.data
          : null;
      const feedRestaurants = (feed?.sections || []).flatMap((section) => section.restaurants || []);
      const feedById = new Map(feedRestaurants.map((restaurant) => [restaurant.id, restaurant]));
      setFeedTags(Array.isArray(feed?.availableTags) ? feed!.availableTags! : []);
      setRestaurants(
        baseRestaurants.map((restaurant) => {
          const feedRestaurant = feedById.get(restaurant.id);
          const metrics = feedRestaurant?.metrics;
          const validReviewCount =
            typeof metrics?.ratingCount === "number" && metrics.ratingCount > 0
              ? metrics.ratingCount
              : restaurant.ratingCount;
          return {
            ...restaurant,
            tags:
              feedRestaurant?.tags?.map((tag) => tag.name) ||
              restaurant.tags ||
              [],
            tagIds: feedRestaurant?.tagIds || restaurant.tagIds,
            etaMinutes:
              typeof metrics?.actualAverageMinutesToday === "number" && metrics.actualAverageMinutesToday > 0
                ? metrics.actualAverageMinutesToday
                : typeof metrics?.etaMinutes === "number" && metrics.etaMinutes > 0
                  ? metrics.etaMinutes
                  : restaurant.etaMinutes,
            rating:
              typeof metrics?.rating === "number" && validReviewCount != null && validReviewCount > 0
                ? metrics.rating
                : restaurant.rating,
            ratingCount: validReviewCount,
            deliveryFee:
              typeof metrics?.deliveryFeeOre === "number"
                ? metrics.deliveryFeeOre / 100
                : restaurant.deliveryFee,
            homeDealMaxPercent:
              typeof metrics?.dealMaxPercent === "number" && metrics.dealMaxPercent > 0
                ? metrics.dealMaxPercent
                : undefined,
            homeFreeDelivery: metrics?.freeDelivery === true,
            homeFreeDeliveryReason: metrics?.freeDeliveryReason ?? null,
          };
        }),
      );
      if (dealResult.status === "fulfilled") {
        setDeals(Array.isArray(dealResult.value.data) ? dealResult.value.data : []);
      }
      setLoading(false);
    });

    try {
      const storedType = localStorage.getItem("platform_order_type");
      const nextOrderType = storedType === "PICKUP" ? "PICKUP" : "DELIVERY";
      queueMicrotask(() => {
        if (!cancelled) setOrderType(nextOrderType);
      });
      const coords = localStorage.getItem("platform_coords");
      if (coords && nextOrderType === "DELIVERY") {
        const { lat, lng } = JSON.parse(coords);
        axios
          .post("/api/cities/validate-location", { lat, lng })
          .then((res) => {
            if (cancelled) return;
            if (!res.data.covered) {
              setDeliverableIds(new Set());
              setZoneInfo({});
              return;
            }
            const cities = (res.data.cities || []) as {
              restaurants: {
                id: string;
                matchedZone?: {
                  deliveryFee?: number;
                  etaMinutes?: number | null;
                } | null;
              }[];
            }[];
            const rows = cities.flatMap((city) => city.restaurants || []);
            setDeliverableIds(new Set(rows.map((restaurant) => restaurant.id)));
            setZoneInfo(
              Object.fromEntries(
                rows
                  .filter((restaurant) => restaurant.matchedZone)
                  .map((restaurant) => [
                    restaurant.id,
                    {
                      deliveryFee:
                        typeof restaurant.matchedZone?.deliveryFee === "number"
                          ? restaurant.matchedZone.deliveryFee / 100
                          : undefined,
                      etaMinutes: restaurant.matchedZone?.etaMinutes,
                    },
                  ]),
              ),
            );
          })
          .catch(() => {
            if (!cancelled) {
              setDeliverableIds(null);
              setZoneInfo({});
            }
          });
      }
    } catch {
      // Ogiltig lokal adressdata: behåll fail-open-standarderna null/{}.
    }

    return () => {
      cancelled = true;
    };
  }, []);

  const categoryOptions = useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>();
    const categoryRestaurants =
      orderType === "DELIVERY" && deliverableIds !== null
        ? restaurants.filter((restaurant) => deliverableIds.has(restaurant.id))
        : restaurants;
    categoryRestaurants.forEach((restaurant) => {
      const seen = new Set<string>();
      restaurantTerms(restaurant).forEach((term) => {
        const key = term.toLocaleLowerCase("sv");
        if (seen.has(key)) return;
        seen.add(key);
        const current = counts.get(key);
        counts.set(key, {
          label: current?.label || titleCase(term),
          count: (current?.count || 0) + 1,
        });
      });
    });
    const available = new Map(feedTags.map((tag) => [tag.slug.toLocaleLowerCase("sv"), tag]));
    const options = [...counts.entries()]
      .map(([key, value]) => ({ key, ...value }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "sv"))
      .slice(0, 20);
    if (available.size === 0) return options;
    return options.filter((option) =>
      [...available.values()].some(
        (tag) =>
          tag.slug.toLocaleLowerCase("sv") === option.key ||
          tag.name.toLocaleLowerCase("sv") === option.key,
      ),
    );
  }, [restaurants, feedTags, orderType, deliverableIds]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("sv");
    const matches = restaurants.filter((restaurant) => {
      // Vald matkategori är ett leveransurval och får därför inte innehålla
      // restauranger utanför adressens zon. "Alla restauranger" behåller dem
      // synliga men dimmade längre ned.
      if (
        selectedTag &&
        orderType === "DELIVERY" &&
        deliverableIds !== null &&
        !deliverableIds.has(restaurant.id)
      ) {
        return false;
      }
      const terms = restaurantTerms(restaurant).map((term) => term.toLocaleLowerCase("sv"));
      const matchesTag = !selectedTag || terms.some((term) => term === selectedTag || term.includes(selectedTag));
      const haystack = [
        restaurant.name,
        restaurant.cuisine,
        restaurant.description,
        ...(restaurant.tags || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("sv");
      return matchesTag && (!normalizedQuery || haystack.includes(normalizedQuery));
    });
    return matches.sort((left, right) => {
      const leftInZone = orderType !== "DELIVERY" || deliverableIds === null || deliverableIds.has(left.id);
      const rightInZone = orderType !== "DELIVERY" || deliverableIds === null || deliverableIds.has(right.id);
      const leftRank = leftInZone && isAvailableNow(left, availabilityNow) ? 0 : leftInZone ? 1 : 2;
      const rightRank = rightInZone && isAvailableNow(right, availabilityNow) ? 0 : rightInZone ? 1 : 2;
      return leftRank - rightRank || left.name.localeCompare(right.name, "sv");
    });
  }, [query, selectedTag, restaurants, orderType, deliverableIds, availabilityNow]);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] pb-32 text-[var(--ink)] md:pt-20">
      <div className="mx-auto max-w-6xl px-5 pb-8 pt-8 sm:px-6 lg:px-10">
        <header>
          <p className="text-[12px] font-black text-[var(--orange)]">SÖK</p>
          <h1 className="mt-1 text-[32px] font-black leading-[1.02] tracking-tight sm:text-5xl">
            Vad är du sugen på?
          </h1>
          <p className="mt-2 text-[14px] font-semibold text-[var(--muted)]">
            Välj en tagg eller sök direkt.
          </p>

          <label className="mt-5 flex h-[58px] items-center gap-3 rounded-[18px] border border-[var(--line)] bg-white px-4 shadow-[0_8px_22px_rgba(17,17,19,0.06)]">
            <SearchIcon size={21} strokeWidth={2.4} className="shrink-0 text-[var(--orange)]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Restaurang, pizza, kebab..."
              className="h-full min-w-0 flex-1 bg-transparent text-[16px] font-bold outline-none placeholder:text-[var(--muted)]"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Rensa sök" className="grid h-9 w-9 place-items-center rounded-full bg-[var(--bg-deep)] text-[var(--muted)]">
                <X size={16} />
              </button>
            )}
          </label>
        </header>

        {!loading && categoryOptions.length > 0 && (
          <section className="mt-7" aria-labelledby="food-tags-title">
            <div className="mb-3 flex items-end justify-between">
              <h2 id="food-tags-title" className="text-[20px] font-black">Matkategorier</h2>
              {selectedTag && (
                <button type="button" onClick={() => setSelectedTag("")} className="text-[13px] font-black text-[var(--orange)]">
                  Visa alla
                </button>
              )}
            </div>
            {/* Exakt två rader som rullar i sidled. Ett rutnät som växer nedåt
                sköt ner restaurangerna under vikningen så fort menyerna hade
                många taggar. */}
            <div className="-mx-5 overflow-x-auto px-5 pb-2 no-scrollbar sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
              <div
                className="grid gap-2.5"
                style={{ gridTemplateRows: "repeat(2, minmax(0, 1fr))", gridAutoFlow: "column", gridAutoColumns: "148px" }}
              >
                {categoryOptions.map((category) => {
                  const active = selectedTag === category.key;
                  return (
                    <button
                      key={category.key}
                      type="button"
                      onClick={() => setSelectedTag(active ? "" : category.key)}
                      aria-pressed={active}
                      className="flex h-[76px] flex-col justify-center rounded-[16px] px-3.5 text-left transition-[background-color,box-shadow] active:scale-[0.99]"
                      style={{
                        backgroundColor: active ? "var(--orange)" : "var(--bg-secondary)",
                        color: active ? "#fff" : "var(--ink)",
                        boxShadow: active
                          ? "inset 0 0 0 1px var(--orange)"
                          : "inset 0 0 0 1px var(--border-muted)",
                      }}
                    >
                      <span className="line-clamp-1 text-[15.5px] font-black leading-[1.1] tracking-[-0.02em]">
                        {category.label}
                      </span>
                      <span
                        className="mt-1 text-[11.5px] font-bold"
                        style={{ color: active ? "rgba(255,255,255,0.82)" : "var(--muted)" }}
                      >
                        {category.count === 1 ? "1 ställe" : `${category.count} ställen`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        <section className="mt-8">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-[21px] font-black">
                {selectedTag
                  ? categoryOptions.find((category) => category.key === selectedTag)?.label || "Resultat"
                  : query.trim()
                    ? `Resultat för ”${query.trim()}”`
                    : "Alla restauranger"}
              </h2>
              {!loading && <p className="mt-0.5 text-[12px] font-bold text-[var(--muted)]">{filtered.length} restauranger</p>}
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[1, 2, 3, 4].map((index) => <div key={index} className="skeleton h-[142px] rounded-[20px]" />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={query || selectedTag ? SearchX : Utensils}
              title="Inga restauranger matchar"
              text="Prova en annan tagg eller sökning."
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {filtered.map((restaurant) => {
                const inZone = orderType !== "DELIVERY" || deliverableIds === null || deliverableIds.has(restaurant.id);
                const available = inZone && isAvailableNow(restaurant, availabilityNow);
                const zone = zoneInfo[restaurant.id];
                const eta = zone?.etaMinutes ?? restaurant.etaMinutes;
                const fee = zone?.deliveryFee ?? restaurant.deliveryFee;
                const deal = dealForRestaurant(deals, restaurant.id);
                const maxDiscountPercent = Math.max(deal.maxPercent, restaurant.homeDealMaxPercent || 0);
                const activeDealFreeDelivery =
                  deal.freeDelivery || restaurant.homeFreeDeliveryReason === "ACTIVE_DEAL";
                const hasFreeDelivery =
                  inZone && (
                    activeDealFreeDelivery ||
                    (typeof zone?.deliveryFee === "number"
                      ? zone.deliveryFee <= 0
                      : restaurant.homeFreeDelivery === true ||
                        (typeof restaurant.deliveryFee === "number" && restaurant.deliveryFee <= 0))
                  );
                const hasReviews =
                  typeof restaurant.rating === "number" &&
                  Number.isFinite(restaurant.rating) &&
                  typeof restaurant.ratingCount === "number" &&
                  restaurant.ratingCount > 0;
                return (
                  <Link
                    key={restaurant.id}
                    href={`/restaurants/${restaurant.slug}`}
                    className={`group overflow-hidden rounded-[20px] border border-[var(--line)] bg-white shadow-[0_8px_22px_rgba(17,17,19,0.06)] ${available ? "" : "opacity-55 grayscale"}`}
                  >
                    <div className="flex min-h-[142px]">
                      <div className="relative w-[38%] shrink-0 overflow-hidden bg-[var(--bg-deep)]">
                        {restaurant.heroImageUrl || restaurant.imageUrl ? (
                          <SmartImage
                            src={absoluteImage(restaurant.heroImageUrl || restaurant.imageUrl)}
                            alt={restaurant.name}
                            sizes="(max-width: 640px) 38vw, 220px"
                            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                        ) : (
                          <div className="grid h-full place-items-center text-[var(--muted)]"><Utensils size={28} /></div>
                        )}
                        {(maxDiscountPercent > 0 || hasFreeDelivery) && (
                          <div className="absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] flex-wrap gap-1">
                            {maxDiscountPercent > 0 && <span className="rounded-md bg-[var(--orange)] px-2 py-1 text-[10px] font-black text-white">Upp till {maxDiscountPercent}%</span>}
                            {hasFreeDelivery && <span className="rounded-md bg-[#2E7D4F] px-2 py-1 text-[10px] font-black text-white">Fri leverans</span>}
                          </div>
                        )}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col p-3.5">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <h3 className="line-clamp-2 text-[17px] font-black leading-tight">{restaurant.name}</h3>
                            {(restaurant.cuisine || restaurant.city) && (
                              <p className="mt-1 truncate text-[12px] font-semibold text-[var(--muted)]">{restaurant.cuisine || restaurant.city}</p>
                            )}
                          </div>
                          <ChevronRight size={18} className="mt-0.5 shrink-0 text-[var(--muted)]" />
                        </div>
                        <div className="mt-auto flex flex-wrap items-center gap-x-2.5 gap-y-1.5 pt-3 text-[11px] font-bold text-[var(--muted)]">
                          {hasReviews && (
                            <span className="flex items-center gap-1 text-[var(--ink)]">
                              <Star size={11} className="fill-[var(--orange)] text-[var(--orange)]" />
                              {restaurant.rating!.toFixed(1)} ({restaurant.ratingCount})
                            </span>
                          )}
                          {orderType === "DELIVERY" && inZone && typeof eta === "number" && Number.isFinite(eta) && (
                            <span className="flex items-center gap-1"><Clock size={11} /> {Math.round(eta)} min</span>
                          )}
                          {orderType === "DELIVERY" && inZone && (hasFreeDelivery || (typeof fee === "number" && Number.isFinite(fee))) && (
                            <span className="flex items-center gap-1"><Truck size={11} /> {hasFreeDelivery || (typeof fee === "number" && fee <= 0) ? "Fri leverans" : `${Math.round(fee as number)} kr`}</span>
                          )}
                          {orderType === "PICKUP" && <span className="flex items-center gap-1"><Store size={11} /> Hämta själv</span>}
                          {!inZone && <span className="text-rose-600">Levererar inte till din adress</span>}
                          {typeof restaurant.isOpen === "boolean" && (
                            <span className={`rounded-full px-2 py-1 text-[9px] font-black ${available ? "bg-[#EAF7EF] text-[#246B43]" : "bg-[var(--bg-deep)] text-[var(--muted)]"}`}>
                              {available ? "Öppet" : restaurant.comingSoon ? "Kommer snart" : "Stängt"}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
