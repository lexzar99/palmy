
export interface OpeningHours {
  open: string; // e.g., "11:00"
  close: string; // e.g., "22:00"
  closed: boolean;
}

export type WeeklyOpeningHours = Record<string, OpeningHours>;

const SWEDEN_TIME_ZONE = 'Europe/Stockholm';
const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const stockholmFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: SWEDEN_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  hourCycle: 'h23',
});

type LocalDateParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function parseHours(openingHours: any | string | null | undefined): any | null {
  if (!openingHours) return null;
  if (typeof openingHours === 'string') {
    try {
      return JSON.parse(openingHours);
    } catch {
      return null;
    }
  }
  return openingHours;
}

function stockholmParts(date: Date): LocalDateParts {
  const parts = stockholmFormatter.formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value || 0);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

function stockholmOffsetMs(date: Date): number {
  const p = stockholmParts(date);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - date.getTime();
}

function stockholmLocalToUtc(year: number, month: number, day: number, hour: number, minute: number): Date {
  const localAsUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let utc = new Date(localAsUtcMs);
  for (let i = 0; i < 3; i += 1) {
    utc = new Date(localAsUtcMs - stockholmOffsetMs(utc));
  }
  return utc;
}

function addLocalDays(base: LocalDateParts, days: number): LocalDateParts {
  const d = new Date(Date.UTC(base.year, base.month - 1, base.day + days, 12, 0, 0, 0));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: 0,
    minute: 0,
    second: 0,
  };
}

function localDateKey(date: Pick<LocalDateParts, 'year' | 'month' | 'day'>): string {
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}

function localDayName(date: Pick<LocalDateParts, 'year' | 'month' | 'day'>): string {
  return DAY_NAMES[new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay()];
}

function slotsFor(day: any): any[] {
  if (!day || day.closed === true) return [];
  if (Array.isArray(day)) return day;
  if (Array.isArray(day.shifts)) return day.shifts;
  return [day];
}

function dayDataFor(hours: any, date: Pick<LocalDateParts, 'year' | 'month' | 'day'>): any | null {
  const specialHours = Array.isArray(hours.specialHours) ? hours.specialHours : [];
  const special = specialHours.find((sh: any) => sh?.date === localDateKey(date));
  if (special?.closed === true) return null;
  if (special) return special;
  const day = localDayName(date);
  return hours[day] || hours.regular?.[day] || null;
}

