/**
 * Restaurangernas egna domäner (fas 3 i docs/RESTAURANGSAJTER-PLATTFORM.md).
 *
 * En aktiv rad i RestaurantDomain släpper igenom exakt https://<host> för
 * CORS, kioskbevis och betalningsretur. Inga jokertecken, inget http och inga
 * portar: en domän läggs bara in av superadmin, och varje värdnamn räknas för sig.
 *
 * Tabellen läses i sin helhet till en ögonblicksbild i minnet. Den är liten, och
 * CORS-kontrollen måste vara synkron. Bilden förnyas var 60:e sekund och direkt
 * när en domän sparas i admin. Med flera API-instanser kan en ändring alltså ta
 * upp till en minut att nå alla.
 *
 * Saknas tabellen (SQL-filen är inte körd) gäller de hårdkodade listorna som
 * förut. Om läsningen fallerar av annat skäl behålls den senaste lyckade bilden,
 * så att ett tillfälligt databasfel inte öppnar eller stänger något.
 */

export const RESTAURANT_DOMAIN_CACHE_TTL_MS = 60_000;
export const DEFAULT_MENU_PATH = '/meny';

export type RestaurantDomainRow = {
  host: string;
  restaurantId: string;
  restaurantSlug: string;
  isPrimary: boolean;
  menuPath: string;
  embedEnabled: boolean;
  restaurantArchived: boolean;
};

export type ActiveRestaurantDomain = {
  host: string;
  origin: string;
  restaurantId: string;
  restaurantSlug: string;
  isPrimary: boolean;
  menuPath: string;
};

type SnapshotStatus = 'unloaded' | 'ok' | 'missing';

type Snapshot = {
  status: SnapshotStatus;
  loadedAt: number;
  byHost: Map<string, ActiveRestaurantDomain>;
  bySlug: Map<string, ActiveRestaurantDomain[]>;
};

type Loader = () => Promise<RestaurantDomainRow[]>;

// ── Normalisering ───────────────────────────────────────────────────────────

const HOST_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

// Värdar som aldrig får knytas till en restaurang. viaeats egna domäner har
// redan egen behörighet, och delade plattformsrötter skulle annars öppna för
// alla deras kunder.
const RESERVED_HOSTS = new Set([
  'vercel.app',
  'netlify.app',
  'github.io',
  'pages.dev',
  'web.app',
  'firebaseapp.com',
  'railway.app',
  'up.railway.app',
  'onrender.com',
  'herokuapp.com',
]);

function isReservedHost(host: string): boolean {
  if (RESERVED_HOSTS.has(host)) return true;
  return host === 'viaeats.se' || host.endsWith('.viaeats.se');
}

/**
 * Gör om admininmatning till ett rent värdnamn: gemener, utan schema, port,
 * sökväg eller avslutande punkt. Returnerar null för allt som inte är en vanlig
 * offentlig domän.
 */
export function normalizeDomainHost(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  let raw = input.trim().toLowerCase();
  if (!raw || raw.length > 300) return null;
  if (/[\s@\\]/.test(raw)) return null;

  if (/^[a-z][a-z0-9+.-]*:\/\//.test(raw)) {
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      return null;
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    if (parsed.username || parsed.password || parsed.port) return null;
    if ((parsed.pathname && parsed.pathname !== '/') || parsed.search || parsed.hash) return null;
    raw = parsed.hostname;
  } else if (/[/?#:]/.test(raw)) {
    return null;
  }

  if (raw.endsWith('.')) raw = raw.slice(0, -1);
  if (raw.length < 4 || raw.length > 253) return null;
  if (!HOST_PATTERN.test(raw)) return null;
  if (isReservedHost(raw)) return null;
  return raw;
}

/** Sidan där embedden ligger. Bara en ren sökväg på samma domän. */
export function normalizeMenuPath(input: unknown): string | null {
  if (input === undefined || input === null || input === '') return DEFAULT_MENU_PATH;
  if (typeof input !== 'string') return null;
  const value = input.trim();
  if (!value) return DEFAULT_MENU_PATH;
  if (value.length > 128) return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  if (!/^\/[A-Za-z0-9._~/-]*$/.test(value)) return null;
  if (value.split('/').some((segment) => segment === '..' || segment === '.')) return null;
  return value;
}

/** Värdnamnet ur en browser-origin, men bara för exakt https utan port. */
export function hostFromOrigin(origin: unknown): string | null {
  if (typeof origin !== 'string' || !origin || origin.length > 300) return null;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || parsed.port || parsed.username || parsed.password) return null;
  if (parsed.origin !== origin.replace(/\/$/, '')) return null;
  return normalizeDomainHost(parsed.hostname);
}

// ── Ögonblicksbilden ────────────────────────────────────────────────────────

function emptySnapshot(status: SnapshotStatus, loadedAt = 0): Snapshot {
  return { status, loadedAt, byHost: new Map(), bySlug: new Map() };
}

let snapshot: Snapshot = emptySnapshot('unloaded');
let inFlight: Promise<void> | null = null;
let generation = 0;
let loader: Loader = defaultLoader;
let missingWarned = false;

