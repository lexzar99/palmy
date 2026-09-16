"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import axios from "axios";
import {
  Bike,
  ChevronRight,
  Clock,
  Search as SearchIcon,
  SearchX,
  Star,
  Store,
  Utensils,
  X,
} from "lucide-react";
import PlainImage from "@/components/restaurant/PlainImage";
import { useDesignBackground } from "@/components/restaurant/useDesignBackground";
import { API_URL } from "@/lib/api";
import "@/components/restaurant/restaurant.css";

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

// Kategoriraden är en genväg, inte en katalog. Åtta räcker för att täcka
// det folk faktiskt letar efter utan att raden blir egen scrollsträcka.
const CATEGORY_LIMIT = 8;

/** Ordstam för lös matchning: "pizza" ska hitta "Husets pizzor". */
function categoryStem(label: string) {
  return label.trim().toLocaleLowerCase("sv").slice(0, 4);
}

/**
 * Menyavdelningar heter sällan samma sak som matkategorin. Synonymerna låter
 * "Familj" hitta Barnmenyn och "Bowls" hitta salladen när grillavdelningen
 * redan tagits. Ordningen är prioritetsordning — första träffen är bäst.
 */
const CATEGORY_SYNONYMS: Record<string, string[]> = {
  bowl: ["bowl", "salla", "poke"],
  gril: ["gril", "keba", "spett"],
  pizz: ["pizz"],
  burg: ["burg", "crisp"],
  past: ["past"],
  sush: ["sush", "maki"],
  vege: ["vege", "falaf", "hallo"],
  kyck: ["kyck"],
  dess: ["dess", "efter"],
  dryc: ["dryc", "läsk"],
};

/**
 * Bilder som bär en synlig "Referensbild"-stämpel duger inte som
 * kategoribild. Stämpeln ligger i själva bildfilen, så den går inte att
 * upptäcka i data — nyckeln nedan är därför versionshashen för den enskilda
 * fil som är stämplad. Byts bilden i admin får den ny hash och undantaget
 * upphör av sig självt. Den varaktiga fixen är att ladda upp en riktig bild.
 */
const PLACEHOLDER_IMAGE_MARKERS = ["v=1017d78bc4"];

function isPlaceholderImage(url: string) {
  return PLACEHOLDER_IMAGE_MARKERS.some((marker) => url.includes(marker));
}

function matchTerms(label: string) {
  const stem = categoryStem(label);
  return Array.from(new Set([stem, ...(CATEGORY_SYNONYMS[stem] || [])]));
}

/**
 * Hur väl ett namn matchar. En avdelning som *börjar* med ordet är en bättre
 * träff än en som råkar nämna det sist: "Grill & bowls" hör till Grill, inte
 * till Bowls. Högre är bättre, null = ingen träff.
 */
