import { redirect } from "next/navigation";

// Referral-systemet är avstängt — gamla /r/<kod>-länkar redirectar till
// hemsidan. Backend-endpointen finns kvar men frontend exponerar inget.
// Se /invite/page.tsx för längre motivering.
export default function ReferralRedirect() {
  redirect("/");
}
