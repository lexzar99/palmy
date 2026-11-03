import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  applyZoneMoneyChanges,
  keepSpecialHours,
  normalizeTerminalOpeningHours,
  openingHoursView,
  parsePriceChanges,
  parseZoneChanges,
  planPriceChanges,
  priceKey,
  settingsVersion,
  terminalWriteAllowed,
  terminalZoneView,
  TerminalSettingsError,
  validatePriceResult,
  type PriceMenu,
} from '../lib/terminalSettings';
import { isRestaurantOpen, nextOpeningAfterToday } from '../lib/openingHours';

const rejects = (fn: () => unknown, code: string, label: string) => {
  assert.throws(fn, (error: unknown) => error instanceof TerminalSettingsError && error.code === code, label);
};

// ── Version ────────────────────────────────────────────────────────────────
assert.equal(settingsVersion('[]'), settingsVersion('[]'), 'samma sträng ger samma version');
assert.notEqual(settingsVersion('[]'), settingsVersion('[ ]'), 'minsta ändring ger ny version');
assert.equal(settingsVersion(null), settingsVersion(''), 'tomt fält har en stabil version');
assert.equal(settingsVersion('x').length, 16);

// ── Zoner: bara beloppen ändras ────────────────────────────────────────────
const storedZones = JSON.stringify([
  {
    id: 'z1', name: 'Centrum', type: 'circle', centerLat: 55.7, centerLng: 13.19, radiusKm: 3,
    feeOre: 2900, minOrderOre: 15000, fee: 2900, minOrder: 15000, isActive: true, color: '#C8FF00',
    etaMinutes: 25, calculatedEtaMinutes: 31, etaSampleCount: 12, adminNote: 'okänt fält behålls',
  },
  {
    id: 'z2', name: 'Ytterområde', type: 'polygon', radiusKm: 0, isActive: false,
    polygon: [[13.1, 55.6], [13.3, 55.6], [13.3, 55.8]], deliveryFee: 49, minOrder: 20000,
  },
]);
const changedZones = JSON.parse(applyZoneMoneyChanges(storedZones, [{ id: 'z2', feeOre: 5900, minOrderOre: 25000 }]));
const before = JSON.parse(storedZones);
assert.deepEqual(changedZones[0], before[0], 'en zon som inte ändras är byte-lik');
assert.deepEqual(changedZones[1].polygon, before[1].polygon, 'geometrin ligger kvar');
assert.equal(changedZones[1].isActive, false, 'aktiv/inaktiv styrs av admin');
assert.equal(changedZones[1].name, 'Ytterområde');
assert.equal(changedZones[1].feeOre, 5900);
assert.equal(changedZones[1].fee, 5900, 'det gamla aliaset följer med');
assert.equal(changedZones[1].minOrderOre, 25000);
assert.equal(changedZones[1].minOrder, 25000);
assert.equal('deliveryFee' in changedZones[1], false, 'gamla kronfältet tas bort så det inte kan vinna');
assert.equal(terminalZoneView(JSON.stringify(changedZones))[1].feeOre, 5900, 'kassan läser det nya beloppet');

const keptEta = JSON.parse(applyZoneMoneyChanges(storedZones, [{ id: 'z1', feeOre: 0, minOrderOre: 0 }]))[0];
assert.equal(keptEta.calculatedEtaMinutes, 31, 'ETA-räkningen nollställs inte');
assert.equal(keptEta.adminNote, 'okänt fält behålls');
assert.equal(keptEta.radiusKm, 3);
assert.equal(keptEta.centerLat, 55.7);

rejects(() => applyZoneMoneyChanges(storedZones, [{ id: 'saknas', feeOre: 0, minOrderOre: 0 }]), 'INVALID_ZONE_CHANGE', 'okänd zon nekas');

