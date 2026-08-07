/**
 * Fas och ordval för orderspårningen — ren logik, inga React-beroenden.
 *
 * Bor separat från vyn så den går att testa. Buggen som gjorde att en
 * avhämtning fick leveransens ord ("Beräknad framme", steget "På väg") satt i
 * en komponentfil som inget test kunde nå.
 *
 * Grundregeln: vid avhämtning kommer maten aldrig fram till kunden — kunden
 * kommer till maten. Allt som handlar om att något är på väg eller framme hör
 * därför inte hemma i en hämtorder.
 */

export type BreathingPhase = "waiting" | "preparing" | "onTheWay" | "readyForPickup" | "done";

export const ON_WAY_STATUSES = ["DELIVERING", "OUT_FOR_DELIVERY", "ON_THE_WAY"];
export const DONE_STATUSES = ["DELIVERED", "COMPLETED"];

/** Avhämtning avgörs på ett ställe — inte i varje vy som råkar behöva veta. */
export function isPickupOrder(order: any): boolean {
  return String(order?.orderType || order?.type || "DELIVERY").toUpperCase() === "PICKUP";
}

export function resolvePhase(order: any): BreathingPhase {
  const status = String(order?.status || "PENDING").toUpperCase();
  const pickup = isPickupOrder(order);
  // En hämtad order är klar. Den ska inte stå kvar på "Klar för hämtning" —
  // kunden har redan varit där.
  if (DONE_STATUSES.includes(status)) return "done";
  if (pickup && status === "READY") return "readyForPickup";
  // En hämtorder passerar aldrig "på väg", oavsett vad statusfältet säger.
  if (ON_WAY_STATUSES.includes(status)) return pickup ? "readyForPickup" : "onTheWay";
  if (status === "PREPARING" || status === "ACCEPTED" || status === "READY") return "preparing";
  return "waiting";
}

export function phaseTitle(phase: BreathingPhase, pickup = false): string {
  switch (phase) {
    case "waiting": return "Vi väntar på restaurangen";
    case "preparing": return "Mottagen och förbereds";
    case "onTheWay": return "På väg";
    case "readyForPickup": return "Klar för hämtning";
    case "done": return pickup ? "Hämtad" : "Klart";
  }
}

export function phaseSubtitle(phase: BreathingPhase, restaurant: string, pickup = false): string {
  switch (phase) {
    case "waiting": return `${restaurant} svarar oftast inom en minut.`;
    case "preparing": return pickup
      ? "Köket förbereder din mat. Vi säger till när den går att hämta."
      : "Köket förbereder din mat.";
    case "onTheWay": return "Maten har lämnat restaurangen.";
    case "readyForPickup": return "Visa ordernumret i restaurangen.";
    case "done": return "Hoppas det smakade.";
  }
}

/** Stegen under hjärtat. Sista steget skiljer hämtning från leverans. */
export function stepLabels(pickup: boolean): string[] {
  return pickup
    ? ["Skickad", "Förbereds", "Klar för hämtning"]
    : ["Skickad", "Förbereds", "På väg"];
}

export function stepIndex(phase: BreathingPhase): number {
  return phase === "waiting" ? 0 : phase === "preparing" ? 1 : 2;
}

/**
 * Etiketten ovanför klockslaget. Vid avhämtning väntar kunden på att maten
 * ska bli KLAR, inte på att den ska komma FRAM.
 */
export function forecastLabel(input: {
  phase: BreathingPhase;
  pickup: boolean;
  earlier?: boolean;
  later?: boolean;
  revised?: boolean;
}): string {
  const { phase, pickup, earlier, later, revised } = input;
  if (phase === "waiting") return "Tid kommer när köket svarat";
  if (phase === "done") return pickup ? "Hämtad" : "Klar";
  if (phase === "readyForPickup") return "Klar nu";
  if (phase === "onTheWay") {
    if (earlier) return "Kommer tidigare än beräknat";
    return later || revised ? "Uppdaterad prognos" : "Beräknad vara här";
  }
  return pickup ? "Beräknad klar" : "Beräknad framme";
}
