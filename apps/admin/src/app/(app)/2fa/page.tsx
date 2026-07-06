import { redirect } from "next/navigation";

// 2FA bor numera som flik under Användare.
export default function TwoFARoutePage() {
  redirect("/users?tab=sakerhet");
}
