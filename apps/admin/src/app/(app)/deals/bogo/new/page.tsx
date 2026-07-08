import { redirect } from "next/navigation";

export default function NewBogoPage() {
  redirect("/deals?tab=kampanjer");
}
