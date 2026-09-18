"use client";

import { useEffect } from "react";
import { captureOrderAttribution } from "@/lib/orderAttribution";
import { journeySessionId, trackJourney } from "@/lib/journey";
import { hasMarketingConsent, subscribeConsent } from "@/lib/cookieConsent";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Rapporterar att besökaren kom in på sajten, en gång per besök.
 *
 * Sitter i layouten så att kampanjmärkningen fångas oavsett vilken sida
 * länken pekade på — en mejllänk till en restaurangsida ska tillskrivas
 * mejlet lika väl som en till startsidan.
 */
export default function JourneyTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useEffect(() => {
    // sessionStorage, inte localStorage: en ny flik är ett nytt besök, men
    // att klicka runt på sajten är det inte.
    const landed = () => {
      try {
        captureOrderAttribution();
        if (!hasMarketingConsent()) return;
        const sessionId = journeySessionId();
        if (!sessionId) return;
        if (window.sessionStorage.getItem("viaeats_journey_landed") === sessionId) return;
        window.sessionStorage.setItem("viaeats_journey_landed", sessionId);
        trackJourney("LANDED", { meta: { path: window.location.pathname } });
      } catch { /* blockerad lagring ska aldrig påverka sidan */ }
    };
    landed();
    return subscribeConsent(landed);
  }, [pathname, searchParams]);

  return null;
}
