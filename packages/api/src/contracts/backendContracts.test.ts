import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { resolveRestaurantAvailability } from '../lib/restaurantAvailability';
import { buildRestaurantStatusMaintenance } from '../lib/restaurantStatusMaintenance';
import { nextOpeningAfterToday } from '../lib/openingHours';
import { normalizeDeliveryZones } from '../utils/deliveryZones';
import { moneyDto, parseOre, sekToOre } from '../utils/money';
import { resolveContentStatus } from '../lib/contentPlacement';
import { adminTokenVersionMatches } from '../lib/adminSessionVersion';
import {
  customerAuthMethod,
  hasVerifiedSupabasePhone,
} from '../lib/customerAuthPolicy';

const now = new Date('2026-07-10T12:00:00.000Z');
const scheduleClosed = JSON.stringify({ regular: {} });
const fridayWindow = JSON.stringify({ friday: { open: '13:00', close: '15:00' } });
const overnightFriday = JSON.stringify({ friday: { open: '22:00', close: '02:00' } });
const dailyWindow = JSON.stringify({
  regular: {
    friday: { open: '11:00', close: '21:00' },
    saturday: { open: '11:00', close: '21:00' },
  },
});

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
assert.equal(
  nextOpeningAfterToday(dailyWindow, new Date('2026-07-10T18:30:00.000Z')).toISOString(),
  '2026-07-11T09:00:00.000Z',
);
const closedForToday = resolveRestaurantAvailability({
  openingHours: dailyWindow,
  acceptingOrdersMode: 'SCHEDULED',
  pausedUntil: nextOpeningAfterToday(dailyWindow, new Date('2026-07-10T18:30:00.000Z')),
}, {}, new Date('2026-07-10T18:30:00.000Z'));
// Terminalen stängde för dagen: pausedUntil pekar på nästa öppning. Det är en
// stängning, inte en paus — kunden ska aldrig se "Pausad till 11:00" för den.
assert.equal(closedForToday.reason, 'CLOSED_UNTIL_OPENING');
assert.equal(closedForToday.restaurantPaused, false);
assert.equal(closedForToday.configuredMode, 'SCHEDULED');
assert.equal(closedForToday.legacyManualIsOpen, true);
const expiredPauseDuringOpenHours = buildRestaurantStatusMaintenance({
  openingHours: dailyWindow,
  scheduledOpenNow: true,
  acceptingOrdersMode: 'SCHEDULED',
  pausedUntil: '2026-07-10T11:59:59.000Z',
}, now);
assert.equal(expiredPauseDuringOpenHours.pauseExpired, true);
assert.deepEqual(expiredPauseDuringOpenHours.update, { pausedUntil: null });
assert.equal(
  resolveRestaurantAvailability(expiredPauseDuringOpenHours.restaurantForAvailability, {}, now).reason,
  'SCHEDULE_OPEN',
);
const expiredPauseAfterClosing = buildRestaurantStatusMaintenance({
  openingHours: dailyWindow,
  scheduledOpenNow: true,
  acceptingOrdersMode: 'SCHEDULED',
  pausedUntil: '2026-07-10T18:59:59.000Z',
}, new Date('2026-07-10T19:05:00.000Z')); // Friday 21:05 Stockholm
assert.equal(expiredPauseAfterClosing.pauseExpired, true);
assert.deepEqual(expiredPauseAfterClosing.update, { scheduledOpenNow: false, pausedUntil: null });
assert.equal(
  resolveRestaurantAvailability(
    expiredPauseAfterClosing.restaurantForAvailability,
    {},
    new Date('2026-07-10T19:05:00.000Z'),
  ).reason,
  'OUTSIDE_OPENING_HOURS',
);
const nextMorningAfterClosedForToday = buildRestaurantStatusMaintenance({
  openingHours: dailyWindow,
  scheduledOpenNow: false,
  acceptingOrdersMode: 'SCHEDULED',
  pausedUntil: null,
}, new Date('2026-07-11T09:00:00.000Z')); // Saturday 11:00 Stockholm
assert.deepEqual(nextMorningAfterClosedForToday.update, { scheduledOpenNow: true });
assert.equal(
  resolveRestaurantAvailability(
    nextMorningAfterClosedForToday.restaurantForAvailability,
    {},
    new Date('2026-07-11T09:00:00.000Z'),
  ).reason,
  'SCHEDULE_OPEN',
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

assert.equal(adminTokenVersionMatches(undefined, 0), true);
assert.equal(adminTokenVersionMatches(undefined, 1), false);
assert.equal(adminTokenVersionMatches(1, 1), true);
assert.equal(adminTokenVersionMatches(0, 1), false);

assert.equal(customerAuthMethod({ app_metadata: { provider: 'email' } }), null);
assert.equal(customerAuthMethod({ app_metadata: { provider: 'google' } }), null);
assert.equal(customerAuthMethod({ app_metadata: { provider: 'apple' } }), null);
assert.equal(customerAuthMethod({ phone: '+46700000000', app_metadata: { provider: 'phone' } }), null);
assert.equal(customerAuthMethod({
  phone: '+46700000000',
  phone_confirmed_at: '2026-07-15T12:00:00.000Z',
  app_metadata: { provider: 'phone' },
}), 'phone');
const linkedPhoneIdentity = {
  phone: '+46700000000',
  phone_confirmed_at: '2026-07-15T12:00:00.000Z',
  app_metadata: { provider: 'google', providers: ['google'] },
};
assert.equal(customerAuthMethod(linkedPhoneIdentity), null);
assert.equal(customerAuthMethod(linkedPhoneIdentity, ['oauth']), null);
assert.equal(customerAuthMethod(linkedPhoneIdentity, ['token_refresh']), null);
assert.equal(customerAuthMethod(linkedPhoneIdentity, ['otp']), 'phone');
assert.equal(customerAuthMethod({
  ...linkedPhoneIdentity,
  app_metadata: { provider: 'apple' },
}, ['otp']), 'phone');
assert.equal(hasVerifiedSupabasePhone({ phone: '+46700000000', phone_confirmed_at: null }), false);
assert.equal(hasVerifiedSupabasePhone({ phone: '+46700000000', phone_confirmed_at: '2026-07-15T12:00:00.000Z' }), true);

// Customer auth is passwordless. Legacy password/email-link endpoints must be
// intercepted by the 410 guard before their compatibility handlers can run;
// the admin /login password+2FA endpoint is intentionally not retired.
const authRouteSource = fs.readFileSync(path.join(__dirname, '../routes/auth.ts'), 'utf8');
const retiredGuardIndex = authRouteSource.indexOf('router.use((req, res, next) =>');
assert.ok(retiredGuardIndex >= 0);
for (const retiredPath of [
  '/register-user',
  '/login-user',
  '/send-verification-email',
  '/verify-email',
  '/check-email-verified',
  '/forgot-password',
  '/reset-password',
]) {
  assert.ok(authRouteSource.includes(`'${retiredPath}'`), `${retiredPath} must stay fail-closed`);
}
assert.match(authRouteSource, /CUSTOMER_PASSWORD_AUTH_RETIRED/);
assert.doesNotMatch(authRouteSource, /router\.post\('\/(?:register-user|login-user|send-verification-email|verify-email|check-email-verified|forgot-password|reset-password)'/);
assert.match(authRouteSource, /router\.post\('\/login', authLimiter/);
assert.doesNotMatch(authRouteSource, /verified\.email \|\| email/);
assert.match(authRouteSource, /CUSTOMER_OAUTH_RETIRED/);
assert.doesNotMatch(authRouteSource, /verifyGoogleIdToken|verifyAppleIdToken|verifySupabaseOAuthToken/);
assert.match(authRouteSource, /VERIFIED_PHONE_SESSION_REQUIRED/);
assert.match(authRouteSource, /select: \{ deletedAt: true, isActive: true \}/);
assert.doesNotMatch(authRouteSource, /email_confirmed_at|matchedByVerifiedEmail/);
assert.match(authRouteSource, /oauthProvider: 'phone'/);

const profileRouteSource = fs.readFileSync(path.join(__dirname, '../routes/profile.ts'), 'utf8');
assert.match(profileRouteSource, /token: phoneVerificationToken/);
assert.match(profileRouteSource, /hasVerifiedSupabasePhone\(verifiedPhoneUser\)/);
assert.match(profileRouteSource, /verifiedPhone !== requestedPhone/);
for (const relation of [
  'savedAddress',
  'customerDeal',
  'deviceInstallation',
  'notificationOutbox',
]) {
  assert.match(profileRouteSource, new RegExp(`tx\\.${relation}\\.updateMany`));
}
assert.match(profileRouteSource, /status: \{ in: \['PENDING', 'RETRY', 'PROCESSING'\] \}/);
assert.match(profileRouteSource, /isActive: false/);
assert.match(profileRouteSource, /claimedDealIds: mergeJsonStringList/);
assert.match(profileRouteSource, /code: 'PHONE_ACCOUNT_MERGE_CONFLICT'/);

const customerSchemaSource = fs.readFileSync(path.join(__dirname, '../../prisma/schema.prisma'), 'utf8');
const customerUserModelSource = customerSchemaSource.match(/model User\s*\{([\s\S]*?)\n\}/)?.[1] || '';
assert.ok(customerUserModelSource, 'Prisma User model must exist');
for (const retiredCredentialField of [
  'password',
  'passwordResetToken',
  'passwordResetExpiresAt',
  'emailVerificationToken',
  'emailVerificationExpiresAt',
  'emailVerifiedAt',
]) {
  assert.doesNotMatch(
    customerUserModelSource,
    new RegExp(`^\\s*${retiredCredentialField}\\s+`, 'm'),
    `User.${retiredCredentialField} must not remain in the customer schema`,
  );
}

// P1 launch safety: destructive batch refunds/order deletion remain as
// fail-closed tombstones for old clients, with no executable Prisma delete.
const adminRouteSource = fs.readFileSync(path.join(__dirname, '../routes/admin.ts'), 'utf8');
assert.match(adminRouteSource, /BULK_REFUND_DISABLED/);
assert.match(adminRouteSource, /ORDER_HARD_DELETE_DISABLED/);
assert.match(adminRouteSource, /ORDER_WIPE_DISABLED/);
assert.doesNotMatch(adminRouteSource, /prisma\.order\.(?:delete|deleteMany)\s*\(/);

// New production checkouts use the pending-order -> explicitly enabled PSP
// flow. Provider/ref bindings remain immutable after the order is created.
const orderRouteSource = fs.readFileSync(path.join(__dirname, '../routes/orders.ts'), 'utf8');
const paymentProviderSource = fs.readFileSync(path.join(__dirname, '../lib/payments/index.ts'), 'utf8');
const paymentRouteSource = fs.readFileSync(path.join(__dirname, '../routes/payments.ts'), 'utf8');
assert.match(orderRouteSource, /MOLLIE_CHECKOUT_REQUIRED/);
assert.match(paymentProviderSource, /case 'stripe'/);
assert.match(paymentProviderSource, /case 'swish'/);
assert.match(paymentProviderSource, /configuredCheckoutProviderNames/);
assert.match(paymentRouteSource, /PAYMENT_PROVIDER_CONFLICT/);
assert.match(paymentRouteSource, /PAYMENT_BINDING_CHANGED/);
const finalizePaymentSource = fs.readFileSync(path.join(__dirname, '../lib/payments/finalize.ts'), 'utf8');
assert.match(finalizePaymentSource, /provider\/ref binding mismatch/);
assert.match(finalizePaymentSource, /order\.paymentProvider === input\.provider/);
assert.match(finalizePaymentSource, /order\.molliePaymentId === input\.ref/);
assert.match(finalizePaymentSource, /order\.stripePaymentIntentId === input\.ref/);
const retiredAdyenVerify = paymentRouteSource.match(
  /router\.post\('\/adyen\/verify',[\s\S]*?\n}\);/,
)?.[0] || '';
assert.match(retiredAdyenVerify, /status\(410\)/);
assert.match(retiredAdyenVerify, /LEGACY_PAYMENT_VERIFICATION_DISABLED/);
assert.doesNotMatch(retiredAdyenVerify, /finalizePaymentSuccess|getAdyenSessionResult/);

// ── Paus vs stängt ──────────────────────────────────────────────────────────
// Terminalen skriver nästa öppningstid till `pausedUntil` när den stänger för
// dagen. Det får aldrig läsas som en paus: kunden ska se "Stängt · öppnar
// 11:00", inte "Pausad till 11:00".
const nightClosed = resolveRestaurantAvailability(
  {
    openingHours: dailyWindow,
    acceptingOrdersMode: 'SCHEDULED',
    pausedUntil: new Date('2026-07-11T09:00:00.000Z'), // lördag 11:00 Stockholm
  },
  {},
  new Date('2026-07-11T04:00:00.000Z'), // lördag 06:00 Stockholm, utanför öppettid
);
assert.equal(nightClosed.isOpen, false);
assert.equal(nightClosed.restaurantPaused, false, 'dagsstängning är inte en paus');
// Kvarliggande pausedUntil pekar på öppningen → mer precis status än bara
// "utanför öppettider". Kundtexten blir densamma: Stängt · öppnar 11:00.
assert.equal(nightClosed.reason, 'CLOSED_UNTIL_OPENING');

// Utan kvarliggande pausedUntil är det helt enkelt utanför öppettiderna.
const plainNightClosed = resolveRestaurantAvailability(
  { openingHours: dailyWindow, acceptingOrdersMode: 'SCHEDULED' },
  {},
  new Date('2026-07-11T04:00:00.000Z'),
);
assert.equal(plainNightClosed.reason, 'OUTSIDE_OPENING_HOURS');
assert.equal(plainNightClosed.opensAt, new Date('2026-07-11T09:00:00.000Z').toISOString());
assert.equal(
  nightClosed.opensAt,
  new Date('2026-07-11T09:00:00.000Z').toISOString(),
  'stängd restaurang ska tala om när den öppnar igen',
);

// Terminalens "stäng restaurang" mitt i öppettiden: pausedUntil pekar på nästa
// öppning. Det är en stängning med egen status — inte en paus, och inte öppet.
const closedForTheDay = resolveRestaurantAvailability(
  {
    openingHours: dailyWindow,
    acceptingOrdersMode: 'SCHEDULED',
    pausedUntil: nextOpeningAfterToday(dailyWindow, new Date('2026-07-11T12:00:00.000Z')),
  },
  {},
  new Date('2026-07-11T12:00:00.000Z'), // lördag 14:00 Stockholm, mitt i öppettiden
);
assert.equal(closedForTheDay.isOpen, false, 'stängd för dagen är inte öppen');
assert.equal(closedForTheDay.restaurantPaused, false, 'stängd för dagen är inte pausad');
assert.equal(closedForTheDay.closedUntilOpening, true);
assert.equal(closedForTheDay.reason, 'CLOSED_UNTIL_OPENING');
assert.equal(
  closedForTheDay.opensAt,
  nextOpeningAfterToday(dailyWindow, new Date('2026-07-11T12:00:00.000Z')).toISOString(),
);

// Skarpt fall: Palmyra har öppet 00:00-21:00 på tisdagar och terminalen satte
// pausedUntil till 11:00. Sluttiden är varken ett skiftbyte eller en kort paus
// - sex timmar framåt är en stängning för kunden.
const longPauseInsideShift = resolveRestaurantAvailability(
  {
    openingHours: JSON.stringify({ tuesday: { closed: false, shifts: [{ open: '00:00', close: '21:00' }] } }),
    acceptingOrdersMode: 'SCHEDULED',
    pausedUntil: new Date('2026-07-28T09:00:00.000Z'), // tisdag 11:00 Stockholm
  },
  {},
  new Date('2026-07-28T02:48:00.000Z'), // tisdag 04:48 Stockholm
);
assert.equal(longPauseInsideShift.restaurantPaused, false, 'sex timmar är ingen paus');
assert.equal(longPauseInsideShift.reason, 'CLOSED_UNTIL_OPENING');
assert.equal(
  longPauseInsideShift.opensAt,
  new Date('2026-07-28T09:00:00.000Z').toISOString(),
  'öppnar när pausen släpper, inte vid nästa skiftstart',
);

// Etiketten får inte byta namn när nedräkningen kryper under tvåtimmarstaket.
// Slutar tiden på en öppningstid är det en stängning hela vägen fram.
for (const stockholmHour of [4, 8, 9, 10]) {
  const at = new Date(Date.UTC(2026, 6, 28, stockholmHour - 2, 30));
  const state = resolveRestaurantAvailability(
    {
      openingHours: JSON.stringify({
        monday: { closed: false, shifts: [{ open: '11:00', close: '21:00' }] },
        tuesday: { closed: false, shifts: [{ open: '00:00', close: '21:00' }] },
      }),
      acceptingOrdersMode: 'SCHEDULED',
      pausedUntil: new Date('2026-07-28T09:00:00.000Z'), // tisdag 11:00 Stockholm
    },
    {},
    at,
  );
  assert.equal(
    state.reason,
    'CLOSED_UNTIL_OPENING',
    `kl ${stockholmHour}:30 ska fortfarande vara stängt, inte pausat`,
  );
}

// En riktig paus mitt i öppettiden är fortfarande en paus.
const midServicePause = resolveRestaurantAvailability(
  {
    openingHours: dailyWindow,
    acceptingOrdersMode: 'SCHEDULED',
    pausedUntil: new Date('2026-07-11T12:30:00.000Z'), // lördag 14:30 Stockholm
  },
  {},
  new Date('2026-07-11T12:00:00.000Z'), // lördag 14:00 Stockholm, mitt i öppettiden
);
assert.equal(midServicePause.isOpen, false);
assert.equal(midServicePause.restaurantPaused, true, 'avbrott mitt i öppettiden är en paus');
assert.equal(midServicePause.reason, 'RESTAURANT_PAUSED');

// Manuellt tvingad öppen restaurang kan pausa utanför sitt schema.
const forcedOpenPause = resolveRestaurantAvailability(
  {
    openingHours: dailyWindow,
    acceptingOrdersMode: 'FORCE_OPEN',
    pausedUntil: new Date('2026-07-11T05:00:00.000Z'),
  },
  {},
  new Date('2026-07-11T04:00:00.000Z'),
);
assert.equal(forcedOpenPause.restaurantPaused, true, 'FORCE_OPEN + paus är en paus');

// Arkiverad/utkast öppnar inte 11:00 bara för att kalendern säger så.
const draftClosed = resolveRestaurantAvailability(
  { openingHours: dailyWindow, acceptingOrdersMode: 'SCHEDULED', draft: true },
  {},
  new Date('2026-07-11T04:00:00.000Z'),
);
assert.equal(draftClosed.opensAt, null, 'utkast ska inte utlova en öppningstid');

// ── Kuponger som inte gäller på redan rabatterade varor ─────────────────────
// DiscountCode.excludeDiscountedItems → rabatten räknas på `discountableSubtotal`
// (raderna utan nedsatt baspris), aldrig på hela subtotalen. Servern är
// sanningen; kassan visar bara en förhandsvisning av samma tal.
const discountRouteSource = fs.readFileSync(path.join(__dirname, '../routes/discount.ts'), 'utf8');
assert.match(orderRouteSource, /let discountableSubtotal = 0;/);
assert.match(
  orderRouteSource,
  /discountableSubtotal \+= itemHasCatalogDiscount\s*\?\s*extrasTotal \* item\.quantity\s*:\s*itemSubtotal;/,
  'tillval är aldrig rabatterade och ska räknas med även på en rea-rad',
);
assert.match(
  orderRouteSource,
  /const codeBaseOre = \(code as any\)\.excludeDiscountedItems\s*\?\s*discountableSubtotal\s*:\s*subtotal;/,
);
assert.match(orderRouteSource, /manualFoodDiscountAmount = Math\.round\(codeBaseOre \* code\.value \/ 100\);/);
assert.match(orderRouteSource, /manualFoodDiscountAmount = Math\.min\(code\.value, codeBaseOre\);/);
// En kod som inte biter på något får aldrig hamna på ordern som "använd".
assert.match(
  orderRouteSource,
  /if \(manualFoodDiscountAmount > 0 \|\| manualDeliveryDiscountAmount > 0\) \{\s+validatedCode = code\.code;/,
);
// minOrder mäts fortfarande mot hela subtotalen — tröskeln gäller vad kunden
// handlar för, inte vad kupongen får bita på.
assert.match(orderRouteSource, /subtotal >= code\.minOrder/);
// Kassan nekas redan i validate när hela korgen är rabatterad.
assert.match(discountRouteSource, /Koden gäller bara varor som inte redan är rabatterade/);
assert.match(discountRouteSource, /discountAmountOre = Math\.round\(discountableOre \* discount\.value \/ 100\);/);
assert.match(discountRouteSource, /excludeDiscountedItems,/);

console.log('backend availability + money + placement contracts: ok');
