// Kontrakt for Hermes-vakten.
// Kor: node --test tools/hermes-agent/vakt.test.mjs
//
// Vakten far aldrig skramla: ett larm per handelse, inget larm nar minin sjalv
// ar utan natt, och "redan larmat" satts forst nar meddelandet faktiskt gick.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkCertificates,
  checkOpeningHours,
  checkRecord,
  checkSites,
  morningBrief,
  rememberDays,
  restaurantsFromPublic,
  restaurantsText,
  todayText,
  weeklyBrief,
} from './vakt.mjs';

const MIN = 60_000;
// Intl skriver hart mellanslag i "3 456" (sa beloppet inte radbryts). Testerna jamfor med vanliga.
const plain = (text) => text.replace(/[\u00a0\u202f]/g, ' ');
const send = (messages) => { for (const message of messages) message.onSent?.(); return messages.map((message) => plain(message.text)); };

test('sajtvakten larmar efter tva missar, en gang, och sager till nar sajten ar tillbaka', () => {
  const state = {};
  const t0 = Date.parse('2026-10-23T18:00:00Z');
  const down = [{ key: 'api', label: 'api.viaeats.se', ok: false, detail: 'HTTP 502' }];
  assert.deepEqual(send(checkSites(state, down, { now: t0 })), []);
  assert.deepEqual(send(checkSites(state, down, { now: t0 + 2 * MIN })), ['🔴 api.viaeats.se svarar inte (HTTP 502). Kollar igen varannan minut.']);
  assert.deepEqual(send(checkSites(state, down, { now: t0 + 4 * MIN })), []);
  assert.equal(send(checkSites(state, down, { now: t0 + 63 * MIN })).length, 1, 'paminnelse efter en timme');
  assert.deepEqual(send(checkSites(state, [{ key: 'api', label: 'api.viaeats.se', ok: true }], { now: t0 + 70 * MIN })), ['🟢 api.viaeats.se svarar igen. Nere i 70 min.']);
});

test('sajtvakten tiger nar minin sjalv saknar internet', () => {
  const state = {};
  const down = [{ key: 'web', label: 'viaeats.se', ok: false, detail: 'ENOTFOUND' }];
  for (let i = 0; i < 5; i += 1) assert.deepEqual(checkSites(state, down, { now: i * 2 * MIN, internetOk: false }), []);
});

test('ett larm som inte gick ivag raknas inte som skickat', () => {
  const state = {};
  const down = [{ key: 'web', label: 'viaeats.se', ok: false, detail: 'timeout' }];
  checkSites(state, down, { now: 0 });
  assert.equal(checkSites(state, down, { now: 2 * MIN }).length, 1); // onSent anropas inte
  assert.equal(checkSites(state, down, { now: 4 * MIN }).length, 1, 'forsoker igen nasta runda');
});

test('certifikat som snart gar ut varnas en gang per dag', () => {
  const state = {};
  const now = Date.parse('2026-10-23T08:00:00Z');
  const certs = [{ host: 'viaeats.se', validTo: now + 9 * 86_400_000 }, { host: 'api.viaeats.se', validTo: now + 60 * 86_400_000 }];
  const first = send(checkCertificates(state, certs, { now }));
  assert.equal(first.length, 1);
  assert.match(first[0], /viaeats\.se går ut om 9 dagar/);
  assert.deepEqual(send(checkCertificates(state, certs, { now: now + 3_600_000 })), []);
});

