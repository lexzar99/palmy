import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const src=ts.transpileModule(fs.readFileSync(new URL('../lib/orderAttribution.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
function capture(query,consent=true,embedded=false){
 const storage=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}};
 const window={location:{search:query,pathname:'/restaurants/palmyra-pizzeria-lund'},localStorage:storage(),sessionStorage:storage()};window.parent=embedded?{}:window;
 const context={exports:{},URL,URLSearchParams,window,document:{referrer:'',cookie:''},require:name=>name.includes('cookieConsent')?{hasMarketingConsent:()=>consent}:{journeySessionId:()=> 'test-session'}};
 vm.runInNewContext(src,context);return context.exports.orderAttributionContext();
}
test('Meta, Palmyras redirect och direkt sparas separat; utan samtycke fabriceras ingen källa',()=>{
 assert.equal(capture('?utm_source=fb&utm_campaign=palmyra_via50&ad_id=123').current.source,'fb');
 assert.equal(capture('?utm_source=palmyra&utm_campaign=upptack_viaeats').current.source,'palmyra');
 assert.equal(capture('').current.source,'direct');
 assert.equal(capture('',true,true).surface,'VIAEATS_EMBED');
 assert.equal(capture('?utm_source=fb',false).consent,false);
 assert.equal(capture('?utm_source=fb',false).current,undefined);
});
