// Meny-payload-hjälpare. Backend kan svara i två former på /menu/categories:
//   • default     — varje produkt bär hela sina `extraGroups` inbäddade
//   • normalized   — produkter bär bara `extraGroupIds`, och svaret har en
//                    top-level `extraGroups`-ordbok (id → grupp) EN gång
//
// Webben begär normalized (mycket mindre payload för kedjemenyer) och
// rehydrerar HÄR, så att resten av UI:t (MenuContent, ProductModal m.fl.)
// alltid ser `product.extraGroups` ifyllt — exakt som i default-formatet.

/** Query-param som webben lägger på /menu/categories-anrop. */
export const MENU_FORMAT_PARAM = "normalized" as const;

interface RawMenuResponse {
  categories?: any[];
  extraGroups?: Record<string, any>;
}

/**
 * Returnerar kategori-arrayen med varje produkts `extraGroups` ifyllt.
 * Tål BÅDA formaten (och rå-array-fallbacken) → säkert att alltid köra:
 *  - normalized: mappar produktens `extraGroupIds` via ordboken
 *  - default/array: redan inbäddat, returneras oförändrat
 */
export function rehydrateMenuCategories(data: RawMenuResponse | any[] | null | undefined): any[] {
  const categories: any[] = Array.isArray(data) ? data : data?.categories ?? [];
  const groupMap: Record<string, any> | undefined = Array.isArray(data) ? undefined : data?.extraGroups;
  if (!groupMap) return categories; // default-format — redan inbäddat

  return categories.map((cat: any) => ({
    ...cat,
    products: (cat.products ?? []).map((p: any) => {
      if (p.extraGroups) return p; // produkten har redan inbäddade grupper
      const ids: string[] = p.extraGroupIds ?? [];
      // Dela av extraGroupIds från produkten och fyll extraGroups istället.
      const { extraGroupIds: _drop, ...rest } = p;
      return { ...rest, extraGroups: ids.map((id) => groupMap[id]).filter(Boolean) };
    }),
  }));
}
