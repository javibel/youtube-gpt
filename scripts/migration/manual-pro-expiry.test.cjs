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

 let accesses=0;
 const database=new Proxy({},{get(){accesses++;throw Error('No business access from legacy public gate');}});
 const route=load('app/api/admin/grant-pro/route.ts',{'next/server':{NextResponse:Response},'@/lib/prisma':{prisma:database},'@/lib/auth-guards':{requireAdmin:async()=>({ok:true})}},{AbortController,Headers,TextEncoder});
 const post=async body=>route.POST(new Request('https://example.invalid/api/admin/grant-pro',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));
 // Legacy public-gate/marker-based mutation assertions are replaced by the
 // own native-purpose suite. Reader expiry assertions above stay unchanged.
 for(const plan of['pro','business','free']){
  const response=await post({email:'synthetic@example.invalid',plan,durationDays:60});
  assert.equal(response.status,400);
  assert.deepEqual(await response.json(),{error:'invalid_admin_manual_grant'});
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(accesses,0);
 }
 console.log('PASS: bounded manual expiry readers and legacy grant ingress denial');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
