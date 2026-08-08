/**
 * Betalningsuppgifter per restaurang — normalisering och validering.
 *
 * De här fälten styr vart pengarna går. Ett bankgironummer med en felskriven
 * siffra skickar en utbetalning till fel mottagare, och banken fångar det inte
 * åt oss. Därför kontrolleras kontrollsiffran här, inte bara formatet.
 *
 * Ingen I/O — ren funktion, samma indata ger samma utdata.
 */

export class PaymentDetailError extends TypeError {
  constructor(public readonly field: string, message: string) {
    super(message);
    this.name = 'PaymentDetailError';
  }
}

const digitsOnly = (value: string) => value.replace(/\D/g, '');

/**
 * Luhn (mod 10) — samma kontrollsiffra som bankgiro och plusgiro använder.
 * Sista siffran är kontrollsiffran.
 */
export function luhnValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = Number(digits[i]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * Bankgiro: 7 eller 8 siffror, sista är kontrollsiffra. Normaliseras till
 * NNN-NNNN respektive NNNN-NNNN, som det står på inbetalningskortet.
 */
export function normalizeBankgiro(raw: string): string {
  const digits = digitsOnly(raw);
  if (digits.length < 7 || digits.length > 8) {
    throw new PaymentDetailError('bankgiro', 'Bankgiro ska ha 7 eller 8 siffror');
  }
  if (!luhnValid(digits)) {
    throw new PaymentDetailError('bankgiro', 'Bankgirots kontrollsiffra stämmer inte');
  }
  return `${digits.slice(0, digits.length - 4)}-${digits.slice(-4)}`;
}

/**
 * Plusgiro: 2–8 siffror, sista är kontrollsiffra. Normaliseras till NNNNNNN-N.
 */
export function normalizePlusgiro(raw: string): string {
  const digits = digitsOnly(raw);
  if (digits.length < 2 || digits.length > 8) {
    throw new PaymentDetailError('plusgiro', 'Plusgiro ska ha mellan 2 och 8 siffror');
  }
  if (!luhnValid(digits)) {
    throw new PaymentDetailError('plusgiro', 'Plusgirots kontrollsiffra stämmer inte');
  }
  return `${digits.slice(0, -1)}-${digits.slice(-1)}`;
}

/**
 * IBAN: mod-97-kontroll enligt ISO 13616. Normaliseras till versaler utan
 * mellanslag, som banken vill ha det.
 */
export function normalizeIban(raw: string): string {
  const compact = String(raw).replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(compact)) {
    throw new PaymentDetailError('iban', 'IBAN har fel format');
  }
  // Flytta de fyra första tecknen sist och översätt bokstäver till tal.
  const rearranged = compact.slice(4) + compact.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (letter) => String(letter.charCodeAt(0) - 55));
  // Räkna mod 97 i block, så vi aldrig går utanför säkra heltal.
  let remainder = 0;
  for (const digit of numeric) {
    remainder = (remainder * 10 + Number(digit)) % 97;
  }
  if (remainder !== 1) {
    throw new PaymentDetailError('iban', 'IBAN-kontrollen stämmer inte');
  }
  return compact;
}

/** BIC/SWIFT: 8 eller 11 tecken. */
export function normalizeBic(raw: string): string {
  const compact = String(raw).replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(compact)) {
    throw new PaymentDetailError('bic', 'BIC ska vara 8 eller 11 tecken');
  }
  return compact;
}

const normalizeEmail = (raw: string): string => {
  const trimmed = String(raw).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    throw new PaymentDetailError('invoiceEmail', 'Fakturamejlen har fel format');
  }
  return trimmed;
};

export interface PaymentDetailsInput {
  bankgiro?: string | null;
  plusgiro?: string | null;
  iban?: string | null;
  bic?: string | null;
  invoiceAddress?: string | null;
  invoiceEmail?: string | null;
}

export const PAYMENT_DETAIL_FIELDS = [
  'bankgiro',
  'plusgiro',
  'iban',
  'bic',
  'invoiceAddress',
  'invoiceEmail',
] as const;

export type PaymentDetailField = (typeof PAYMENT_DETAIL_FIELDS)[number];

/** True när nyttolasten rör någon betalningsuppgift. */
export function touchesPaymentDetails(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  return PAYMENT_DETAIL_FIELDS.some((field) =>
    Object.prototype.hasOwnProperty.call(body, field),
  );
}

/**
 * Normalisera de fält som faktiskt skickats. Tomt värde betyder "rensa" och
 * blir null — det är hur man tar bort en felaktig uppgift.
 *
 * Kastar PaymentDetailError vid ogiltigt värde, så ett felskrivet kontonummer
 * aldrig hamnar i databasen och tyst styr om nästa utbetalning.
 */
export function normalizePaymentDetails(
  input: PaymentDetailsInput,
): Partial<Record<PaymentDetailField, string | null>> {
  const output: Partial<Record<PaymentDetailField, string | null>> = {};
  const blank = (value: unknown) => value == null || String(value).trim() === '';

  if (input.bankgiro !== undefined) {
    output.bankgiro = blank(input.bankgiro) ? null : normalizeBankgiro(String(input.bankgiro));
  }
  if (input.plusgiro !== undefined) {
    output.plusgiro = blank(input.plusgiro) ? null : normalizePlusgiro(String(input.plusgiro));
  }
  if (input.iban !== undefined) {
    output.iban = blank(input.iban) ? null : normalizeIban(String(input.iban));
  }
  if (input.bic !== undefined) {
    output.bic = blank(input.bic) ? null : normalizeBic(String(input.bic));
  }
  if (input.invoiceAddress !== undefined) {
    output.invoiceAddress = blank(input.invoiceAddress) ? null : String(input.invoiceAddress).trim();
  }
  if (input.invoiceEmail !== undefined) {
    output.invoiceEmail = blank(input.invoiceEmail) ? null : normalizeEmail(String(input.invoiceEmail));
  }
  return output;
}

/**
 * Ett BIC utan IBAN är meningslöst, och ett IBAN utan BIC går ofta inte att
 * betala. Kontrollen körs mot det sammanslagna resultatet — det som faktiskt
 * kommer stå i databasen efteråt — inte bara mot det som skickades.
 */
export function assertPaymentDetailsCoherent(
  merged: Partial<Record<PaymentDetailField, string | null>>,
): void {
  if (merged.bic && !merged.iban) {
    throw new PaymentDetailError('bic', 'BIC kräver ett IBAN');
  }
}

/** Har restaurangen någon uppgift vi kan betala till? */
export const hasPayableDestination = (
  details: Partial<Record<PaymentDetailField, string | null>>,
): boolean => Boolean(details.bankgiro || details.plusgiro || details.iban);
