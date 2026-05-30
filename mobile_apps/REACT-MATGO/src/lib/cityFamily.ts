// City-family hjälpare — speglar webbens `cityFamilyIds`-logik från
// `apps/web/app/page.tsx`. Backend's GET /api/cities/family-by-name returnerar
// hela stad-hierarkin (parent + alla barn) för en given stad. Det används för
// att filtrera restauranger så att "Malmö" matchar restauranger taggade både
// med Malmö OCH dess barn-städer (t.ex. Arlöv → Malmö).
//
// Utan detta filtrerar RN-appen bara på exakt stad-namn-match → en kund i
// Malmö ser inte Arlöv-restauranger trots att de hör ihop på backend.

import { api } from "./api";
import type { Restaurant } from "../types";

export type CityFamily = {
  familyIds: string[];
  resolvedName: string | null;
};

/** Hämta hela stad-familjen för ett city-namn. Använd för att hydratisera
 *  store.cityFamilyIds + store.detectedCityName. Returnerar { [], null } vid
 *  miss eller nätverksfel (caller bestämmer fallback). */
export async function fetchCityFamily(cityName: string): Promise<CityFamily> {
  if (!cityName || !cityName.trim()) return { familyIds: [], resolvedName: null };
  try {
    const res = await api.get("/api/cities/family-by-name", { params: { name: cityName.trim() } });
    const data = res.data || {};
    const familyIds: string[] = Array.isArray(data.familyIds) ? data.familyIds : [];
    const resolvedName: string | null = typeof data.name === "string" ? data.name : null;
    return { familyIds, resolvedName };
  } catch {
    return { familyIds: [], resolvedName: null };
  }
}

/** Filter-predikat: matchar restaurang `r` mot den aktiva stad-familjen.
 *
 *  Logik (speglar `apps/web/app/page.tsx` `matchesCityFamily` exakt):
 *  - Har vi en familjeIDs-lista → kolla om r.cityId ingår. Om r saknar cityId
 *    men vi har detectedCityName → fall tillbaka till stad-namn-jämförelse.
 *  - Har vi ingen familjeIDs men har detectedCityName → strict "visa inget"
 *    (vi vet vilken stad användaren är i men hittade ingen familj).
 *  - PICKUP utan stad satt → visa inget (kunden måste välja stad först).
 *  - DELIVERY utan stad satt → visa alla (default home-view innan adress).
 */
export function matchesCityFamily(
  r: Restaurant,
  cityFamilyIds: string[] | null,
  detectedCityName: string | null,
  orderType: "DELIVERY" | "PICKUP",
): boolean {
  if (cityFamilyIds && cityFamilyIds.length > 0) {
    const rCityId = (r as { cityId?: string | null }).cityId;
    if (rCityId) return cityFamilyIds.includes(rCityId);
    if (detectedCityName) {
      return (r.city || "").toLowerCase() === detectedCityName.toLowerCase();
    }
    return false;
  }
  if (detectedCityName) return false;
  if (orderType === "PICKUP") return false;
  return true;
}
