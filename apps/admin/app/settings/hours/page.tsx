"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Opening hours management has been moved to /restaurants/[id] hub (Hours tab)
export default function HoursRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/restaurants");
  }, [router]);
  return null;
}
