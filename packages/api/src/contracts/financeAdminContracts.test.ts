import assert from 'node:assert/strict';
import { resolveFinancePeriod, FinancePeriodError } from '../lib/financePeriod';
import {
  parseFinancePercentage,
  parseFinancePriceOre,
} from '../lib/financeSettingsInput';
import { financeRevisionAmounts } from '../lib/financeRevision';

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

assert.equal(parseFinancePercentage(0, 'Provision'), 0);
assert.equal(parseFinancePercentage('0', 'Provision'), 0);
assert.equal(parseFinancePercentage('12.5', 'Provision'), 13);
assert.equal(parseFinancePriceOre(0, 'Pris'), 0);
assert.equal(parseFinancePriceOre('0', 'Pris'), 0);
assert.equal(parseFinancePriceOre('12.34', 'Pris'), 1_234);

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