test('oppettidsvakten larmar efter 15 min oplanerad stangning och sager till nar den oppnar', () => {
  const state = {};
  const t0 = Date.parse('2026-10-23T16:05:00Z');
  const closed = [{ id: 'p', name: 'Palmyra Pizzeria', hasHours: true, scheduledOpenNow: true, isOpen: false, availabilityReason: 'RESTAURANT_PAUSED' }];
  assert.deepEqual(send(checkOpeningHours(state, closed, { now: t0 })), []);
  const alarm = send(checkOpeningHours(state, closed, { now: t0 + 16 * MIN }));
  assert.deepEqual(alarm, ['🕐 Palmyra Pizzeria ska ha öppet nu men tar inte emot beställningar (pausad). Stängd sedan 18:05.']);
  assert.deepEqual(send(checkOpeningHours(state, closed, { now: t0 + 30 * MIN })), []);
  const open = [{ ...closed[0], isOpen: true, availabilityReason: 'SCHEDULE_OPEN' }];
  assert.deepEqual(send(checkOpeningHours(state, open, { now: t0 + 40 * MIN })), ['✅ Palmyra Pizzeria tar emot beställningar igen.']);
});

test('avsiktligt stangda restauranger (kommer snart, utanfor tider) larmar aldrig', () => {
  const state = {};
  const restaurants = [
    { id: 'a', name: 'A', hasHours: true, scheduledOpenNow: true, isOpen: false, availabilityReason: 'COMING_SOON' },
    { id: 'b', name: 'B', hasHours: true, scheduledOpenNow: false, isOpen: false, availabilityReason: 'OUTSIDE_OPENING_HOURS' },
    { id: 'c', name: 'C', hasHours: false, scheduledOpenNow: true, isOpen: false, availabilityReason: 'RESTAURANT_PAUSED' },
  ];
  for (let i = 0; i < 20; i += 1) assert.deepEqual(checkOpeningHours(state, restaurants, { now: i * 5 * MIN }), []);
});

test('rekordnotisen kraver historik och kommer en gang per dag', () => {
  const now = Date.parse('2026-10-23T17:00:00Z');
  const trend = ['2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22']
    .map((date, index) => ({ date, orders: [4, 6, 3, 9, 5, 2, 7][index], netSales: 1000 }));
  const fresh = {};
  rememberDays(fresh, trend.slice(-3), { now });
  assert.deepEqual(checkRecord(fresh, { orders: 50, netSales: 9000 }, { now }), [], 'for lite historik');

  const state = {};
  rememberDays(state, trend, { now });
  assert.deepEqual(checkRecord(state, { orders: 9, netSales: 3000 }, { now }), [], 'lika med toppen ar inget rekord');
  const record = send(checkRecord(state, { orders: 10, netSales: 3456 }, { now }));
  assert.deepEqual(record, ['🏆 Bästa dagen på 8 dagar: 10 ordrar och 3 456 kr hittills idag. Förra toppen: 9 ordrar (mån 19 okt.).']);
  assert.deepEqual(checkRecord(state, { orders: 12, netSales: 4000 }, { now: now + 3_600_000 }), []);
});

test('morgonbriefen jamfor med samma dag forra veckan och tar med leads och kampanjslut', () => {
  const now = Date.parse('2026-10-24T05:30:00Z'); // 07:30 svensk tid
  const days = {
    '2026-10-16': { orders: 10, netSales: 3000 },
    '2026-10-22': { orders: 5, netSales: 1500 },
    '2026-10-23': { orders: 12, netSales: 3600 },
  };
  const brief = morningBrief({
    days,
    ops: { payments: { failedPayments24h: 1, stuckAwaitingPayment: 0 } },
    leadDates: ['2026-10-23', '2026-10-23', '2026-10-21'],
    campaign: { end: '2026-10-31', name: 'Meta-kampanjen' },
    now,
  });
  assert.equal(plain(brief.text), [
    'God morgon ☀️',
    'Igår (fre 23 okt.): 12 ordrar · 3 600 kr',
    'Samma dag förra veckan: 10 ordrar · 3 000 kr (+20 %)',
    'Senaste 2 dagarna: 17 ordrar · 5 100 kr', // 16 okt ligger utanfor sjudagarsfonstret
    'Leads igår: 2 (3 sedan bevakningen startade)',
    'Betalningar senaste dygnet: 1 misslyckade, 0 fastnade före betalning',
    'Meta-kampanjen slutar om 7 dagar.',
  ].join('\n'));
});

