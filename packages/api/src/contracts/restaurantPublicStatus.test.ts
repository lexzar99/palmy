import assert from 'node:assert/strict';
import { buildRestaurantPublicStatus } from '../lib/restaurantPublicStatus';

const week = (open: string, close: string) => Object.fromEntries(
  ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    .map((day) => [day, { closed: false, shifts: [{ open, close }] }]),
);
const base = {
  name: 'Testpizzerian',
  slug: 'test',
  address: 'Gatan 1',
  city: 'Lund',
  phone: null,
  pickupOnly: true,
  draft: false,
  comingSoon: false,
  isOpen: true,
  acceptingOrdersMode: 'SCHEDULED',
  openingHours: JSON.stringify(week('11:00', '21:00')),
} as any;

// Måndag 2026-11-02 kl. 12.00 svensk tid (CET)
const noon = new Date('2026-11-02T11:00:00.000Z');
const open = buildRestaurantPublicStatus(base, {}, noon);
assert.equal(open.openNow, true);
assert.equal(open.changes[0].at, '2026-11-02T20:00:00.000Z', 'stänger exakt kl. 21');
assert.equal(open.changes[0].open, false);
assert.equal(open.changes[1].at, '2026-11-03T10:00:00.000Z', 'öppnar nästa dag kl. 11');
assert.equal(open.delivery, false);
assert.equal(open.week[0].day, 'monday');
assert.deepEqual(open.week[0].shifts, [{ open: '11:00', close: '21:00' }]);
assert.ok(JSON.stringify(open).length < 4096, 'svaret ska vara litet');

// Tiden blir exakt även om anropet sker mitt i en minut
const midMinute = buildRestaurantPublicStatus(base, {}, new Date('2026-11-02T11:00:37.000Z'));
assert.equal(midMinute.changes[0].at, '2026-11-02T20:00:00.000Z');

// Nattöppet: fredag 12.00, stänger lördag 04.00
const night = buildRestaurantPublicStatus({ ...base, openingHours: week('11:00', '04:00') }, {}, new Date('2026-11-06T11:00:00.000Z'));
assert.equal(night.changes[0].at, '2026-11-07T03:00:00.000Z', 'stängning efter midnatt hamnar på rätt dygn');

// Lunchstängt ger två pass samma dag
const lunch = buildRestaurantPublicStatus({
  ...base,
  openingHours: { monday: { closed: false, shifts: [{ open: '11:00', close: '14:00' }, { open: '16:00', close: '21:00' }] } },
}, {}, noon);
assert.equal(lunch.changes[0].at, '2026-11-02T13:00:00.000Z');
assert.equal(lunch.changes[1].at, '2026-11-02T15:00:00.000Z');
assert.equal(lunch.changes[1].open, true);

// Tvingat stängd visar stängt, oavsett schema
const forced = buildRestaurantPublicStatus({ ...base, acceptingOrdersMode: 'FORCE_CLOSED', isOpen: false }, {}, noon);
assert.equal(forced.openNow, false);

console.log('restaurantPublicStatus: alla kontrakt gröna');
