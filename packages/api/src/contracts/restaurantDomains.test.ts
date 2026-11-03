import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  __setRestaurantDomainLoaderForTests,
  decideKioskOrigin,
  ensureRestaurantDomains,
  invalidateRestaurantDomains,
  kioskRestaurantAllowed,
  normalizeDomainHost,
  normalizeMenuPath,
  restaurantDomainForOrigin,
  restaurantDomainsAuthoritative,
  type RestaurantDomainRow,
} from '../lib/restaurantDomains';
import { getAllowedOrigins, isOriginAllowed, isOriginAllowedFresh } from '../lib/config';
import { paymentReturnMatchesRestaurant, safePaymentReturnUrl } from '../lib/paymentReturnUrl';

const row = (overrides: Partial<RestaurantDomainRow>): RestaurantDomainRow => ({
  host: 'nyapizzan.se',
  restaurantId: 'r-nya',
  restaurantSlug: 'nya-pizzan-lund',
  isPrimary: true,
  menuPath: '/meny',
  embedEnabled: true,
  restaurantArchived: false,
  ...overrides,
});

async function main() {
  // ── Normalisering ─────────────────────────────────────────────────────────
  assert.equal(normalizeDomainHost('NyaPizzan.se'), 'nyapizzan.se');
  assert.equal(normalizeDomainHost(' https://www.nyapizzan.se/ '), 'www.nyapizzan.se');
  assert.equal(normalizeDomainHost('nyapizzan.se.'), 'nyapizzan.se');
  assert.equal(normalizeDomainHost('https://nyapizzan.se/meny'), null, 'sökväg nekas');
  assert.equal(normalizeDomainHost('https://nyapizzan.se:8443'), null, 'port nekas');
  assert.equal(normalizeDomainHost('https://a@nyapizzan.se'), null, 'användarnamn nekas');
  assert.equal(normalizeDomainHost('nyapizzan.se/meny'), null);
  assert.equal(normalizeDomainHost('*.nyapizzan.se'), null, 'inga jokertecken');
  assert.equal(normalizeDomainHost('localhost'), null);
  assert.equal(normalizeDomainHost('127.0.0.1'), null, 'ip-adresser nekas');
  assert.equal(normalizeDomainHost('ftp://nyapizzan.se'), null);
  assert.equal(normalizeDomainHost('viaeats.se'), null, 'viaeats egna domäner kan inte knytas till en restaurang');
  assert.equal(normalizeDomainHost('www.viaeats.se'), null);
  assert.equal(normalizeDomainHost('vercel.app'), null, 'delad plattformsrot nekas');
  assert.equal(normalizeDomainHost('freds-pizzeria.vercel.app'), 'freds-pizzeria.vercel.app');
  assert.equal(normalizeMenuPath(undefined), '/meny');
  assert.equal(normalizeMenuPath('/meny.html'), '/meny.html');
  assert.equal(normalizeMenuPath('//evil.example'), null, 'protokollrelativ sökväg nekas');
  assert.equal(normalizeMenuPath('/a/../b'), null);
  assert.equal(normalizeMenuPath('https://evil.example/'), null);
  assert.equal(normalizeMenuPath('/meny?x=1'), null);

  // ── Tabellen saknas: de hårdkodade listorna gäller, inget kraschar ───────
  const missing = Object.assign(new Error('The table `public.RestaurantDomain` does not exist'), { code: 'P2021' });
  __setRestaurantDomainLoaderForTests(async () => { throw missing; });
  const warn = console.warn;
  console.warn = () => {};
  await ensureRestaurantDomains();
  console.warn = warn;
  assert.equal(restaurantDomainsAuthoritative(), false);
  assert.equal(isOriginAllowed('https://fredspizza.se'), true, 'reservlistan gäller utan tabell');
  assert.equal(isOriginAllowed('https://nyapizzan.se'), false);
  assert.equal(kioskRestaurantAllowed('palmyra-pizzeria-lund', {} as NodeJS.ProcessEnv), true, 'standardvärdet som förut');
  assert.equal(kioskRestaurantAllowed('nya-pizzan-lund', { KIOSK_RESTAURANT_SLUGS: 'nya-pizzan-lund' } as any), true);
  assert.deepEqual(decideKioskOrigin('nya-pizzan-lund', 'https://nyapizzan.se', { KIOSK_RESTAURANT_SLUGS: 'freds' } as any), {
    allowed: false,
    reason: 'RESTAURANT_NOT_ALLOWED',
  });

  // ── Ett vanligt databasfel behåller senaste bilden ──────────────────────
  let rows: RestaurantDomainRow[] = [
    row({}),
    row({ host: 'www.nyapizzan.se', isPrimary: false }),
    row({ host: 'stangd.se', restaurantId: 'r-stangd', restaurantSlug: 'stangd', embedEnabled: false }),
    row({ host: 'arkiv.se', restaurantId: 'r-arkiv', restaurantSlug: 'arkiv', restaurantArchived: true }),
    // En hand-inlagd rad som bryter mot reglerna ska ignoreras.
    row({ host: 'Versal.se', restaurantId: 'r-x', restaurantSlug: 'x' }),
    row({ host: 'trick.se', restaurantId: 'r-y', restaurantSlug: 'y', menuPath: '//evil.example' }),
    row({ host: 'freds.example', restaurantId: 'r-freds', restaurantSlug: 'freds-pizzeria-hassleholm', menuPath: '/meny' }),
  ];
  let loads = 0;
  let failNext = false;
  __setRestaurantDomainLoaderForTests(async () => {
    loads += 1;
    if (failNext) throw new Error('connection reset');
    return rows;
  });
  await ensureRestaurantDomains();
  assert.equal(restaurantDomainsAuthoritative(), true);
  assert.equal(loads, 1);
  await ensureRestaurantDomains();
  assert.equal(loads, 1, 'en färsk bild läses inte om (cache i 60 s)');

  // ── CORS ─────────────────────────────────────────────────────────────────
  assert.equal(isOriginAllowed('https://nyapizzan.se'), true, 'domän från admin släpps igenom');
  assert.equal(isOriginAllowed('https://www.nyapizzan.se'), true);
  assert.equal(isOriginAllowed('http://nyapizzan.se'), false, 'bara https');
  assert.equal(isOriginAllowed('https://nyapizzan.se:8443'), false, 'ingen annan port');
  assert.equal(isOriginAllowed('https://evil.nyapizzan.se'), false, 'underdomäner räknas inte automatiskt');
  assert.equal(isOriginAllowed('https://nyapizzan.se.evil.example'), false);
  assert.equal(isOriginAllowed('https://okand-restaurang.se'), false, 'okänd origin nekas');
  assert.equal(await isOriginAllowedFresh('https://okand-restaurang.se'), false);
  assert.equal(isOriginAllowed('https://stangd.se'), false, 'avstängd domän nekas');
  assert.equal(isOriginAllowed('https://arkiv.se'), false, 'arkiverad restaurang nekas');
  assert.equal(isOriginAllowed('https://versal.se'), false, 'ogiltig rad ignoreras');
  assert.equal(isOriginAllowed('https://trick.se'), false);
  assert.equal(isOriginAllowed('https://viaeats.se'), true, 'viaeats egna origins påverkas inte');
  assert.ok(getAllowedOrigins().includes('https://fredspizza.se'), 'reservlistan ligger kvar under övergången');

  // ── Kioskbevis: slug och domän måste höra ihop ──────────────────────────
  const env = { KIOSK_RESTAURANT_SLUGS: 'demo-pizzan' } as NodeJS.ProcessEnv;
  const ok = decideKioskOrigin('nya-pizzan-lund', 'https://www.nyapizzan.se', env);
  assert.equal(ok.allowed, true);
  assert.equal((ok as any).partner.menuPath, '/meny');
  assert.deepEqual(decideKioskOrigin('palmyra-pizzeria-lund', 'https://nyapizzan.se', env), {
    allowed: false,
    reason: 'ORIGIN_SLUG_MISMATCH',
  }, 'en sajt får inte bevis för en annan restaurang');
  assert.deepEqual(decideKioskOrigin('nya-pizzan-lund', 'https://okand-restaurang.se', env), {
    allowed: false,
    reason: 'ORIGIN_UNKNOWN',
  });
  assert.deepEqual(decideKioskOrigin('nya-pizzan-lund', 'http://nyapizzan.se', env), {
    allowed: false,
    reason: 'ORIGIN_UNKNOWN',
  });
  assert.equal(decideKioskOrigin('stangd', 'https://stangd.se', env).allowed, false);
  // Viaeats egna demosidor har ingen domän och styrs av KIOSK_RESTAURANT_SLUGS.
  assert.equal(decideKioskOrigin('demo-pizzan', 'https://www.viaeats.se', env).allowed, true);
  assert.equal(decideKioskOrigin('nya-pizzan-lund', 'https://www.viaeats.se', env).allowed, false);
  assert.equal(decideKioskOrigin('demo-pizzan', undefined, env).allowed, true);
  assert.equal(decideKioskOrigin('palmyra-pizzeria-lund', undefined, {} as NodeJS.ProcessEnv).allowed, false,
    'med tabellen finns inget standardvärde för palmyra');
  assert.equal(kioskRestaurantAllowed('nya-pizzan-lund', {} as NodeJS.ProcessEnv), true);
  assert.equal(kioskRestaurantAllowed('stangd', {} as NodeJS.ProcessEnv), false);
  assert.equal(kioskRestaurantAllowed('palmyra-pizzeria-lund', {} as NodeJS.ProcessEnv), false,
    'KIOSK_RESTAURANT_SLUGS ersätts av tabellen');
  assert.equal(kioskRestaurantAllowed('demo-pizzan', env), true);

  // ── Betalningsretur ──────────────────────────────────────────────────────
  assert.equal(
    safePaymentReturnUrl('https://nyapizzan.se/meny?payment_return=o1&embed=1', 'Web'),
    'https://nyapizzan.se/meny?payment_return=o1&embed=1',
    'returadress till en godkänd domän accepteras',
  );
  assert.equal(safePaymentReturnUrl('https://okand-restaurang.se/meny?payment_return=o1', 'Web'), null, 'okänd domän nekas');
  assert.equal(safePaymentReturnUrl('https://stangd.se/meny', 'Web'), null);
  assert.equal(safePaymentReturnUrl('http://nyapizzan.se/meny', 'Web'), null);
  assert.equal(safePaymentReturnUrl('https://nyapizzan.se/meny', 'iOS'), null, 'native återvänder bara via API-bryggan');
  assert.equal(paymentReturnMatchesRestaurant('https://nyapizzan.se/meny', 'nya-pizzan-lund'), true);
  assert.equal(paymentReturnMatchesRestaurant('https://nyapizzan.se/meny', 'palmyra-pizzeria-lund'), false,
    'en order får inte återvända till en annan restaurangs domän');
  assert.equal(paymentReturnMatchesRestaurant('https://viaeats.se/cart', 'nya-pizzan-lund'), true);

  // ── Ändring i admin gäller direkt, databasfel öppnar inget ──────────────
  rows = rows.filter((item) => item.host !== 'www.nyapizzan.se');
  await invalidateRestaurantDomains();
  assert.equal(isOriginAllowed('https://www.nyapizzan.se'), false, 'borttagen domän nekas direkt i samma process');
  assert.equal(restaurantDomainForOrigin('https://nyapizzan.se')?.restaurantSlug, 'nya-pizzan-lund');

  failNext = true;
  const error = console.error;
  console.error = () => {};
  await invalidateRestaurantDomains();
  console.error = error;
  assert.equal(restaurantDomainsAuthoritative(), true, 'tillfälligt fel behåller bilden');
  assert.equal(isOriginAllowed('https://nyapizzan.se'), true);
  assert.equal(isOriginAllowed('https://www.nyapizzan.se'), false);
  __setRestaurantDomainLoaderForTests(null);

  // ── Källkoden använder modulen i stället för egna listor ────────────────
  const src = (file: string) => readFileSync(join(__dirname, '..', file), 'utf8');
  for (const file of ['index.ts', 'routes/orders.ts', 'routes/payments.ts']) {
    assert.doesNotMatch(src(file), /process\.env\.KIOSK_RESTAURANT_SLUGS/, `${file} läser inte KIOSK_RESTAURANT_SLUGS själv`);
    assert.match(src(file), /kioskRestaurantAllowed\(/);
  }
  assert.match(src('index.ts'), /isOriginAllowedFresh\(origin\)/);
  assert.match(src('index.ts'), /app\.use\('\/api\/admin\/restaurant-domains', restaurantDomainsAdminRouter\)/);
  assert.match(src('routes/restaurantDomains.ts'), /restaurantDomainsAdminRouter\.use\(authenticate, requireSuperAdmin\)/,
    'domäner ändras bara av superadmin');
  assert.match(src('routes/payments.ts'), /paymentReturnMatchesRestaurant\(verifiedReturnUrl, order\.restaurant\?\.slug\)/);

  console.log('restaurantDomains: alla kontrakt gröna');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
