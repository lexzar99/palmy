import type { HomeCategorySection, PublicDeal, Restaurant } from "../types";

type DeliveryOverrideMap = Record<string, { deliveryFee: number; minOrderAmount: number }>;

function includesAny(source: string[], needle: string[]) {
  if (!needle.length) return true;
  const normalized = source.map((value) => value.toLowerCase());
  return needle.some((value) => normalized.some((entry) => entry.includes(value.toLowerCase())));
}

function uniqueRestaurants(restaurants: Restaurant[]) {
  const seen = new Set<string>();
  return restaurants.filter((restaurant) => {
    if (seen.has(restaurant.id)) return false;
    seen.add(restaurant.id);
    return true;
  });
}

function getEffectiveDeliveryFee(restaurant: Restaurant, deliveryOverrides: DeliveryOverrideMap) {
  return deliveryOverrides[restaurant.id]?.deliveryFee ?? restaurant.deliveryFee ?? 0;
}

function compareRestaurants(
  left: Restaurant,
  right: Restaurant,
  sortBy: "FEATURED" | "RATING" | "ETA" | "NAME",
  sortDirection: "ASC" | "DESC",
  zoneRestaurantIds: string[] | null,
) {
  const leftInZone = zoneRestaurantIds === null || zoneRestaurantIds.includes(left.id);
  const rightInZone = zoneRestaurantIds === null || zoneRestaurantIds.includes(right.id);
  if (leftInZone !== rightInZone) return leftInZone ? -1 : 1;

  const leftOpen = left.isOpen !== false ? 1 : 0;
  const rightOpen = right.isOpen !== false ? 1 : 0;
  if (leftOpen !== rightOpen) return rightOpen - leftOpen;

  const multiplier = sortDirection === "ASC" ? 1 : -1;
  const leftFeatured = left.featuredClass === 1 ? 2 : left.featuredClass === 2 ? 1 : 0;
  const rightFeatured = right.featuredClass === 1 ? 2 : right.featuredClass === 2 ? 1 : 0;

  if (sortBy === "ETA") {
    const diff = (left.etaMinutes ?? 999) - (right.etaMinutes ?? 999);
    if (diff !== 0) return diff * multiplier;
  }

  if (sortBy === "NAME") {
    const diff = left.name.localeCompare(right.name, "sv");
    if (diff !== 0) return diff * multiplier;
  }

  if (sortBy === "FEATURED") {
    const diff = rightFeatured - leftFeatured;
    if (diff !== 0) return diff * multiplier;
  }

  if (sortBy === "RATING" || sortBy === "FEATURED") {
    const diff = (right.rating ?? 0) - (left.rating ?? 0);
    if (diff !== 0) return diff * multiplier;
  }

  if (sortBy !== "NAME") {
    const nameDiff = left.name.localeCompare(right.name, "sv");
    if (nameDiff !== 0) return nameDiff;
  }

  return 0;
}

export function resolveHomeCategoryRestaurants({
  section,
  restaurants,
  deals,
  deliveryOverrides,
  orderType,
  selectedCityName,
  zoneRestaurantIds,
}: {
  section: HomeCategorySection;
  restaurants: Restaurant[];
  deals: PublicDeal[];
  deliveryOverrides: DeliveryOverrideMap;
  orderType: "DELIVERY" | "PICKUP";
  selectedCityName?: string | null;
  zoneRestaurantIds: string[] | null;
}) {
  const filters = section.filters || {};
  const restaurantById = new Map(restaurants.map((restaurant) => [restaurant.id, restaurant]));
  const dealRestaurantIds = new Set(
    deals.flatMap((deal) => [deal.restaurantId, ...(deal.applicableRestaurantIds || [])].filter(Boolean) as string[]),
  );

  const contextRestaurants = restaurants.filter((restaurant) => {
    if (orderType === "PICKUP" && selectedCityName) {
      return (restaurant.city || "").toLowerCase() === selectedCityName.toLowerCase();
    }
    return true;
  });

  const manualRestaurants = section.manualRestaurantIds
    .map((restaurantId) => restaurantById.get(restaurantId))
    .filter((restaurant): restaurant is Restaurant => !!restaurant)
    .filter((restaurant) => contextRestaurants.some((entry) => entry.id === restaurant.id));

  const filteredRestaurants = contextRestaurants.filter((restaurant) => {
    if (filters.searchTerm) {
      const haystack = `${restaurant.name} ${restaurant.cuisine || ""} ${restaurant.description || ""} ${(restaurant.tags || []).join(" ")}`.toLowerCase();
      if (!haystack.includes(filters.searchTerm.toLowerCase())) return false;
    }

    if (filters.cuisines?.length) {
      const matchesCuisine = includesAny([restaurant.cuisine || "", ...(restaurant.tags || [])], filters.cuisines);
      if (!matchesCuisine) return false;
    }

    if (filters.tags?.length && !includesAny(restaurant.tags || [], filters.tags)) {
      return false;
    }

    if (filters.featuredClasses?.length && !filters.featuredClasses.includes(restaurant.featuredClass || 0)) {
      return false;
    }

    if (filters.minRating != null && (restaurant.rating ?? 0) < filters.minRating) {
      return false;
    }

    if (filters.maxEtaMinutes != null && (restaurant.etaMinutes ?? 999) > filters.maxEtaMinutes) {
      return false;
    }

    if (filters.maxDeliveryFee != null && getEffectiveDeliveryFee(restaurant, deliveryOverrides) > filters.maxDeliveryFee) {
      return false;
    }

    if (filters.freeDeliveryOnly && getEffectiveDeliveryFee(restaurant, deliveryOverrides) > 0) {
      return false;
    }

    if (filters.dealsOnly && !dealRestaurantIds.has(restaurant.id)) {
      return false;
    }

    if (filters.openNowOnly && restaurant.isOpen === false) {
      return false;
    }

    return true;
  });

  const sortBy = filters.sortBy || "FEATURED";
  const sortDirection = filters.sortDirection || "DESC";
  const sortedFilteredRestaurants = [...filteredRestaurants].sort((left, right) =>
    compareRestaurants(left, right, sortBy, sortDirection, zoneRestaurantIds),
  );

  const merged =
    section.filterMode === "MANUAL"
      ? manualRestaurants
      : section.filterMode === "HYBRID"
        ? [...manualRestaurants, ...sortedFilteredRestaurants]
        : sortedFilteredRestaurants;

  return uniqueRestaurants(merged).slice(0, section.maxRestaurants || 8);
}
