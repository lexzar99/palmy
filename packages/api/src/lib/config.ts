// Centralized configuration — single source of truth for secrets and settings
// This module will throw at startup if critical env vars are missing in production.

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

export const JWT_SECRET = requireEnv('JWT_SECRET', 'dev-only-secret-change-me');

export const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'admin';
export const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || (isProduction ? '' : 'admin123');

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
];

export const getAllowedOrigins = (): string[] => {
  return [...DEFAULT_ORIGINS, ...ALLOWED_ORIGINS];
};
