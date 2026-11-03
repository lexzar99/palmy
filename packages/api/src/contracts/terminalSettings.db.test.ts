/* Integrationstest för plattans endpoints mot en riktig, LOKAL Postgres.
 * Tömmer menytabellerna, så det vägrar köra mot något annat än localhost.
 *
 *   initdb -D /tmp/vt -U viaeats_test --auth=trust
 *   LC_ALL=C pg_ctl -D /tmp/vt -o "-p 55432 -c listen_addresses=127.0.0.1" start
 *   createdb -h 127.0.0.1 -p 55432 -U viaeats_test terminal_test
 *   export DATABASE_URL=postgresql://viaeats_test@127.0.0.1:55432/terminal_test DIRECT_URL=$DATABASE_URL
 *   pnpm exec prisma db push --skip-generate --schema prisma/schema.prisma   # bara den lokala testdatabasen
 *   pnpm run test:terminal-settings-db
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

const API = '..';
if (!/@(127\.0\.0\.1|localhost)(:\d+)?\//.test(process.env.DATABASE_URL || '')) throw new Error('Körs bara mot en lokal testdatabas (localhost)');

// Webbens revalidate fångas av en lokal server.
const revalidated: string[] = [];
const webServer = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    if (req.url === '/api/revalidate' && req.headers['x-revalidate-secret'] === 'test-secret') {
      revalidated.push(JSON.parse(body).slug);
    }
    res.end('{}');
  });
});

async function main() {
  await new Promise<void>((r) => webServer.listen(0, '127.0.0.1', () => r()));
  process.env.FRONTEND_URL = `http://127.0.0.1:${(webServer.address() as AddressInfo).port}`;
  process.env.REVALIDATE_SECRET = 'test-secret';
  process.env.JWT_SECRET = 'terminal-integration-secret';
  process.env.NODE_ENV = 'test';

  const express = (await import('express')).default;
  const cookieParser = (await import('cookie-parser')).default;
  const jwt = (await import('jsonwebtoken')).default;
  const prisma = (await import(`${API}/lib/prisma`)).default;
  const { initSocket } = await import(`${API}/lib/socket`);
  const terminalRoutes = (await import(`${API}/routes/terminal`)).default;
  const adminRoutes = (await import(`${API}/routes/admin`)).default;
  const restaurantsRoutes = (await import(`${API}/routes/restaurants`)).default;
  const { settingsVersion } = await import(`${API}/lib/terminalSettings`);

  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use('/api/terminal', terminalRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/restaurants', restaurantsRoutes);
  const server = http.createServer(app);
  const io = await initSocket(server, {});
  const events: Array<{ event: string; payload: any }> = [];
  const record = (event: string, payload: any) => { events.push({ event, payload }); };
  const origEmit = io.emit.bind(io);
  (io as any).emit = (event: string, payload: any) => { record(event, payload); return origEmit(event, payload); };
  const origTo = io.to.bind(io);
  (io as any).to = (room: string) => {
    const target = origTo(room);
    return { emit: (event: string, payload: any) => { record(`${room}|${event}`, payload); return target.emit(event, payload); } };
  };
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  // ── Testdata ──────────────────────────────────────────────────────────────
  await prisma.auditLog.deleteMany({});
  await prisma.productExtraGroup.deleteMany({});
  await prisma.extra.deleteMany({});
  await prisma.extraGroup.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.restaurantDevice.deleteMany({});
  await prisma.restaurant.deleteMany({});
  await prisma.adminUser.deleteMany({});

  const admin = await prisma.adminUser.create({ data: { email: 'palmyra-test', password: 'x', name: 'Palmyra', role: 'RESTAURANT_ADMIN' } });
  const zones = [
    { id: 'z1', name: 'Centrum', type: 'circle', centerLat: 55.7, centerLng: 13.19, radiusKm: 3, feeOre: 2900, minOrderOre: 15000, fee: 2900, minOrder: 15000, isActive: true, calculatedEtaMinutes: 31 },
    { id: 'z2', name: 'Ytter', type: 'polygon', radiusKm: 0, isActive: true, polygon: [[13.1, 55.6], [13.3, 55.6], [13.3, 55.8]], feeOre: 4900, minOrderOre: 20000 },
  ];
  const week = Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    .map((d) => [d, { closed: false, shifts: [{ open: '11:00', close: '21:00' }] }]));
  const restaurant = await prisma.restaurant.create({
    data: {
      name: 'Testpalmyra', slug: 'testpalmyra', adminUserId: admin.id, adminEmail: admin.email,
      deliveryZones: JSON.stringify(zones), openingHours: JSON.stringify(week), pickupOnly: false,
    },
  });
  const other = await prisma.restaurant.create({ data: { name: 'Annan', slug: 'annan' } });
  await prisma.restaurantDevice.create({ data: { deviceId: 'device-aaaa-1111', restaurantId: restaurant.id } });
  const pizza = await prisma.category.create({ data: { name: 'Pizza', slug: 'pizza-tp', restaurantId: restaurant.id, position: 0 } });
  const drinks = await prisma.category.create({ data: { name: 'Drycker', slug: 'drycker-tp', restaurantId: restaurant.id, position: 1 } });
  const foreignCat = await prisma.category.create({ data: { name: 'Annans', slug: 'annans', restaurantId: other.id } });
  const margherita = await prisma.product.create({ data: { name: 'Margherita', slug: 'margherita-tp', price: 9000, categoryId: pizza.id } });
  const kebab = await prisma.product.create({ data: { name: 'Kebabpizza', slug: 'kebab-tp', price: 11900, categoryId: pizza.id, discountActive: true, discountPrice: 9900 } });
  const cola = await prisma.product.create({ data: { name: 'Cola', slug: 'cola-tp', price: 2500, categoryId: drinks.id } });
  const foreign = await prisma.product.create({ data: { name: 'Annans rätt', slug: 'annans-ratt', price: 5000, categoryId: foreignCat.id } });
  const size = await prisma.extraGroup.create({
    data: {
      name: 'Storlek', restaurantId: restaurant.id,
      extras: { create: [{ name: 'Barnpizza', priceAddon: -1000 }, { name: 'Familj', priceAddon: 10000 }] },
    },
    include: { extras: true },
  });
  await prisma.productExtraGroup.create({ data: { productId: margherita.id, extraGroupId: size.id } });
  const kid = size.extras.find((e: any) => e.name === 'Barnpizza')!;
  const family = size.extras.find((e: any) => e.name === 'Familj')!;

  const token = (deviceId: string | null) => jwt.sign(
    { id: admin.id, email: admin.email, role: 'RESTAURANT_ADMIN', restaurantId: restaurant.id, restaurantSlug: restaurant.slug, tokenVersion: 0, ...(deviceId ? { deviceId } : {}) },
    process.env.JWT_SECRET!, { expiresIn: '1h' },
  );
  const device = token('device-aaaa-1111');
  const web = token(null);
  const call = async (method: string, path: string, body?: unknown, auth = device, headers: Record<string, string> = {}) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${auth}`, 'user-agent': 'ViaEats-Partner-Native-Android/2.1.0', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, json };
  };
  const settle = () => new Promise((r) => setTimeout(r, 1700));

  // ── Behörighet ────────────────────────────────────────────────────────────
  assert.equal((await call('GET', '/api/terminal/menu/prices', undefined, web)).status, 403, 'webbinloggning kommer inte in');
  assert.equal((await call('GET', '/api/terminal/nope')).status, 404, 'okänd terminalsökväg ger fortfarande 404');
  assert.equal((await call('GET', '/api/terminal/delivery-zones', undefined, 'skräp')).status, 401);

  // ── Zoner ─────────────────────────────────────────────────────────────────
  const z0 = await call('GET', '/api/terminal/delivery-zones');
  assert.equal(z0.status, 200);
  assert.equal(z0.json.source, 'restaurant');
  assert.equal(z0.json.hasDelivery, true);
  assert.equal(z0.json.zones.length, 2);
  assert.equal(z0.json.version, settingsVersion(restaurant.deliveryZones));

  revalidated.length = 0; events.length = 0;
  const zKey = { 'idempotency-key': 'zone-save-1' };
  const zSave = await call('PATCH', '/api/terminal/delivery-zones', { version: z0.json.version, changes: [{ id: 'z1', feeOre: 3900, minOrderOre: 15000 }] }, device, zKey);
  assert.equal(zSave.status, 200, JSON.stringify(zSave.json));
  assert.equal(zSave.json.zones[0].feeOre, 3900);
  const zDb = JSON.parse((await prisma.restaurant.findUnique({ where: { id: restaurant.id } }))!.deliveryZones);
  assert.equal(zDb[0].feeOre, 3900);
  assert.equal(zDb[0].calculatedEtaMinutes, 31, 'ETA ligger kvar');
  assert.deepEqual(zDb[1], zones[1], 'den andra zonen är orörd');
  assert.equal(zDb[0].radiusKm, 3);
  await settle();
  assert.ok(revalidated.includes('testpalmyra'), 'status-adressen och webben rensas');
  assert.ok(events.some((e) => e.event === 'settings:updated' && e.payload.restaurantId === restaurant.id), 'settings:updated skickas');

  const zReplay = await call('PATCH', '/api/terminal/delivery-zones', { version: z0.json.version, changes: [{ id: 'z1', feeOre: 3900, minOrderOre: 15000 }] }, device, zKey);
  assert.equal(zReplay.status, 200, 'omspelning med samma nyckel');
  const zReplay2 = await call('PATCH', '/api/terminal/delivery-zones', { version: z0.json.version, changes: [{ id: 'z1', feeOre: 3900, minOrderOre: 15000 }] }, device, { 'idempotency-key': 'annan' });
  assert.equal(zReplay2.status, 200, 'omspelning efter omstart (ny nyckel) är ofarlig');
  const zStale = await call('PATCH', '/api/terminal/delivery-zones', { version: z0.json.version, changes: [{ id: 'z1', feeOre: 1000, minOrderOre: 15000 }] });
  assert.equal(zStale.status, 409, 'gammal version ger konflikt');
  assert.equal(zStale.json.code, 'VERSION_CONFLICT');
  assert.equal(zStale.json.current.zones[0].feeOre, 3900, 'konflikten visar serverns värde');
  const zGeo = await call('PATCH', '/api/terminal/delivery-zones', { version: zSave.json.version, changes: [{ id: 'z1', feeOre: 1000, minOrderOre: 15000, radiusKm: 99 }] });
  assert.equal(zGeo.status, 422, 'geometri kan inte skickas');
  const zUnknown = await call('PATCH', '/api/terminal/delivery-zones', { version: zSave.json.version, changes: [{ id: 'zz', feeOre: 1000, minOrderOre: 15000 }] });
  assert.equal(zUnknown.status, 422);

  // ── Öppettider ────────────────────────────────────────────────────────────
  const h0 = await call('GET', '/api/terminal/opening-hours');
  assert.equal(h0.status, 200);
  assert.equal(h0.json.configured, true);
  assert.equal(h0.json.week.monday.shifts[0].open, '11:00');
  assert.ok(Array.isArray(h0.json.preview.changes));
  // Stängd för i dag (som plattans "Stäng för idag") ska följa de nya tiderna.
  const { nextOpeningAfterToday } = await import(`${API}/lib/openingHours`);
  await prisma.restaurant.update({
    where: { id: restaurant.id },
    data: {
      acceptingOrdersMode: 'FORCE_CLOSED', acceptingOrdersOverrideReason: 'CLOSED_UNTIL_NEXT_OPENING',
      acceptingOrdersOverrideUntil: nextOpeningAfterToday(restaurant.openingHours),
    },
  });
  const h0b = await call('GET', '/api/terminal/opening-hours');
  const newWeek = Object.fromEntries(Object.keys(h0.json.week).map((d) => [d, { closed: false, shifts: [{ open: '12:00', close: '14:00' }, { open: '17:00', close: '22:00' }] }]));
  const tomorrow = new Date(Date.now() + 24 * 3600_000).toISOString().slice(0, 10);
  revalidated.length = 0;
  const hSave = await call('PUT', '/api/terminal/opening-hours', { version: h0b.json.version, week: newWeek, specialHours: [{ date: tomorrow, closed: true, shifts: [], note: 'Test' }] });
  assert.equal(hSave.status, 200, JSON.stringify(hSave.json));
  assert.equal(hSave.json.specialHours[0].date, tomorrow);
  const rDb = (await prisma.restaurant.findUnique({ where: { id: restaurant.id } }))!;
  assert.equal(rDb.acceptingOrdersOverrideUntil!.toISOString(), nextOpeningAfterToday(rDb.openingHours).toISOString(), 'stängt till nästa öppning följer nya tiderna');
  await settle();
  assert.ok(revalidated.includes('testpalmyra'));
  const hStale = await call('PUT', '/api/terminal/opening-hours', { version: h0.json.version, week: week, specialHours: [] });
  assert.equal(hStale.status, 409);
  const hBad = await call('PUT', '/api/terminal/opening-hours', { version: hSave.json.version, week: { ...newWeek, monday: { closed: false, shifts: [{ open: '11:00', close: '15:00' }, { open: '14:00', close: '20:00' }] } }, specialHours: [] });
  assert.equal(hBad.status, 422);
  const hReplay = await call('PUT', '/api/terminal/opening-hours', { version: h0b.json.version, week: newWeek, specialHours: [{ date: tomorrow, closed: true, shifts: [], note: 'Test' }] });
  assert.equal(hReplay.status, 200, 'samma sparning igen är ofarlig');

  // Admin (webbinloggning) sparar formuläret utan specialHours: dagen ligger kvar.
  await prisma.restaurant.update({ where: { id: restaurant.id }, data: { acceptingOrdersMode: 'SCHEDULED', acceptingOrdersOverrideReason: null, acceptingOrdersOverrideUntil: null } });
  const adminSave = await call('PATCH', `/api/restaurants/${restaurant.id}`, { openingHours: week }, web);
  assert.equal(adminSave.status, 200, JSON.stringify(adminSave.json));
  const afterAdmin = JSON.parse((await prisma.restaurant.findUnique({ where: { id: restaurant.id } }))!.openingHours);
  assert.equal(afterAdmin.specialHours[0].date, tomorrow, 'admin raderar inte plattans avvikande dag');
  assert.equal(afterAdmin.monday.shifts[0].open, '11:00', 'admins vecka gäller');

  // ── Vitlistan ─────────────────────────────────────────────────────────────
  assert.equal((await call('PATCH', `/api/restaurants/${restaurant.id}`, { deliveryZones: [] })).status, 403, 'plattan kan inte skriva zoner direkt');
  assert.equal((await call('PATCH', `/api/restaurants/${restaurant.id}`, { slug: 'kapad' })).status, 403);
  assert.equal((await call('PATCH', `/api/restaurants/${restaurant.id}`, { isOpen: true })).status, 200, 'öppna fungerar som förut');
  assert.equal((await call('PATCH', `/api/restaurants/${restaurant.id}`, { acceptingOrdersMode: 'SCHEDULED', acceptingOrdersOverrideUntil: null, acceptingOrdersOverrideReason: null, pausedUntil: null })).status, 200, 'paus fungerar som förut');
  assert.equal((await call('PATCH', `/api/admin/products/${cola.id}`, { isActive: false })).status, 200, 'slut fungerar som förut');
  assert.equal((await call('PATCH', `/api/admin/products/${cola.id}`, { isActive: true })).status, 200);
  assert.equal((await call('PATCH', `/api/admin/extras/${kid.id}`, { isActive: true })).status, 200);
  assert.equal((await call('PATCH', `/api/admin/products/${cola.id}`, { price: 1 })).status, 403, 'pris via admin-rutten nekas för plattan');
  assert.equal((await call('PATCH', `/api/admin/extra-groups/${size.id}`, { extras: [] })).status, 403, 'tillvalsgrupper nekas');
  assert.equal((await call('GET', `/api/admin/categories?restaurantId=${restaurant.id}&includeProducts=true`)).status, 200, 'läsning fungerar');
  assert.equal((await call('PATCH', `/api/admin/products/${cola.id}`, { price: 26 }, web)).status, 200, 'webbadmin påverkas inte');
  await prisma.product.update({ where: { id: cola.id }, data: { price: 2500 } });

  // ── Priser ────────────────────────────────────────────────────────────────
  const p0 = await call('GET', '/api/terminal/menu/prices');
  assert.equal(p0.status, 200);
  assert.equal(p0.json.products.length, 3, 'bara den egna menyn');
  assert.ok(!p0.json.products.some((p: any) => p.id === foreign.id));
  assert.equal(p0.json.extraGroups[0].extras.find((e: any) => e.id === kid.id).priceAddonOre, -1000);

  events.length = 0; revalidated.length = 0;
  const pKey = { 'idempotency-key': 'price-save-1' };
  const pSave = await call('POST', '/api/terminal/menu/prices', {
    summary: 'höjde allt utom Drycker med 5 kr',
    changes: [
      { kind: 'product', id: margherita.id, fromOre: 9000, toOre: 9500 },
      { kind: 'product', id: kebab.id, fromOre: 11900, toOre: 12400 },
      { kind: 'extra', id: kid.id, fromOre: -1000, toOre: -1500 },
    ],
  }, device, pKey);
  assert.equal(pSave.status, 200, JSON.stringify(pSave.json));
  assert.equal(pSave.json.applied.length, 3);
  assert.equal((await prisma.product.findUnique({ where: { id: margherita.id } }))!.price, 9500);
  assert.equal((await prisma.extra.findUnique({ where: { id: kid.id } }))!.priceAddon, -1500);
  await settle();
  assert.ok(events.some((e) => e.event.endsWith('|menu:changed')), 'kunder och admin får menu:changed');
  assert.ok(events.some((e) => e.event === `admin-room:${restaurant.id}|menu:updated`), 'plattorna får menu:updated');
  assert.ok(revalidated.includes('testpalmyra'), 'webbens menycache rensas');

  const pReplay = await call('POST', '/api/terminal/menu/prices', { changes: [{ kind: 'product', id: margherita.id, fromOre: 9000, toOre: 9500 }] });
  assert.equal(pReplay.status, 200);
  assert.equal(pReplay.json.unchanged.length, 1, 'omspelning räknas som redan sparad');

  // Allt eller inget: en konflikt i listan gör att inget skrivs.
  const pMixed = await call('POST', '/api/terminal/menu/prices', { changes: [
    { kind: 'product', id: cola.id, fromOre: 2500, toOre: 3000 },
    { kind: 'product', id: kebab.id, fromOre: 11900, toOre: 13000 },
  ] });
  assert.equal(pMixed.status, 409);
  assert.deepEqual(pMixed.json.conflicts, [{ kind: 'product', id: kebab.id, currentOre: 12400 }]);
  assert.equal((await prisma.product.findUnique({ where: { id: cola.id } }))!.price, 2500, 'inget skrevs');

  // Negativt tillval får inte göra en rätt gratis.
  const pNeg = await call('POST', '/api/terminal/menu/prices', { changes: [{ kind: 'extra', id: kid.id, fromOre: -1500, toOre: -9600 }] });
  assert.equal(pNeg.status, 422);
  assert.equal(pNeg.json.code, 'NEGATIVE_EXTRA_EXCEEDS_PRICE');
  const pDisc = await call('POST', '/api/terminal/menu/prices', { changes: [{ kind: 'product', id: kebab.id, fromOre: 12400, toOre: 9000 }] });
  assert.equal(pDisc.status, 422);
  assert.equal(pDisc.json.code, 'DISCOUNT_ABOVE_PRICE');

  // En annan restaurangs rätt kan inte ändras.
  const pForeign = await call('POST', '/api/terminal/menu/prices', { changes: [{ kind: 'product', id: foreign.id, fromOre: 5000, toOre: 1 }] });
  assert.equal(pForeign.status, 409);
  assert.equal((await prisma.product.findUnique({ where: { id: foreign.id } }))!.price, 5000);

  // Samtidiga sparningar av samma pris: exakt en vinner.
  const [a, b] = await Promise.all([
    call('POST', '/api/terminal/menu/prices', { changes: [{ kind: 'extra', id: family.id, fromOre: 10000, toOre: 11000 }] }),
    call('POST', '/api/terminal/menu/prices', { changes: [{ kind: 'extra', id: family.id, fromOre: 10000, toOre: 12000 }] }),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409], `en vinner, en får konflikt (${a.status}/${b.status})`);
  const familyNow = (await prisma.extra.findUnique({ where: { id: family.id } }))!.priceAddon;
  assert.ok(familyNow === 11000 || familyNow === 12000);

  // Ångra = omvänd lista.
  const pUndo = await call('POST', '/api/terminal/menu/prices', { changes: [
    { kind: 'product', id: margherita.id, fromOre: 9500, toOre: 9000 },
    { kind: 'product', id: kebab.id, fromOre: 12400, toOre: 11900 },
    { kind: 'extra', id: kid.id, fromOre: -1500, toOre: -1000 },
  ] });
  assert.equal(pUndo.status, 200);
  assert.equal((await prisma.product.findUnique({ where: { id: kebab.id } }))!.price, 11900);

  // Stor massjustering i ett anrop.
  const many = await Promise.all(Array.from({ length: 400 }, (_, i) => prisma.product.create({ data: { name: `Rätt ${i}`, slug: `ratt-${i}-tp`, price: 10000, categoryId: pizza.id } })));
  const t0 = Date.now();
  const pBulk = await call('POST', '/api/terminal/menu/prices', { changes: many.map((p) => ({ kind: 'product', id: p.id, fromOre: 10000, toOre: 10500 })) });
  assert.equal(pBulk.status, 200, JSON.stringify(pBulk.json).slice(0, 300));
  assert.equal(await prisma.product.count({ where: { price: 10500 } }), 400);
  console.log(`  400 priser sparade på ${Date.now() - t0} ms`);

  // ── Audit och Hermes ──────────────────────────────────────────────────────
  const audits = await prisma.auditLog.findMany({ where: { action: { startsWith: 'TERMINAL_' } } });
  assert.ok(audits.some((x: any) => x.action === 'TERMINAL_MENU_PRICES_UPDATE' && JSON.parse(x.changes).deviceId === 'device-aaaa-1111'));
  assert.ok(audits.some((x: any) => x.action === 'TERMINAL_DELIVERY_ZONES_UPDATE'));
  assert.ok(audits.some((x: any) => x.action === 'TERMINAL_OPENING_HOURS_UPDATE'));
  const hermes = await prisma.auditLog.findMany({ where: { changes: { contains: 'restaurant_terminal_change' } } });
  console.log(`  Hermes-larm i utkorgen: ${hermes.length}`);
  assert.ok(hermes.length >= 3, 'Hermes får en rad per sparning');
  assert.ok(hermes.some((x: any) => /höjde allt utom Drycker/.test(x.changes)));

  // Återkallad platta kommer inte in.
  await prisma.restaurantDevice.update({ where: { deviceId: 'device-aaaa-1111' }, data: { revoked: true } });
  assert.equal((await call('GET', '/api/terminal/menu/prices')).status, 401, 'återkallad platta nekas');

  console.log('terminal-integration: allt grönt');
  await prisma.$disconnect();
  server.close();
  webServer.close();
  io.close();
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
