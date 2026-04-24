import { redirect } from "next/navigation";

export default async function SettingsHoursRestaurantRedirectPage({
  params,
}: {
  params: Promise<{ restaurantId: string }>;
}) {
  const { restaurantId } = await params;
  redirect(`/restaurants/${restaurantId}`);
}
