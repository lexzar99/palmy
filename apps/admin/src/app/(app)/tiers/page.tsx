import { redirect } from "next/navigation";

// Tiers bor numera som flik under Ekonomi.
export default function RouteTiersPage() {
  redirect("/finance?tab=tiers");
}
