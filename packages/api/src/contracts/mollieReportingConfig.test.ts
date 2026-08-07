import assert from 'node:assert/strict';
import {
  getMollieFinanceReport,
  mollieFinanceReportCacheKey,
  molliePeriodPaymentsUrl,
  MOLLIE_REPORTING_REQUIRED_SCOPES,
} from '../lib/mollieFinance';

async function main() {
  assert.deepEqual(MOLLIE_REPORTING_REQUIRED_SCOPES, [
    'balances.read',
    'balance-reports.read',
    'payments.read',
    'settlements.read',
    'payouts.read',
  ]);

  const periodUrl = new URL(molliePeriodPaymentsUrl(' pfl_viaeats/test '));
  assert.equal(periodUrl.pathname, '/v2/payments');
  assert.equal(periodUrl.searchParams.get('limit'), '250');
  assert.equal(periodUrl.searchParams.get('sort'), 'desc');
  assert.equal(
    periodUrl.searchParams.get('profileId'),
    'pfl_viaeats/test',
    'organization-token payment listing always carries the selected profileId',
  );
  assert.throws(() => molliePeriodPaymentsUrl(''), /MOLLIE_PROFILE_ID_REQUIRED/);

  const from = new Date('2026-08-01T00:00:00.000Z');
  const to = new Date('2026-08-31T23:59:59.999Z');
  const cacheInput = {
    from,
    to,
    paymentIds: ['tr_b', 'tr_a', 'tr_a'],
    refundedPaymentIds: ['tr_b'],
    orderReferences: [{ id: 'order-a', orderNumber: 'VE-1', refunded: true }],
  } as const;
  const profileACacheKey = mollieFinanceReportCacheKey({
    ...cacheInput,
    profileId: 'pfl_a',
  });
  assert.equal(
    profileACacheKey,
    mollieFinanceReportCacheKey({
      ...cacheInput,
      profileId: 'pfl_a',
      paymentIds: ['tr_a', 'tr_b'],
    }),
    'equivalent payment sets share one deterministic report cache entry',
  );
  assert.notEqual(
    profileACacheKey,
    mollieFinanceReportCacheKey({ ...cacheInput, profileId: 'pfl_b' }),
    'reports from different Mollie profiles can never share a cache entry',
  );

  const missingToken = await getMollieFinanceReport({
    from,
    to,
    paymentIds: [],
    env: { MOLLIE_PROFILE_ID: 'pfl_a' },
  });
  assert.equal(
    missingToken.feeError,
    'MOLLIE_REPORTING_ACCESS_TOKEN saknas (kräver balances.read, balance-reports.read, payments.read, settlements.read, payouts.read)',
  );

  const missingProfile = await getMollieFinanceReport({
    from,
    to,
    paymentIds: [],
    env: { MOLLIE_REPORTING_ACCESS_TOKEN: 'org_token' },
  });
  assert.equal(
    missingProfile.feeError,
    'MOLLIE_PROFILE_ID saknas (krävs för payments.read med organisationstoken)',
  );

  console.log('Mollie reporting token, profile, error and cache contracts: ok');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
