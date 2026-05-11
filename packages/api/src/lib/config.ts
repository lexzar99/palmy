// Centralized configuration — single source of truth for secrets and settings
// This module will throw at startup if critical env vars are missing in production.

import crypto from 'crypto';

const isProduction = process.env.NODE_ENV === 'production';

function requireEnv(name: string, fallbackForDev?: string): string {
  const value = process.env[name];
  if (value) return value;
  if (!isProduction && fallbackForDev) {
    console.warn(`⚠️  ${name} not set — using dev fallback. Set this in production!`);
    return fallbackForDev;
  }
  throw new Error(`❌ Missing required environment variable: ${name}`);
}

// JWT_SECRET fallback i dev är ett RANDOM värde per process (inte en statisk
// gissningsbar default). Det betyder att alla tokens invalideras vid restart
// vilket är OK i dev — och om någon glömmer sätta variabeln i prod kastar
// requireEnv direkt eftersom isProduction stänger av fallback.
export const JWT_SECRET = requireEnv(
  'JWT_SECRET',
  `dev-${crypto.randomBytes(32).toString('hex')}`,
);

export const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'admin';
export const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || (isProduction ? '' : 'admin123');

// Säkerhetsflaggor som styr riskabla admin-funktioner. Läggs här så de syns
// centralt och inte gömda i routes-filer.
export const ALLOW_WIPE_ORDERS = process.env.ALLOW_WIPE_ORDERS === 'true';
// passwordPlain lagrar admin-lösen i klartext för Flutter-restaurang-appen.
// Default är AVSTÄNGT — måste explicit aktiveras med ENABLE_PASSWORD_PLAIN=true.
// I prod bör Flutter-auth byggas om med ett separat refresh-token-system.
export const ENABLE_PASSWORD_PLAIN = process.env.ENABLE_PASSWORD_PLAIN === 'true';

if (isProduction && ENABLE_PASSWORD_PLAIN) {
  console.warn(
    '⚠️  ENABLE_PASSWORD_PLAIN=true i produktion — admin-lösen lagras i klartext. Stäng av snarast och migrera Flutter-auth.',
  );
}
if (isProduction && ALLOW_WIPE_ORDERS) {
  console.warn(
    '⚠️  ALLOW_WIPE_ORDERS=true i produktion — wipe-endpoint är tillgänglig. Detta är ett test-only-feature.',
  );
}

export const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// Default origins for dev + production
export const DEFAULT_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'https://web-production-67f45.up.railway.app',
  'https://palmy-production-2021.up.railway.app',
  'https://admin-production-7b07.up.railway.app',
  'https://matgo-admin.up.railway.app',
  'https://palmyra-admin.up.railway.app',
  'https://palmyra-business.up.railway.app',
];

export const getAllowedOrigins = (): string[] => {
  return [...DEFAULT_ORIGINS, ...ALLOWED_ORIGINS];
};