function matchScore(text: string, terms: string[]): number | null {
  const words = text.toLocaleLowerCase("sv").split(/[^a-zåäöéü0-9]+/).filter(Boolean);
  let best: number | null = null;
  terms.forEach((term, termIndex) => {
    const wordIndex = words.findIndex((word) => word.startsWith(term));
    if (wordIndex === -1) return;
    const score = 1000 - termIndex * 100 - wordIndex * 10;
    if (best === null || score > best) best = score;
  });
  return best;
}

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
  useDesignBackground();
  const [query, setQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [deals, setDeals] = useState<PublicDeal[]>([]);
  const [feedTags, setFeedTags] = useState<FeedTag[]>([]);
  const [categoryImages, setCategoryImages] = useState<Record<string, string>>({});
  const [loadedCategoryImages, setLoadedCategoryImages] = useState<Record<string, boolean>>({});
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
    // Restaurangen sparas med kategorin: dess meny får ge kategorin sin bild.
    const counts = new Map<string, { label: string; count: number; restaurant: Restaurant }>();
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
          restaurant: current?.restaurant || restaurant,
        });
      });
    });
    const available = new Map(feedTags.map((tag) => [tag.slug.toLocaleLowerCase("sv"), tag]));
    const options = [...counts.entries()]
      .map(([key, value]) => ({ key, ...value }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "sv"));
    const allowed = available.size === 0
      ? options
      : options.filter((option) =>
          [...available.values()].some(
            (tag) =>
              tag.slug.toLocaleLowerCase("sv") === option.key ||
              tag.name.toLocaleLowerCase("sv") === option.key,
          ),
        );
    // Ett tak, inte en obegränsad rad. Fler än så blir en vägg att scrolla
    // förbi i stället för en genväg — de vanligaste kategorierna räcker.
    return allowed.slice(0, CATEGORY_LIMIT);
  }, [restaurants, feedTags, orderType, deliverableIds]);

  // Varje kategori får sin bild från en riktig rätt i restaurangens meny —
  // pizza visar en pizza, bowls en bowl. Menyn hämtas en gång per restaurang
  // och först efter att korten redan renderats, så raden aldrig blockerar
  // sidan. Hittas ingen passande rätt faller kortet tillbaka på restaurangens
  // egen bild, och i sista hand på ren typografi.
  useEffect(() => {
    if (categoryOptions.length === 0) return;
    let cancelled = false;

    const bySlug = new Map<string, typeof categoryOptions>();
    categoryOptions.forEach((category) => {
      const slug = category.restaurant?.slug;
      if (!slug) return;
      bySlug.set(slug, [...(bySlug.get(slug) || []), category]);
    });

    (async () => {
      const picked: Record<string, string> = {};
      const used = new Set<string>();

      for (const [slug, categories] of bySlug) {
        let menu: {
          name?: string;
          imageUrl?: string | null;
          products?: { name?: string; imageUrl?: string | null }[];
        }[] = [];
        try {
          const response = await axios.get(`/api/menu/categories`, { params: { slug } });
          menu = Array.isArray(response.data) ? response.data : response.data?.categories || [];
        } catch {
          menu = [];
        }
        if (cancelled) return;

        // Alla tänkbara par av kategori och bild poängsätts först, sedan
        // delas bilderna ut med bästa träff överst. Annars vann den kategori
        // som råkade komma först i bokstavsordning: "Bowls" tog grillbilden
        // och "Grill" blev utan.
        const pairs: { key: string; image: string; score: number }[] = [];
        for (const category of categories) {
          const terms = matchTerms(category.label);
          for (const section of menu) {
            const image = absoluteImage(section.imageUrl || undefined);
            const score = matchScore(String(section.name || ""), terms);
            if (image && !isPlaceholderImage(image) && score !== null) {
              pairs.push({ key: category.key, image, score });
            }
          }
          // Rätternas namn matchas medvetet INTE: i den här menystrukturen
          // ärver varje rätt sin avdelnings bild. "Falafel Lunch Bowl" gav
          // därför bilden på Studentfavoriter — en inslagen rulle — till
          // kategorin Bowls. Bara avdelningens eget namn säger något om vad
          // bilden föreställer.
        }

        pairs.sort((left, right) => right.score - left.score);
        for (const pair of pairs) {
          // Samma foto på två kategorier ser ut som ett fel, och en kategori
          // behöver bara en bild.
          if (picked[pair.key] || used.has(pair.image)) continue;
          picked[pair.key] = pair.image;
          used.add(pair.image);
        }

        // Ingen kategori lämnas utan bild. Saknas en träff tar vi menyns
        // största avdelning som ännu inte används — den är restaurangens mest
        // representativa, och en riktig bild ur samma kök är alltid bättre än
        // ett tomt kort. Fortfarande aldrig samma foto två gånger.
        const fallbacks = menu
          .map((section, index) => ({
            image: absoluteImage(section.imageUrl || undefined),
            count: (section.products || []).length,
            index,
          }))
          .filter((entry) => entry.image && !isPlaceholderImage(entry.image))
          .sort((left, right) => right.count - left.count || left.index - right.index);

        for (const category of categories) {
          if (picked[category.key]) continue;
          const fallback = fallbacks.find((entry) => !used.has(entry.image));
          if (!fallback) break;
          picked[category.key] = fallback.image;
          used.add(fallback.image);
        }
      }

      if (!cancelled) setCategoryImages(picked);
    })();

    return () => {
      cancelled = true;
    };
  }, [categoryOptions]);

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

  const resultTitle = selectedTag
    ? categoryOptions.find((category) => category.key === selectedTag)?.label || "Resultat"
    : query.trim()
      ? `Resultat för ”${query.trim()}”`
      : "Alla restauranger";

  // Formgivning enligt docs/DESIGN_SYSTEM.md: grå yta, vita kort, bläck som
  // text. Orange bara som liten detalj: sökikonen, vald kategori och rabatt.
  return (
    <div className="ve-root min-h-screen pb-32 md:pt-20">
      <div className="mx-auto max-w-[680px] px-4 pt-[calc(env(safe-area-inset-top,0px)+16px)] md:pt-8">
        <header className="px-1">
          <h1 className="m-0 text-[28px] font-semibold leading-[1.1]" style={{ letterSpacing: "-0.025em", color: "var(--ve-ink)" }}>Sök</h1>
          <p className="m-0 mt-1.5 text-[15px]" style={{ color: "var(--ve-ink-2)" }}>Vad är du sugen på?</p>
        </header>

        <label className="mt-4 flex h-12 items-center gap-2.5 rounded-full pl-4 pr-2" style={{ backgroundColor: "var(--ve-card)", boxShadow: "inset 0 0 0 0.5px var(--ve-line), var(--ve-shadow-card)" }}>
          <SearchIcon size={18} strokeWidth={2.4} className="shrink-0" style={{ color: "var(--ve-accent)" }} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            type="search"
            enterKeyHint="search"
            placeholder="Restaurang, pizza, kebab…"
            className="ve-input h-full min-w-0 flex-1 bg-transparent font-medium outline-none"
            style={{ color: "var(--ve-ink)" }}
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Rensa sök" className="grid h-7 w-7 place-items-center rounded-full" style={{ backgroundColor: "var(--ve-ink-3)", color: "#fff" }}>
              <X size={13} strokeWidth={3} />
            </button>
          )}
        </label>

        {!loading && categoryOptions.length > 0 && (
          <section className="mt-7" aria-labelledby="food-tags-title">
            <div className="mb-3 flex items-baseline justify-between px-1">
              <h2 id="food-tags-title" className="m-0 text-[17px] font-semibold" style={{ letterSpacing: "-0.015em", color: "var(--ve-ink)" }}>Kategorier</h2>
              {selectedTag && (
                <button type="button" onClick={() => setSelectedTag("")} className="text-[14px] font-medium" style={{ color: "var(--ve-accent)" }}>
                  Visa alla
                </button>
              )}
            </div>
            <div className="ve-no-scrollbar -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 snap-x">
              {categoryOptions.map((category) => {
                const active = selectedTag === category.key;
                const image = categoryImages[category.key];
                const hasPhoto = Boolean(image) && loadedCategoryImages[category.key];
                return (
                  <button
                    key={category.key}
                    type="button"
                    onClick={() => setSelectedTag(active ? "" : category.key)}
                    aria-pressed={active}
                    className="ve-press relative h-[108px] w-[132px] shrink-0 snap-start overflow-hidden rounded-[18px] text-left"
                    style={{
                      backgroundColor: hasPhoto ? "#2A3744" : "var(--ve-card)",
                      boxShadow: active
                        ? "inset 0 0 0 2px var(--ve-accent), var(--ve-shadow-card)"
                        : "inset 0 0 0 0.5px var(--ve-line), var(--ve-shadow-card)",
                    }}
                  >
                    {image ? (
                      // Vanlig img: bilderna ligger utanför next/image-optimeringen
                      // och laddningsbeskedet styr utseendet.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={image}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover transition-opacity duration-300"
                        style={{ opacity: hasPhoto ? 1 : 0 }}
                        onLoad={() => setLoadedCategoryImages((current) => ({ ...current, [category.key]: true }))}
                        onError={() => setLoadedCategoryImages((current) => ({ ...current, [category.key]: false }))}
                      />
                    ) : null}
                    {hasPhoto && (
                      <span aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.18) 55%, rgba(0,0,0,0) 100%)" }} />
                    )}
                    <span className="absolute inset-x-0 bottom-0 flex flex-col gap-px p-3">
                      <span className="line-clamp-1 text-[15px] font-semibold leading-tight" style={{ letterSpacing: "-0.015em", color: hasPhoto ? "#fff" : "var(--ve-ink)" }}>
                        {category.label}
                      </span>
                      <span className="ve-tabular text-[11.5px]" style={{ color: hasPhoto ? "rgba(255,255,255,0.8)" : "var(--ve-ink-3)" }}>
                        {category.count === 1 ? "1 ställe" : `${category.count} ställen`}
                      </span>
                    </span>
                    {active && (
                      <span className="absolute right-2 top-2 h-5 w-5 rounded-full grid place-items-center" style={{ backgroundColor: "var(--ve-accent)" }}>
                        <span className="h-1.5 w-1.5 rounded-full bg-white" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <section className="mt-7">
          <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
            <h2 className="m-0 min-w-0 truncate text-[17px] font-semibold" style={{ letterSpacing: "-0.015em", color: "var(--ve-ink)" }}>{resultTitle}</h2>
            {!loading && <span className="ve-tabular shrink-0 text-[13px]" style={{ color: "var(--ve-ink-3)" }}>{filtered.length} {filtered.length === 1 ? "restaurang" : "restauranger"}</span>}
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((index) => <div key={index} className="ve-skeleton h-[112px] rounded-[20px]" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="ve-card px-6 py-12 text-center">
              <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full" style={{ backgroundColor: "var(--ve-fill)" }}>
                {query || selectedTag ? <SearchX size={22} strokeWidth={2} style={{ color: "var(--ve-ink-3)" }} /> : <Utensils size={22} strokeWidth={2} style={{ color: "var(--ve-ink-3)" }} />}
              </div>
              <p className="m-0 text-[17px] font-semibold" style={{ letterSpacing: "-0.015em", color: "var(--ve-ink)" }}>Inga restauranger matchar</p>
              <p className="m-0 mt-1 text-[14px]" style={{ color: "var(--ve-ink-2)" }}>Prova en annan kategori eller sökning.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((restaurant) => {
                const inZone = orderType !== "DELIVERY" || deliverableIds === null || deliverableIds.has(restaurant.id);
                const available = inZone && isAvailableNow(restaurant, availabilityNow);
                const zone = zoneInfo[restaurant.id];
                const eta = zone?.etaMinutes ?? restaurant.etaMinutes;
                const fee = zone?.deliveryFee ?? restaurant.deliveryFee;
                const deal = dealForRestaurant(deals, restaurant.id);
                const maxDiscountPercent = Math.max(deal.maxPercent, restaurant.homeDealMaxPercent || 0);
                const activeDealFreeDelivery = deal.freeDelivery || restaurant.homeFreeDeliveryReason === "ACTIVE_DEAL";
                const hasFreeDelivery =
                  inZone && (
                    activeDealFreeDelivery ||
                    (typeof zone?.deliveryFee === "number"
                      ? zone.deliveryFee <= 0
                      : restaurant.homeFreeDelivery === true ||
                        (typeof restaurant.deliveryFee === "number" && restaurant.deliveryFee <= 0))
                  );
                const hasReviews =
                  typeof restaurant.rating === "number" && Number.isFinite(restaurant.rating) &&
                  typeof restaurant.ratingCount === "number" && restaurant.ratingCount > 0;
                const statusLabel = available ? "Öppet" : restaurant.comingSoon ? "Kommer snart" : "Stängt";
                const image = absoluteImage(restaurant.heroImageUrl || restaurant.imageUrl);
                return (
                  <Link
                    key={restaurant.id}
                    href={`/restaurants/${restaurant.slug}`}
                    className="ve-press ve-card flex overflow-hidden"
                    style={{ opacity: available ? 1 : 0.55 }}
                  >
                    <div className="relative w-[112px] shrink-0 overflow-hidden" style={{ backgroundColor: "#EBEBEE", filter: available ? undefined : "grayscale(1)" }}>
                      {image ? (
                        <PlainImage src={image} alt={restaurant.name} width={384} className="absolute inset-0 h-full w-full object-cover" />
                      ) : (
                        <div className="grid h-full place-items-center"><Utensils size={26} strokeWidth={1.6} style={{ color: "var(--ve-ink-3)", opacity: 0.5 }} /></div>
                      )}
                      {(maxDiscountPercent > 0 || hasFreeDelivery) && (
                        <div className="absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] flex-wrap gap-1">
                          {maxDiscountPercent > 0 && (
                            <span className="ve-tabular inline-flex h-[22px] items-center rounded-full px-2 text-[11px] font-semibold" style={{ backgroundColor: "rgba(255,255,255,0.92)", color: "var(--ve-accent)" }}>−{maxDiscountPercent} %</span>
                          )}
                          {hasFreeDelivery && (
                            <span className="inline-flex h-[22px] items-center gap-1 rounded-full px-2 text-[11px] font-semibold" style={{ backgroundColor: "rgba(255,255,255,0.92)", color: "var(--ve-success)" }}><Bike size={11} strokeWidth={2.4} /> Fri</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col justify-between px-4 py-3.5">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <h3 className="m-0 line-clamp-1 text-[16px] font-semibold leading-snug" style={{ letterSpacing: "-0.015em", color: "var(--ve-ink)" }}>{restaurant.name}</h3>
                          {(restaurant.cuisine || restaurant.city) && (
                            <p className="m-0 mt-0.5 truncate text-[13px]" style={{ color: "var(--ve-ink-2)" }}>{[restaurant.cuisine, restaurant.city].filter(Boolean).join(" · ")}</p>
                          )}
                        </div>
                        <ChevronRight size={17} strokeWidth={2.2} className="mt-0.5 shrink-0" style={{ color: "var(--ve-ink-3)" }} />
                      </div>
                      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]" style={{ color: "var(--ve-ink-2)" }}>
                        {hasReviews && (
                          <span className="ve-tabular inline-flex items-center gap-1 font-medium" style={{ color: "var(--ve-ink)" }}>
                            <Star size={11} strokeWidth={0} fill="var(--ve-ink)" />
                            {restaurant.rating!.toFixed(1)} <span style={{ color: "var(--ve-ink-3)" }}>({restaurant.ratingCount})</span>
                          </span>
                        )}
                        {orderType === "DELIVERY" && inZone && typeof eta === "number" && Number.isFinite(eta) && (
                          <span className="ve-tabular inline-flex items-center gap-1"><Clock size={12} strokeWidth={2} /> {Math.round(eta)} min</span>
                        )}
                        {orderType === "DELIVERY" && inZone && (hasFreeDelivery || (typeof fee === "number" && Number.isFinite(fee))) && (
                          <span className="ve-tabular inline-flex items-center gap-1"><Bike size={12} strokeWidth={2} /> {hasFreeDelivery || (typeof fee === "number" && fee <= 0) ? "Fri leverans" : `${Math.round(fee as number)} kr`}</span>
                        )}
                        {orderType === "PICKUP" && <span className="inline-flex items-center gap-1"><Store size={12} strokeWidth={2} /> Hämta själv</span>}
                        {!inZone && <span style={{ color: "var(--ve-danger)" }}>Levererar inte hit</span>}
                        {typeof restaurant.isOpen === "boolean" && (
                          <span className="inline-flex items-center gap-1.5 font-medium" style={{ color: available ? "var(--ve-success)" : "var(--ve-ink-3)" }}>
                            <span className="h-[6px] w-[6px] rounded-full" style={{ backgroundColor: available ? "var(--ve-success)" : "var(--ve-ink-3)" }} />
                            {statusLabel}
                          </span>
                        )}
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