test('svaren pa begaran: dagens siffror och restaurangstatus', () => {
  const now = Date.parse('2026-10-23T17:00:00Z');
  const overview = {
    today: { orders: 6, netSales: 1890, liveOrders: 2, pendingOrders: 1 },
    restaurants: { open: 2, total: 3 },
    restaurantStatus: [
      { name: 'Palmyra Pizzeria', isOpen: true, availabilityReason: 'SCHEDULE_OPEN', liveOrders: 2 },
      { name: 'Wanthai', isOpen: false, availabilityReason: 'RESTAURANT_PAUSED', liveOrders: 0 },
    ],
  };
  assert.equal(plain(todayText(overview, { '2026-10-16': { orders: 9, netSales: 2700 } }, { now })), [
    'Idag hittills: 6 ordrar · 1 890 kr',
    'Samma dag förra veckan (hela dagen): 9 ordrar · 2 700 kr',
    'Pågår nu: 2, varav 1 väntar på restaurangen',
    'Öppna restauranger: 2 av 3',
  ].join('\n'));
  assert.equal(restaurantsText(overview.restaurantStatus), '🟢 Palmyra Pizzeria: öppet · 2 pågår\n⚪️ Wanthai: pausad');
});

test('publika restaurang-API:t laser bada formaten for oppettider och hoppar over utkast', () => {
  const list = restaurantsFromPublic([
    { id: 'p', name: 'Palmyra', isOpen: true, scheduledOpenNow: true, availabilityReason: 'SCHEDULE_OPEN', activeOrdersCount: 2, openingHours: { monday: { closed: false, shifts: [{ open: '11:00', close: '21:00' }] } } },
    { id: 'r', name: 'Roma', isOpen: false, scheduledOpenNow: true, availabilityReason: 'RESTAURANT_PAUSED', openingHours: { monday: { open: '13:00', close: '21:00', closed: false } } },
    { id: 'x', name: 'Utan tider', isOpen: false, openingHours: { monday: { closed: true, shifts: [] } } },
    { id: 'd', name: 'Utkast', draft: true },
  ]);
  assert.deepEqual(list.map((restaurant) => [restaurant.name, restaurant.hasHours, restaurant.liveOrders]), [['Palmyra', true, 2], ['Roma', true, 0], ['Utan tider', false, 0]]);
});

test('veckobrevet jamfor vecka mot vecka och sager om datat ar ofullstandigt', () => {
  const now = Date.parse('2026-10-26T07:00:00Z'); // mandag 26 okt 08:00
  const days = {};
  for (let i = 0; i < 14; i += 1) {
    const key = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(Date.parse('2026-10-25T12:00:00Z') - i * 86_400_000);
    days[key] = { orders: i < 7 ? 10 : 8, netSales: i < 7 ? 3000 : 2500 };
  }
  days['2026-10-24'] = { orders: 15, netSales: 4500 };
  const brief = weeklyBrief({ days, leadDates: ['2026-10-20', '2026-10-25', '2026-10-12'], campaign: { end: '2026-10-31', name: 'Meta-kampanjen' }, now });
  assert.equal(plain(brief.text), [
    'Veckobrev, vecka 43 📊',
    '75 ordrar · 22 500 kr',
    'Veckan innan: 56 ordrar · 17 500 kr (+29 %)',
    'Bästa dagen: lör 24 okt. med 15 ordrar',
    'Nya leads: 2',
    'Meta-kampanjen slutar om 5 dagar.',
  ].join('\n'));

  const late = weeklyBrief({ days, now: Date.parse('2026-10-27T09:00:00Z') }); // tisdag: samma vecka
  assert.match(plain(late.text), /^Veckobrev, vecka 43 📊\n75 ordrar/);

  const partial = weeklyBrief({ days: { '2026-10-24': { orders: 3, netSales: 900 } }, now });
  assert.match(plain(partial.text), /3 ordrar · 900 kr \(data för 1 av 7 dagar\)/);
});
