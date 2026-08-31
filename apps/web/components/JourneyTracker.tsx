"use client";

import { useEffect } from "react";
import { trackJourney } from "@/lib/journey";

/**
 * Rapporterar att besökaren kom in på sajten, en gång per besök.
 *
 * Sitter i layouten så att kampanjmärkningen fångas oavsett vilken sida
 * länken pekade på — en mejllänk till en restaurangsida ska tillskrivas
 * mejlet lika väl som en till startsidan.
 */
export default function JourneyTracker() {
  useEffect(() => {
    // sessionStorage, inte localStorage: en ny flik är ett nytt besök, men
    // att klicka runt på sajten är det inte.
    try {
      if (window.sessionStorage.getItem("viaeats_journey_landed")) return;
      window.sessionStorage.setItem("viaeats_journey_landed", "1");
    } catch {
      // Blockerad lagring — hellre ett extra steg än inget alls.
    }
    trackJourney("LANDED", { meta: { path: window.location.pathname } });
  }, []);

  return null;
}
