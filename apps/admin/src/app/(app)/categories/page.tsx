import { redirect } from "next/navigation";

export default function RouteCategoriesPage() {
  redirect("/homepage?tab=rails");
}
