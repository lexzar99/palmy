import { resolveRestaurantAvailability } from './restaurantAvailability';

type Restaurant = Parameters<typeof resolveRestaurantAvailability>[0] & {
  name: string;
  slug: string;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  pickupOnly?: boolean | null;
  openingHours?: unknown;
};
type Overlays = Parameters<typeof resolveRestaurantAvailability>[1];

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
const STEP_MS = 5 * 60_000;
const HORIZON_MS = 7 * 24 * 60 * 60_000;
const MAX_CHANGES = 40;

const parseHours = (value: unknown): Record<string, any> => {
  if (typeof value !== 'string') return (value ?? {}) as Record<string, any>;
  try {
    return JSON.parse(value) ?? {};
  } catch {
    return {};
  }
};

/** Veckoschemat i en enda form, oavsett om dagen sparats med `shifts` eller `open`/`close`. */
function weekFromHours(openingHours: unknown) {
  const hours = parseHours(openingHours);
  return DAYS.map((day) => {
    const entry = hours[day];
    if (!entry || entry.closed) return { day, shifts: [] };
    const shifts = Array.isArray(entry.shifts) ? entry.shifts : [{ open: entry.open, close: entry.close }];
    return { day, shifts: shifts.filter((s: any) => s?.open && s?.close).map((s: any) => ({ open: s.open, close: s.close })) };
  });
}

/**
 * Publikt läge för restaurangens egen hemsida: litet svar utan meny. Kommande
 * öppningar och stängningar räknas med samma logik som kassan, så att sajten
 * bara behöver jämföra klockan med listan.
 */
export function buildRestaurantPublicStatus(restaurant: Restaurant, overlays: Overlays, now = new Date()) {
  const openAt = (time: number) => resolveRestaurantAvailability(restaurant, overlays, new Date(time)).isOpen;
  const start = now.getTime();
  const changes: { at: string; open: boolean }[] = [];
  let previous = openAt(start);
  const openNow = previous;

  for (let time = start + STEP_MS; time <= start + HORIZON_MS && changes.length < MAX_CHANGES; time += STEP_MS) {
    const open = openAt(time);
    if (open === previous) continue;
    let low = time - STEP_MS;
    let high = time;
    while (high - low > 60_000) {
      const middle = Math.floor((low + high) / 2);
      if (openAt(middle) === previous) low = middle;
      else high = middle;
    }
    changes.push({ at: new Date(Math.ceil(high / 60_000) * 60_000).toISOString(), open });
    previous = open;
  }

  return {
    slug: restaurant.slug,
    name: restaurant.name,
    address: restaurant.address ?? null,
    city: restaurant.city ?? null,
    phone: restaurant.phone ?? null,
    pickup: true,
    delivery: !restaurant.pickupOnly,
    week: weekFromHours(restaurant.openingHours),
    openNow,
    changes,
    generatedAt: now.toISOString(),
  };
}
