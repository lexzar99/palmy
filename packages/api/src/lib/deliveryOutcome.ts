import prisma from './prisma';

// ── "Kunden gick inte att nå" ────────────────────────────────────────────────
//
// Restaurangen markerar i plattan (partner v2) vad som hände med maten när
// kunden inte svarade. Markeringen ändrar aldrig orderns status: ordern följer
// sitt vanliga flöde till DELIVERED, så utbetalningen påverkas inte
// (DELIVERY_FAILED skulle blockera hela utbetalningsperioden). Kunden får
// beskedet på spårningssidan och, om e-post finns, i ett mejl.
//
// Lagring utan schemaändring: en EngineEvent-rad per order, samma mönster som
// mötesbokningen. Varje ändring loggas dessutom i AuditLog av rutten.

export const DELIVERY_OUTCOME_ENGINE = 'order_delivery_outcome';

export const DELIVERY_OUTCOME_CODES = [
  'AT_RESTAURANT',
  'LEFT_AT_DOOR',
  'LEFT_WITH_NEIGHBOUR',
  'REDELIVERING',
  'RESOLVED',
] as const;
export type DeliveryOutcomeCode = (typeof DELIVERY_OUTCOME_CODES)[number];

export const OUTCOME_NOTE_MAX = 140;
export const OUTCOME_MARK_WINDOW_MS = 24 * 60 * 60 * 1000;
export const OUTCOME_MAX_EMAILS = 3;
const ELIGIBLE_STATUSES = ['PREPARING', 'READY', 'DELIVERING', 'DELIVERED'];

export class DeliveryOutcomeError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export type StoredOutcome = {
  orderId: string;
  restaurantId: string;
  code: DeliveryOutcomeCode;
  note: string | null;
  markedAt: string;
  deviceId: string | null;
  appVersion: string | null;
  revision: number;
  emails: number;
};

export const outcomeRowId = (orderId: string) => `delivery_outcome_${orderId}`;

const isCode = (value: unknown): value is DeliveryOutcomeCode =>
  typeof value === 'string' && (DELIVERY_OUTCOME_CODES as readonly string[]).includes(value);

