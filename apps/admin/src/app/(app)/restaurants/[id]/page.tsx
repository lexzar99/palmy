import { RestaurantFormPage } from "@/modules/restaurants/restaurant-form-page";

export default function EditRestaurantPage({ params }: { params: { id: string } }) {
  return <RestaurantFormPage restaurantId={params.id} />;
}
