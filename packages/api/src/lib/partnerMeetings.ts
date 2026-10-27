/**
 * Mötesbokning för restaurangpartners (/boka på webben).
 *
 * Restauranger som visat intresse får en SMS-länk och bokar 30 minuter med
 * Jalle, på plats (bara Skåne) eller som videomöte. Bokningarna lagras som
 * `EngineEvent`-rader med engine = "partner_meeting" — ingen schemaändring,
 * eftersom produktionen inte är baselined och SQL måste köras manuellt.
 *
 * Radens id härleds ur passets starttid (`meeting_20261029T1300`). Två
 * samtidiga bokningar av samma pass krockar därmed på primärnyckeln (P2002)
 * och den andra får 409 — dubbelbokning är omöjlig utan extra låsning.
 *
 * Kalendern ska se efterfrågad ut: ungefär hälften av passen visas som
 * "Bokad" via en stabil hash av datum + tid. Samma pass ger alltid samma
 * svar, så inget hoppar mellan sidladdningar, och API:t nekar de passen
 * precis som riktiga bokningar.
 */

import crypto from 'crypto';
import { z } from 'zod';

export const PARTNER_MEETING_ENGINE = 'partner_meeting';
export const MEETING_TIME_ZONE = 'Europe/Stockholm';
export const MEETING_DURATION_MIN = 30;
export const MEETING_BUFFER_MIN = 15;
/** 13:00–18:00 med 30 min möte + 15 min buffert. Sista start 17:30 slutar 18:00. */
export const MEETING_START_TIMES = ['13:00', '13:45', '14:30', '15:15', '16:00', '16:45', '17:30'] as const;
/** ISO-veckodagar (mån = 1 … sön = 7) som går att boka: tor, fre, lör, sön, mån. */
export const MEETING_WEEKDAYS = new Set([4, 5, 6, 7, 1]);

/** Salt till blockeringshashen. Byts det ritas hela kalendern om. */
const BLOCK_SALT = 'viaeats-partner-meeting-v1';

const WEEKDAY_SHORT = ['', 'mån', 'tis', 'ons', 'tor', 'fre', 'lör', 'sön'];
const WEEKDAY_LONG = ['', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag', 'söndag'];
const MONTH_SHORT = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

export type MeetingMode = 'onsite' | 'video';

export type LocalDate = { year: number; month: number; day: number };

export type MeetingSlot = {
  /** Stabilt id, också EngineEvent-radens id. */
  id: string;
  start: string;
  end: string;
  /** "13:45" */
  label: string;
  blocked: boolean;
};

export type MeetingDay = {
  /** "2026-10-29" */
  date: string;
  /** ISO-veckodag, mån = 1 … sön = 7 */
  weekday: number;
  /** "tor" */
  weekdayShort: string;
  /** "29 okt" */
  dateLabel: string;
  slots: MeetingSlot[];
};

// ── Tid i Europe/Stockholm ───────────────────────────────────────────────────

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: MEETING_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function stockholmParts(instant: Date) {
  const parts: Record<string, number> = {};
  for (const p of partsFormatter.formatToParts(instant)) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour === 24 ? 0 : parts.hour,
    minute: parts.minute,
  };
}

/** Lokal svensk väggklocka → UTC-ögonblick (hanterar sommar-/vintertid). */
export function stockholmToUtc(date: LocalDate, hour: number, minute: number): Date {
  const wanted = Date.UTC(date.year, date.month - 1, date.day, hour, minute);
  let guess = wanted;
  // Två varv räcker: offseten är +1 eller +2 och ändras högst en gång per dygn.
  for (let i = 0; i < 2; i += 1) {
    const p = stockholmParts(new Date(guess));
    const seen = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    guess += wanted - seen;
  }
  return new Date(guess);
}

export function stockholmToday(now: Date): LocalDate {
  const p = stockholmParts(now);
  return { year: p.year, month: p.month, day: p.day };
}

