import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const ts = createRequire(import.meta.url)('typescript');
function fixture(file) {
  const storage=()=>{ const m=new Map(); return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}; };
  let consent=true, now=1789500000000; const events=[]; const listeners=new Map();
  const window={localStorage:storage(),sessionStorage:storage(),location:{search:'?utm_source=ig&utm_medium=paid_social&utm_campaign=lund&ad_id=123&fbclid=CLICK',pathname:'/restaurants/palmyra'},parent:null,dispatchEvent:e=>{events.push(e.type);(listeners.get(e.type)||[]).forEach(f=>f());}};window.parent=window;
  const document={referrer:'https://palmyrapizzeria.se/',cookie:'',querySelector:()=>null,createElement:()=>({dataset:{}}),head:{appendChild:()=>{}}};
  const module={exports:{}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,window,document,localStorage:window.localStorage,URL,URLSearchParams,Date:{now:()=>now},Event:class{constructor(type){this.type=type;}},Set,decodeURIComponent,require:n=>n.includes('cookieConsent')?{hasMarketingConsent:()=>consent}:{journeySessionId:()=> 'session-123'}});
  return {api:module.exports,window,document,events,setConsent:v=>consent=v,advance:ms=>now+=ms};
}
test('Metas kö används före laddning och dispatcher efter laddning, init en gång',()=>{const f=fixture('../lib/metaPixelRuntime.ts');f.api.ensureMetaPixel('123');assert.equal(f.window.fbq.queue.length,2);const calls=[];f.window.fbq.callMethod=(...args)=>calls.push(args);f.window.fbq('track','Purchase');assert.equal(calls[0][1],'Purchase');assert.equal(f.window.fbq.queue.length,2);f.api.ensureMetaPixel('123');assert.equal(calls.length,1);});
test('pixeln skapas inte utan samtycke',()=>{const f=fixture('../lib/metaPixelRuntime.ts');f.setConsent(false);f.api.ensureMetaPixel('123');assert.equal(f.window.fbq,undefined);});