function isMissingTableError(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  if (code === 'P2021' || code === '42P01') return true;
  const message = (error as Error)?.message || '';
  return /RestaurantDomain/.test(message) && /does not exist/i.test(message);
}

async function defaultLoader(): Promise<RestaurantDomainRow[]> {
  // Lazy require: config.ts importerar den här modulen, och Prisma ska inte
  // dras in i varje test som bara läser config.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const prisma = require('./prisma').default;
  // Kolla först att tabellen finns. Annars loggar Prisma ett fel varje minut
  // tills SQL-filen är körd.
  const [check] = await prisma.$queryRaw`SELECT to_regclass('public."RestaurantDomain"') IS NOT NULL AS "exists"` as Array<{ exists: boolean }>;
  if (!check?.exists) throw Object.assign(new Error('RestaurantDomain does not exist'), { code: 'P2021' });
  const rows = await prisma.restaurantDomain.findMany({
    select: {
      host: true,
      restaurantId: true,
      isPrimary: true,
      menuPath: true,
      embedEnabled: true,
      restaurant: { select: { slug: true, archivedAt: true } },
    },
  });
  return rows.map((row: any) => ({
    host: row.host,
    restaurantId: row.restaurantId,
    restaurantSlug: row.restaurant?.slug || '',
    isPrimary: Boolean(row.isPrimary),
    menuPath: row.menuPath,
    embedEnabled: Boolean(row.embedEnabled),
    restaurantArchived: Boolean(row.restaurant?.archivedAt),
  }));
}

export function buildRestaurantDomainSnapshot(rows: RestaurantDomainRow[], loadedAt = Date.now()): Snapshot {
  const next = emptySnapshot('ok', loadedAt);
  for (const row of rows) {
    // Raden kontrolleras igen här: en hand-inlagd rad i databasen ska inte
    // kunna kringgå reglerna som admin-API:t följer.
    const host = normalizeDomainHost(row.host);
    const menuPath = normalizeMenuPath(row.menuPath);
    if (!host || host !== row.host || !menuPath) continue;
    if (!row.embedEnabled || row.restaurantArchived || !row.restaurantSlug) continue;
    const entry: ActiveRestaurantDomain = {
      host,
      origin: `https://${host}`,
      restaurantId: row.restaurantId,
      restaurantSlug: row.restaurantSlug,
      isPrimary: row.isPrimary,
      menuPath,
    };
    next.byHost.set(host, entry);
    const list = next.bySlug.get(entry.restaurantSlug) || [];
    list.push(entry);
    next.bySlug.set(entry.restaurantSlug, list);
  }
  for (const list of next.bySlug.values()) {
    list.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.host.localeCompare(b.host));
  }
  return next;
}

/** Läser om tabellen. Samtidiga anrop delar på samma läsning. */
export function refreshRestaurantDomains(): Promise<void> {
  if (inFlight) return inFlight;
  const startedGeneration = generation;
  inFlight = (async () => {
    try {
      const rows = await loader();
      // En invalidering under läsningen betyder att raden kan vara gammal.
      // Bilden sparas ändå (den är nyare än den förra), men en ny läsning körs.
      snapshot = buildRestaurantDomainSnapshot(rows);
      missingWarned = false;
    } catch (error) {
      if (isMissingTableError(error)) {
        snapshot = emptySnapshot('missing', Date.now());
        if (!missingWarned) {
          missingWarned = true;
          console.warn('[restaurant-domains] Tabellen RestaurantDomain saknas. De hårdkodade listorna gäller tills SQL-filen är körd.');
        }
      } else {
        // Behåll senaste bilden men försök igen vid nästa anrop.
        snapshot = { ...snapshot, loadedAt: 0 };
        console.error('[restaurant-domains] Kunde inte läsa domäner:', (error as Error)?.message || error);
      }
    } finally {
      inFlight = null;
    }
    if (startedGeneration !== generation) await refreshRestaurantDomains();
  })();
  return inFlight;
}

/**
 * Ser till att bilden är högst 60 s gammal. Har den aldrig laddats väntar
 * anropet in läsningen. Annars returneras den befintliga bilden direkt och en
 * ny hämtas i bakgrunden.
 */
export async function ensureRestaurantDomains(): Promise<void> {
  const age = Date.now() - snapshot.loadedAt;
  if (snapshot.loadedAt > 0 && age < RESTAURANT_DOMAIN_CACHE_TTL_MS) return;
  if (snapshot.status === 'unloaded') {
    await refreshRestaurantDomains();
    return;
  }
  void refreshRestaurantDomains();
}

/** Anropas när en domän sparas eller tas bort i admin. */
export function invalidateRestaurantDomains(): Promise<void> {
  generation += 1;
  snapshot = { ...snapshot, loadedAt: 0 };
  return refreshRestaurantDomains();
}

let refreshTimer: NodeJS.Timeout | null = null;

/** Startar periodisk förnyelse så att de synkrona kontrollerna alltid har en färsk bild. */
export function startRestaurantDomainRefresh(): void {
  if (refreshTimer) return;
  void refreshRestaurantDomains();
  refreshTimer = setInterval(() => { void refreshRestaurantDomains(); }, RESTAURANT_DOMAIN_CACHE_TTL_MS);
  refreshTimer.unref?.();
}

