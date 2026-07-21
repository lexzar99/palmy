import { isStrongSuperAdminBootstrapPassword } from './superAdminBootstrap';
import { prelaunchModeEnabled } from './prelaunchAccess';
import { payoutRefundWindowHours } from './payoutPolicy';
import { validateFcmServiceAccount } from './fcmConfig';

export type LaunchIssueSeverity = 'error' | 'warning';

export type LaunchConfigIssue = {
  key: string;
  severity: LaunchIssueSeverity;
  message: string;
};

const present = (env: NodeJS.ProcessEnv, name: string): boolean =>
  Boolean(String(env[name] || '').trim());

const validHttpsUrl = (value: string | undefined): boolean => {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
};

export function getPublicApiBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const configured = String(env.API_PUBLIC_URL || env.PUBLIC_API_URL || '').trim();
  if (configured) return configured.replace(/\/$/, '');
  return env.NODE_ENV === 'production' ? 'https://api.viaeats.se' : '';
}

export function getLaunchConfigIssues(
  env: NodeJS.ProcessEnv = process.env,
): LaunchConfigIssue[] {
  const issues: LaunchConfigIssue[] = [];
  const add = (key: string, severity: LaunchIssueSeverity, message: string) => {
    issues.push({ key, severity, message });
  };
  const production = env.NODE_ENV === 'production';
  const prelaunchMode = String(env.PRELAUNCH_MODE || '').trim();

  if (production && prelaunchMode !== '0' && prelaunchMode !== '1') {
    add(
      'prelaunch_mode',
      'error',
      'PRELAUNCH_MODE måste vara explicit 1 (låst) eller 0 (offentlig) i produktion',
    );
  }
  if (production && !present(env, 'SUPER_ADMIN_EMAIL')) {
    add('super_admin_email', 'error', 'SUPER_ADMIN_EMAIL måste sättas explicit i produktion');
  }

  if (!present(env, 'DATABASE_URL')) add('database_url', 'error', 'DATABASE_URL saknas');
  if (!present(env, 'DIRECT_URL')) add('direct_url', 'warning', 'DIRECT_URL saknas för säkra migreringar');

  const provider = String(env.PAYMENT_PROVIDER || 'mollie').toLowerCase();
  if (!['mollie', 'stripe', 'adyen'].includes(provider)) {
    add('payment_provider', 'error', `Okänd PAYMENT_PROVIDER: ${provider}`);
  } else if (production && provider !== 'mollie') {
    add(
      'payment_provider_launch',
      'error',
      'Mollie måste vara aktiv betalprovider vid produktionslaunch; Stripe och Adyen är endast legacy-stöd',
    );
  } else if (provider === 'mollie') {
    if (!present(env, 'MOLLIE_API_KEY')) {
      add('mollie_key', 'error', 'MOLLIE_API_KEY saknas');
    } else if (production && !String(env.MOLLIE_API_KEY).startsWith('live_')) {
      add('mollie_mode', 'error', 'Mollie använder inte en live-nyckel');
    }
  } else if (provider === 'stripe') {
    if (!present(env, 'STRIPE_SECRET_KEY')) add('stripe_key', 'error', 'STRIPE_SECRET_KEY saknas');
    if (!present(env, 'STRIPE_WEBHOOK_SECRET')) add('stripe_webhook', 'error', 'STRIPE_WEBHOOK_SECRET saknas');
    if (production && present(env, 'STRIPE_SECRET_KEY') && !String(env.STRIPE_SECRET_KEY).startsWith('sk_live_')) {
      add('stripe_mode', 'error', 'Stripe använder inte en live-nyckel');
    }
  } else if (provider === 'adyen') {
    for (const name of ['ADYEN_API_KEY', 'ADYEN_MERCHANT_ACCOUNT', 'ADYEN_HMAC_KEY']) {
      if (!present(env, name)) add(name.toLowerCase(), 'error', `${name} saknas`);
    }
    if (production && String(env.ADYEN_ENVIRONMENT || '').toLowerCase() !== 'live') {
      add('adyen_mode', 'error', 'Adyen kör inte live-miljö');
    }
  }

  const publicApi = getPublicApiBaseUrl(env);
  if (!validHttpsUrl(publicApi)) {
    add('public_api_url', 'error', 'API_PUBLIC_URL/PUBLIC_API_URL måste vara en publik HTTPS-adress');
  } else if (!present(env, 'API_PUBLIC_URL') && production) {
    add('public_api_explicit', 'warning', 'API_PUBLIC_URL saknas; den säkra viaeats.se-fallbacken används');
  }
  if (!validHttpsUrl(env.FRONTEND_URL)) {
    add('frontend_url', 'warning', 'FRONTEND_URL saknas eller är inte HTTPS; cache-revalidation är avstängd');
  }

  if (!present(env, 'GOOGLE_MAPS_API_KEY') && !present(env, 'GOOGLE_MAPS_KEY')) {
    add('google_maps', 'error', 'Google Maps-servernyckel saknas; adressökning fungerar inte');
  }

  for (const name of [
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET',
    'R2_PUBLIC_BASE_URL',
  ]) {
    if (!present(env, name)) add(`r2_${name.toLowerCase()}`, 'warning', `${name} saknas; bilduppladdning är avstängd`);
  }
  if (String(env.R2_PUBLIC_BASE_URL || '').includes('.r2.dev')) {
    add(
      'r2_test_domain',
      'warning',
      'R2_PUBLIC_BASE_URL använder r2.dev som kan strypas; anslut en egen Cloudflare-domän före publik trafik',
    );
  }

  if (!present(env, 'SUPABASE_URL') || !present(env, 'SUPABASE_SERVICE_ROLE_KEY') || !present(env, 'SUPABASE_ANON_KEY')) {
    add('supabase_auth', 'error', 'Supabase URL/service-role/anon-konfiguration är ofullständig');
  }

  const fcm = validateFcmServiceAccount(env);
  if (fcm.ok === false) {
    add('fcm', 'error', `${fcm.error}; Android/restaurangpush fungerar inte`);
  }
  if (!present(env, 'PUSH_TOKEN_ENCRYPTION_KEY') || String(env.PUSH_TOKEN_ENCRYPTION_KEY || '').trim().length < 32) {
    add('push_token_encryption', 'error', 'PUSH_TOKEN_ENCRYPTION_KEY måste vara en separat slumpad hemlighet på minst 32 tecken');
  }

  const apnsNames = ['APNS_KEY_ID', 'APNS_TEAM_ID', 'APNS_BUNDLE_ID', 'APNS_KEY_P8'];
  if (apnsNames.some((name) => !present(env, name))) {
    add('apns', 'error', 'APNs-konfigurationen är ofullständig; iOS-push fungerar inte');
  } else if (production && env.APNS_PRODUCTION !== '1') {
    add('apns_environment', 'error', 'APNs kör sandbox i produktion');
  }

  if (
    production &&
    present(env, 'SUPER_ADMIN_PASSWORD') &&
    !isStrongSuperAdminBootstrapPassword(env.SUPER_ADMIN_PASSWORD)
  ) {
    add(
      'super_admin_password',
      'warning',
      'SUPER_ADMIN_PASSWORD är svagt. Det ignoreras för befintligt konto och blockerar skapande av ett saknat produktionskonto',
    );
  }
  if (
    production &&
    present(env, 'SUPER_ADMIN_PASSWORD_FORCE') &&
    !isStrongSuperAdminBootstrapPassword(env.SUPER_ADMIN_PASSWORD_FORCE)
  ) {
    add(
      'super_admin_force_password',
      'error',
      'SUPER_ADMIN_PASSWORD_FORCE är svagt och produktionsstart kommer att blockeras',
    );
  }
  if (!present(env, 'SENTRY_DSN')) add('sentry', 'warning', 'SENTRY_DSN saknas; felövervakning är avstängd');
  if (!present(env, 'REDIS_URL')) {
    add('redis', 'warning', 'REDIS_URL saknas; kör exakt en API-replika eller Socket.IO kan tappa events');
  }
  if (!present(env, 'PAYOUT_REFUND_WINDOW_HOURS')) {
    add('payout_refund_window', 'warning', 'PAYOUT_REFUND_WINDOW_HOURS saknas; säkert standardvärde 72 timmar används');
  } else {
    try {
      payoutRefundWindowHours(env);
    } catch (error) {
      add('payout_refund_window', 'error', (error as Error).message);
    }
  }
  if (!present(env, 'REVALIDATE_SECRET')) {
    add('revalidate', 'warning', 'REVALIDATE_SECRET saknas; webbens cache kan uppdateras fördröjt');
  }
  if (prelaunchModeEnabled(env) && !present(env, 'LAUNCH_ACCESS_COOKIE_SECRET')) {
    add('prelaunch_secret', 'error', 'PRELAUNCH_MODE kräver LAUNCH_ACCESS_COOKIE_SECRET på API:t');
  }
  if (!present(env, 'VAPID_PUBLIC_KEY') || !present(env, 'VAPID_PRIVATE_KEY')) {
    add('customer_web_push', 'error', 'VAPID saknas; gästkunders orderspecifika webbpush fungerar inte');
  }

  return issues;
}

