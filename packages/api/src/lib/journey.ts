/**
 * Kundresan — vad besökaren gjorde, i ordning, och var det tog slut.
 *
 * Plattformen såg tidigare bara ordrar. Allt före dem — menyn, varukorgen,
 * adressen som låg utanför zonen — var osynligt, vilket är precis där
 * kunderna försvinner. Den här modulen definierar stegen och räknar tratten.
 *
 * Besökaren är anonym tills hon skriver sitt telefonnummer i kassan.
 * `sessionId` binder ihop stegen dessförinnan; `attachIdentityToSession`
 * skriver numret på sessionens tidigare rader när det blir känt.
 */

import prisma from './prisma';

/**
 * Trattens steg i ordning. Ordningen ÄR definitionen av "hur långt kom
 * besökaren" — sista steget i listan som en session nått är dess djup.
 */
export const FUNNEL_STEPS = [
  'LANDED',
  'RESTAURANT_VIEWED',
  'PRODUCT_VIEWED',
  'ADDED_TO_CART',
  'CART_OPENED',
  'ORDER_TYPE_CHOSEN',
  'ADDRESS_ACCEPTED',
  'CONTACT_ENTERED',
  'PAYMENT_STARTED',
  'ORDER_PLACED',
] as const;

/**
 * Steg som inte ligger på vägen framåt utan berättar VARFÖR någon fastnade.
 * De räknas separat — en avvisad adress är inte ett framsteg, det är ett hinder.
 */
export const PROBLEM_STEPS = [
  'ADDRESS_REJECTED',
  'PAYMENT_FAILED',
] as const;

export const JOURNEY_STEPS = [...FUNNEL_STEPS, ...PROBLEM_STEPS] as const;
export type JourneyStep = (typeof JOURNEY_STEPS)[number];

const STEP_SET = new Set<string>(JOURNEY_STEPS);
export const isJourneyStep = (value: unknown): value is JourneyStep =>
  typeof value === 'string' && STEP_SET.has(value);

/** Svenska etiketter — adminvyn ska läsas, inte avkodas. */
export const STEP_LABELS: Record<string, string> = {
  LANDED: 'Kom in på sajten',
  RESTAURANT_VIEWED: 'Öppnade en restaurang',
  PRODUCT_VIEWED: 'Tittade på en rätt',
  ADDED_TO_CART: 'La i varukorgen',
  CART_OPENED: 'Öppnade kassan',
  ORDER_TYPE_CHOSEN: 'Valde leverans eller avhämtning',
  ADDRESS_ACCEPTED: 'Adressen godkändes',
  CONTACT_ENTERED: 'Fyllde i namn och telefon',
  PAYMENT_STARTED: 'Startade betalningen',
  ORDER_PLACED: 'Lade ordern',
  ADDRESS_REJECTED: 'Adressen låg utanför zonen',
  PAYMENT_FAILED: 'Betalningen gick inte igenom',
};

const stepRank = new Map<string, number>(FUNNEL_STEPS.map((s, i) => [s, i]));

/** Hur långt en session kom. Problemsteg räknas inte som framsteg. */
export function deepestStep(steps: string[]): { step: string; index: number } {
  let best = -1;
  for (const s of steps) {
    const rank = stepRank.get(s);
    if (rank !== undefined && rank > best) best = rank;
  }
  return best < 0
    ? { step: 'LANDED', index: 0 }
    : { step: FUNNEL_STEPS[best], index: best };
}

/**
 * Tolkar varför en session tog slut där den gjorde. Det är skillnaden mellan
 * "48 % föll bort i kassan" och "de fick veta att vi inte kör till dem".
 */
export function explainDropOff(steps: string[]): string {
  const seen = new Set(steps);
  if (seen.has('ORDER_PLACED')) return 'Beställde';
  if (seen.has('PAYMENT_FAILED')) return 'Betalningen gick inte igenom';
  if (seen.has('PAYMENT_STARTED')) return 'Lämnade mitt i betalningen';
  if (seen.has('ADDRESS_REJECTED')) return 'Vi levererar inte till adressen';
  if (seen.has('CONTACT_ENTERED')) return 'Fyllde i uppgifter men betalade aldrig';
  if (seen.has('ADDRESS_ACCEPTED')) return 'Adressen gick bra men gick inte vidare';
  if (seen.has('ORDER_TYPE_CHOSEN')) return 'Fastnade på adressen';
  if (seen.has('CART_OPENED')) return 'Lämnade kassan direkt';
  if (seen.has('ADDED_TO_CART')) return 'Övergav varukorgen utan att öppna kassan';
  if (seen.has('PRODUCT_VIEWED')) return 'Tittade på maten men la inget i korgen';
  if (seen.has('RESTAURANT_VIEWED')) return 'Bläddrade i menyn och försvann';
  return 'Kom in men gjorde inget mer';
}

/**
 * Skriver identiteten på hela sessionen, inte bara på det nya steget.
 *
 * Kunden är anonym fram till kassan. Utan den här backfillen skulle stegen
 * före kassan aldrig gå att tillskriva en person, och frågan "vad gjorde
 * Rosen innan hon försvann" vore obesvarbar.
 */
export async function attachIdentityToSession(
  sessionId: string,
  identity: { phone?: string | null; email?: string | null; userId?: string | null },
): Promise<void> {
  const data: Record<string, string> = {};
  if (identity.phone) data.phone = identity.phone;
  if (identity.email) data.email = identity.email.toLowerCase();
  if (identity.userId) data.userId = identity.userId;
  if (Object.keys(data).length === 0) return;

  await (prisma as any).journeyEvent
    .updateMany({ where: { sessionId }, data })
    .catch((error: unknown) => {
      // Spårning får aldrig fälla ett kundflöde. Ett tappat namn på en rad
      // är en sämre rapport, inte en trasig beställning.
      console.error('[journey] kunde inte knyta identitet till sessionen:', error);
    });
}
