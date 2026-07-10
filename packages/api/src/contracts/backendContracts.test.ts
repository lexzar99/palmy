import assert from 'node:assert/strict';
import { resolveRestaurantAvailability } from '../lib/restaurantAvailability';
import { normalizeDeliveryZones } from '../utils/deliveryZones';
import { moneyDto, parseOre, sekToOre } from '../utils/money';
import { resolveContentStatus } from '../lib/contentPlacement';

const now = new Date('2026-07-10T12:00:00.000Z');
const scheduleClosed = JSON.stringify({ regular: {} });
const fridayWindow = JSON.stringify({ friday: { open: '13:00', close: '15:00' } });
const overnightFriday = JSON.stringify({ friday: { open: '22:00', close: '02:00' } });

assert.equal(
  resolveRestaurantAvailability({ openingHours: '{}', acceptingOrdersMode: 'SCHEDULED' }, {}, now).isOpen,
  true,
);
assert.equal(
  resolveRestaurantAvailability({ openingHours: fridayWindow, acceptingOrdersMode: 'SCHEDULED' }, {}, now).isOpen,
  true,
);
assert.equal(
  resolveRestaurantAvailability(
    { openingHours: overnightFriday, acceptingOrdersMode: 'SCHEDULED' },
    {},
    new Date('2026-07-10T21:00:00.000Z'), // Friday 23:00 Stockholm
  ).isOpen,
  true,
);
assert.equal(
  resolveRestaurantAvailability(
    { openingHours: overnightFriday, acceptingOrdersMode: 'SCHEDULED' },
    {},
    new Date('2026-07-10T23:00:00.000Z'), // Saturday 01:00 Stockholm
  ).isOpen,
  true,
);
assert.equal(
  resolveRestaurantAvailability(
    { openingHours: overnightFriday, acceptingOrdersMode: 'SCHEDULED' },
    {},
    new Date('2026-07-11T01:00:00.000Z'), // Saturday 03:00 Stockholm
  ).isOpen,
  false,
);
assert.equal(
  resolveRestaurantAvailability({ openingHours: '{}', acceptingOrdersMode: 'FORCE_CLOSED' }, {}, now).reason,
  'MANUAL_FORCE_CLOSED',
);
assert.equal(
  resolveRestaurantAvailability({ openingHours: scheduleClosed, acceptingOrdersMode: 'FORCE_OPEN' }, {}, now).isOpen,
  true,
);
const expiredOverride = resolveRestaurantAvailability({
    openingHours: '{}',
    acceptingOrdersMode: 'FORCE_CLOSED',
    acceptingOrdersOverrideUntil: '2026-07-10T11:59:59.000Z',
  }, {}, now);
assert.equal(expiredOverride.reason, 'SCHEDULE_OPEN');
assert.equal(expiredOverride.legacyManualIsOpen, true);
assert.equal(
  resolveRestaurantAvailability(
    { openingHours: scheduleClosed, acceptingOrdersMode: 'FORCE_OPEN' },
    { city: { ordersPaused: true } },
    now,
  ).reason,
  'CITY_PAUSED',
);
assert.equal(
  resolveRestaurantAvailability(
    { openingHours: scheduleClosed, acceptingOrdersMode: 'FORCE_OPEN' },
    { platform: { platformOrdersPaused: true } },
    now,
  ).reason,
  'PLATFORM_PAUSED',
);

// 900 is never guessed: explicit ore stays 900, explicit SEK becomes 90,000.
assert.equal(parseOre(900), 900);
assert.equal(sekToOre(900), 90_000);
assert.deepEqual(moneyDto(900), { amountMinor: 900, currency: 'SEK' });

const geometry = { id: 'z1', name: 'Centrum', type: 'circle', centerLat: 55.7, centerLng: 13.2, radiusKm: 3 };
assert.equal(normalizeDeliveryZones([{ ...geometry, feeOre: 900, minOrderOre: 15_000 }], { strict: true })[0].feeOre, 900);
assert.equal(normalizeDeliveryZones([{ ...geometry, fee: 900, minOrder: 15_000 }], { strict: true })[0].feeOre, 900);
assert.equal(normalizeDeliveryZones([{ ...geometry, deliveryFee: 9, minOrder: 15_000 }], { strict: true })[0].feeOre, 900);
assert.throws(
  () => normalizeDeliveryZones([{ ...geometry, feeOre: 9.5, minOrderOre: 15_000 }], { strict: true }),
  /ogiltig geometri eller pengaenhet/,
);

assert.equal(resolveContentStatus({ isActive: true, hasContent: false, now }), 'DRAFT');
assert.equal(resolveContentStatus({ isActive: false, hasContent: true, now }), 'PAUSED');
assert.equal(resolveContentStatus({ isActive: true, startsAt: '2026-07-11T12:00:00.000Z', now }), 'SCHEDULED');
assert.equal(resolveContentStatus({ isActive: true, endsAt: '2026-07-09T12:00:00.000Z', now }), 'ENDED');
assert.equal(resolveContentStatus({ isActive: true, startsAt: '2026-07-09T12:00:00.000Z', now }), 'LIVE');

console.log('backend availability + money + placement contracts: ok');
