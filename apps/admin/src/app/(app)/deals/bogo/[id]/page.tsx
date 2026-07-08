import { redirect } from "next/navigation";

export default function EditBogoPage() {
  redirect("/deals?tab=kampanjer");
}
