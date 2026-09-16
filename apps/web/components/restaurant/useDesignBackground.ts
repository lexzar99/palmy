"use client";

import { useEffect } from "react";

/**
 * Låter sidans grå yta (token --ve-bg) nå ända ut i overscroll/safe-area.
 * Värdet läses från designsystemets tokens i stället för att hårdkodas, så en
 * ändring i restaurant.css slår igenom överallt — även i partner-embedden.
 */
export function useDesignBackground() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".ve-root") ?? document.documentElement;
    const bg = getComputedStyle(root).getPropertyValue("--ve-bg").trim();
    if (!bg) return;
    const prev = document.body.style.backgroundColor;
    document.body.style.backgroundColor = bg;
    return () => { document.body.style.backgroundColor = prev; };
  }, []);
}
