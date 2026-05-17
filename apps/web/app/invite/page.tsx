import { redirect } from "next/navigation";

// Referral-systemet är avstängt i denna version. Vi behåller route:n men
// redirectar till hemsidan så gamla länkar inte 404:ar. Beslutet var att
// förenkla launch-flödet: welcome-deal hanterar nya kunder; referral
// kan re-introduceras senare när kund-basen är tillräcklig för att det
// ska driva tillväxt på riktigt.
export default function InvitePage() {
  redirect("/");
}
