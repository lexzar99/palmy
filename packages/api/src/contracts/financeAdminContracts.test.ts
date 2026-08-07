import assert from 'node:assert/strict';
import {
  resolveFinancePeriod,
  FinancePeriodError,
  isFinanceCalendarMonthPeriod,
  subscriptionAppliesToFinancePeriod,
} from '../lib/financePeriod';
import {
  parseFinancePercentage,
  parseFinancePriceOre,
} from '../lib/financeSettingsInput';
import { financeRevisionAmounts } from '../lib/financeRevision';
import { commissionOverrideFromAgreement } from '../lib/restaurantFinanceAgreement';

const springForward = resolveFinancePeriod('2026-03-29', '2026-03-29');
assert.equal(springForward.start.toISOString(), '2026-03-28T23:00:00.000Z');
assert.equal(springForward.end.toISOString(), '2026-03-29T21:59:59.999Z');
assert.equal(springForward.end.getTime() - springForward.start.getTime() + 1, 23 * 60 * 60 * 1_000);

const fallBack = resolveFinancePeriod('2026-10-25', '2026-10-25');
assert.equal(fallBack.start.toISOString(), '2026-10-24T22:00:00.000Z');
assert.equal(fallBack.end.toISOString(), '2026-10-25T22:59:59.999Z');
assert.equal(fallBack.end.getTime() - fallBack.start.getTime() + 1, 25 * 60 * 60 * 1_000);

const defaultStockholmMonth = resolveFinancePeriod(
  undefined,
  undefined,
  new Date('2026-08-31T22:30:00.000Z'),
);
assert.equal(defaultStockholmMonth.start.toISOString(), '2026-08-31T22:00:00.000Z');
assert.equal(defaultStockholmMonth.end.toISOString(), '2026-09-01T21:59:59.999Z');

assert.throws(
  () => resolveFinancePeriod('2026-02-30', '2026-03-01'),
  FinancePeriodError,
);
assert.throws(
  () => resolveFinancePeriod('2026-03-02', '2026-03-01'),
  FinancePeriodError,
);

const january = resolveFinancePeriod(
  '2026-01-01',
  '2026-01-31',
  new Date('2026-01-15T12:00:00.000Z'),
);
const march = resolveFinancePeriod(
  '2026-03-01',
  '2026-03-31',
  new Date('2026-03-15T12:00:00.000Z'),
);
const october = resolveFinancePeriod(
  '2026-10-01',
  '2026-10-31',
  new Date('2026-10-15T12:00:00.000Z'),
);
const partialMarch = resolveFinancePeriod(
  '2026-03-15',
  '2026-03-31',
  new Date('2026-03-15T12:00:00.000Z'),
);
assert.equal(isFinanceCalendarMonthPeriod(january.start, january.end), true);
assert.equal(isFinanceCalendarMonthPeriod(march.start, march.end), true, 'CET→CEST month is exact');
assert.equal(isFinanceCalendarMonthPeriod(october.start, october.end), true, 'CEST→CET month is exact');
assert.equal(isFinanceCalendarMonthPeriod(partialMarch.start, partialMarch.end), false);
assert.equal(
  subscriptionAppliesToFinancePeriod(new Date('2026-02-10T12:00:00.000Z'), null, january.start, january.end),
  false,
  'a historical month before restaurant creation has no subscription',
);
assert.equal(
  subscriptionAppliesToFinancePeriod(new Date('2026-03-20T12:00:00.000Z'), null, march.start, march.end),
  true,
  'the full restaurant start month has one full subscription',
);
assert.equal(
  subscriptionAppliesToFinancePeriod(new Date('2026-03-01T00:00:00.000Z'), null, partialMarch.start, partialMarch.end),
  false,
  'partial periods cannot create a second monthly subscription',
);

const may = resolveFinancePeriod(
  '2026-05-01',
  '2026-05-31',
  new Date('2026-05-15T12:00:00.000Z'),
);
const june = resolveFinancePeriod(
  '2026-06-01',
  '2026-06-30',
  new Date('2026-06-15T12:00:00.000Z'),
);
const archivedAt = new Date('2026-05-07T10:00:00.000Z');
assert.equal(
  subscriptionAppliesToFinancePeriod(new Date('2026-02-10T12:00:00.000Z'), archivedAt, may.start, may.end),
  true,
  'the full archive month carries one final full subscription',
);
assert.equal(
  subscriptionAppliesToFinancePeriod(new Date('2026-02-10T12:00:00.000Z'), archivedAt, june.start, june.end),
  false,
  'a month beginning after archivedAt has no subscription',
);

assert.equal(parseFinancePercentage(0, 'Provision'), 0);
assert.equal(parseFinancePercentage('0', 'Provision'), 0);
assert.equal(parseFinancePercentage('12.5', 'Provision'), 13);
assert.equal(parseFinancePriceOre(0, 'Pris'), 0);
assert.equal(parseFinancePriceOre('0', 'Pris'), 0);
assert.equal(parseFinancePriceOre('12.34', 'Pris'), 1_234);

assert.equal(
  commissionOverrideFromAgreement('CUSTOM', 0),
  0,
  'a commission-free restaurant must persist an explicit 0 override',
);
assert.equal(commissionOverrideFromAgreement('CUSTOM', 17), 17);
assert.equal(
  commissionOverrideFromAgreement('GLOBAL', 0),
  null,
  'only the explicit global mode may clear the restaurant override',
);
assert.throws(() => commissionOverrideFromAgreement('CUSTOM', null), TypeError);
assert.throws(() => commissionOverrideFromAgreement('CUSTOM', -1), TypeError);
assert.throws(() => commissionOverrideFromAgreement('CUSTOM', 12.5), TypeError);

for (const invalid of [null, '', '   ', false, true, {}, []]) {
  assert.throws(() => parseFinancePercentage(invalid, 'Provision'), TypeError);
  assert.throws(() => parseFinancePriceOre(invalid, 'Pris'), TypeError);
}

assert.deepEqual(financeRevisionAmounts({
  commissionAmount: 2_000,
  subscriptionAmount: 500,
  feeVatPctSnapshot: 25,
}), {
  commissionExVatOre: 2_000,
  subscriptionExVatOre: 500,
  viaEatsExVatOre: 2_500,
  vatOre: 625,
});

console.log('finance admin contracts: ok');
