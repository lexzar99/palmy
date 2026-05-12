import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import prisma from './prisma';

const COOKIE_NAME = 'admin_trusted';
const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 dagar

/**
 * Beskrivande etikett för en enhet baserat på User-Agent. Räcker för
 * att admin ska känna igen "Chrome på Mac" vs "Safari på iPad".
 */
function describeDevice(userAgent: string | undefined): string {
  const ua = userAgent || '';
  let browser = 'Okänd browser';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/Chrome\//i.test(ua)) browser = 'Chrome';
  else if (/Safari\//i.test(ua)) browser = 'Safari';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';

  let os = '';
  if (/Mac OS X|Macintosh/i.test(ua)) os = 'Mac';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Linux/i.test(ua)) os = 'Linux';
  else if (/iPhone/i.test(ua)) os = 'iPhone';
  else if (/iPad/i.test(ua)) os = 'iPad';
  else if (/Android/i.test(ua)) os = 'Android';

  return os ? `${browser} på ${os}` : browser;
}

/**
 * Skapar en ny trusted device. Returnerar token som ska sättas som cookie.
 * Token-hashen sparas i DB — själva tokenen lämnar systemet via cookien.
 */
export async function createTrustedDevice(
  adminId: string,
  req: Request,
): Promise<string> {
  // 32 bytes random → 64 hex chars. Med bcrypt-hash i DB är 32 bytes mer
  // än nog (motsvarar ~256-bitars entropi).
  const token = randomBytes(32).toString('hex');
  const tokenHash = await bcrypt.hash(token, 10);
  const userAgent = (req.headers['user-agent'] as string) || null;
  const ipAddress = (req.ip || req.headers['x-forwarded-for'] as string || null) as string | null;
  const expiresAt = new Date(Date.now() + COOKIE_MAX_AGE_MS);

  const device = await (prisma as any).trustedDevice.create({
    data: {
      adminId,
      tokenHash,
      deviceLabel: describeDevice(userAgent || undefined),
      ipAddress,
      userAgent,
      expiresAt,
    },
  });

  // Format: deviceId.token — så vi kan slå upp i DB med deviceId istället
  // för att brute-forca alla rader för denna admin.
  return `${device.id}.${token}`;
}

/** Sätter trusted-device-cookien på response. */
export function setTrustedDeviceCookie(res: Response, value: string): void {
  res.cookie(COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: COOKIE_MAX_AGE_MS,
    path: '/',
  });
}

/** Rensar trusted-device-cookien. */
export function clearTrustedDeviceCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

/**
 * Validerar att inkommande cookie matchar en aktiv (icke-revokerad,
 * icke-utgången) trusted device för given admin. Returnerar device-id
 * om matchande, annars null.
 *
 * Uppdaterar `lastSeenAt` vid matchning.
 */
export async function verifyTrustedDeviceCookie(
  req: Request,
  adminId: string,
): Promise<string | null> {
  const raw = (req as any).cookies?.[COOKIE_NAME] as string | undefined;
  if (!raw || !raw.includes('.')) return null;

  const [deviceId, token] = raw.split('.', 2);
  if (!deviceId || !token) return null;

  const device = await (prisma as any).trustedDevice.findUnique({
    where: { id: deviceId },
  });

  if (!device) return null;
  if (device.adminId !== adminId) return null;
  if (device.revokedAt) return null;
  if (device.expiresAt < new Date()) return null;

  const valid = await bcrypt.compare(token, device.tokenHash);
  if (!valid) return null;

  // Uppdatera lastSeenAt — fire-and-forget, blockerar inte login
  void (prisma as any).trustedDevice
    .update({
      where: { id: deviceId },
      data: { lastSeenAt: new Date() },
    })
    .catch(() => null);

  return deviceId;
}

/**
 * Hämtar alla aktiva (icke-revokerade) trusted devices för en admin.
 * Används av /2fa-sidan i admin för att visa enheter med revoke-knapp.
 */
export async function listTrustedDevices(adminId: string) {
  return (prisma as any).trustedDevice.findMany({
    where: {
      adminId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { lastSeenAt: 'desc' },
    select: {
      id: true,
      deviceLabel: true,
      ipAddress: true,
      createdAt: true,
      lastSeenAt: true,
      expiresAt: true,
    },
  });
}

/** Markerar en enhet som revokerad. */
export async function revokeTrustedDevice(adminId: string, deviceId: string) {
  await (prisma as any).trustedDevice.updateMany({
    where: { id: deviceId, adminId },
    data: { revokedAt: new Date() },
  });
}

/** Revokar ALLA trusted devices för en admin (säkerhetsåtgärd). */
export async function revokeAllTrustedDevices(adminId: string) {
  await (prisma as any).trustedDevice.updateMany({
    where: { adminId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