function addDays(date: LocalDate, days: number): LocalDate {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function isoWeekday(date: LocalDate): number {
  const dow = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
  return dow === 0 ? 7 : dow;
}

const pad = (n: number) => String(n).padStart(2, '0');
const dateKey = (d: LocalDate) => `${d.year}-${pad(d.month)}-${pad(d.day)}`;

/** Fönstret: från i morgon till och med söndag i nästa vecka (räknat i Stockholm). */
export function meetingWindow(now: Date): { first: LocalDate; last: LocalDate } {
  const today = stockholmToday(now);
  const toThisSunday = 7 - isoWeekday(today);
  return { first: addDays(today, 1), last: addDays(today, toThisSunday + 7) };
}

// ── Blockering ("Bokad" för att kalendern ska se efterfrågad ut) ─────────────

function hashFraction(input: string): number {
  const digest = crypto.createHash('sha256').update(`${BLOCK_SALT}:${input}`, 'utf8').digest();
  return digest.readUInt32BE(0) / 0x1_0000_0000;
}

/**
 * Hur upptagen en dag ska se ut: 20–80 % av passen, i snitt ungefär hälften.
 * Vissa dagar blir nästan fulla, andra har flera lediga.
 */
export function dayBusyness(date: string): number {
  return 0.2 + hashFraction(`day:${date}`) * 0.6;
}

/**
 * Vilka starttider en dag som visas som bokade. Deterministiskt per datum
 * och tid. Minst ett pass per dag lämnas alltid ledigt: blir alla blockerade
 * friges passet med högst hash (alltså det som var "närmast" att vara ledigt).
 */
export function blockedTimesForDate(date: string): Set<string> {
  const busy = dayBusyness(date);
  const scored = MEETING_START_TIMES.map((time) => ({ time, score: hashFraction(`slot:${date}T${time}`) }));
  const blocked = new Set(scored.filter((s) => s.score < busy).map((s) => s.time));
  if (blocked.size >= MEETING_START_TIMES.length) {
    const freest = scored.reduce((a, b) => (b.score > a.score ? b : a));
    blocked.delete(freest.time);
  }
  return blocked;
}

// ── Passgenerering ───────────────────────────────────────────────────────────

export function meetingSlotId(date: LocalDate, time: string): string {
  return `meeting_${date.year}${pad(date.month)}${pad(date.day)}T${time.replace(':', '')}`;
}

export function buildMeetingDays(now: Date = new Date()): MeetingDay[] {
  const { first, last } = meetingWindow(now);
  const days: MeetingDay[] = [];
  for (let d = first; dateKey(d) <= dateKey(last); d = addDays(d, 1)) {
    const weekday = isoWeekday(d);
    if (!MEETING_WEEKDAYS.has(weekday)) continue;
    const key = dateKey(d);
    const blocked = blockedTimesForDate(key);
    days.push({
      date: key,
      weekday,
      weekdayShort: WEEKDAY_SHORT[weekday],
      dateLabel: `${d.day} ${MONTH_SHORT[d.month - 1]}`,
      slots: MEETING_START_TIMES.map((time) => {
        const [h, m] = time.split(':').map(Number);
        const start = stockholmToUtc(d, h, m);
        return {
          id: meetingSlotId(d, time),
          start: start.toISOString(),
          end: new Date(start.getTime() + MEETING_DURATION_MIN * 60_000).toISOString(),
          label: time,
          blocked: blocked.has(time),
        };
      }),
    });
  }
  return days;
}

/** Slår upp ett pass i det aktuella fönstret utifrån klientens ISO-start. */
export function findMeetingSlot(slotStart: string, now: Date = new Date()): MeetingSlot | null {
  const wanted = new Date(slotStart);
  if (Number.isNaN(wanted.getTime())) return null;
  for (const day of buildMeetingDays(now)) {
    for (const slot of day.slots) {
      if (new Date(slot.start).getTime() === wanted.getTime()) return slot;
    }
  }
  return null;
}

// ── Skåne och mötesform ──────────────────────────────────────────────────────

export const SKANE_CITIES = [
  'Malmö', 'Lund', 'Helsingborg', 'Kristianstad', 'Landskrona', 'Trelleborg', 'Ängelholm',
  'Hässleholm', 'Ystad', 'Eslöv', 'Höganäs', 'Åstorp', 'Staffanstorp', 'Vellinge', 'Höör',
  'Simrishamn', 'Klippan', 'Svedala', 'Lomma', 'Kävlinge', 'Bjuv', 'Perstorp', 'Tomelilla',
  'Sjöbo', 'Skurup', 'Båstad', 'Osby', 'Örkelljunga', 'Burlöv', 'Arlöv', 'Svalöv', 'Bromölla',
] as const;

/** Gemener, utan diakriter, utan "kommun" och utan det som står efter ett kommatecken. */
export function normalizeCity(city: string): string {
  return String(city || '')
    .split(',')[0]
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\bkommun\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const SKANE_KEYS = new Set(SKANE_CITIES.map((c) => normalizeCity(c)));

export function isSkaneCity(city: string): boolean {
  const key = normalizeCity(city);
  if (!key) return false;
  if (SKANE_KEYS.has(key)) return true;
  // "Ängelholms kommun" → "angelholms"
  return key.endsWith('s') && SKANE_KEYS.has(key.slice(0, -1));
}

export function allowedModesForCity(city: string): MeetingMode[] {
  return isSkaneCity(city) ? ['onsite', 'video'] : ['video'];
}

export function modeLabel(mode: MeetingMode): string {
  return mode === 'onsite' ? 'På plats' : 'Videomöte';
}

// ── Formuläret ───────────────────────────────────────────────────────────────

export const PartnerMeetingSchema = z.object({
  slotStart: z.string().trim().min(10).max(40),
  mode: z.enum(['onsite', 'video']),
  name: z.string().trim().min(2, 'Ange ditt namn').max(100, 'Namnet är för långt'),
  email: z.string().trim().toLowerCase().email('Ange en giltig e-postadress').max(254),
  phone: z
    .string()
    .trim()
    .max(30, 'Telefonnumret är för långt')
    .refine((v) => v.replace(/\D/g, '').length >= 7, 'Ange ett giltigt telefonnummer'),
  restaurant: z.string().trim().min(2, 'Ange restaurangens namn').max(120, 'Restaurangnamnet är för långt'),
  city: z.string().trim().min(2, 'Ange ort').max(80, 'Orten är för lång'),
  /** Honungsfälla — riktiga besökare ser aldrig fältet. */
  website: z.string().max(200).optional(),
}).strict();

export type PartnerMeetingInput = z.infer<typeof PartnerMeetingSchema>;

// ── Presentation ─────────────────────────────────────────────────────────────

/** "tor 29 okt 13:45" i svensk tid. */
export function formatMeetingShort(startIso: string): string {
  const p = stockholmParts(new Date(startIso));
  const wd = isoWeekday({ year: p.year, month: p.month, day: p.day });
  return `${WEEKDAY_SHORT[wd]} ${p.day} ${MONTH_SHORT[p.month - 1]} ${pad(p.hour)}:${pad(p.minute)}`;
}

/** { date: "torsdag 29 okt", time: "13:45–14:15" } för mejlet. */
export function formatMeetingLong(startIso: string, endIso: string) {
  const s = stockholmParts(new Date(startIso));
  const e = stockholmParts(new Date(endIso));
  const wd = isoWeekday({ year: s.year, month: s.month, day: s.day });
  return {
    date: `${WEEKDAY_LONG[wd]} ${s.day} ${MONTH_SHORT[s.month - 1]}`,
    time: `${pad(s.hour)}:${pad(s.minute)}–${pad(e.hour)}:${pad(e.minute)}`,
  };
}

export function meetingAlertText(b: {
  slotStart: string;
  mode: MeetingMode;
  name: string;
  phone: string;
  email: string;
  restaurant: string;
  city: string;
}): string {
  return [
    `NY BOKNING ${formatMeetingShort(b.slotStart)} · ${modeLabel(b.mode)}`,
    `${b.restaurant}, ${b.city}`,
    `${b.name} · ${b.phone} · ${b.email}`,
  ].join('\n');
}