function parseTimeMinutes(value: unknown): number | null {
  if (typeof value !== 'string' || !value.includes(':')) return null;
  const [hour, minute] = value.split(':').map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

/**
 * Returns the next scheduled opening after the current Stockholm calendar day.
 * Used for terminal "closed for today": the restaurant should return to
 * schedule automatically and never become permanently force-closed.
 */
export function nextOpeningAfterToday(
  openingHours: any | string | null | undefined,
  now = new Date(),
): Date {
  const base = stockholmParts(now);
  const tomorrow = addLocalDays(base, 1);
  const fallback = stockholmLocalToUtc(tomorrow.year, tomorrow.month, tomorrow.day, 0, 0);
  const hours = parseHours(openingHours);
  if (!hours || typeof hours !== 'object') return fallback;

  const allKeys = Object.keys(hours);
  const hasRegular = hours.regular && Object.keys(hours.regular).length > 0;
  if (allKeys.length === 0 && !hasRegular) return fallback;

  for (let offset = 1; offset <= 14; offset += 1) {
    const date = addLocalDays(base, offset);
    const candidates = slotsFor(dayDataFor(hours, date))
      .map((slot) => parseTimeMinutes(slot?.open))
      .filter((value): value is number => value !== null)
      .sort((a, b) => a - b);
    if (candidates.length === 0) continue;
    const first = candidates[0];
    return stockholmLocalToUtc(date.year, date.month, date.day, Math.floor(first / 60), first % 60);
  }

  return fallback;
}

export function isRestaurantOpen(
  openingHours: any | string | null | undefined,
  now = new Date(),
): boolean {
  if (!openingHours) return true;
  
  let hours: any;
  if (typeof openingHours === 'string') {
    try {
      hours = JSON.parse(openingHours);
    } catch {
      return true;
    }
  } else {
    hours = openingHours;
  }

  // Use Sweden (Europe/Stockholm) time. `now` is injectable so status checks
  // and tests use the same instant, including DST transitions.
  const nowInSweden = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Stockholm' }));
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayKey = dayNames[nowInSweden.getDay()];
  const yesterday = new Date(nowInSweden);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = dayNames[yesterday.getDay()];
  const dateKey = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const todayStr = dateKey(nowInSweden);
  const yesterdayStr = dateKey(yesterday);

  const slotsFor = (day: any): any[] => {
    if (!day || day.closed === true) return [];
    if (Array.isArray(day)) return day;
    if (Array.isArray(day.shifts)) return day.shifts;
    return [day];
  };

  const specialHours = Array.isArray(hours.specialHours) ? hours.specialHours : [];
  const todaySpecial = specialHours.find((sh: any) => sh?.date === todayStr);
  const yesterdaySpecial = specialHours.find((sh: any) => sh?.date === yesterdayStr);

  // Check Special Hours (Exceptions)
  if (todaySpecial?.closed === true) return false;
  const todayData = todaySpecial || hours[dayKey] || hours.regular?.[dayKey];
  const yesterdayData = yesterdaySpecial?.closed === true
    ? null
    : yesterdaySpecial || hours[yesterdayKey] || hours.regular?.[yesterdayKey];

  // If no hours set at all (completely empty object), default to open for new restaurants
  const allKeys = Object.keys(hours);
  const hasRegular = hours.regular && Object.keys(hours.regular).length > 0;
  if (allKeys.length === 0 && !hasRegular) return true;

  // Today's own shifts cover their same-calendar-day segment. For a 22-02
  // shift that is 22:00-24:00 here; 00:00-02:00 belongs to yesterday's shift.
  for (const slot of slotsFor(todayData)) {
    if (!slot.open || !slot.close) continue;
    const open = isWithinSlot(nowInSweden, slot.open, slot.close, false);
    if (open) return true;
  }

  // Carry the previous day's overnight shifts across midnight. This avoids
  // closing a Friday 22-02 restaurant at 00:01 on Saturday.
  for (const slot of slotsFor(yesterdayData)) {
    if (!slot.open || !slot.close) continue;
    if (isWithinSlot(nowInSweden, slot.open, slot.close, true)) return true;
  }

  return false;
}

/**
 * Returns true if the restaurant has any meaningful opening-hours data configured.
 * Accepts every shape isRestaurantOpen() handles:
 *   - { monday: { open, close } }
 *   - { monday: { open, close, closed } }
 *   - { monday: [{ open, close }, ...] }
 *   - { monday: { shifts: [{ open, close }, ...] } }
 *   - { monday: { closed: true } }
 *   - { specialHours: [...] }
 *   - { regular: { monday: ... } }
 */
export function hasOpeningHours(openingHours: any | string | null | undefined): boolean {
  if (!openingHours) return false;
  let hours: any;
  if (typeof openingHours === 'string') {
    try {
      hours = JSON.parse(openingHours);
    } catch {
      return false;
    }
  } else {
    hours = openingHours;
  }
  if (!hours || typeof hours !== 'object') return false;

  const dayHasData = (day: any): boolean => {
    if (!day) return false;
    if (Array.isArray(day)) return day.some((slot) => slot && (slot.open || slot.close));
    if (typeof day !== 'object') return false;
    if (day.closed === true || day.closed === false) return true;
    if (day.open && day.close) return true;
    if (Array.isArray(day.shifts) && day.shifts.some((s: any) => s && (s.open || s.close))) return true;
    return false;
  };

  if (Array.isArray(hours.specialHours) && hours.specialHours.some(dayHasData)) return true;
  if (hours.regular && typeof hours.regular === 'object') {
    for (const k of Object.keys(hours.regular)) {
      if (dayHasData(hours.regular[k])) return true;
    }
  }
  const skip = new Set(['specialHours', 'regular']);
  for (const key of Object.keys(hours)) {
    if (skip.has(key)) continue;
    if (dayHasData(hours[key])) return true;
  }
  return false;
}

/**
 * Minuter kvar tills restaurangen enligt schemat stänger IDAG, räknat från nu
 * (Europe/Stockholm). Returnerar null om restaurangen inte är inom ett öppet
 * pass just nu. Används av bedrägeri-vakten för att flagga "stängde tidigt"
 * (t.ex. pausade 1,5h innan stängning). Hanterar samma former som
 * isRestaurantOpen (platt, shifts, array, regular, specialHours).
 */
export function minutesUntilClose(openingHours: any | string | null | undefined): number | null {
  if (!openingHours) return null;
  let hours: any;
  if (typeof openingHours === 'string') {
    try {
      hours = JSON.parse(openingHours);
    } catch {
      return null;
    }
  } else {
    hours = openingHours;
  }
  if (!hours || typeof hours !== 'object') return null;

  const nowInSweden = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Stockholm' }));
  const todayStr = nowInSweden.toISOString().split('T')[0];
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayKey = dayNames[nowInSweden.getDay()];

  let todayData: any = hours[dayKey] || hours.regular?.[dayKey];
  if (hours.specialHours && Array.isArray(hours.specialHours)) {
    const special = hours.specialHours.find((sh: any) => sh.date === todayStr);
    if (special) {
      if (special.closed) return null;
      if (special.open && special.close) todayData = special;
    }
  }
  if (!todayData || (todayData as any).closed === true) return null;

  let slots: any[] = [];
  if (Array.isArray(todayData)) slots = todayData;
  else if (Array.isArray((todayData as any).shifts)) slots = (todayData as any).shifts;
  else slots = [todayData];

  const nowMin = nowInSweden.getHours() * 60 + nowInSweden.getMinutes();
  for (const slot of slots) {
    if (!slot?.open || !slot?.close) continue;
    const [oH, oM] = String(slot.open).split(':').map(Number);
    const [cH, cM] = String(slot.close).split(':').map(Number);
    if ([oH, oM, cH, cM].some((n) => Number.isNaN(n))) continue;
    const openMin = oH * 60 + oM;
    let closeMin = cH * 60 + cM;
    if (closeMin <= openMin) closeMin += 24 * 60; // efter midnatt
    if (nowMin >= openMin && nowMin < closeMin) return closeMin - nowMin;
  }
  return null;
}

function isWithinSlot(now: Date, open: any, close: any, previousDayCarry = false): boolean {
  if (typeof open !== 'string' || typeof close !== 'string') return false;
  if (!open.includes(':') || !close.includes(':')) return false;

  const [openH, openM] = open.split(':').map(Number);
  const [closeH, closeM] = close.split(':').map(Number);
  
  if (isNaN(openH) || isNaN(openM) || isNaN(closeH) || isNaN(closeM)) return false;
  
  const currentTimeInMinutes = now.getHours() * 60 + now.getMinutes();
  const openTimeInMinutes = openH * 60 + openM;
  let closeTimeInMinutes = closeH * 60 + closeM;

  if (closeTimeInMinutes <= openTimeInMinutes) {
    return previousDayCarry
      ? currentTimeInMinutes < closeTimeInMinutes
      : currentTimeInMinutes >= openTimeInMinutes;
  }

  return !previousDayCarry && currentTimeInMinutes >= openTimeInMinutes && currentTimeInMinutes < closeTimeInMinutes;
}
