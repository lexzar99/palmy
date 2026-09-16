import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const ts = createRequire(import.meta.url)('typescript');
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../lib/menuDealCategory.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module, exports: module.exports, Set });
const { menuWithDeals } = module.exports;
test('Deals först, samma produkter och priser, inga dubbla rätter', () => {
  const sale = { id: 'pizza', name: 'Pizza', price: 115, discountPrice: 79 };
  const regular = { id: 'drink', name: 'Dryck', price: 25 };
  const source = [{ id: 'old', name: 'Deals', products: [sale, regular] }, { id: 'other', name: 'Pizza', products: [sale] }];
  const result = menuWithDeals(source, false);
  assert.equal(result[0].name, 'Deals');
  assert.equal(result[0].products[0], sale);
  assert.equal(result.flatMap(c => c.products).filter(p => p.id === 'pizza').length, 1);
  assert.equal(result[1].name, 'Favoriter');
  assert.equal(source[0].products.length, 2);
});
test('embed döljer kampanjkategorin utan att ändra ordinarie kategorier eller priser', () => {
  const ordinary = { id: 'pizza', name: 'Pizzor', products: [{ id: 'b', price: 115 }] };
  const source = [{ id: 'old', name: 'Deals', products: [{ id: 'a', price: 115 }] }, ordinary];
  const result = menuWithDeals(source, true);
  assert.equal(result.length, 1);
  assert.equal(result[0], ordinary);
  assert.equal(source.length, 2);
});
