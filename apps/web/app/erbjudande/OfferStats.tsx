"use client";
import { useEffect } from "react";
import { atStage, startVisit, type OfferStage } from "./visitStats";

/** Mäter besöket och vilken del av sidan under resan som är i bild. */
export default function OfferStats() {
  useEffect(() => {
    const stop = startVisit();
    const watcher = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) atStage((entry.target as HTMLElement).dataset.stat as OfferStage);
    }, { rootMargin: "-45% 0px -45% 0px" });
    document.querySelectorAll("[data-stat]").forEach((section) => watcher.observe(section));
    return () => {
      watcher.disconnect();
      stop();
    };
  }, []);
  return null;
}
