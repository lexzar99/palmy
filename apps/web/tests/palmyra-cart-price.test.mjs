import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const context={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../lib/palmyraCartPrice.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,context);
const price=context.exports.palmyraCartPrice;
test('gammal rabatt ersätts av aktuell meny; Palmyras erbjudande behålls',()=>{
 assert.equal(price({price:129,discountActive:false,discountPrice:null}),129);
 assert.equal(price({price:129,discountActive:true,discountPrice:89}),89);
 assert.equal(price({price:135,salePrice:89}),89);
 assert.equal(price({price:125,discountActive:true,discountPercent:20}),100);
 assert.equal(price({price:129,discountActive:false,discountPrice:89}),129);
 assert.equal(price({price:NaN}),null);
});