const zoneBody = (change: Record<string, unknown>) => ({ version: 'v', changes: [{ id: 'z1', feeOre: 100, minOrderOre: 100, ...change }] });
assert.equal(parseZoneChanges(zoneBody({})).changes[0].feeOre, 100);
rejects(() => parseZoneChanges(zoneBody({ radiusKm: 9 })), 'INVALID_ZONE_CHANGE', 'geometri kan inte ens skickas');
rejects(() => parseZoneChanges(zoneBody({ polygon: [] })), 'INVALID_ZONE_CHANGE', 'polygon nekas');
rejects(() => parseZoneChanges(zoneBody({ isActive: false })), 'INVALID_ZONE_CHANGE', 'aktiv nekas');
rejects(() => parseZoneChanges(zoneBody({ name: 'Ny' })), 'INVALID_ZONE_CHANGE', 'namn nekas');
rejects(() => parseZoneChanges(zoneBody({ feeOre: 12.5 })), 'INVALID_ZONE_CHANGE', 'bara heltal ören');
rejects(() => parseZoneChanges(zoneBody({ feeOre: -1 })), 'INVALID_ZONE_CHANGE', 'ingen negativ avgift');
rejects(() => parseZoneChanges(zoneBody({ feeOre: 50_001 })), 'INVALID_ZONE_CHANGE', 'avgiften har ett tak');
rejects(() => parseZoneChanges(zoneBody({ minOrderOre: 200_001 })), 'INVALID_ZONE_CHANGE', 'minsta order har ett tak');
rejects(() => parseZoneChanges(zoneBody({ feeOre: '100' })), 'INVALID_ZONE_CHANGE', 'text är inte ett belopp');
rejects(() => parseZoneChanges({ changes: [] }), 'INVALID_ZONE_CHANGE', 'version krävs');
rejects(() => parseZoneChanges({ version: 'v', changes: [], deliveryZones: [] }), 'INVALID_ZONE_CHANGE', 'hela zonlistan kan inte skickas');
rejects(
  () => parseZoneChanges({ version: 'v', changes: [{ id: 'z1', feeOre: 1, minOrderOre: 1 }, { id: 'z1', feeOre: 2, minOrderOre: 2 }] }),
  'INVALID_ZONE_CHANGE',
  'samma zon två gånger nekas',
);

// ── Öppettider ─────────────────────────────────────────────────────────────
const today = '2026-11-03';
const allWeek = (shifts: Array<{ open: string; close: string }>) => Object.fromEntries(
  ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => [day, { closed: false, shifts }]),
);
const lunchAndDinner = [{ open: '17:00', close: '22:00' }, { open: '11:00', close: '14:00' }];
const savedHours = normalizeTerminalOpeningHours(
  {
    version: 'v',
    week: { ...allWeek(lunchAndDinner), sunday: { closed: true, shifts: [] } },
    specialHours: [
      { date: '2026-12-24', closed: true, shifts: [], note: ' Julafton ' },
      { date: '2026-12-31', closed: false, shifts: [{ open: '12:00', close: '2:00' }] },
      { date: '2026-10-01', closed: true, shifts: [] },
    ],
  },
  JSON.stringify({ monday: { open: '10:00', close: '20:00' }, regular: { monday: { open: '09:00', close: '10:00' } }, timezoneNote: 'behålls' }),
  today,
);
const parsedHours = JSON.parse(savedHours);
assert.deepEqual(parsedHours.monday, { closed: false, shifts: [{ open: '11:00', close: '14:00' }, { open: '17:00', close: '22:00' }] }, 'passen sorteras');
assert.deepEqual(parsedHours.sunday, { closed: true, shifts: [] });
assert.equal(parsedHours.regular, undefined, 'regular ersätts av dagnycklarna');
assert.equal(parsedHours.timezoneNote, 'behålls', 'okända toppnycklar behålls');
assert.equal(parsedHours.specialHours.length, 2, 'dagar äldre än en vecka rensas tyst');
assert.equal(parsedHours.specialHours[0].note, 'Julafton');
assert.equal(parsedHours.specialHours[1].shifts[0].close, '02:00', 'tiden skrivs alltid TT:MM');

// Servern räknar på precis det som sparas.
assert.equal(isRestaurantOpen(savedHours, new Date('2026-11-02T12:00:00.000Z')), true, 'måndag 13.00 öppet');
assert.equal(isRestaurantOpen(savedHours, new Date('2026-11-02T14:00:00.000Z')), false, 'måndag 15.00 lunchuppehåll');
assert.equal(isRestaurantOpen(savedHours, new Date('2026-11-08T12:00:00.000Z')), false, 'söndag stängt');
assert.equal(isRestaurantOpen(savedHours, new Date('2026-12-24T12:00:00.000Z')), false, 'julafton stängt');
assert.equal(isRestaurantOpen(savedHours, new Date('2027-01-01T00:30:00.000Z')), true, 'nyårsnatten går över midnatt');
assert.equal(
  nextOpeningAfterToday(savedHours, new Date('2026-11-03T14:00:00.000Z')).toISOString(),
  '2026-11-03T16:00:00.000Z',
  'nästa öppning är kvällspasset samma dag',
);

