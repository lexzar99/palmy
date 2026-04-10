"use client";
// Opening hours moved to /restaurants/[id] hub (Hours tab)
import { use, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function HoursRestaurantRedirect({
  params,
}: {
  params: Promise<{ restaurantId: string }>;
}) {
  const { restaurantId } = use(params);
  const router = useRouter();
  useEffect(() => {
    router.replace(`/restaurants/${restaurantId}`);
  }, [router, restaurantId]);
  return null;
}
