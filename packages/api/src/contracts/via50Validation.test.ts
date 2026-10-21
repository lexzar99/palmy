import assert from 'node:assert/strict';
import express from 'express';
import { PALMYRA_ID } from '../lib/palmyraCampaign';
const prismaPath = require.resolve('../lib/prisma');
require.cache[prismaPath] = { id:prismaPath, filename:prismaPath, loaded:true, exports:{__esModule:true,default:{discountCode:{findUnique:async()=>null}}}} as any;
const RealDate = Date;
global.Date = class extends RealDate { constructor(value?: any) { super(value ?? '2026-09-19T12:00:00Z'); } } as DateConstructor;
async function main(){
 const app=express();app.use(express.json());app.use('/discount',require('../routes/discount').default);
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 const url=`http://127.0.0.1:${(server.address() as any).port}/discount/validate`;
 const post=(data:any)=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:'VIA50',restaurantId:PALMYRA_ID,subtotal:150,discountableSubtotal:150,...data})});
 try {
  const ok=await post({});assert.equal(ok.status,200);const data:any=await ok.json();assert.equal(data.value,50);assert.equal(data.discountAmount,50);assert.equal(data.minOrder,150);assert.equal(data.freeDelivery,true);
  const large=await post({code:'VIA70',subtotal:250,discountableSubtotal:250});assert.equal(large.status,200);const big:any=await large.json();assert.equal(big.value,70);assert.equal(big.discountAmount,70);assert.equal(big.minOrder,250);
  assert.equal((await post({code:'VIA70',subtotal:249,discountableSubtotal:249})).status,400);
  assert.equal((await post({subtotal:149,discountableSubtotal:149})).status,400);
  const mixed=await post({subtotal:200,discountableSubtotal:121});assert.equal(mixed.status,400);assert.match((await mixed.json() as any).error,/ej rabatterade/);
  assert.equal((await post({restaurantId:'other'})).status,400);
  assert.equal((await post({hasDiscountedItems:true})).status,400);
  console.log('VIA50 endpoint: 50 kr (inte ören), gräns, blandad korg och restaurangspärr OK');
 }finally{server.close();global.Date=RealDate;}
}
void main().catch(e=>{console.error(e);process.exitCode=1;});
