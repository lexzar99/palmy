import crypto from 'node:crypto';

export type FcmServiceAccount = {
  type: 'service_account';
  client_email: string;
  private_key: string;
  project_id: string;
};

export type FcmServiceAccountValidation =
  | { ok: true; account: FcmServiceAccount; source: string }
  | { ok: false; account: null; source: string | null; error: string };

const FCM_SECRET_NAMES = [
  'FCM_SERVICE_ACCOUNT_JSON',
  'GOOGLE_SERVICE_ACCOUNT',
  'FIREBASE_SERVICE_ACCOUNT',
] as const;

function configuredSecret(env: NodeJS.ProcessEnv): { source: string | null; raw: string } {
  for (const name of FCM_SECRET_NAMES) {
    const raw = String(env[name] || '').trim();
    if (raw) return { source: name, raw };
  }
  return { source: null, raw: '' };
}

/** Parse and structurally validate the exact credentials used by FCM HTTP v1. */
export function validateFcmServiceAccount(
  env: NodeJS.ProcessEnv = process.env,
): FcmServiceAccountValidation {
  const configured = configuredSecret(env);
  if (!configured.raw) {
    return { ok: false, account: null, source: null, error: 'FCM service account saknas' };
  }

  let value: unknown;
  try {
    value = JSON.parse(configured.raw);
  } catch {
    return {
      ok: false,
      account: null,
      source: configured.source,
      error: `${configured.source} innehåller inte giltig JSON`,
    };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, account: null, source: configured.source, error: 'FCM service account måste vara ett JSON-objekt' };
  }

  const record = value as Record<string, unknown>;
  const type = String(record.type || '').trim();
  const projectId = String(record.project_id || '').trim();
  const clientEmail = String(record.client_email || '').trim().toLowerCase();
  const privateKey = String(record.private_key || '').replace(/\\n/g, '\n').trim();
  if (type !== 'service_account') {
    return { ok: false, account: null, source: configured.source, error: 'FCM JSON är inte ett service_account' };
  }
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)) {
    return { ok: false, account: null, source: configured.source, error: 'FCM service account har ogiltigt project_id' };
  }
  if (!clientEmail.endsWith(`@${projectId}.iam.gserviceaccount.com`)) {
    return { ok: false, account: null, source: configured.source, error: 'FCM client_email matchar inte project_id' };
  }

  try {
    const key = crypto.createPrivateKey(privateKey);
    const modulusLength = key.asymmetricKeyDetails?.modulusLength || 0;
    if (key.asymmetricKeyType !== 'rsa' || modulusLength < 2_048) {
      throw new Error('RSA-nyckeln är för svag');
    }
  } catch {
    return { ok: false, account: null, source: configured.source, error: 'FCM private_key är inte en giltig RSA-nyckel' };
  }

  const expectedProject = String(
    env.FCM_PROJECT_ID || env.FIREBASE_PROJECT_ID || '',
  ).trim();
  if (expectedProject && expectedProject !== projectId) {
    return { ok: false, account: null, source: configured.source, error: 'FCM project_id matchar inte serverns konfigurerade projekt' };
  }

  return {
    ok: true,
    source: configured.source!,
    account: {
      type: 'service_account',
      client_email: clientEmail,
      private_key: `${privateKey}\n`,
      project_id: projectId,
    },
  };
}