/** Fritexten: styrtecken bort, blanksteg ihop, högst 140 tecken. */
export function cleanOutcomeNote(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function validateOutcome(input: { outcome?: unknown; note?: unknown }): { code: DeliveryOutcomeCode; note: string | null } {
  const code = typeof input.outcome === 'string' ? input.outcome.trim().toUpperCase() : '';
  if (!isCode(code)) throw new DeliveryOutcomeError(400, 'INVALID_OUTCOME', 'Okänt val');
  if (code !== 'LEFT_WITH_NEIGHBOUR') return { code, note: null };
  const note = cleanOutcomeNote(input.note);
  if (!note) throw new DeliveryOutcomeError(400, 'NOTE_REQUIRED', 'Skriv var maten lämnades');
  if (note.length > OUTCOME_NOTE_MAX) {
    throw new DeliveryOutcomeError(400, 'NOTE_TOO_LONG', `Högst ${OUTCOME_NOTE_MAX} tecken`);
  }
  return { code, note };
}

/** null = får markeras, annars orsaken. */
export function outcomeIneligibleReason(
  order: { type: string; status: string; createdAt: Date | string; selfDelivery: boolean },
  previous: StoredOutcome | null,
  code: DeliveryOutcomeCode,
  now = Date.now(),
): string | null {
  if (order.type !== 'DELIVERY' || !order.selfDelivery) return 'Gäller bara egen hemkörning';
  if (!ELIGIBLE_STATUSES.includes(String(order.status).toUpperCase())) return 'Ordern går inte att markera i den här statusen';
  if (now - new Date(order.createdAt).getTime() > OUTCOME_MARK_WINDOW_MS) return 'Ordern är äldre än ett dygn';
  if (code === 'RESOLVED' && (!previous || previous.code === 'RESOLVED')) return 'Det finns ingen markering att lösa';
  return null;
}

/**
 * Så länge restaurangen har ett öppet besked (allt utom RESOLVED) får kunden
 * inte betygsätta, även när ordern blivit DELIVERED efter 50 min. Beslut
 * 2026-11-04: beskedet ligger kvar och betyget är spärrat.
 */
export function outcomeBlocksReview(outcome: Pick<StoredOutcome, 'code'> | null | undefined): boolean {
  return !!outcome && outcome.code !== 'RESOLVED';
}

export function parseStoredOutcome(meta: unknown): StoredOutcome | null {
  if (!meta || typeof meta !== 'object') return null;
  const m = meta as Record<string, unknown>;
  if (!isCode(m.code) || typeof m.orderId !== 'string') return null;
  return {
    orderId: m.orderId,
    restaurantId: String(m.restaurantId || ''),
    code: m.code,
    note: typeof m.note === 'string' ? m.note : null,
    markedAt: String(m.markedAt || ''),
    deviceId: typeof m.deviceId === 'string' ? m.deviceId : null,
    appVersion: typeof m.appVersion === 'string' ? m.appVersion : null,
    revision: Number(m.revision) || 0,
    emails: Number(m.emails) || 0,
  };
}

export async function readOutcome(orderId: string): Promise<StoredOutcome | null> {
  const row = await prisma.engineEvent
    .findUnique({ where: { id: outcomeRowId(orderId) }, select: { engine: true, meta: true } })
    .catch(() => null);
  return row?.engine === DELIVERY_OUTCOME_ENGINE ? parseStoredOutcome(row.meta) : null;
}

export async function readOutcomes(orderIds: string[]): Promise<Map<string, StoredOutcome>> {
  const result = new Map<string, StoredOutcome>();
  if (orderIds.length === 0) return result;
  const rows = await prisma.engineEvent
    .findMany({
      where: { id: { in: orderIds.map(outcomeRowId) }, engine: DELIVERY_OUTCOME_ENGINE },
      select: { meta: true },
    })
    .catch(() => []);
  for (const row of rows) {
    const outcome = parseStoredOutcome(row.meta);
    if (outcome) result.set(outcome.orderId, outcome);
  }
  return result;
}

/** Det kunden får se. RESOLVED betyder att beskedet är borta. */
export function customerOutcomeView(outcome: StoredOutcome | null, opts: { includeNote: boolean }) {
  if (!outcome || outcome.code === 'RESOLVED') return null;
  return {
    code: outcome.code,
    note: opts.includeNote ? outcome.note : null,
    markedAt: outcome.markedAt,
  };
}

/** Det terminalen får se (även RESOLVED, så att den kan visa "Löst"). */
export function terminalOutcomeView(outcome: StoredOutcome | null | undefined) {
  if (!outcome) return null;
  return { code: outcome.code, note: outcome.note, markedAt: outcome.markedAt, revision: outcome.revision };
}

/**
 * Skriver den nya markeringen i en transaktion med radlås, så att två plattor
 * (eller ett omförsök) aldrig tappar en ändring. Räknar om mejl ska skickas.
 */
export async function writeOutcome(input: {
  orderId: string;
  orderNumber: string;
  restaurantId: string;
  code: DeliveryOutcomeCode;
  note: string | null;
  deviceId: string | null;
  appVersion: string | null;
  wantsEmail: boolean;
}): Promise<{ previous: StoredOutcome | null; next: StoredOutcome; sendEmail: boolean }> {
  const id = outcomeRowId(input.orderId);
  const attempt = () =>
    prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ meta: unknown }>>`
        SELECT meta FROM "EngineEvent" WHERE id = ${id} FOR UPDATE`;
      const previous = locked.length > 0 ? parseStoredOutcome(locked[0].meta) : null;
      const changed = !previous || previous.code !== input.code || previous.note !== input.note;
      const sendEmail =
        changed && input.wantsEmail && input.code !== 'RESOLVED' && (previous?.emails ?? 0) < OUTCOME_MAX_EMAILS;
      const next: StoredOutcome = {
        orderId: input.orderId,
        restaurantId: input.restaurantId,
        code: input.code,
        note: input.note,
        markedAt: changed || !previous ? new Date().toISOString() : previous.markedAt,
        deviceId: input.deviceId,
        appVersion: input.appVersion,
        revision: (previous?.revision ?? 0) + (changed ? 1 : 0),
        emails: (previous?.emails ?? 0) + (sendEmail ? 1 : 0),
      };
      if (locked.length > 0) {
        await tx.engineEvent.update({ where: { id }, data: { meta: next as any, message: input.orderNumber } });
      } else {
        await tx.engineEvent.create({
          data: { id, engine: DELIVERY_OUTCOME_ENGINE, message: input.orderNumber, meta: next as any },
        });
      }
      return { previous, next, sendEmail };
    });
  try {
    return await attempt();
  } catch (error: any) {
    // Två samtidiga första markeringar: den ena får P2002 och gör om, nu med lås.
    if (error?.code === 'P2002') return attempt();
    throw error;
  }
}

// ── Texter (mejl och Hermes). Webben har samma texter i egen fil. ───────────

export function deliveryOutcomeCopy(
  code: DeliveryOutcomeCode,
  ctx: { restaurantName: string; restaurantPhone: string; note: string | null },
): { title: string; body: string } | null {
  const name = ctx.restaurantName || 'Restaurangen';
  const phone = ctx.restaurantPhone ? ` på ${ctx.restaurantPhone}` : '';
  switch (code) {
    case 'AT_RESTAURANT':
      return {
        title: 'Vi kunde inte nå dig',
        body: `Restaurangen har försökt ringa dig utan svar. Din mat finns kvar hos ${name}. Ring dem${phone} så löser ni det.`,
      };
    case 'LEFT_AT_DOOR':
      return {
        title: 'Maten står utanför din dörr',
        body: `Restaurangen kunde inte nå dig och har lämnat maten utanför porten eller dörren. Hittar du den inte? Kontakta ${name}${phone}.`,
      };
    case 'LEFT_WITH_NEIGHBOUR':
      return {
        title: 'Maten är lämnad hos en granne',
        body: `Restaurangen kunde inte nå dig. Var maten finns: "${ctx.note || ''}". Frågor? Kontakta ${name}${phone}.`,
      };
    case 'REDELIVERING':
      return {
        title: 'Restaurangen försöker igen',
        body: `De kunde inte nå dig nyss och kör ut igen. Ha telefonen nära${ctx.restaurantPhone ? `, de ringer från ${ctx.restaurantPhone}` : ''}.`,
      };
    default:
      return null;
  }
}

export const OUTCOME_TERMINAL_LABEL: Record<DeliveryOutcomeCode, string> = {
  AT_RESTAURANT: 'maten finns i restaurangen',
  LEFT_AT_DOOR: 'lämnad utanför dörren',
  LEFT_WITH_NEIGHBOUR: 'lämnad hos granne',
  REDELIVERING: 'kör ut igen',
  RESOLVED: 'löst',
};
