import crypto from 'node:crypto';
import { isIP } from 'node:net';
import prisma from './prisma';

export const CUSTOMER_PUSH_PROVIDERS = ['FCM_FID', 'APNS', 'EXPO', 'WEB_PUSH'] as const;
export type CustomerPushProvider = (typeof CUSTOMER_PUSH_PROVIDERS)[number];
export const ORDER_DEVICE_SUBSCRIPTION_TTL_MS = 7 * 24 * 60 * 60_000;
export const MAX_ACTIVE_WEB_PUSH_DEVICES_PER_ORDER = 6;
export const MAX_ACTIVE_WEB_PUSH_DEVICES_PER_USER = 20;

const MAX_WEB_PUSH_ENDPOINT_BYTES = 2_048;
const MAX_WEB_PUSH_SUBSCRIPTION_BYTES = 4_096;
const WEB_PUSH_PROVIDER_HOSTS = [
  'fcm.googleapis.com',
  'android.googleapis.com',
  'updates.push.services.mozilla.com',
  'web.push.apple.com',
] as const;
const WEB_PUSH_PROVIDER_SUFFIXES = [
  '.push.services.mozilla.com',
  '.notify.windows.com',
] as const;

const TOKEN_VERSION = 'v1';

function encryptionKey(): Buffer {
  const material = String(
    process.env.PUSH_TOKEN_ENCRYPTION_KEY ||
    (process.env.NODE_ENV === 'production' ? '' : process.env.JWT_SECRET || 'viaeats-local-push-key-not-for-production'),
  ).trim();
  if (material.length < 32) {
    throw new Error('PUSH_TOKEN_ENCRYPTION_KEY saknas eller är kortare än 32 tecken');
  }
  return crypto.createHash('sha256').update(material, 'utf8').digest();
}

export function customerPushTokenHash(provider: CustomerPushProvider, rawToken: string): string {
  return crypto.createHash('sha256').update(`${provider}\0${rawToken}`, 'utf8').digest('hex');
}

export function opaqueInstallationId(provider: CustomerPushProvider, rawToken: string): string {
  const hash = customerPushTokenHash(provider, rawToken);
  return `legacy_${hash.slice(0, 40)}`;
}

