/**
 * Formattering och statusord för ekonomisidorna — samma i hela panelen, så två
 * sidor aldrig visar samma belopp på två sätt.
 *
 * Här räknas ingenting. Beloppen kommer färdiga ur avräkningen i backend.
 */

/** Tusenavgränsat heltal med typografiskt minustecken. */
export const num = (value: number | null | undefined) => {
  const numeric = Number(value || 0);
  return `${numeric < 0 ? "−" : ""}${Math.abs(Math.round(numeric))
    .toLocaleString("sv-SE")
    .replace(/ /g, " ")}`;
};

export const kr = (value: number | null | undefined) => `${num(value)} kr`;

/** Justeringar visas alltid med tecken, så riktningen syns direkt. */
export const signed = (value: number | null | undefined) => {
  const numeric = Math.round(Number(value || 0));
  if (numeric === 0) return "0";
  return `${numeric > 0 ? "+" : "−"}${num(Math.abs(numeric))}`;
};

/** En avgift som ännu inte hämtats är okänd, inte noll. */
export const fee = (value: number | null | undefined) => (value == null ? "hämtas" : num(value));
export const feeKr = (value: number | null | undefined) => (value == null ? "hämtas" : kr(value));
export const negativeFee = (value: number | null | undefined) => (value == null ? "hämtas" : num(-value));
export const negativeFeeKr = (value: number | null | undefined) => (value == null ? "hämtas" : kr(-value));

const MONTHS = ["jan", "feb", "mars", "april", "maj", "juni", "juli", "aug", "sep", "okt", "nov", "dec"];

/** "2026-07-01" → "1 juli" */
export const shortDate = (iso: string) => {
  const [, month, day] = String(iso).split("-");
  return `${Number(day)} ${MONTHS[Number(month) - 1] ?? ""}`.trim();
};

export type StatusLabel = "Utkast" | "Godkänd" | "Betald";

/**
 * Tre lägen, inget mer. En period utan sparad post är ett utkast — underlaget
 * skapas automatiskt när perioden är slut. HOLD är ett gammalt väntläge som
 * inte finns i modellen och räknas som utkast.
 */
export function statusLabel(status: string | null | undefined): StatusLabel {
  switch (String(status || "").toUpperCase()) {
    case "PAID":
      return "Betald";
    case "APPROVED":
      return "Godkänd";
    default:
      return "Utkast";
  }
}

/** Statusordet tillbaka till API:ts kod. */
export const statusCode = (label: StatusLabel) =>
  label === "Betald" ? "PAID" : label === "Godkänd" ? "APPROVED" : "DRAFT";