const view = openingHoursView(savedHours, today);
assert.equal(view.configured, true);
assert.deepEqual(view.week.monday.shifts, parsedHours.monday.shifts);
assert.equal(view.specialHours[0].date, '2026-12-24');
const legacyView = openingHoursView(JSON.stringify({ monday: { open: '11:00', close: '21:00' }, tuesday: [{ open: '10:00', close: '12:00' }], regular: { friday: { shifts: [{ open: '16:00', close: '23:00' }] } } }), today);
assert.deepEqual(legacyView.week.monday, { closed: false, shifts: [{ open: '11:00', close: '21:00' }] }, 'gammalt open/close läses');
assert.deepEqual(legacyView.week.tuesday.shifts, [{ open: '10:00', close: '12:00' }], 'lista med pass läses');
assert.deepEqual(legacyView.week.friday.shifts, [{ open: '16:00', close: '23:00' }], 'regular läses');
assert.equal(legacyView.week.sunday.closed, true);
assert.equal(openingHoursView('{}', today).configured, false, 'tomma öppettider syns som ej inlagda');
assert.equal(openingHoursView('inte json', today).configured, false, 'trasig JSON kraschar inte');

const hoursBody = (monday: unknown, extra: Record<string, unknown> = {}) => ({ version: 'v', week: { ...allWeek([{ open: '11:00', close: '21:00' }]), monday }, ...extra });
rejects(() => normalizeTerminalOpeningHours(hoursBody({ closed: false, shifts: [{ open: '11:00', close: '15:00' }, { open: '14:00', close: '20:00' }] }), '{}', today), 'INVALID_OPENING_HOURS', 'överlapp nekas');
rejects(() => normalizeTerminalOpeningHours(hoursBody({ closed: false, shifts: [{ open: '20:00', close: '02:00' }, { open: '21:00', close: '23:00' }] }), '{}', today), 'INVALID_OPENING_HOURS', 'nattpass bara sist');
rejects(() => normalizeTerminalOpeningHours(hoursBody({ closed: false, shifts: [{ open: '11:00', close: '11:00' }] }), '{}', today), 'INVALID_OPENING_HOURS', 'samma öppning och stängning nekas');
rejects(() => normalizeTerminalOpeningHours(hoursBody({ closed: false, shifts: [{ open: '24:00', close: '02:00' }] }), '{}', today), 'INVALID_OPENING_HOURS', 'ogiltig tid nekas');
rejects(() => normalizeTerminalOpeningHours(hoursBody({ closed: false, shifts: [1, 2, 3, 4].map((h) => ({ open: `0${h}:00`, close: `0${h}:30` })) }), '{}', today), 'INVALID_OPENING_HOURS', 'högst tre pass');
rejects(() => normalizeTerminalOpeningHours(hoursBody({ closed: false, shifts: [], open: '11:00' }), '{}', today), 'INVALID_OPENING_HOURS', 'okända fält på dagen nekas');
rejects(() => normalizeTerminalOpeningHours({ version: 'v', week: allWeek([]), holidays: [] }, '{}', today), 'INVALID_OPENING_HOURS', 'okända fält nekas');
rejects(() => normalizeTerminalOpeningHours({ version: 'v', week: { monday: { closed: true, shifts: [] } } }, '{}', today), 'INVALID_OPENING_HOURS', 'hela veckan krävs');
rejects(() => normalizeTerminalOpeningHours(hoursBody({ closed: true, shifts: [] }, { specialHours: [{ date: '2026-02-30', closed: true }] }), '{}', today), 'INVALID_OPENING_HOURS', 'ogiltigt datum nekas');
rejects(() => normalizeTerminalOpeningHours(hoursBody({ closed: true, shifts: [] }, { specialHours: [{ date: '2028-01-01', closed: true }] }), '{}', today), 'INVALID_OPENING_HOURS', 'högst ett år framåt');
rejects(() => normalizeTerminalOpeningHours(hoursBody({ closed: true, shifts: [] }, { specialHours: [{ date: '2026-12-24', closed: true }, { date: '2026-12-24', closed: true }] }), '{}', today), 'INVALID_OPENING_HOURS', 'samma datum två gånger');
rejects(() => normalizeTerminalOpeningHours(hoursBody({ closed: true, shifts: [] }, { specialHours: [{ date: '2026-12-24', closed: true, note: 'x'.repeat(41) }] }), '{}', today), 'INVALID_OPENING_HOURS', 'kort notering');
const openDayWithoutShifts = JSON.parse(normalizeTerminalOpeningHours(hoursBody({ closed: false, shifts: [] }), '{}', today));
assert.deepEqual(openDayWithoutShifts.monday, { closed: true, shifts: [] }, 'öppen dag utan pass sparas som stängd');

