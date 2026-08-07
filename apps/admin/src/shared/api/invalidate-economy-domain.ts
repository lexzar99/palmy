import type { QueryClient } from "@tanstack/react-query";

/**
 * Economy values are projected into several admin views. Keep the dependency
 * list in one place so an edit can never leave finance, dashboard, restaurant
 * or tier cards showing different versions of the same agreement.
 */
export async function invalidateEconomyDomain(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["finance"] }),
    queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
    queryClient.invalidateQueries({ queryKey: ["restaurants"] }),
    queryClient.invalidateQueries({ queryKey: ["tiers"] }),
  ]);
}
