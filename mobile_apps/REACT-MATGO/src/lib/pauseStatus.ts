/**
 * Pause-status helpers — speglar webbens lib/usePauseStatus.ts.
 * Restaurang kan vara "pausad" (tillfällig stängning med auto-resume) som
 * skiljer sig från permanent stängd. Backend exponerar `pausedUntil` (ISO).
 */

export interface PauseStatus {
  isPaused: boolean;
  resumeTime: string; // "HH:MM"
  minutesLeft: number;
}

export function getPauseStatus(pausedUntil: string | Date | null | undefined): PauseStatus {
  if (!pausedUntil) {
    return { isPaused: false, resumeTime: "", minutesLeft: 0 };
  }
  const date = pausedUntil instanceof Date ? pausedUntil : new Date(pausedUntil);
  const diffMs = date.getTime() - Date.now();
  if (diffMs <= 0) {
    return { isPaused: false, resumeTime: "", minutesLeft: 0 };
  }
  const h = date.getHours().toString().padStart(2, "0");
  const m = date.getMinutes().toString().padStart(2, "0");
  return {
    isPaused: true,
    resumeTime: `${h}:${m}`,
    minutesLeft: Math.ceil(diffMs / 60_000),
  };
}

/**
 * Etikett för restaurang-status pill. Pause åsidosätter open/closed.
 */
export function getRestaurantStatusLabel(restaurant: {
  isOpen?: boolean | null;
  pausedUntil?: string | Date | null;
}): { label: string; tone: "open" | "paused" | "closed" } {
  const pause = getPauseStatus(restaurant.pausedUntil ?? null);
  if (pause.isPaused) {
    return { label: `Pausad · ${pause.resumeTime}`, tone: "paused" };
  }
  if (restaurant.isOpen === false) {
    return { label: "Stängd", tone: "closed" };
  }
  return { label: "Öppen", tone: "open" };
}
