import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  assertRuntimeCriticalConfiguration,
  getLaunchConfigIssues,
  getPublicApiBaseUrl,
} from '../lib/launchReadiness';

const { privateKey: fcmPrivateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2_048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const validFcmServiceAccount = JSON.stringify({
  type: 'service_account',
  project_id: 'viaeats-prod',
  client_email: 'firebase-adminsdk@viaeats-prod.iam.gserviceaccount.com',
  private_key: fcmPrivateKey,
});

const healthy: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  PRELAUNCH_MODE: '0',
  DATABASE_URL: 'postgresql://db',
  DIRECT_URL: 'postgresql://db-direct',
  PAYMENT_PROVIDER: 'mollie',
  MOLLIE_API_KEY: 'live_example',
  MOLLIE_REPORTING_ACCESS_TOKEN: 'org_reporting_example',
  MOLLIE_PROFILE_ID: 'pfl_viaeats',
  API_PUBLIC_URL: 'https://api.viaeats.se',
  FRONTEND_URL: 'https://viaeats.se',
  GOOGLE_MAPS_KEY: 'maps',
  R2_ACCOUNT_ID: 'a',
  R2_ACCESS_KEY_ID: 'a',
  R2_SECRET_ACCESS_KEY: 'a',
  R2_BUCKET: 'a',
  R2_PUBLIC_BASE_URL: 'https://images.viaeats.se',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  SUPABASE_ANON_KEY: 'anon',
  FCM_SERVICE_ACCOUNT_JSON: validFcmServiceAccount,
  PUSH_TOKEN_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef',
  APNS_KEY_ID: 'key',
  APNS_TEAM_ID: 'team',
  APNS_BUNDLE_ID: 'se.viaeats.swift',
  APNS_KEY_P8: 'pem',
  APNS_PRODUCTION: '1',
  SUPER_ADMIN_EMAIL: 'launch-admin',
  SUPER_ADMIN_PASSWORD: 'long-random-password',
  SENTRY_DSN: 'https://sentry',
  REDIS_URL: 'redis://redis',
  REVALIDATE_SECRET: 'secret',
  PAYOUT_REFUND_WINDOW_HOURS: '72',
  GMAIL_USER: 'launch@viaeats.se',
  GMAIL_APP_PASSWORD: 'app-password',
  VAPID_PUBLIC_KEY: 'public',
  VAPID_PRIVATE_KEY: 'private',
};

assert.deepEqual(getLaunchConfigIssues(healthy), []);
assert.equal(getPublicApiBaseUrl({ NODE_ENV: 'production' }), 'https://api.viaeats.se');
assert.doesNotThrow(() => assertRuntimeCriticalConfiguration(healthy));

const r2TestDomain = { ...healthy, R2_PUBLIC_BASE_URL: 'https://bucket.r2.dev' };
assert(getLaunchConfigIssues(r2TestDomain).some((issue) => issue.key === 'r2_test_domain'));

const missingPrelaunchMode = { ...healthy, PRELAUNCH_MODE: '' };
assert(getLaunchConfigIssues(missingPrelaunchMode).some((issue) => issue.key === 'prelaunch_mode'));
assert.throws(() => assertRuntimeCriticalConfiguration(missingPrelaunchMode), /PRELAUNCH_MODE/);

const invalidPrelaunchMode = { ...healthy, PRELAUNCH_MODE: 'maybe' };
assert(getLaunchConfigIssues(invalidPrelaunchMode).some((issue) => issue.key === 'prelaunch_mode'));
assert.throws(() => assertRuntimeCriticalConfiguration(invalidPrelaunchMode), /PRELAUNCH_MODE/);

const missingSuperAdminEmail = { ...healthy, SUPER_ADMIN_EMAIL: '' };
assert(getLaunchConfigIssues(missingSuperAdminEmail).some((issue) => issue.key === 'super_admin_email'));
assert.throws(() => assertRuntimeCriticalConfiguration(missingSuperAdminEmail), /SUPER_ADMIN_EMAIL/);

const prelaunchWithoutSharedSecret = { ...healthy, PRELAUNCH_MODE: '1' };
assert(getLaunchConfigIssues(prelaunchWithoutSharedSecret).some((issue) => issue.key === 'prelaunch_secret'));
assert.throws(() => assertRuntimeCriticalConfiguration(prelaunchWithoutSharedSecret), /LAUNCH_ACCESS_COOKIE_SECRET/);
assert.doesNotThrow(() => assertRuntimeCriticalConfiguration({
  ...prelaunchWithoutSharedSecret,
  LAUNCH_ACCESS_COOKIE_SECRET: 'shared-secret',
}));

const missingPayment = { ...healthy, MOLLIE_API_KEY: '' };
assert(getLaunchConfigIssues(missingPayment).some((issue) => issue.key === 'mollie_key' && issue.severity === 'error'));
assert.throws(() => assertRuntimeCriticalConfiguration(missingPayment), /MOLLIE_API_KEY/);