// Admin raderar inte plattans avvikande dagar.
const withSpecial = JSON.stringify({ monday: { closed: false, shifts: [] }, specialHours: [{ date: '2026-12-24', closed: true }] });
assert.deepEqual((keepSpecialHours({ monday: { closed: true, shifts: [] } }, withSpecial) as any).specialHours, [{ date: '2026-12-24', closed: true }]);
assert.deepEqual((keepSpecialHours({ monday: {}, specialHours: [] }, withSpecial) as any).specialHours, [], 'ett uttryckligt tomt val gäller');
assert.deepEqual(keepSpecialHours({ monday: {} }, '{}'), { monday: {} }, 'inget att föra över');
assert.equal((keepSpecialHours(JSON.stringify({ monday: {} }), withSpecial) as any).specialHours.length, 1, 'även när admin skickar en sträng');

// ── Priser ─────────────────────────────────────────────────────────────────
const change = (kind: 'product' | 'extra', id: string, fromOre: number, toOre: number) => ({ kind, id, fromOre, toOre });
assert.equal(parsePriceChanges({ changes: [change('extra', 'e1', -1000, -1500)] })[0].toOre, -1500, 'negativa tillval går att sätta');
rejects(() => parsePriceChanges({ changes: [change('product', 'p1', 100, -100)] }), 'INVALID_PRICE', 'rätt kan inte bli negativ');
rejects(() => parsePriceChanges({ changes: [change('product', 'p1', 100, 300_001)] }), 'INVALID_PRICE', 'tak för rätt');
rejects(() => parsePriceChanges({ changes: [change('extra', 'e1', 100, -50_001)] }), 'INVALID_PRICE', 'golv för tillval');
rejects(() => parsePriceChanges({ changes: [change('product', 'p1', 100, 99.5)] }), 'INVALID_PRICE', 'bara heltal ören');
rejects(() => parsePriceChanges({ changes: [{ ...change('product', 'p1', 100, 200), isActive: false }] }), 'INVALID_PRICE', 'bara pris kan ändras');
rejects(() => parsePriceChanges({ changes: [change('product', 'p1', 100, 200), change('product', 'p1', 100, 300)] }), 'INVALID_PRICE', 'samma rad två gånger');
rejects(() => parsePriceChanges({ changes: [] }), 'INVALID_PRICE', 'tomt anrop nekas');
rejects(() => parsePriceChanges({ changes: Array.from({ length: 2001 }, (_, i) => change('product', `p${i}`, 1, 2)) }), 'INVALID_PRICE', 'högst 2 000 rader');
assert.equal(parsePriceChanges({ changes: [change('product', 'p1', 400_000, 300_000)] }).length, 1, 'ett gammalt pris över taket går att rätta');
assert.equal(parsePriceChanges({ changes: Array.from({ length: 2000 }, (_, i) => change('extra', `e${i}`, 0, 500)) }).length, 2000);

const current = new Map([[priceKey('product', 'p1'), 12900], [priceKey('product', 'p2'), 9900], [priceKey('extra', 'e1'), -1000]]);
const plan = planPriceChanges([
  change('product', 'p1', 12900, 13900),
  change('product', 'p2', 9900, 9900 + 0),
  change('extra', 'e1', -500, -1500),
  change('product', 'gone', 100, 200),
], current);
assert.deepEqual(plan.apply.map((c) => c.id), ['p1']);
assert.deepEqual(plan.unchanged.map((c) => c.id), ['p2'], 'redan rätt pris räknas som sparat');
assert.deepEqual(plan.conflicts, [{ kind: 'extra', id: 'e1', currentOre: -1000 }, { kind: 'product', id: 'gone', currentOre: null }]);

