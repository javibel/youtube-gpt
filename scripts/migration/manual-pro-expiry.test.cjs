'use strict';
const assert=require('node:assert/strict');
const {load}=require('./route-harness.cjs');
const fixed=new Date('2026-09-28T12:00:00Z');
let subscription;
const prisma={subscription:{findUnique:async()=>subscription},user:{findUnique:async()=>({id:'synthetic-user'})}};
const plans=load('lib/plans.ts',{'@/lib/prisma':{prisma}});
async function run(){
 const sub=(stripeCustomerId,currentPeriodEnd,status='active')=>({plan:'pro',status,stripeCustomerId,currentPeriodEnd});
 assert.equal(plans.hasPaidAccess(sub('manual_admin',new Date('2026-09-29T00:00:00Z')),fixed),true);
 assert.equal(plans.hasPaidAccess(sub('manual_admin',fixed),fixed),false);
 assert.equal(plans.hasPaidAccess(sub('manual_admin',null),fixed),false);
 assert.equal(plans.hasPaidAccess(sub('cus_synthetic',fixed),fixed),true);
 assert.equal(plans.hasPaidAccess(sub('manual_admin',new Date('2026-09-29T00:00:00Z'),'canceled'),fixed),false);
 subscription=sub('manual_admin',new Date('2020-01-01T00:00:00Z'));
 assert.equal(await plans.getUserPlan('synthetic-user'),'free');
 subscription=sub('cus_synthetic',new Date('2020-01-01T00:00:00Z'));
 assert.equal(await plans.getUserPlan('synthetic-user'),'pro');

 let writes=[],lostClaim=false,createConflict=false;
 const database={user:{findUnique:async()=>({id:'synthetic-user'})},subscription:{
  findUnique:async()=>subscription,
  updateMany:async x=>{writes.push(x);return {count:lostClaim?0:1};},
  create:async x=>{if(createConflict)throw {code:'P2002'};writes.push(x);return x;},
 }};
 const route=load('app/api/admin/grant-pro/route.ts',{'next/server':{NextResponse:Response},'@/lib/prisma':{prisma:database},'@/lib/auth-guards':{requireAdmin:async()=>({ok:true})}});
 const post=async body=>route.POST(new Request('https://example.invalid/api/admin/grant-pro',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));
 subscription=sub('cus_synthetic',new Date('2026-10-01T00:00:00Z'));
 assert.equal((await post({email:'synthetic@example.invalid',plan:'pro',durationDays:60})).status,409);
 assert.equal((await post({email:'synthetic@example.invalid',plan:'free'})).status,409);
 subscription=sub(null,new Date('2026-10-01T00:00:00Z'));
 assert.equal((await post({email:'synthetic@example.invalid',plan:'pro',durationDays:60})).status,409);
 assert.equal((await post({email:'synthetic@example.invalid',plan:'free'})).status,409);
 assert.equal(writes.length,0);
 subscription=null;
 for(const durationDays of [undefined,0,366,1.2,'60'])assert.equal((await post({email:'synthetic@example.invalid',durationDays})).status,400);
 assert.equal(writes.length,0);
 const before=Date.now();
 const response=await post({email:'synthetic@example.invalid',plan:'pro',durationDays:60});
 assert.equal(response.status,200);
 const end=writes[0].data.currentPeriodEnd.getTime();
 assert.ok(end>=before+60*86400000&&end<=Date.now()+60*86400000);
 assert.equal(writes[0].data.stripeCustomerId,'manual_admin');
 assert.equal(writes[0].data.cancelAtPeriodEnd,true);
 assert.equal((await response.json()).currentPeriodEnd,new Date(end).toISOString());
 writes=[];createConflict=true;
 assert.equal((await post({email:'synthetic@example.invalid',plan:'pro',durationDays:60})).status,409);
 assert.equal(writes.length,0);createConflict=false;
 subscription=sub('manual_admin',new Date('2026-10-01T00:00:00Z'));
 lostClaim=true;
 assert.equal((await post({email:'synthetic@example.invalid',plan:'pro',durationDays:60})).status,409);
 assert.equal((await post({email:'synthetic@example.invalid',plan:'free'})).status,409);
 assert.ok(writes.every(x=>x.where.stripeCustomerId==='manual_admin'));
 lostClaim=false;writes=[];
 assert.equal((await post({email:'synthetic@example.invalid',plan:'pro',durationDays:60})).status,200);
 assert.equal(writes[0].where.stripeCustomerId,'manual_admin');
 console.log('PASS: bounded manual Pro expiry and conditional updates; Stripe and ambiguous legacy records remain untouched');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
