"use client";

import { useEffect, useState } from "react";

/**
 * Formaterar en pausedUntil-tidstämpel som "14:30".
 */
export function formatPauseTime(pausedUntil: string | Date | null): string {
  if (!pausedUntil) return "";
  const date =
    pausedUntil instanceof Date ? pausedUntil : new Date(pausedUntil);
  const h = date.getHours().toString().padStart(2, "0");
  const m = date.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * Returnerar minuter kvar tills pause går ut. Räknar ner varje sekund.
 * 0 om pause inte längre är aktiv.
 */
export function usePauseCountdown(pausedUntil: string | Date | null): {
  isPaused: boolean;
  minutesLeft: number;
  resumeTime: string;
} {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!pausedUntil) return;
    const interval = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(interval);
  }, [pausedUntil]);

  if (!pausedUntil) {
    return { isPaused: false, minutesLeft: 0, resumeTime: "" };
  }
  const date =
    pausedUntil instanceof Date ? pausedUntil : new Date(pausedUntil);
  const diffMs = date.getTime() - Date.now();
  if (diffMs <= 0) {
    return { isPaused: false, minutesLeft: 0, resumeTime: "" };
  }
  return {
    isPaused: true,
    minutesLeft: Math.ceil(diffMs / 60_000),
    resumeTime: formatPauseTime(date),
  };
}
