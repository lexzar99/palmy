import { RestaurantFormPage } from "@/modules/restaurants/restaurant-form-page";

export default async function EditRestaurantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RestaurantFormPage restaurantId={id} />;
}
