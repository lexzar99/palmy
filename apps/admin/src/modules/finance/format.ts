/**
 * Formattering och statusord för ekonomisidorna — samma i hela panelen, så två
 * sidor aldrig visar samma belopp på två sätt.
 *
 * Här räknas ingenting. Beloppen kommer färdiga ur avräkningen i backend.
 *
 * Pengar visas med två decimaler. Underlaget ligger i öre, och en avrundning
 * till hela kronor per rad gör att kolumnen inte summerar till totalen —
 * på en sida som ska stämma mot banken är det inte acceptabelt.
 */

/** Tusenavgränsare som mellanslag, inte hårt blanksteg — bryter inte i tabeller. */
const group = (formatted: string) => formatted.replace(/ /g, " ");

/** Antal, aldrig decimaler. Ordrar, restauranger, versioner. */
export const count = (value: number | null | undefined) =>
  group(Math.round(Number(value || 0)).toLocaleString("sv-SE"));

/** Belopp med två decimaler och typografiskt minustecken. */
export const num = (value: number | null | undefined) => {
  const numeric = Number(value || 0);
  const formatted = group(
    Math.abs(numeric).toLocaleString("sv-SE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
  );
  // −0,00 är förvirrande. Ett belopp som avrundas till noll är noll.
  return formatted === "0,00" ? formatted : `${numeric < 0 ? "−" : ""}${formatted}`;
};

export const kr = (value: number | null | undefined) => `${num(value)} kr`;

/**
 * Avrundat belopp för översiktens stora tal, där hela kronor läser bättre än
 * öre. Används aldrig i en kolumn som ska summera.
 */
export const krCompact = (value: number | null | undefined) => {
  const numeric = Number(value || 0);
  const formatted = group(Math.abs(Math.round(numeric)).toLocaleString("sv-SE"));
  return `${numeric < 0 ? "−" : ""}${formatted} kr`;
};

/** Justeringar visas alltid med tecken, så riktningen syns direkt. */
export const signed = (value: number | null | undefined) => {
  const numeric = Number(value || 0);
  const formatted = num(numeric);
  if (formatted === "0,00") return formatted;
  return numeric > 0 ? `+${formatted}` : formatted;
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

/**
 * Belopp ur ett fritextfält, i kronor.
 *
 * Justeringar är pengar och har ören. Tidigare plockades decimaltecknet bort
 * innan `parseInt` fick tag i strängen, så "55,53" blev 5 553 kr — hundra
 * gånger för mycket, och utbetalningen blev orimlig.
 *
 * Godtar svenskt komma såväl som punkt, tusenavgränsare som mellanslag, och
 * typografiskt minustecken. Returnerar null när fältet inte går att tolka, så
 * anropet kan skilja på "tomt" och "noll".
 */
export const parseAmount = (value: string): number | null => {
  const normalized = String(value)
    .replace(/[−–—]/g, "-")
    .replace(/[\s ]/g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  if (!normalized || normalized === "-" || normalized === ".") return null;
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) return null;
  // Ören är minsta enhet. Inga tiondels ören i ett belopp som ska betalas ut.
  return Math.round(parsed * 100) / 100;
};

/** Beloppet tillbaka till fältet, med svenskt decimaltecken. */
export const amountInputValue = (value: number): string =>
  Number.isInteger(value) ? String(value) : String(value).replace(".", ",");

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
