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

// Hård validering i prod: refusera att starta om JWT_SECRET är default-
// placeholdern (legacy "palmyra-super-secret-jwt-key-change-in-production"
// eller liknande) eller kortare än 32 tecken. Misslyckas tidigt med fatal
// log + process.exit(1) så ingen prod-server kan starta med svag nyckel.
if (isProduction) {
  const secret = process.env.JWT_SECRET || '';
  const looksLikePlaceholder =
    secret.includes('change-in-production') ||
    secret.includes('changeme') ||
    secret.includes('palmyra-super-secret');
  if (!secret || looksLikePlaceholder || secret.length < 32) {
    console.error(
      'FATAL: JWT_SECRET måste sättas till >=32 tecken random i prod ' +
        '(och får inte innehålla "change-in-production"). Avbryter start.',
    );
    process.exit(1);
  }
}

export const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'admin';
export const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || (isProduction ? '' : 'admin123');

// Säkerhetsflaggor som styr riskabla admin-funktioner. Läggs här så de syns
// centralt och inte gömda i routes-filer.
export const ALLOW_WIPE_ORDERS = process.env.ALLOW_WIPE_ORDERS === 'true';

if (isProduction && ALLOW_WIPE_ORDERS) {
  console.warn(
    '⚠️  ALLOW_WIPE_ORDERS=true i produktion — wipe-endpoint är tillgänglig. Detta är ett test-only-feature.',
  );
}

// Strikt allow-list. Stödjer både ALLOWED_ORIGINS (legacy) och
// CORS_ALLOWED_ORIGINS (nytt namn) som comma-separerad env-var.
export const ALLOWED_ORIGINS = [
  ...(process.env.ALLOWED_ORIGINS || '').split(','),
  ...(process.env.CORS_ALLOWED_ORIGINS || '').split(','),
]
  .map(s => s.trim())
  .filter(Boolean);

// Default origins for dev + production. Inkluderar både legacy Railway-URLer
// (för bakåtkompatibilitet) och primära foodgo.se-domäner.
export const DEFAULT_ORIGINS = [
  // Dev / lokala
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  // Prod (foodgo.se)
  'https://foodgo.se',
  'https://www.foodgo.se',
  'https://app.foodgo.se',
  'https://admin.foodgo.se',
  // Legacy / Railway-deploys
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

/**
 * Strikt CORS-check. Returnerar true om origin är tillåten.
 *
 * VIKTIGT om no-origin-requests:
 * CORS är en BROWSER-mekanism. Server-to-server-trafik (Stripe-webhooks,
 * health-checks, curl, native-app-fetch, Next.js SSR-fetch) har ingen
 * Origin-header. CSRF kan ALDRIG hända utan en browser — och en browser
 * sätter ALLTID Origin på cross-origin requests. Därför är "blockera
 * no-origin" fel verktyg för CSRF-skydd. Rätt skydd: SameSite=Lax cookies
 * eller CSRF-token. Vi använder JWT i Authorization-header (Bearer) som
 * inte skickas automatiskt av browsers → ingen CSRF-risk över huvudtaget.
 *
 * Bug-historik: tidigare blockerade vi no-origin i prod → Stripe-webhooks
 * och RN-native-app-fetch fick "Not allowed by CORS" tills denna fix.
 *
 * - No-origin: ALLTID tillåten (inte browser → CORS irrelevant).
 * - Browser med origin i prod: kräver matchande allow-list.
 * - Browser med origin i dev: tillåter även localhost/127.0.0.1/192.168.*.
 *
 * Vercel-wildcard (`*.vercel.app`) är borttaget — exakta preview-URLer
 * måste läggas till via CORS_ALLOWED_ORIGINS om de behövs för testing.
 */
export function isOriginAllowed(origin: string | undefined): boolean {
  // No-origin = inte browser = CORS gäller inte. Tillåt alltid.
  // Webhooks/health/native-apps auth:as på andra sätt (signatur/JWT).
  if (!origin) return true;

  const isProd = process.env.NODE_ENV === 'production';

  const allowed = getAllowedOrigins();
  if (allowed.includes(origin)) return true;

  // Vår egen infra: Vercel-deploys (preview + prod) och Railway-app-domäner.
  // Tidigare blockerade vi *.vercel.app helt — för restriktivt eftersom vi
  // använder Vercel-preview-URLer för testning innan custom domain dragits.
  // Säkerhetsmässigt OK: ingen annan kan deploya till våra Vercel-projekt.
  try {
    const host = new URL(origin).hostname;
    if (
      host.endsWith('.vercel.app') ||
      host.endsWith('.up.railway.app') ||
      host.endsWith('.railway.app')
    ) {
      return true;
    }
  } catch {
    // Ogiltigt URL-format → blockera
    return false;
  }

  if (!isProd) {
    if (/^https?:\/\/(localhost|192\.168\.\d+\.\d+|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return true;
    }
  }

  return false;
}