const missingMollieReportingToken = { ...healthy, MOLLIE_REPORTING_ACCESS_TOKEN: '' };
assert(getLaunchConfigIssues(missingMollieReportingToken).some(
  (issue) => issue.key === 'mollie_reporting_token' && issue.severity === 'error',
));
assert.throws(
  () => assertRuntimeCriticalConfiguration(missingMollieReportingToken),
  /MOLLIE_REPORTING_ACCESS_TOKEN/,
);

const missingMollieProfile = { ...healthy, MOLLIE_PROFILE_ID: '' };
assert(getLaunchConfigIssues(missingMollieProfile).some(
  (issue) => issue.key === 'mollie_profile_id' && issue.severity === 'error',
));
assert.throws(
  () => assertRuntimeCriticalConfiguration(missingMollieProfile),
  /MOLLIE_PROFILE_ID/,
);

const testMollieInProduction = { ...healthy, MOLLIE_API_KEY: 'test_example' };
assert(getLaunchConfigIssues(testMollieInProduction).some((issue) => issue.key === 'mollie_mode'));
assert.throws(
  () => assertRuntimeCriticalConfiguration(testMollieInProduction),
  /live-nyckel/,
);
assert.doesNotThrow(() => assertRuntimeCriticalConfiguration({
  ...testMollieInProduction,
  NODE_ENV: 'development',
  API_PUBLIC_URL: 'https://api-dev.viaeats.se',
}));

const sandboxApns = { ...healthy, APNS_PRODUCTION: '0' };
assert(getLaunchConfigIssues(sandboxApns).some((issue) => issue.key === 'apns_environment'));

const missingVapid = { ...healthy, VAPID_PRIVATE_KEY: '' };
assert(getLaunchConfigIssues(missingVapid).some(
  (issue) => issue.key === 'customer_web_push' && issue.severity === 'error',
));

const invalidFcmJson = { ...healthy, FCM_SERVICE_ACCOUNT_JSON: '{}' };
assert(getLaunchConfigIssues(invalidFcmJson).some(
  (issue) => issue.key === 'fcm' && issue.severity === 'error' && /service_account/.test(issue.message),
));
const mismatchedFcmProject = {
  ...healthy,
  FCM_PROJECT_ID: 'another-project',
};
assert(getLaunchConfigIssues(mismatchedFcmProject).some(
  (issue) => issue.key === 'fcm' && /matchar inte/.test(issue.message),
));
const fcmAlias = {
  ...healthy,
  FCM_SERVICE_ACCOUNT_JSON: '',
  GOOGLE_SERVICE_ACCOUNT: validFcmServiceAccount,
};
assert(!getLaunchConfigIssues(fcmAlias).some((issue) => issue.key === 'fcm'));

const weakAdmin = { ...healthy, SUPER_ADMIN_PASSWORD: 'short' };
assert(getLaunchConfigIssues(weakAdmin).some((issue) => issue.key === 'super_admin_password' && issue.severity === 'warning'));

const existingAdminNeedsNoBootstrapSecret = { ...healthy, SUPER_ADMIN_PASSWORD: '' };
assert(!getLaunchConfigIssues(existingAdminNeedsNoBootstrapSecret).some((issue) => issue.key === 'super_admin_password'));

const weakForcedAdminReset = { ...healthy, SUPER_ADMIN_PASSWORD_FORCE: 'short' };
assert(getLaunchConfigIssues(weakForcedAdminReset).some((issue) => issue.key === 'super_admin_force_password' && issue.severity === 'error'));

const invalidPayoutWindow = { ...healthy, PAYOUT_REFUND_WINDOW_HOURS: '0' };
assert(getLaunchConfigIssues(invalidPayoutWindow).some((issue) => issue.key === 'payout_refund_window' && issue.severity === 'error'));
assert.throws(() => assertRuntimeCriticalConfiguration(invalidPayoutWindow), /PAYOUT_REFUND_WINDOW_HOURS/);

assert.throws(
  () => assertRuntimeCriticalConfiguration({ ...healthy, PAYMENT_PROVIDER: 'unknown' }),
  /Okänd PAYMENT_PROVIDER/,
);

for (const legacyProvider of ['stripe', 'adyen']) {
  const legacyProduction = {
    ...healthy,
    PAYMENT_PROVIDER: legacyProvider,
    STRIPE_SECRET_KEY: 'sk_live_legacy',
    STRIPE_WEBHOOK_SECRET: 'whsec_legacy',
    ADYEN_API_KEY: 'legacy',
    ADYEN_MERCHANT_ACCOUNT: 'legacy',
    ADYEN_HMAC_KEY: 'legacy',
    ADYEN_ENVIRONMENT: 'live',
  };
  assert(
    getLaunchConfigIssues(legacyProduction).some(
      (issue) => issue.key === 'payment_provider_launch' && issue.severity === 'error',
    ),
  );
  assert.throws(
    () => assertRuntimeCriticalConfiguration(legacyProduction),
    /Mollie måste vara aktiv PAYMENT_PROVIDER/,
  );
  assert.doesNotThrow(() => assertRuntimeCriticalConfiguration({
    ...legacyProduction,
    NODE_ENV: 'development',
  }));
}

console.log('launch readiness contracts: ok');
