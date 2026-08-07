import { RestaurantEconomyPage } from "@/modules/finance/restaurant-economy-page";

/**
 * Landningssidan för Restaurangekonomi. Ingen restaurang i adressen — sidan
 * visar periodens första och låter väljaren högst upp byta.
 */
export default function RestaurantEconomyLandingRoute() {
  return <RestaurantEconomyPage />;
}
