import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { resolveRestaurantAvailability } from '../lib/restaurantAvailability';
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

assert.equal(adminTokenVersionMatches(undefined, 0), true);
assert.equal(adminTokenVersionMatches(undefined, 1), false);
assert.equal(adminTokenVersionMatches(1, 1), true);
assert.equal(adminTokenVersionMatches(0, 1), false);

assert.equal(customerAuthMethod({ app_metadata: { provider: 'email' } }), null);
assert.equal(customerAuthMethod({ app_metadata: { provider: 'google' } }), 'google');
assert.equal(customerAuthMethod({ app_metadata: { provider: 'apple' } }), 'apple');
assert.equal(customerAuthMethod({ phone: '+46700000000', app_metadata: { provider: 'phone' } }), null);
assert.equal(customerAuthMethod({
  phone: '+46700000000',
  phone_confirmed_at: '2026-07-15T12:00:00.000Z',
  app_metadata: { provider: 'phone' },
}), 'phone');
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
assert.match(authRouteSource, /where: \{ oauthProvider: provider, oauthId: String\(providerId\) \}/);
assert.match(authRouteSource, /if \(!user && email && emailVerified\)/);
assert.match(authRouteSource, /Verifierad e-post krävs när ett nytt OAuth-konto skapas/);
assert.match(authRouteSource, /VERIFIED_PHONE_SESSION_REQUIRED/);
assert.match(authRouteSource, /select: \{ deletedAt: true, isActive: true \}/);
assert.match(authRouteSource, /user\.email && user\.email_confirmed_at/);
assert.match(authRouteSource, /name: \(name \|\| ''\)\.trim\(\),/);
assert.match(authRouteSource, /matchedByVerifiedEmail/);
assert.match(authRouteSource, /provider === 'apple' \|\| user\.oauthProvider !== 'apple'/);

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

// New production checkouts must use the pending-order -> Mollie flow. Legacy
// provider code may still reconcile/refund already-existing Stripe/Adyen rows.
const orderRouteSource = fs.readFileSync(path.join(__dirname, '../routes/orders.ts'), 'utf8');
const paymentProviderSource = fs.readFileSync(path.join(__dirname, '../lib/payments/index.ts'), 'utf8');
const paymentRouteSource = fs.readFileSync(path.join(__dirname, '../routes/paymentsMollie.ts'), 'utf8');
assert.match(orderRouteSource, /MOLLIE_CHECKOUT_REQUIRED/);
assert.match(paymentProviderSource, /Mollie måste vara aktiv PAYMENT_PROVIDER i produktion/);
assert.match(paymentRouteSource, /PAYMENT_PROVIDER_CONFLICT/);
assert.match(paymentRouteSource, /PAYMENT_BINDING_CHANGED/);
const finalizePaymentSource = fs.readFileSync(path.join(__dirname, '../lib/payments/finalize.ts'), 'utf8');
assert.match(finalizePaymentSource, /provider\/ref binding mismatch/);
assert.match(finalizePaymentSource, /order\.paymentProvider === input\.provider/);
assert.match(finalizePaymentSource, /order\.molliePaymentId === input\.ref/);
const retiredAdyenVerify = paymentRouteSource.match(
  /router\.post\('\/adyen\/verify',[\s\S]*?\n}\);/,
)?.[0] || '';
assert.match(retiredAdyenVerify, /status\(410\)/);
assert.match(retiredAdyenVerify, /LEGACY_PAYMENT_VERIFICATION_DISABLED/);
assert.doesNotMatch(retiredAdyenVerify, /finalizePaymentSuccess|getAdyenSessionResult/);

console.log('backend availability + money + placement contracts: ok');
