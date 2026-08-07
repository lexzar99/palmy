const STOCKHOLM_TIME_ZONE = 'Europe/Stockholm';

type CalendarDate = {
  year: number;
  month: number;
  day: number;
};

const stockholmPartsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: STOCKHOLM_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export class FinancePeriodError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = 'FinancePeriodError';
  }
}
const datePartsInStockholm = (date: Date) => {
  const parts = Object.fromEntries(
    stockholmPartsFormatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
};

const validCalendarDate = ({ year, month, day }: CalendarDate) => {
  const probe = new Date(0);
  probe.setUTCHours(0, 0, 0, 0);
  probe.setUTCFullYear(year, month - 1, day);
  return probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day;
};

const parseDateOnly = (value: unknown, label: string): CalendarDate | null => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new FinancePeriodError(`${label} måste anges som ÅÅÅÅ-MM-DD`);
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new FinancePeriodError(`${label} måste anges som ÅÅÅÅ-MM-DD`);
  }
  const calendarDate = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
  if (!validCalendarDate(calendarDate)) {
    throw new FinancePeriodError(`${label} är inte ett giltigt datum`);
  }
  return calendarDate;
};

const addCalendarDays = (date: CalendarDate, days: number): CalendarDate => {
  const next = new Date(0);
  next.setUTCHours(0, 0, 0, 0);
  next.setUTCFullYear(date.year, date.month - 1, date.day + days);
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
};

/**
 * Converts an unambiguous Stockholm wall-clock midnight to an instant. The
 * iterative correction asks Intl for the real zone offset on that date, so it
 * follows both CET and CEST without depending on the server's own TZ setting.
 */
const stockholmMidnight = ({ year, month, day }: CalendarDate): Date => {
  const targetWallClock = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  let instant = targetWallClock;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actual = datePartsInStockholm(new Date(instant));
    const actualWallClock = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
      0,
    );
    const correction = targetWallClock - actualWallClock;
    instant += correction;
    if (correction === 0) break;
  }

  const result = new Date(instant);
  const parts = datePartsInStockholm(result);
  if (
    parts.year !== year ||
    parts.month !== month ||
    parts.day !== day ||
    parts.hour !== 0 ||
    parts.minute !== 0 ||
    parts.second !== 0
  ) {
    throw new FinancePeriodError('Kunde inte beräkna periodgränsen i Europe/Stockholm');
  }
  return result;
};

/** Inclusive calendar-day period in Europe/Stockholm. */
export function resolveFinancePeriod(
  fromRaw: unknown,
  toRaw: unknown,
  now = new Date(),
) {
  if (!Number.isFinite(now.getTime())) {
    throw new FinancePeriodError('Nuvarande tid är ogiltig');
  }

  const today = datePartsInStockholm(now);
  const startDate = parseDateOnly(fromRaw, 'Periodens start') ?? {
    year: today.year,
    month: today.month,
    day: 1,
  };
  const endDate = parseDateOnly(toRaw, 'Periodens slut') ?? {
    year: today.year,
    month: today.month,
    day: today.day,
  };

  const start = stockholmMidnight(startDate);
  const end = new Date(stockholmMidnight(addCalendarDays(endDate, 1)).getTime() - 1);
  if (start.getTime() > end.getTime()) {
    throw new FinancePeriodError('Periodens slut måste vara samma dag som eller efter start');
  }
  return { start, end };
}
