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

// Testordrar är dev-only. Order-rensning har ingen flagga längre: den är
// permanent blockerad i både API och databas.
export const ALLOW_TEST_ORDERS = !isProduction && process.env.ALLOW_TEST_ORDERS === 'true';

if (isProduction && process.env.ALLOW_TEST_ORDERS === 'true') {
  console.warn('⚠️  ALLOW_TEST_ORDERS ignoreras i produktion. Gratis testordrar är hårt avstängda.');
}

// Strikt allow-list. Stödjer både ALLOWED_ORIGINS (legacy) och
// CORS_ALLOWED_ORIGINS (nytt namn) som comma-separerad env-var.
export const ALLOWED_ORIGINS = [
  ...(process.env.ALLOWED_ORIGINS || '').split(','),
  ...(process.env.CORS_ALLOWED_ORIGINS || '').split(','),
]
  .map(s => s.trim())
  .filter(Boolean);

// Default origins for dev + production. Primära ViaEats-domäner plus kända
// deploy-domäner som behövs under drift.
export const DEV_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
];

export const DEFAULT_ORIGINS = [
  // Prod: primär brand-domän bakom Cloudflare och Vercel.
  // MÅSTE finnas här annars blockar CORS browser-anrop från storefront/admin
  // ("Kan inte nå servern" trots att API:t svarar).
  'https://viaeats.se',
  'https://www.viaeats.se',
  'https://office.viaeats.se',
  'https://courier.viaeats.se',
  'https://api.viaeats.se',
  // Känd äldre storefront-deploy. Övriga previews måste uttryckligen läggas i
  // CORS_ALLOWED_ORIGINS; vem som helst kan annars skapa en *.vercel.app-domän.
  'https://viaeats-web-pi.vercel.app',
];

export const getAllowedOrigins = (): string[] => {
  return [
    ...DEFAULT_ORIGINS,
    ...(isProduction ? [] : DEV_ORIGINS),
    ...ALLOWED_ORIGINS,
  ];
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

  if (!isProd) {
    if (/^https?:\/\/(localhost|192\.168\.\d+\.\d+|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return true;
    }
  }

  return false;
}
