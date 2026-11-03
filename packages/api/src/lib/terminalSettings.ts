import crypto from 'crypto';
import { normalizeDeliveryZones } from '../utils/deliveryZones';

/**
 * Ren logik för det som restaurangen själv får ändra från plattan (partner v2):
 * zonavgift och minsta order, öppettider och menypriser. Inget här rör
 * databasen, så allt kan testas i `contracts/terminalSettings.test.ts`.
 *
 * Två principer bär allt:
 *  - Servern tar emot exakta ändringar (`fromOre` → `toOre`), aldrig regler.
 *    Appen räknar fram massjusteringar själv och visar samma lista som skickas.
 *  - Jämför och sätt: en ändring gäller bara om värdet fortfarande är det
 *    plattan såg. Det ger skydd mot dubbeltryck, omspelning och samtidiga
 *    ändringar från admin utan versionskolumner i databasen.
 */

export const TERMINAL_LIMITS = {
  productMaxOre: 300_000,
  extraMinOre: -50_000,
  extraMaxOre: 100_000,
  zoneFeeMaxOre: 50_000,
  zoneMinOrderMaxOre: 200_000,
  maxPriceChanges: 2_000,
  maxShiftsPerDay: 3,
  maxSpecialDays: 60,
  specialDaysAheadMax: 366,
  specialDaysKeptAfter: 7,
  noteMaxLength: 40,
} as const;

export class TerminalSettingsError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'TerminalSettingsError';
  }
}

const invalid = (code: string, message: string, details?: Record<string, unknown>) =>
  new TerminalSettingsError(422, code, message, details);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const assertOnlyKeys = (value: Record<string, unknown>, allowed: readonly string[], code: string, where: string) => {
  const extra = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extra.length > 0) {
    throw invalid(code, `${where}: fältet ${extra[0]} får inte ändras från plattan`, { field: extra[0] });
  }
};

const integerIn = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;

/** Versionen av ett lagrat JSON-fält: samma sträng ger samma version. */
export function settingsVersion(stored: string | null | undefined): string {
  return crypto.createHash('sha256').update(stored ?? '').digest('hex').slice(0, 16);
}