/**
 * Stoppa endast konfiguration som gör checkout farlig eller omöjlig. Övriga
 * launchkrav exponeras på /ready så Railway-liveness inte hamnar i restart-loop.
 */
export function assertRuntimeCriticalConfiguration(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const prelaunchMode = String(env.PRELAUNCH_MODE || '').trim();
  if (env.NODE_ENV === 'production' && prelaunchMode !== '0' && prelaunchMode !== '1') {
    throw new Error('PRELAUNCH_MODE måste vara explicit 1 eller 0 i produktion');
  }
  if (env.NODE_ENV === 'production' && !present(env, 'SUPER_ADMIN_EMAIL')) {
    throw new Error('SUPER_ADMIN_EMAIL måste sättas explicit i produktion');
  }

  const provider = String(env.PAYMENT_PROVIDER || 'mollie').toLowerCase();
  if (!['mollie', 'stripe', 'adyen'].includes(provider)) {
    throw new Error(`Okänd PAYMENT_PROVIDER: ${provider}`);
  }
  if (env.NODE_ENV === 'production' && provider !== 'mollie') {
    throw new Error('Mollie måste vara aktiv PAYMENT_PROVIDER i produktion');
  }
  const required =
    provider === 'mollie'
      ? ['MOLLIE_API_KEY']
      : provider === 'stripe'
        ? ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']
        : ['ADYEN_API_KEY', 'ADYEN_MERCHANT_ACCOUNT', 'ADYEN_HMAC_KEY'];
  const missing = required.filter((name) => !present(env, name));
  if (missing.length) {
    throw new Error(`Aktiv betalprovider saknar: ${missing.join(', ')}`);
  }

  if (env.NODE_ENV === 'production') {
    if (provider === 'mollie' && !String(env.MOLLIE_API_KEY).startsWith('live_')) {
      throw new Error('Mollie måste använda en live-nyckel i produktion');
    }
  }

  const publicApi = getPublicApiBaseUrl(env);
  if (env.NODE_ENV === 'production' && !validHttpsUrl(publicApi)) {
    throw new Error('Publik HTTPS-adress för betalwebhooks saknas');
  }
  if (prelaunchModeEnabled(env) && !present(env, 'LAUNCH_ACCESS_COOKIE_SECRET')) {
    throw new Error('PRELAUNCH_MODE kräver LAUNCH_ACCESS_COOKIE_SECRET');
  }
  payoutRefundWindowHours(env);
}
