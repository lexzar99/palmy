import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
test('menyingång överlever kassan, Meta nollställer, och direkt återbesök får ordinarie meny',()=>{
 const source=ts.transpileModule(fs.readFileSync(new URL('../lib/palmyraOffer.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 const map=new Map();const storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
 const context={exports:{},URL,sessionStorage:storage,window:{location:{href:'https://viaeats.se/restaurants/palmyra-pizzeria-lund?utm_source=palmyra'}},document:{referrer:'https://palmyrapizzeria.se/'}};
 vm.runInNewContext(source,context);const read=context.exports.palmyraOfferChannel;
 assert.equal(read(),'palmyra');
 context.window.location.href='https://viaeats.se/cart';context.document.referrer='https://viaeats.se/restaurants/palmyra-pizzeria-lund';assert.equal(read(),'palmyra');
 context.window.location.href='https://viaeats.se/restaurants/palmyra-pizzeria-lund?utm_source=fb&code=VIA50';assert.equal(read(),'regular');assert.equal(map.get('viaeats.pending-code'),'VIA50');
 context.window.location.href='https://viaeats.se/restaurants/palmyra-pizzeria-lund?utm_source=palmyra';assert.equal(read(),'palmyra');
 context.window.location.href='https://viaeats.se/';context.document.referrer='';assert.equal(read(),'regular');
});