export function encryptCustomerPushToken(rawToken: string): string {
  if (!rawToken) throw new Error('Push-token saknas');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(rawToken, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [TOKEN_VERSION, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function decryptCustomerPushToken(value: string): string {
  const [version, ivValue, tagValue, ciphertextValue] = String(value || '').split('.');
  if (version !== TOKEN_VERSION || !ivValue || !tagValue || !ciphertextValue) {
    throw new Error('Okänt format för krypterad push-token');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export type RegisterDeviceInput = {
  userId?: string | null;
  provider: CustomerPushProvider;
  rawToken: string;
  installationId?: string | null;
  platform?: string | null;
};

/**
 * PostgreSQL advisory locks are process-independent, so every API replica
 * serialises ownership changes for both aliases of one physical installation:
 * its stable provider/device id and its provider-scoped token hash.
 *
 * Sorting before hashing gives every caller the same lock order and prevents a
 * token-rotation request (old installation id + new token) from deadlocking a
 * concurrent account-transfer request (new installation id + old token).
 */
export function customerPushAdvisoryLockResources(
  provider: CustomerPushProvider,
  installationId: string,
  tokenHash?: string | null,
): string[] {
  return [
    `customer-push:installation:${provider}:${installationId}`,
    ...(tokenHash ? [`customer-push:token:${tokenHash}`] : []),
  ].sort();
}

function advisoryLockPair(resource: string): [number, number] {
  const digest = crypto.createHash('sha256').update(resource, 'utf8').digest();
  return [digest.readInt32BE(0), digest.readInt32BE(4)];
}

export async function lockCustomerPushAdvisoryResources(
  tx: any,
  resources: readonly string[],
): Promise<void> {
  for (const resource of [...new Set(resources)].sort()) {
    const [classId, objectId] = advisoryLockPair(resource);
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(${classId}, ${objectId})`;
  }
}

async function lockDeviceRegistration(
  tx: any,
  provider: CustomerPushProvider,
  installationId: string,
  tokenHash: string,
): Promise<void> {
  await lockCustomerPushAdvisoryResources(
    tx,
    customerPushAdvisoryLockResources(provider, installationId, tokenHash),
  );
}

export type BrowserPushSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

function base64UrlBytes(value: unknown, label: string, maxCharacters: number): Buffer {
  const encoded = String(value || '').trim();
  if (!encoded || encoded.length > maxCharacters || !/^[A-Za-z0-9_-]+={0,2}$/.test(encoded)) {
    throw new Error(`Ogiltig ${label} i push-subscription`);
  }
  const unpadded = encoded.replace(/=+$/, '');
  if (unpadded.length % 4 === 1) throw new Error(`Ogiltig ${label} i push-subscription`);
  const decoded = Buffer.from(unpadded, 'base64url');
  if (!decoded.length || decoded.toString('base64url') !== unpadded) {
    throw new Error(`Ogiltig ${label} i push-subscription`);
  }
  return decoded;
}

function allowedWebPushHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, '');
  return WEB_PUSH_PROVIDER_HOSTS.includes(normalized as (typeof WEB_PUSH_PROVIDER_HOSTS)[number]) ||
    WEB_PUSH_PROVIDER_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

/**
 * A PushSubscription is also an outbound network destination. Only the browser
 * vendors' real HTTPS push services are accepted, so this endpoint can never be
 * turned into an SSRF proxy for private/internal hosts.
 */
export function validateBrowserPushSubscription(value: unknown): BrowserPushSubscription {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Ogiltig push-subscription');
  }
  let rawSize = MAX_WEB_PUSH_SUBSCRIPTION_BYTES + 1;
  try {
    rawSize = Buffer.byteLength(JSON.stringify(value), 'utf8');
  } catch {
    throw new Error('Ogiltig push-subscription');
  }
  if (rawSize > MAX_WEB_PUSH_SUBSCRIPTION_BYTES) {
    throw new Error('Push-subscription är för stor');
  }
  const candidate = value as Record<string, unknown>;
  const endpoint = String(candidate.endpoint || '').trim();
  if (!endpoint || Buffer.byteLength(endpoint, 'utf8') > MAX_WEB_PUSH_ENDPOINT_BYTES) {
    throw new Error('Ogiltig endpoint i push-subscription');
  }

  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new Error('Ogiltig endpoint i push-subscription');
  }
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (
    parsed.protocol !== 'https:' ||
    Boolean(parsed.username || parsed.password || parsed.hash) ||
    (parsed.port && parsed.port !== '443') ||
    !hostname ||
    isIP(hostname) !== 0 ||
    hostname === 'localhost' ||
    !allowedWebPushHostname(hostname)
  ) {
    throw new Error('Push-endpointens provider är inte tillåten');
  }

  const keys = candidate.keys;
  if (!keys || typeof keys !== 'object' || Array.isArray(keys)) {
    throw new Error('Ogiltiga nycklar i push-subscription');
  }
  const keyRecord = keys as Record<string, unknown>;
  const p256dh = String(keyRecord.p256dh || '').trim().replace(/=+$/, '');
  const auth = String(keyRecord.auth || '').trim().replace(/=+$/, '');
  const p256dhBytes = base64UrlBytes(keyRecord.p256dh, 'p256dh', 128);
  const authBytes = base64UrlBytes(keyRecord.auth, 'auth', 64);
  if (p256dhBytes.length !== 65 || p256dhBytes[0] !== 0x04) {
    throw new Error('Ogiltig p256dh-nyckel i push-subscription');
  }
  try {
    crypto.ECDH.convertKey(p256dhBytes, 'prime256v1', undefined, undefined, 'uncompressed');
  } catch {
    throw new Error('Ogiltig p256dh-nyckel i push-subscription');
  }
  if (authBytes.length !== 16) {
    throw new Error('Ogiltig auth-nyckel i push-subscription');
  }

  const subscription = { endpoint: parsed.toString(), keys: { p256dh, auth } };
  if (Buffer.byteLength(JSON.stringify(subscription), 'utf8') > MAX_WEB_PUSH_SUBSCRIPTION_BYTES) {
    throw new Error('Push-subscription är för stor');
  }
  return subscription;
}

function serializedBrowserPushSubscription(value: unknown): {
  subscription: BrowserPushSubscription;
  rawToken: string;
  installationId: string;
  tokenHash: string;
} {
  const subscription = validateBrowserPushSubscription(value);
  const rawToken = JSON.stringify(subscription);
  const installationId = `web_${crypto.createHash('sha256').update(subscription.endpoint).digest('hex').slice(0, 40)}`;
  const tokenHash = customerPushTokenHash('WEB_PUSH', rawToken);
  return { subscription, rawToken, installationId, tokenHash };
}

/**
 * Upsertar exakt en installation utan att skriva över användarens andra
 * enheter. Om samma provider-token har flyttats till ett annat konto eller
 * roterat till ett nytt device-id återkallas den gamla ägaren atomiskt.
 */
export async function registerDeviceInstallation(
  input: RegisterDeviceInput,
  conflictRetry = false,
  client: any = prisma,
) {
  const rawToken = String(input.rawToken || '').trim();
  if (!rawToken) throw new Error('Push-token saknas');
  const provider = input.provider;
  const installationId = String(input.installationId || opaqueInstallationId(provider, rawToken)).trim();
  if (!installationId || installationId.length > 256 || /\s/.test(installationId)) {
    throw new Error('Ogiltigt installationId');
  }
  const tokenHash = customerPushTokenHash(provider, rawToken);
  const tokenCiphertext = encryptCustomerPushToken(rawToken);
  const now = new Date();
  const register = async (tx: any) => {
    // Migration bridge: om samma gamla token fortfarande ligger på ett
    // annat User-konto får den inte återimporteras och "stjäla tillbaka"
    // installationen efter en konto-/enhetsväxling.
    if (provider === 'APNS') {
      await tx.user.updateMany({
        where: {
          apnsDeviceToken: rawToken,
          ...(input.userId ? { id: { not: input.userId } } : {}),
        },
        data: { apnsDeviceToken: null },
      });
    } else if (provider !== 'WEB_PUSH') {
      await tx.user.updateMany({
        where: {
          pushToken: rawToken,
          ...(input.userId ? { id: { not: input.userId } } : {}),
        },
        data: { pushToken: null },
      });
    }

    // This must happen before either device lookup. Without a database-wide
    // lock, two API replicas can both read the old owner and the last update can
    // retain the first transaction's newly-created order subscription.
    await lockDeviceRegistration(tx, provider, installationId, tokenHash);

    const [byKey, byToken] = await Promise.all([
      tx.deviceInstallation.findUnique({
        where: { provider_installationId: { provider, installationId } },
      }),
      tx.deviceInstallation.findUnique({ where: { tokenHash } }),
    ]);

    // Tokenen kan bara vara aktiv på en installation. Behåll historiken men
    // ta bort det sändbara hemliga värdet från den gamla raden.
    if (byToken && byKey && byToken.id !== byKey.id) {
      await tx.deviceInstallation.update({
        where: { id: byToken.id },
        data: {
          active: false,
          revokedAt: now,
          revokedReason: 'token_transferred',
          tokenHash: null,
          tokenCiphertext: null,
        },
      });
    }

    const target = byKey || byToken;
    if (target) {
      const nextUserId = input.userId === undefined ? target.userId : input.userId;
      if (target.userId !== nextUserId) {
        // A device changing account/guest ownership must not retain order
        // subscriptions from the previous owner. A nullable->nullable guest
        // refresh keeps its other active guest orders on the same device.
        await tx.deviceOrderSubscription.updateMany({
          where: { deviceInstallationId: target.id, revokedAt: null },
          data: { revokedAt: now },
        });
      }
      return tx.deviceInstallation.update({
        where: { id: target.id },
        data: {
          userId: nextUserId,
          provider,
          installationId,
          platform: input.platform || null,
          tokenHash,
          tokenCiphertext,
          active: true,
          revokedAt: null,
          revokedReason: null,
          lastSeenAt: now,
          consecutiveFailures: 0,
        },
      });
    }

    return tx.deviceInstallation.create({
      data: {
        userId: input.userId || null,
        provider,
        installationId,
        platform: input.platform || null,
        tokenHash,
        tokenCiphertext,
        active: true,
        lastSeenAt: now,
      },
    });
  };

  try {
    const ownsTransaction = typeof client.$transaction === 'function';
    return ownsTransaction
      ? await client.$transaction((tx: any) => register(tx))
      : await register(client);
  } catch (error: any) {
    // Två samtidiga registrationer kan båda läsa "saknas" innan det
    // unika indexet avgör vinnaren. Läs om en gång och konvergera till samma rad.
    if (!conflictRetry && error?.code === 'P2002' && typeof client.$transaction === 'function') {
      return registerDeviceInstallation(input, true, client);
    }
    throw error;
  }
}

export async function revokeDeviceInstallation(input: {
  userId: string;
  installationId?: string | null;
  provider?: CustomerPushProvider | null;
  allDevices?: boolean;
  reason?: string;
}): Promise<number> {
  const where = input.allDevices
    ? { userId: input.userId, active: true }
    : {
        userId: input.userId,
        active: true,
        installationId: String(input.installationId || ''),
        ...(input.provider ? { provider: input.provider } : {}),
      };
  if (!input.allDevices && !input.installationId) return 0;
  return prisma.$transaction(async (tx) => {
    const candidates = await tx.deviceInstallation.findMany({
      where,
      select: {
        id: true,
        provider: true,
        installationId: true,
        tokenHash: true,
      },
    });
    if (candidates.length === 0) return 0;
    await lockCustomerPushAdvisoryResources(
      tx,
      candidates.flatMap((device) => customerPushAdvisoryLockResources(
        device.provider as CustomerPushProvider,
        device.installationId,
        device.tokenHash,
      )),
    );
    const result = await tx.deviceInstallation.updateMany({
      where: { ...where, id: { in: candidates.map((device) => device.id) } },
      data: {
        active: false,
        revokedAt: new Date(),
        revokedReason: input.reason || 'logout',
        tokenHash: null,
        tokenCiphertext: null,
      },
    });
    return result.count;
  });
}

export async function revokeInvalidDeviceInstallation(id: string, reason: string): Promise<void> {
  await prisma.deviceInstallation.updateMany({
    where: { id, active: true },
    data: {
      active: false,
      revokedAt: new Date(),
      revokedReason: reason.slice(0, 120),
      tokenHash: null,
      tokenCiphertext: null,
      lastFailureAt: new Date(),
      consecutiveFailures: { increment: 1 },
    },
  });
}

/**
 * Dataminimering: orderspecifika gästinstallationer (alla providers) och
 * browserinstallationer får inte leva vidare efter sin sista aktiva order.
 * Kontoägda native-installationer finns kvar för konto-notiser; deras gamla
 * orderrelation matchas inte efter expiresAt.
 */
export async function revokeExpiredOrderScopedInstallations(now = new Date()): Promise<number> {
  const result = await prisma.deviceInstallation.updateMany({
    where: {
      active: true,
      lastSeenAt: { lt: new Date(now.getTime() - 10 * 60_000) },
      OR: [{ userId: null }, { provider: 'WEB_PUSH' }],
      orderSubscriptions: {
        none: { revokedAt: null, expiresAt: { gt: now } },
      },
    },
    data: {
      active: false,
      revokedAt: now,
      revokedReason: 'order_subscriptions_expired',
      tokenHash: null,
      tokenCiphertext: null,
    },
  });
  return result.count;
}

export async function upsertOrderDeviceSubscription(input: {
  deviceInstallationId: string;
  orderId: string;
  now?: Date;
}, client: any = prisma): Promise<void> {
  const now = input.now || new Date();
  await client.deviceOrderSubscription.upsert({
    where: {
      deviceInstallationId_orderId: {
        deviceInstallationId: input.deviceInstallationId,
        orderId: input.orderId,
      },
    },
    create: {
      deviceInstallationId: input.deviceInstallationId,
      orderId: input.orderId,
      expiresAt: new Date(now.getTime() + ORDER_DEVICE_SUBSCRIPTION_TTL_MS),
    },
    update: {
      expiresAt: new Date(now.getTime() + ORDER_DEVICE_SUBSCRIPTION_TTL_MS),
      revokedAt: null,
    },
  });
}

/**
 * One physical provider token cannot safely be both an account-wide device for
 * customer A and an order-scoped device for customer B. Matching owners retain
 * account scope; guest orders and a raw proof for another account deliberately
 * become nullable-user, exact-order installations.
 */
export function orderScopedInstallationUserId(
  orderUserId: string | null,
  requestedUserId: string | null | undefined,
): string | null {
  return orderUserId && requestedUserId === orderUserId ? orderUserId : null;
}

/**
 * Native order registration used to commit the device owner first and add the
 * exact order relation in a second transaction. A concurrent account switch
 * could therefore leave a newly transferred device with another customer's
 * relation. Keep owner transfer, previous-relation revocation and the new
 * relation in one advisory-lock-serialised transaction.
 */
export async function registerOrderDeviceInstallation(
  input: RegisterDeviceInput & { orderId: string },
) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string; userId: string | null }>>`
      SELECT "id", "userId" FROM "Order" WHERE "id" = ${input.orderId} FOR UPDATE
    `;
    const order = rows[0];
    if (!order) throw new Error('Ordern hittades inte');

    const device = await registerDeviceInstallation({
      userId: orderScopedInstallationUserId(order.userId, input.userId),
      provider: input.provider,
      rawToken: input.rawToken,
      installationId: input.installationId,
      platform: input.platform,
    }, false, tx);
    await upsertOrderDeviceSubscription({
      deviceInstallationId: device.id,
      orderId: order.id,
    }, tx);
    return device;
  });
}

/** Importerar gamla User-kolumner lazily så deployen inte tappar befintliga enheter. */
export async function importLegacyUserInstallations(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { pushToken: true, apnsDeviceToken: true },
  });
  if (!user) return;
  const registrations: Promise<unknown>[] = [];
  if (user.pushToken) {
    const provider: CustomerPushProvider = user.pushToken.startsWith('ExponentPushToken[') ? 'EXPO' : 'FCM_FID';
    registrations.push(registerDeviceInstallation({ userId, provider, rawToken: user.pushToken }));
  }
  if (user.apnsDeviceToken) {
    registrations.push(registerDeviceInstallation({ userId, provider: 'APNS', rawToken: user.apnsDeviceToken }));
  }
  await Promise.all(registrations);
  if (registrations.length > 0) {
    // Migreringen är verifierad ovan; ta därefter bort de gamla råa
    // klartextkolumnerna så bara AES-GCM-ciphertext + envägshash blir kvar.
    await prisma.user.updateMany({
      where: { id: userId },
      data: {
        ...(user.pushToken ? { pushToken: null } : {}),
        ...(user.apnsDeviceToken ? { apnsDeviceToken: null } : {}),
      },
    });
  }
}

export async function registerOrderWebPush(input: {
  orderId: string;
  subscription: BrowserPushSubscription;
}, conflictRetry = false): Promise<{ installationId: string }> {
  const { rawToken, installationId, tokenHash } = serializedBrowserPushSubscription(input.subscription);
  try {
    return await prisma.$transaction(async (tx) => {
      // Serialise registrations for the same order. Account devices also lock
      // their owner below, making both caps deterministic across API replicas.
      const rows = await tx.$queryRaw<Array<{ id: string; userId: string | null }>>`
        SELECT "id", "userId" FROM "Order" WHERE "id" = ${input.orderId} FOR UPDATE
      `;
      const order = rows[0];
      if (!order) throw new Error('Ordern hittades inte');
      if (order.userId) {
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${order.userId} FOR UPDATE`;
      }

      // Order/User locks protect the caps. This installation/token lock protects
      // ownership and all of its order relations across different users/orders.
      await lockDeviceRegistration(tx, 'WEB_PUSH', installationId, tokenHash);

      const existing = await tx.deviceInstallation.findUnique({
        where: { provider_installationId: { provider: 'WEB_PUSH', installationId } },
        select: { id: true },
      });
      const now = new Date();
      const [activeForOrder, activeForUser] = await Promise.all([
        tx.deviceOrderSubscription.count({
          where: {
            orderId: input.orderId,
            revokedAt: null,
            expiresAt: { gt: now },
            deviceInstallation: {
              active: true,
              provider: 'WEB_PUSH',
              ...(existing ? { id: { not: existing.id } } : {}),
            },
          },
        }),
        order.userId
          ? tx.deviceInstallation.count({
              where: {
                userId: order.userId,
                provider: 'WEB_PUSH',
                active: true,
                ...(existing ? { id: { not: existing.id } } : {}),
              },
            })
          : Promise.resolve(0),
      ]);
      if (activeForOrder >= MAX_ACTIVE_WEB_PUSH_DEVICES_PER_ORDER) {
        throw new Error('Ordern har redan maximalt antal aktiva push-enheter');
      }
      if (activeForUser >= MAX_ACTIVE_WEB_PUSH_DEVICES_PER_USER) {
        throw new Error('Kontot har redan maximalt antal aktiva web push-enheter');
      }

      const device = await registerDeviceInstallation({
        userId: order.userId,
        provider: 'WEB_PUSH',
        rawToken,
        installationId,
        platform: 'web',
      }, false, tx);
      await upsertOrderDeviceSubscription({
        deviceInstallationId: device.id,
        orderId: input.orderId,
        now,
      }, tx);
      return { installationId };
    });
  } catch (error: any) {
    if (!conflictRetry && error?.code === 'P2002') {
      return registerOrderWebPush(input, true);
    }
    throw error;
  }
}

/** Possession of the complete browser subscription revokes exactly that row. */
export async function revokeOrderWebPushSubscription(value: unknown, client: any = prisma): Promise<boolean> {
  const { installationId, tokenHash } = serializedBrowserPushSubscription(value);
  return client.$transaction(async (tx: any) => {
    await lockDeviceRegistration(tx, 'WEB_PUSH', installationId, tokenHash);
    const device = await tx.deviceInstallation.findFirst({
      where: { provider: 'WEB_PUSH', installationId, tokenHash },
      select: { id: true },
    });
    if (!device) return false;
    const now = new Date();
    const revoked = await tx.deviceInstallation.updateMany({
      where: { id: device.id, provider: 'WEB_PUSH', tokenHash },
      data: {
        active: false,
        revokedAt: now,
        revokedReason: 'browser_unsubscribe',
        tokenHash: null,
        tokenCiphertext: null,
      },
    });
    if (revoked.count !== 1) return false;
    await tx.deviceOrderSubscription.updateMany({
      where: { deviceInstallationId: device.id, revokedAt: null },
      data: { revokedAt: now },
    });
    return true;
  });
}
