import { RestaurantZonePage } from "@/modules/zones/restaurant-zone-page";

export default async function RouteRestaurantZonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RestaurantZonePage restaurantId={id} />;
}
