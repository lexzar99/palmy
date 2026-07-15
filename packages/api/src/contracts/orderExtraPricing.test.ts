import assert from 'node:assert/strict';
import {
  assertNonnegativeCatalogLine,
  OrderExtraPricingError,
  resolveAuthoritativeExtraSelection,
} from '../lib/orderExtraPricing';

const group = { id: 'g1', name: 'Storlek', required: true, minSelections: 1 };
const childPizza = { id: 'e-child', name: 'Barnpizza', priceAddon: -2_000 };

const resolved = resolveAuthoritativeExtraSelection({
  productName: 'Pizza',
  group,
  extra: childPizza,
  selected: { extraName: 'FORGED', quantity: 1 },
});
assert.equal(resolved.priceAddon, -20);
assert.equal(resolved.extraName, 'Barnpizza');
assert.equal(resolved.groupName, 'Storlek');

assert.throws(
  () => resolveAuthoritativeExtraSelection({
    productName: 'Pizza',
    group: null,
    extra: null,
    selected: { extraName: 'Påhittat', quantity: 1 },
  }),
  OrderExtraPricingError,
);
assert.throws(
  () => resolveAuthoritativeExtraSelection({
    productName: 'Pizza',
    group,
    extra: null,
    selected: { extraName: 'Påhittat', quantity: 1 },
  }),
  /finns inte längre/,
);

assert.doesNotThrow(() => assertNonnegativeCatalogLine('Pizza', 10_000, -2_000));
assert.throws(() => assertNonnegativeCatalogLine('Pizza', 1_000, -2_000), /ogiltig tillvalskombination/);

console.log('Order extra pricing: authoritative catalog values and negative child-price modifiers OK');
