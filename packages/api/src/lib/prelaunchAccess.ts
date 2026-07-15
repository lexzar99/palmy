import { createHmac, timingSafeEqual } from 'node:crypto';

export const PRELAUNCH_ACCESS_HEADER = 'x-viaeats-launch-access';

export function prelaunchModeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const mode = String(env.PRELAUNCH_MODE || '').trim();
  if (mode === '1') return true;
  if (mode === '0') return false;
  if (mode) return true;
  return env.NODE_ENV === 'production';
}

export function expectedPrelaunchProof(env: NodeJS.ProcessEnv = process.env): string | null {
  const secret = String(env.LAUNCH_ACCESS_COOKIE_SECRET || '').trim();
  if (!secret) return null;
  return createHmac('sha256', secret).update('launch-unlocked').digest('hex');
}

export function validPrelaunchProof(
  candidate: unknown,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (typeof candidate !== 'string' || !candidate) return false;
  const expected = expectedPrelaunchProof(env);
  if (!expected) return false;
  const actualBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}