const parseArray = (raw: string | null | undefined): any[] => {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const parseObject = (raw: string | null | undefined): Record<string, any> => {
  try {
    const parsed = JSON.parse(raw || '{}');
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

// ── Leveranszoner ───────────────────────────────────────────────────────────

export type ZoneMoneyChange = { id: string; feeOre: number; minOrderOre: number };

export function parseZoneChanges(body: unknown): { version: string; changes: ZoneMoneyChange[] } {
  if (!isPlainObject(body)) throw invalid('INVALID_ZONE_CHANGE', 'Ogiltig begäran');
  assertOnlyKeys(body, ['version', 'changes'], 'INVALID_ZONE_CHANGE', 'Zoner');
  const { version, changes } = body;
  if (typeof version !== 'string' || !version) throw invalid('INVALID_ZONE_CHANGE', 'version krävs');
  if (!Array.isArray(changes) || changes.length === 0 || changes.length > 200) {
    throw invalid('INVALID_ZONE_CHANGE', 'Inga ändringar att spara');
  }
  const seen = new Set<string>();
  const parsed = changes.map((change) => {
    if (!isPlainObject(change)) throw invalid('INVALID_ZONE_CHANGE', 'Ogiltig zonändring');
    assertOnlyKeys(change, ['id', 'feeOre', 'minOrderOre'], 'INVALID_ZONE_CHANGE', 'Zon');
    const id = typeof change.id === 'string' ? change.id : '';
    if (!id) throw invalid('INVALID_ZONE_CHANGE', 'Zonen saknar id');
    if (seen.has(id)) throw invalid('INVALID_ZONE_CHANGE', 'Samma zon finns två gånger', { id });
    seen.add(id);
    if (!integerIn(change.feeOre, 0, TERMINAL_LIMITS.zoneFeeMaxOre)) {
      throw invalid('INVALID_ZONE_CHANGE', 'Leveransavgiften måste vara 0–500 kr', { id, field: 'feeOre' });
    }
    if (!integerIn(change.minOrderOre, 0, TERMINAL_LIMITS.zoneMinOrderMaxOre)) {
      throw invalid('INVALID_ZONE_CHANGE', 'Minsta order måste vara 0–2 000 kr', { id, field: 'minOrderOre' });
    }
    return { id, feeOre: change.feeOre, minOrderOre: change.minOrderOre };
  });
  return { version, changes: parsed };
}

/**
 * Skriver in nya belopp i den lagrade zonlistan. Bara beloppen ändras: geometri,
 * namn, aktiv, färg, ETA och okända fält ligger kvar exakt som admin sparade dem.
 */
export function applyZoneMoneyChanges(rawZonesJson: string, changes: ZoneMoneyChange[]): string {
  const zones = parseArray(rawZonesJson);
  const byId = new Map(changes.map((change) => [change.id, change]));
  const touched = new Set<string>();
  const next = zones.map((zone) => {
    const id = isPlainObject(zone) ? String(zone.id ?? '') : '';
    const change = id ? byId.get(id) : undefined;
    if (!change || !isPlainObject(zone)) return zone;
    touched.add(id);
    const { deliveryFee: _legacySek, deliveryFeeOre: _legacyOre, delivery_fee: _legacySnake, min_order: _legacyMin, ...rest } = zone;
    return { ...rest, feeOre: change.feeOre, fee: change.feeOre, minOrderOre: change.minOrderOre, minOrder: change.minOrderOre };
  });
  const missing = changes.find((change) => !touched.has(change.id));
  if (missing) throw invalid('INVALID_ZONE_CHANGE', 'Zonen finns inte längre', { id: missing.id });
  try {
    normalizeDeliveryZones(next, { strict: true });
  } catch {
    throw invalid('INVALID_ZONE_CHANGE', 'Zonerna är ogiltiga och kan bara rättas av viaeats');
  }
  return JSON.stringify(next);
}

export function terminalZoneView(rawZonesJson: string | null | undefined) {
  return normalizeDeliveryZones(parseArray(rawZonesJson)).map((zone) => ({
    id: zone.id,
    name: zone.name,
    type: zone.type,
    isActive: zone.isActive,
    color: zone.color ?? null,
    radiusKm: zone.type === 'circle' ? zone.radiusKm : null,
    feeOre: zone.feeOre,
    minOrderOre: zone.minOrderOre,
  }));
}

// ── Öppettider ──────────────────────────────────────────────────────────────

export const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
export type DayKey = (typeof DAY_KEYS)[number];
export type Shift = { open: string; close: string };
export type DayHours = { closed: boolean; shifts: Shift[] };
export type SpecialDay = { date: string; closed: boolean; shifts: Shift[]; note?: string };

const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const minutesOf = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

const normalizeTime = (value: unknown, where: string): string => {
  const match = typeof value === 'string' ? TIME.exec(value.trim()) : null;
  if (!match) throw invalid('INVALID_OPENING_HOURS', `${where}: tiden måste skrivas som TT:MM`);
  return `${match[1].padStart(2, '0')}:${match[2]}`;
};

/** Pass för en dag: högst tre, inga överlapp, och bara sista passet får gå över midnatt. */
export function normalizeShifts(raw: unknown, where: string): Shift[] {
  if (!Array.isArray(raw)) throw invalid('INVALID_OPENING_HOURS', `${where}: passen saknas`);
  if (raw.length > TERMINAL_LIMITS.maxShiftsPerDay) {
    throw invalid('INVALID_OPENING_HOURS', `${where}: högst ${TERMINAL_LIMITS.maxShiftsPerDay} pass per dag`);
  }
  const shifts = raw.map((shift) => {
    if (!isPlainObject(shift)) throw invalid('INVALID_OPENING_HOURS', `${where}: ogiltigt pass`);
    const open = normalizeTime(shift.open, where);
    const close = normalizeTime(shift.close, where);
    if (open === close) throw invalid('INVALID_OPENING_HOURS', `${where}: passet öppnar och stänger samma tid`);
    return { open, close };
  }).sort((a, b) => minutesOf(a.open) - minutesOf(b.open));

  shifts.forEach((shift, index) => {
    const overnight = minutesOf(shift.close) <= minutesOf(shift.open);
    if (overnight && index !== shifts.length - 1) {
      throw invalid('INVALID_OPENING_HOURS', `${where}: bara dagens sista pass får gå över midnatt`);
    }
    const next = shifts[index + 1];
    if (next && minutesOf(shift.close) > minutesOf(next.open)) {
      throw invalid('INVALID_OPENING_HOURS', `${where}: passen ${shift.open}–${shift.close} och ${next.open}–${next.close} överlappar`);
    }
  });
  return shifts;
}

const shiftsFromStored = (day: any): Shift[] => {
  if (!day || day.closed === true) return [];
  const slots = Array.isArray(day) ? day : Array.isArray(day.shifts) ? day.shifts : [day];
  return slots
    .filter((slot: any) => slot && typeof slot.open === 'string' && typeof slot.close === 'string')
    .map((slot: any) => ({ open: slot.open, close: slot.close }));
};

const dayFromStored = (day: any): DayHours => {
  const shifts = shiftsFromStored(day);
  return { closed: shifts.length === 0, shifts };
};

const datePartsOf = (date: string) => {
  const match = DATE.exec(date);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) return null;
  return utc.getTime();
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Kalenderdagen i Sverige som `YYYY-MM-DD`. */
export function stockholmDateKey(now = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Det plattan ser: veckan i kanonisk form och avvikande dagar, oavsett hur de en gång sparades. */
export function openingHoursView(stored: string | null | undefined, today = stockholmDateKey()) {
  const hours = parseObject(stored);
  const regular = isPlainObject(hours.regular) ? hours.regular : {};
  const week = Object.fromEntries(
    DAY_KEYS.map((day) => [day, dayFromStored(hours[day] ?? regular[day])]),
  ) as Record<DayKey, DayHours>;
  const todayMs = datePartsOf(today) ?? Date.now();
  const specialHours: SpecialDay[] = (Array.isArray(hours.specialHours) ? hours.specialHours : [])
    .filter((entry: any) => {
      const ms = typeof entry?.date === 'string' ? datePartsOf(entry.date) : null;
      return ms !== null && ms >= todayMs - DAY_MS;
    })
    .map((entry: any) => {
      const shifts = entry.closed === true ? [] : shiftsFromStored(entry);
      return {
        date: entry.date,
        closed: entry.closed === true || shifts.length === 0,
        shifts,
        ...(typeof entry.note === 'string' && entry.note.trim() ? { note: entry.note.trim().slice(0, TERMINAL_LIMITS.noteMaxLength) } : {}),
      };
    })
    .sort((a: SpecialDay, b: SpecialDay) => a.date.localeCompare(b.date));
  const configured = DAY_KEYS.some((day) => hours[day] !== undefined || regular[day] !== undefined)
    || (Array.isArray(hours.specialHours) && hours.specialHours.length > 0);
  return { configured, week, specialHours };
}

/**
 * Bygger den lagrade strängen ur det plattan skickar. Formatet är detsamma som
 * admin skriver (`{monday: {closed, shifts}}`), plus `specialHours`. Okända
 * toppnycklar behålls, och `regular` ersätts av dagnycklarna.
 */
export function normalizeTerminalOpeningHours(
  input: unknown,
  stored: string | null | undefined,
  today = stockholmDateKey(),
): string {
  if (!isPlainObject(input)) throw invalid('INVALID_OPENING_HOURS', 'Ogiltig begäran');
  assertOnlyKeys(input, ['version', 'week', 'specialHours'], 'INVALID_OPENING_HOURS', 'Öppettider');
  const { week, specialHours } = input;
  if (!isPlainObject(week)) throw invalid('INVALID_OPENING_HOURS', 'Veckan saknas');
  assertOnlyKeys(week, DAY_KEYS, 'INVALID_OPENING_HOURS', 'Veckan');

  const days = Object.fromEntries(DAY_KEYS.map((day) => {
    const entry = week[day];
    if (!isPlainObject(entry)) throw invalid('INVALID_OPENING_HOURS', `${day} saknas`);
    assertOnlyKeys(entry, ['closed', 'shifts'], 'INVALID_OPENING_HOURS', day);
    if (entry.closed === true) return [day, { closed: true, shifts: [] }];
    const shifts = normalizeShifts(entry.shifts, day);
    return [day, shifts.length === 0 ? { closed: true, shifts: [] } : { closed: false, shifts }];
  }));

  const todayMs = datePartsOf(today);
  if (todayMs === null) throw new Error('today måste vara YYYY-MM-DD');
  const rawSpecial = specialHours === undefined ? [] : specialHours;
  if (!Array.isArray(rawSpecial)) throw invalid('INVALID_OPENING_HOURS', 'Avvikande dagar måste vara en lista');
  const seen = new Set<string>();
  const special: SpecialDay[] = [];
  for (const entry of rawSpecial) {
    if (!isPlainObject(entry)) throw invalid('INVALID_OPENING_HOURS', 'Ogiltig avvikande dag');
    assertOnlyKeys(entry, ['date', 'closed', 'shifts', 'note'], 'INVALID_OPENING_HOURS', 'Avvikande dag');
    const date = typeof entry.date === 'string' ? entry.date : '';
    const ms = datePartsOf(date);
    if (ms === null) throw invalid('INVALID_OPENING_HOURS', 'Datumet måste skrivas ÅÅÅÅ-MM-DD', { date });
    // Passerade dagar släpps tyst, så att en lista som legat öppen över natten går att spara.
    if (ms < todayMs - TERMINAL_LIMITS.specialDaysKeptAfter * DAY_MS) continue;
    if (ms > todayMs + TERMINAL_LIMITS.specialDaysAheadMax * DAY_MS) {
      throw invalid('INVALID_OPENING_HOURS', 'Avvikande dagar kan läggas högst ett år framåt', { date });
    }
    if (seen.has(date)) throw invalid('INVALID_OPENING_HOURS', `${date} finns två gånger`, { date });
    seen.add(date);
    if (entry.note !== undefined && typeof entry.note !== 'string') {
      throw invalid('INVALID_OPENING_HOURS', 'Noteringen måste vara text', { date });
    }
    const note = typeof entry.note === 'string' ? entry.note.trim() : '';
    if (note.length > TERMINAL_LIMITS.noteMaxLength) {
      throw invalid('INVALID_OPENING_HOURS', `Noteringen får vara högst ${TERMINAL_LIMITS.noteMaxLength} tecken`, { date });
    }
    const shifts = entry.closed === true ? [] : normalizeShifts(entry.shifts ?? [], date);
    special.push({ date, closed: shifts.length === 0, shifts, ...(note ? { note } : {}) });
  }
  if (special.length > TERMINAL_LIMITS.maxSpecialDays) {
    throw invalid('INVALID_OPENING_HOURS', `Högst ${TERMINAL_LIMITS.maxSpecialDays} avvikande dagar`);
  }
  special.sort((a, b) => a.date.localeCompare(b.date));

  const existing = parseObject(stored);
  const kept = Object.fromEntries(
    Object.entries(existing).filter(([key]) => !(DAY_KEYS as readonly string[]).includes(key) && key !== 'regular' && key !== 'specialHours'),
  );
  return JSON.stringify({ ...kept, ...days, specialHours: special });
}

// ── Menypriser ──────────────────────────────────────────────────────────────

export type PriceKind = 'product' | 'extra';
export type PriceChange = { kind: PriceKind; id: string; fromOre: number; toOre: number };
export const priceKey = (kind: PriceKind, id: string) => `${kind}:${id}`;

const priceRange = (kind: PriceKind) => kind === 'product'
  ? { min: 0, max: TERMINAL_LIMITS.productMaxOre }
  : { min: TERMINAL_LIMITS.extraMinOre, max: TERMINAL_LIMITS.extraMaxOre };

export function parsePriceChanges(body: unknown): PriceChange[] {
  if (!isPlainObject(body)) throw invalid('INVALID_PRICE', 'Ogiltig begäran');
  assertOnlyKeys(body, ['changes', 'summary'], 'INVALID_PRICE', 'Priser');
  const { changes } = body;
  if (!Array.isArray(changes) || changes.length === 0) throw invalid('INVALID_PRICE', 'Inga ändringar att spara');
  if (changes.length > TERMINAL_LIMITS.maxPriceChanges) {
    throw invalid('INVALID_PRICE', `Högst ${TERMINAL_LIMITS.maxPriceChanges} ändringar åt gången`);
  }
  const seen = new Set<string>();
  return changes.map((change) => {
    if (!isPlainObject(change)) throw invalid('INVALID_PRICE', 'Ogiltig prisändring');
    assertOnlyKeys(change, ['kind', 'id', 'fromOre', 'toOre'], 'INVALID_PRICE', 'Pris');
    const kind = change.kind;
    if (kind !== 'product' && kind !== 'extra') throw invalid('INVALID_PRICE', 'Okänd sorts pris');
    const id = typeof change.id === 'string' ? change.id : '';
    if (!id) throw invalid('INVALID_PRICE', 'Priset saknar id');
    const key = priceKey(kind, id);
    if (seen.has(key)) throw invalid('INVALID_PRICE', 'Samma pris finns två gånger', { kind, id });
    seen.add(key);
    const { min, max } = priceRange(kind);
    // fromOre har ingen övre gräns: ett gammalt pris utanför gränserna ska fortfarande gå att rätta.
    if (typeof change.fromOre !== 'number' || !Number.isSafeInteger(change.fromOre)) {
      throw invalid('INVALID_PRICE', 'Det gamla priset saknas', { kind, id });
    }
    if (!integerIn(change.toOre, min, max)) {
      throw invalid('INVALID_PRICE', kind === 'product'
        ? 'Priset på en rätt måste vara 0–3 000 kr'
        : 'Priset på ett tillval måste vara −500 till 1 000 kr', { kind, id });
    }
    return { kind, id, fromOre: change.fromOre, toOre: change.toOre };
  });
}

/**
 * Delar upp ändringarna mot det som ligger i databasen nu. `unchanged` betyder
 * att servern redan har det nya priset (dubbeltryck, omspelning eller ångra som
 * redan gått igenom). `conflicts` betyder att någon annan hunnit ändra.
 */
export function planPriceChanges(changes: PriceChange[], currentByKey: Map<string, number>) {
  const apply: PriceChange[] = [];
  const unchanged: PriceChange[] = [];
  const conflicts: Array<{ kind: PriceKind; id: string; currentOre: number | null }> = [];
  for (const change of changes) {
    const current = currentByKey.get(priceKey(change.kind, change.id));
    if (current === undefined) conflicts.push({ kind: change.kind, id: change.id, currentOre: null });
    else if (current === change.toOre) unchanged.push(change);
    else if (current !== change.fromOre) conflicts.push({ kind: change.kind, id: change.id, currentOre: current });
    else apply.push(change);
  }
  return { apply, unchanged, conflicts };
}

export type PriceMenu = {
  products: Array<{
    id: string;
    name: string;
    priceOre: number;
    discountActive: boolean;
    discountPriceOre: number | null;
    extraGroupIds: string[];
  }>;
  groups: Array<{ id: string; name: string; extras: Array<{ id: string; name: string; priceAddonOre: number }> }>;
};

/**
 * Prövar menyn som den blir efter ändringen. Bara rätter som påverkas av
 * ändringen kontrolleras, så ett gammalt fel någon annanstans aldrig hindrar
 * restaurangen från att spara.
 *  - Ett negativt tillval får inte ta en rätt under 0 kr (samma regel som
 *    assertNonnegativeCatalogLine i kassan). Det mest negativa tillvalet i varje
 *    grupp räknas, åt båda hållen: höjt avdrag och sänkt rätt.
 *  - Ett aktivt reapris får inte ligga över det nya ordinarie priset.
 */
export function validatePriceResult(menu: PriceMenu, changes: PriceChange[]) {
  const productTo = new Map(changes.filter((c) => c.kind === 'product').map((c) => [c.id, c.toOre]));
  const extraTo = new Map(changes.filter((c) => c.kind === 'extra').map((c) => [c.id, c.toOre]));
  const groupsById = new Map(menu.groups.map((group) => [group.id, group]));
  const touchedGroups = new Set(
    menu.groups.filter((group) => group.extras.some((extra) => extraTo.has(extra.id))).map((group) => group.id),
  );

  const negativeViolations: Array<{ productId: string; productName: string; priceOre: number; extraName: string; extraOre: number }> = [];
  const discountViolations: Array<{ productId: string; productName: string; priceOre: number; discountPriceOre: number }> = [];

  for (const product of menu.products) {
    const priceChanged = productTo.has(product.id);
    const groupTouched = product.extraGroupIds.some((id) => touchedGroups.has(id));
    if (!priceChanged && !groupTouched) continue;
    const priceOre = productTo.get(product.id) ?? product.priceOre;

    let worstTotal = 0;
    let worstExtra: { name: string; ore: number } | null = null;
    for (const groupId of product.extraGroupIds) {
      const group = groupsById.get(groupId);
      if (!group) continue;
      let lowest: { name: string; ore: number } | null = null;
      for (const extra of group.extras) {
        const ore = extraTo.get(extra.id) ?? extra.priceAddonOre;
        if (ore < 0 && (!lowest || ore < lowest.ore)) lowest = { name: extra.name, ore };
      }
      if (lowest) {
        worstTotal += lowest.ore;
        if (!worstExtra || lowest.ore < worstExtra.ore) worstExtra = lowest;
      }
    }
    if (worstExtra && priceOre + worstTotal < 0) {
      negativeViolations.push({ productId: product.id, productName: product.name, priceOre, extraName: worstExtra.name, extraOre: worstExtra.ore });
    }
    if (priceChanged && product.discountActive && product.discountPriceOre != null && product.discountPriceOre > priceOre) {
      discountViolations.push({ productId: product.id, productName: product.name, priceOre, discountPriceOre: product.discountPriceOre });
    }
  }

  if (negativeViolations.length > 0) {
    const first = negativeViolations[0];
    throw invalid(
      'NEGATIVE_EXTRA_EXCEEDS_PRICE',
      `${first.extraName} (${first.extraOre / 100} kr) gör ${first.productName} (${first.priceOre / 100} kr) billigare än 0 kr`,
      { violations: negativeViolations },
    );
  }
  if (discountViolations.length > 0) {
    const first = discountViolations[0];
    throw invalid(
      'DISCOUNT_ABOVE_PRICE',
      `Reapriset på ${first.productName} (${first.discountPriceOre / 100} kr) är högre än det nya priset`,
      { violations: discountViolations },
    );
  }
}

// ── Vitlista för plattans token mot de vanliga rutterna ─────────────────────

const RESTAURANT_FIELDS = ['isOpen', 'pausedUntil', 'acceptingOrdersMode', 'acceptingOrdersOverrideUntil', 'acceptingOrdersOverrideReason'];
const PRODUCT_FIELDS = ['isActive', 'rewardable'];
const EXTRA_FIELDS = ['isActive'];
const SEGMENT = '[^/]+';

/**
 * Vad en token med `deviceId` (restaurangplattan) får skriva utanför
 * `/api/terminal`. Listan bygger på vad v1 och v2 faktiskt skickar. Allt annat,
 * till exempel zongeometri, namn, slug, provision och tillvalsgrupper, nekas.
 * Läsningar påverkas inte.
 */
export function terminalWriteAllowed(method: string, path: string, body: unknown): { allowed: boolean; reason?: string } {
  const verb = method.toUpperCase();
  if (verb === 'GET' || verb === 'HEAD' || verb === 'OPTIONS') return { allowed: true };
  const clean = path.split('?')[0].replace(/\/+$/, '');
  const keysWithin = (allowed: string[]) => {
    if (!isPlainObject(body)) return { allowed: true };
    const extra = Object.keys(body).find((key) => !allowed.includes(key));
    return extra ? { allowed: false, reason: `fältet ${extra}` } : { allowed: true };
  };
  const is = (pattern: string) => new RegExp(`^${pattern}$`).test(clean);

  if (clean === '/api/terminal' || clean.startsWith('/api/terminal/')) return { allowed: true };
  if (verb === 'PATCH' && is(`/api/restaurants/${SEGMENT}`)) return keysWithin(RESTAURANT_FIELDS);
  if (verb === 'PATCH' && is(`/api/admin/products/${SEGMENT}`)) return keysWithin(PRODUCT_FIELDS);
  if (verb === 'PATCH' && is(`/api/admin/extras/${SEGMENT}`)) return keysWithin(EXTRA_FIELDS);
  if (verb === 'POST' && is('/api/admin/deals')) return { allowed: true };
  if (verb === 'DELETE' && is(`/api/admin/deals/${SEGMENT}`)) return { allowed: true };
  if (verb === 'PATCH' && is(`/api/admin/orders/${SEGMENT}/status`)) return { allowed: true };
  return { allowed: false, reason: `${verb} ${clean}` };
}

/**
 * Admin skickar öppettider utan `specialHours` (formuläret känner inte till dem).
 * Då behålls de avvikande dagar som plattan lagt in, i stället för att raderas.
 */
export function keepSpecialHours(incoming: unknown, stored: string | null | undefined): unknown {
  let parsed: unknown = incoming;
  if (typeof incoming === 'string') {
    try { parsed = JSON.parse(incoming); } catch { return incoming; }
  }
  if (!isPlainObject(parsed) || Object.prototype.hasOwnProperty.call(parsed, 'specialHours')) return incoming;
  const existing = parseObject(stored);
  if (!Array.isArray(existing.specialHours) || existing.specialHours.length === 0) return incoming;
  return { ...parsed, specialHours: existing.specialHours };
}