// ── Synkrona uppslag ────────────────────────────────────────────────────────

/** True när tabellen är läst och därför är ensam källa för kioskbevisen. */
export function restaurantDomainsAuthoritative(): boolean {
  return snapshot.status === 'ok';
}

export function restaurantDomainOrigins(): string[] {
  return Array.from(snapshot.byHost.values(), (entry) => entry.origin);
}

export function restaurantDomainForOrigin(origin: unknown): ActiveRestaurantDomain | null {
  const host = hostFromOrigin(origin);
  return host ? snapshot.byHost.get(host) || null : null;
}

export function restaurantDomainsForSlug(slug: unknown): ActiveRestaurantDomain[] {
  if (typeof slug !== 'string' || !slug) return [];
  return snapshot.bySlug.get(slug.trim()) || [];
}

function envKioskSlugs(env: NodeJS.ProcessEnv, fallback: string): Set<string> {
  return new Set(
    String(env.KIOSK_RESTAURANT_SLUGS || fallback)
      .split(',')
      .map((slug) => slug.trim())
      .filter(Boolean),
  );
}

/**
 * Sluggar i KIOSK_RESTAURANT_SLUGS. Innan tabellen finns är det listan över
 * alla embed-restauranger (som förut). När tabellen finns gäller den bara
 * menyer som bäddas in på viaeats egna sidor, till exempel studiodemona under
 * viaeats.se/demo, som saknar egen domän.
 */
function kioskEnvSlugs(env: NodeJS.ProcessEnv): Set<string> {
  return envKioskSlugs(env, restaurantDomainsAuthoritative() ? '' : 'palmyra-pizzeria-lund');
}

const VIAEATS_OWN_ORIGINS = new Set(['https://viaeats.se', 'https://www.viaeats.se']);

/**
 * Får restaurangen kioskbevis? När tabellen finns krävs en aktiv domän, eller
 * att restaurangen står i KIOSK_RESTAURANT_SLUGS för viaeats egna demosidor.
 */
export function kioskRestaurantAllowed(slug: unknown, env: NodeJS.ProcessEnv = process.env): boolean {
  if (typeof slug !== 'string' || !slug.trim()) return false;
  const cleanSlug = slug.trim();
  if (restaurantDomainsAuthoritative() && restaurantDomainsForSlug(cleanSlug).length > 0) return true;
  return kioskEnvSlugs(env).has(cleanSlug);
}

export type KioskOriginDecision =
  | { allowed: true; source: 'domains' | 'fallback' | 'viaeats'; partner: ActiveRestaurantDomain | null }
  | { allowed: false; reason: 'SLUG_REQUIRED' | 'ORIGIN_UNKNOWN' | 'ORIGIN_SLUG_MISMATCH' | 'RESTAURANT_NOT_ALLOWED' };

/**
 * Hör slug och partnerns origin ihop? Används innan ett kioskbevis lämnas ut.
 *
 * Origin kommer från embed.js och kan inte bevisas av servern: den som anropar
 * direkt kan skriva vad som helst. Kontrollen hindrar att en sajt får bevis för
 * en annan restaurang och att okända domäner får bevis alls. Själva skyddet
 * för kunddata ligger i att beviset bara ger rätt att skapa order och se status.
 */
export function decideKioskOrigin(slug: unknown, origin: unknown, env: NodeJS.ProcessEnv = process.env): KioskOriginDecision {
  if (typeof slug !== 'string' || !slug.trim()) return { allowed: false, reason: 'SLUG_REQUIRED' };
  const cleanSlug = slug.trim();
  if (!restaurantDomainsAuthoritative()) {
    return kioskEnvSlugs(env).has(cleanSlug)
      ? { allowed: true, source: 'fallback', partner: null }
      : { allowed: false, reason: 'RESTAURANT_NOT_ALLOWED' };
  }
  const hasOrigin = typeof origin === 'string' && origin.length > 0;
  if (!hasOrigin || VIAEATS_OWN_ORIGINS.has(origin as string)) {
    // Menyn ligger på viaeats egen sida (eller en äldre embed.js utan origin).
    return kioskEnvSlugs(env).has(cleanSlug)
      ? { allowed: true, source: 'viaeats', partner: null }
      : { allowed: false, reason: 'RESTAURANT_NOT_ALLOWED' };
  }
  const partner = restaurantDomainForOrigin(origin);
  if (!partner) return { allowed: false, reason: 'ORIGIN_UNKNOWN' };
  if (partner.restaurantSlug !== cleanSlug) return { allowed: false, reason: 'ORIGIN_SLUG_MISMATCH' };
  return { allowed: true, source: 'domains', partner };
}

// ── Endast för kontraktstester ──────────────────────────────────────────────

export function __setRestaurantDomainLoaderForTests(next: Loader | null): void {
  loader = next || defaultLoader;
  snapshot = emptySnapshot('unloaded');
  inFlight = null;
  generation = 0;
  missingWarned = false;
}
