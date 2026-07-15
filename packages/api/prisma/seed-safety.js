'use strict';

const DESTRUCTIVE_SEED_CONFIRMATION = 'I_UNDERSTAND_THIS_DELETES_DATA';
const MIN_ADMIN_PASSWORD_LENGTH = 16;
const MAX_BCRYPT_PASSWORD_BYTES = 72;

function normalizedEnvironment(value) {
  return String(value || '').trim().toLowerCase();
}

function isProductionEnvironment(env = process.env) {
  return [
    env.NODE_ENV,
    env.APP_ENV,
    env.ENVIRONMENT,
    env.VERCEL_ENV,
    env.RAILWAY_ENVIRONMENT_NAME,
  ].some((value) => ['prod', 'production'].includes(normalizedEnvironment(value)));
}

function assertDestructiveSeedAllowed(env = process.env) {
  if (isProductionEnvironment(env)) {
    throw new Error('Destructive seed scripts are permanently disabled in production environments.');
  }

  if (env.VIAEATS_ALLOW_DESTRUCTIVE_SEED !== DESTRUCTIVE_SEED_CONFIRMATION) {
    throw new Error(
      `Refusing destructive seed. Set VIAEATS_ALLOW_DESTRUCTIVE_SEED=${DESTRUCTIVE_SEED_CONFIRMATION} only for an intentional non-production reset.`,
    );
  }
}

function isStrongSeedPassword(password, email) {
  if (typeof password !== 'string') return false;

  const byteLength = Buffer.byteLength(password, 'utf8');
  if (password.length < MIN_ADMIN_PASSWORD_LENGTH || byteLength > MAX_BCRYPT_PASSWORD_BYTES) {
    return false;
  }

  const normalized = password.trim().toLowerCase();
  if (normalized.length !== password.length || new Set(password).size < 6) return false;
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^a-zA-Z\d]/.test(password)) {
    return false;
  }
  if (/(admin123|password|changeme|qwerty|viaeats)/i.test(password)) return false;

  const emailLocalPart = String(email || '').split('@')[0].trim().toLowerCase();
  return emailLocalPart.length < 4 || !normalized.includes(emailLocalPart);
}

function getRequiredSeedAdminCredentials(env = process.env) {
  const email = String(env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = env.SUPER_ADMIN_PASSWORD;
  const name = String(env.SUPER_ADMIN_NAME || '').trim() || 'Seeded Super Admin';

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('SUPER_ADMIN_EMAIL must be set to a valid, explicit email address for this seed.');
  }
  if (!isStrongSeedPassword(password, email)) {
    throw new Error(
      'SUPER_ADMIN_PASSWORD must be explicit, 16-72 bytes, contain upper/lower-case letters, a number and a symbol, and must not be a known default.',
    );
  }

  return { email, password, name };
}

module.exports = {
  DESTRUCTIVE_SEED_CONFIRMATION,
  assertDestructiveSeedAllowed,
  getRequiredSeedAdminCredentials,
  isProductionEnvironment,
  isStrongSeedPassword,
};