// Omspelning efter att ändringen gått igenom ger samma resultat utan ny skrivning.
const afterSave = new Map(current);
afterSave.set(priceKey('product', 'p1'), 13900);
const replay = planPriceChanges([change('product', 'p1', 12900, 13900)], afterSave);
assert.equal(replay.apply.length, 0);
assert.equal(replay.unchanged.length, 1);
assert.equal(replay.conflicts.length, 0);

// Ångra är den omvända listan, och skriver aldrig över någon annans nyare ändring.
const undo = planPriceChanges([change('product', 'p1', 13900, 12900)], afterSave);
assert.equal(undo.apply.length, 1);
const adminChangedAgain = new Map(afterSave);
adminChangedAgain.set(priceKey('product', 'p1'), 14900);
assert.equal(planPriceChanges([change('product', 'p1', 13900, 12900)], adminChangedAgain).conflicts.length, 1);

const menu: PriceMenu = {
  products: [
    { id: 'margherita', name: 'Margherita', priceOre: 9000, discountActive: false, discountPriceOre: null, extraGroupIds: ['size'] },
    { id: 'kebab', name: 'Kebabtallrik', priceOre: 12900, discountActive: true, discountPriceOre: 11900, extraGroupIds: [] },
    { id: 'old', name: 'Gammalt fel', priceOre: 500, discountActive: false, discountPriceOre: null, extraGroupIds: ['broken'] },
  ],
  groups: [
    { id: 'size', name: 'Storlek', extras: [{ id: 'kid', name: 'Barnpizza', priceAddonOre: -1000 }, { id: 'family', name: 'Familj', priceAddonOre: 10000 }] },
    { id: 'broken', name: 'Gammal grupp', extras: [{ id: 'minus', name: 'Minus', priceAddonOre: -2000 }] },
  ],
};
validatePriceResult(menu, [change('extra', 'kid', -1000, -8000)]);
rejects(() => validatePriceResult(menu, [change('extra', 'kid', -1000, -9500)]), 'NEGATIVE_EXTRA_EXCEEDS_PRICE', 'avdraget får inte bli större än rätten');
rejects(() => validatePriceResult(menu, [change('product', 'margherita', 9000, 900)]), 'NEGATIVE_EXTRA_EXCEEDS_PRICE', 'rätten får inte sänkas under avdraget');
validatePriceResult(menu, [change('product', 'margherita', 9000, 1000)]);
validatePriceResult(menu, [change('product', 'kebab', 12900, 13900)]);
rejects(() => validatePriceResult(menu, [change('product', 'kebab', 12900, 11000)]), 'DISCOUNT_ABOVE_PRICE', 'reapriset får inte bli högre än priset');
validatePriceResult(menu, [change('product', 'margherita', 9000, 9500)]);
// "Gammalt fel" är redan under 0 men rörs inte av ändringen, så sparningen går igenom.
validatePriceResult(menu, [change('product', 'kebab', 12900, 12000), change('extra', 'family', 10000, 12000)]);

