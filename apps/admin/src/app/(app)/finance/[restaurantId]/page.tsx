import { RestaurantEconomyPage } from "@/modules/finance/restaurant-economy-page";

export default async function RestaurantEconomyRoute({
  params,
}: {
  params: Promise<{ restaurantId: string }>;
}) {
  const { restaurantId } = await params;
  return <RestaurantEconomyPage restaurantId={restaurantId} />;
}
