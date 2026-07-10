import { apiDelete, apiGet, apiPatch, apiPost } from "@/shared/api/client";

export interface ZoneRecord {
  id: string;
  name: string;
  type: "circle" | "polygon";
  centerLat?: number;
  centerLng?: number;
  radiusKm?: number;
  polygon?: [number, number][];
  deliveryFee: number;
  minOrder: number;
  etaMinutes?: number;
  isActive: boolean;
  color?: string;
}

type ZoneApiRecord = Partial<ZoneRecord> & {
  feeOre?: number;
  minOrderOre?: number;
  fee?: number;
  minOrder?: number;
  deliveryFeeOre?: number;
};

export interface CityRestaurantLink {
  id: string;
  name: string;
  slug: string;
  isOpen: boolean;
  city?: string | null;
  deliveryZones?: unknown;
  freeDeliveryAbove?: number;
  freeDeliveryAboveOre?: number | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface CityRecord {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  deliveryMode: "ALL" | "ONLY_PICKUP" | "ONLY_DELIVERY";
  zones: unknown;
  latitude?: number | null;
  longitude?: number | null;
  centerLat?: number | null;
  centerLng?: number | null;
  radiusKm?: number;
  polygon?: string | null;
  freeDeliveryAbove: number;
  freeDeliveryAboveOre?: number;
  restaurants: CityRestaurantLink[];
}

export interface RestaurantLocationRecord {
  id: string;
  name: string;
  slug: string;
  city?: string | null;
  isOpen: boolean;
  latitude?: number | null;
  longitude?: number | null;
  deliveryZones?: unknown;
}

const toOre = (kr: number) => Math.round(Number(kr || 0) * 100);
const oreToKr = (ore: unknown): number => {
  const numeric = Number(ore ?? 0);
  return Number.isFinite(numeric) ? numeric / 100 : 0;
};

export const parseZones = (raw: unknown): ZoneRecord[] => {
  try {
    const zones = typeof raw === "string" ? JSON.parse(raw) : Array.isArray(raw) ? raw : [];
    return zones
      .filter((zone: any) => zone?.id)
      .map((zone: ZoneApiRecord): ZoneRecord | null => {
        const type = zone.type === "polygon" ? "polygon" : "circle";

        if (type === "polygon") {
          if (!Array.isArray(zone.polygon) || zone.polygon.length < 3) return null;
        } else {
          if (zone.centerLat == null || zone.centerLng == null) return null;
          const radius = Number(zone.radiusKm ?? 0);
          if (!radius || radius <= 0) return null;
        }

        return {
          id: String(zone.id),
          name: String(zone.name),
          type,
          centerLat: zone.centerLat != null ? Number(zone.centerLat) : undefined,
          centerLng: zone.centerLng != null ? Number(zone.centerLng) : undefined,
          radiusKm: zone.radiusKm != null ? Number(zone.radiusKm) : 0,
          polygon: Array.isArray(zone.polygon) ? zone.polygon : undefined,
          // feeOre/minOrderOre är det kanoniska kontraktet. Legacy fee och
          // minOrder är också uttryckligen öre; inga värdeheuristiker används.
          deliveryFee: oreToKr(zone.feeOre ?? zone.deliveryFeeOre ?? zone.fee ?? toOre(zone.deliveryFee ?? 0)),
          minOrder: oreToKr(zone.minOrderOre ?? zone.minOrder ?? toOre(zone.minOrder ?? 0)),
          etaMinutes: zone.etaMinutes != null ? Number(zone.etaMinutes) : undefined,
          isActive: zone.isActive !== false,
          color: zone.color || "",
        };
      })
      .filter((zone: ZoneRecord | null): zone is ZoneRecord => zone !== null);
  } catch {
    return [];
  }
};

export const serializeZones = (zones: ZoneRecord[]) =>
  zones.map((zone) => ({
    id: zone.id,
    name: zone.name || "Unnamed zone",
    type: zone.type,
    centerLat: zone.centerLat,
    centerLng: zone.centerLng,
    radiusKm: zone.radiusKm ?? 0,
    polygon: zone.polygon,
    feeOre: toOre(zone.deliveryFee),
    minOrderOre: toOre(zone.minOrder),
    etaMinutes: zone.etaMinutes ?? null,
    isActive: zone.isActive,
    color: zone.color || "",
  }));

export const zonesCitiesQueryKey = ["zones", "cities"] as const;
export const zonesRestaurantsQueryKey = ["zones", "restaurants"] as const;
export const cityHierarchyQueryKey = ["zones", "cityHierarchy"] as const;

export interface CityHierarchyNode {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  restaurantCount: number;
  aliases: string[];
  parentCityId: string | null;
  children: CityHierarchyNode[];
}

export const getCities = () => apiGet<CityRecord[]>("/cities?all=true");
export const getCityHierarchy = () => apiGet<CityHierarchyNode[]>("/cities/hierarchy");
export const mergeCityUnder = (cityId: string, parentCityId: string | null) =>
  apiPatch<{ id: string }>(`/cities/${cityId}/merge`, { parentCityId });
export const updateCityAliases = (cityId: string, aliases: string[]) =>
  apiPatch<{ id: string }>(`/cities/${cityId}/aliases`, { aliases });
export const getZoneRestaurants = () => apiGet<RestaurantLocationRecord[]>("/restaurants");

export const saveCity = (city: {
  id?: string;
  name: string;
  slug: string;
  deliveryMode: CityRecord["deliveryMode"];
  isActive: boolean;
  latitude?: number | null;
  longitude?: number | null;
  centerLat?: number | null;
  centerLng?: number | null;
  radiusKm?: number;
  polygon?: string | null;
  freeDeliveryAbove: number;
  zones: ZoneRecord[];
  restaurantIds: string[];
  restaurantZones: Record<string, { zones: ReturnType<typeof serializeZones>; freeDeliveryAbove: number }>;
}) =>
  apiPost<CityRecord>("/cities", {
    ...city,
    freeDeliveryAboveOre: toOre(city.freeDeliveryAbove),
    zones: serializeZones(city.zones),
    restaurantZones: Object.fromEntries(
      Object.entries(city.restaurantZones).map(([restaurantId, value]) => [restaurantId, { ...value, freeDeliveryAboveOre: toOre(value.freeDeliveryAbove) }]),
    ),
  });

export const createCity = (name: string) =>
  apiPost<CityRecord>("/cities", {
    name,
    slug: name.trim().toLowerCase().replace(/\s+/g, "-"),
    deliveryMode: "ALL",
    zones: [],
    isActive: true,
  });

export const deleteCity = (cityId: string) => apiDelete<{ success: boolean }>(`/cities/${cityId}`);