// ── Vitlistan för plattans token ───────────────────────────────────────────
const allowed = (method: string, path: string, body?: unknown) => terminalWriteAllowed(method, path, body).allowed;
// Exakt det v1 och v2 skickar i dag.
assert.equal(allowed('PATCH', '/api/restaurants/r1', { isOpen: false }), true);
assert.equal(allowed('PATCH', '/api/restaurants/r1', { isOpen: true }), true);
assert.equal(allowed('PATCH', '/api/restaurants/r1', { acceptingOrdersMode: 'SCHEDULED', acceptingOrdersOverrideUntil: null, acceptingOrdersOverrideReason: null, pausedUntil: '2026-11-03T12:00:00.000Z' }), true);
assert.equal(allowed('PATCH', '/api/admin/products/p1', { isActive: false }), true);
assert.equal(allowed('PATCH', '/api/admin/products/p1', { rewardable: true }), true);
assert.equal(allowed('PATCH', '/api/admin/extras/e1', { isActive: true }), true);
assert.equal(allowed('POST', '/api/admin/deals', { title: 'x', discountType: 'PERCENTAGE' }), true);
assert.equal(allowed('DELETE', '/api/admin/deals/d1'), true);
assert.equal(allowed('PATCH', '/api/admin/orders/o1/status', { status: 'ACCEPTED', estimatedTime: 20 }), true);
assert.equal(allowed('POST', '/api/terminal/test-order', {}), true);
assert.equal(allowed('POST', '/api/terminal/menu/prices', { changes: [] }), true);
assert.equal(allowed('GET', '/api/admin/categories?restaurantId=r1'), true, 'läsning påverkas inte');
assert.equal(allowed('PATCH', '/api/restaurants/r1/', { isOpen: true }), true, 'avslutande snedstreck');
// Allt annat nekas.
assert.equal(allowed('PATCH', '/api/restaurants/r1', { deliveryZones: [] }), false, 'zongeometri');
assert.equal(allowed('PATCH', '/api/restaurants/r1', { isOpen: true, slug: 'annat' }), false, 'slug');
assert.equal(allowed('PATCH', '/api/restaurants/r1', { commissionPctOverride: 0 }), false, 'provision');
assert.equal(allowed('PATCH', '/api/restaurants/r1', { openingHours: {} }), false, 'öppettider går via terminal-API:t');
assert.equal(allowed('PATCH', '/api/admin/products/p1', { price: 1 }), false, 'pris går via terminal-API:t');
assert.equal(allowed('PATCH', '/api/admin/extras/e1', { priceAddon: 1 }), false);
assert.equal(allowed('PATCH', '/api/admin/extra-groups/g1', { extras: [] }), false, 'tillvalsgrupper');
assert.equal(allowed('POST', '/api/admin/categories', { name: 'x' }), false);
assert.equal(allowed('DELETE', '/api/admin/products/p1'), false);
assert.equal(allowed('PATCH', '/api/admin/deals/d1', { isActive: true }), false);
assert.equal(allowed('POST', '/api/admin/upload-r2'), false);
assert.equal(allowed('PATCH', '/api/admin/products/p1/../../restaurants/r1', { isActive: true }), false, 'konstiga sökvägar nekas');

// ── Kopplingen i rutterna ──────────────────────────────────────────────────
const source = (file: string) => readFileSync(join(__dirname, '..', file), 'utf8');
const terminalRoute = source('routes/terminal.ts');
const settingsRoute = source('routes/terminalSettings.ts');
const adminRoute = source('routes/admin.ts');
const restaurantsRoute = source('routes/restaurants.ts');
assert.match(terminalRoute, /router\.use\(terminalSettingsRouter\)/, 'terminalens nya rutter är monterade');
assert.match(adminRoute, /router\.use\(authenticate\);\s*\n[^\n]*\n?router\.use\(terminalWriteGate\)/, 'admin-rutterna spärras för plattan direkt efter inloggningen');
assert.match(restaurantsRoute, /router\.patch\('\/:id', authenticate, terminalWriteGate,/, 'restaurangens PATCH spärras för plattan');
assert.match(restaurantsRoute, /keepSpecialHours\(payload\.openingHours, existingRestaurant\.openingHours\)/, 'admin raderar inte avvikande dagar');
assert.match(settingsRoute, /where: \{ id: change\.id, price: change\.fromOre \}/, 'rättens pris skrivs med jämför-och-sätt');
assert.match(settingsRoute, /where: \{ id: change\.id, priceAddon: change\.fromOre \}/, 'tillvalets pris skrivs med jämför-och-sätt');
assert.match(settingsRoute, /where: \{ id: restaurantId, deliveryZones: stored \}/, 'zonerna skrivs med jämför-och-sätt');
assert.match(settingsRoute, /where: \{ id: restaurantId, openingHours: stored \}/, 'öppettiderna skrivs med jämför-och-sätt');
assert.match(settingsRoute, /const guard = \[authenticate, requireTerminalDevice\]/, 'bara plattans session kommer in');
assert.doesNotMatch(settingsRoute, /req\.(params|body|query)\.restaurantId/, 'restaurangen tas aldrig ur begäran');
assert.equal((settingsRoute.match(/router\.(get|patch|put|post)\('[^']+', guard,/g) || []).length, 6, 'alla sex rutter har spärren');
assert.match(settingsRoute, /afterRestaurantSettingsChanged\(restaurantId\)/, 'zoner och tider rensar cacher och status-adressen');
assert.match(settingsRoute, /broadcastMenuChange\(restaurantId/, 'priser rensar menycacher och webben');

console.log('terminalSettings: alla kontrakt gröna');
