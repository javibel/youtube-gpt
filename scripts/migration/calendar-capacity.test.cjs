'use strict';
const assert=require('node:assert/strict');
const {load}=require('./route-harness.cjs');
const results=[];
const watchdog=setTimeout(()=>{console.error('FAIL: calendar capacity contracts did not finish');process.exit(1);},10_000);
async function test(name,run){await run();results.push({name,status:'PASS'});}
function fixture(options={}){
 let count=options.count??199,creates=0,locks=0,counts=0,transactions=0,tail=Promise.resolve(),waiters=[];
 const countUnlocked=()=>new Promise(resolve=>{waiters.push(resolve);if(waiters.length===2){const original=count;waiters.splice(0).forEach(done=>done(original));}});
 const insert=async({data})=>{if(options.createFails)throw Error('Create failed');creates++;count++;return{id:'synthetic-entry-'+creates,createdAt:new Date('2026-10-01'),updatedAt:new Date('2026-10-01'),...data};};
 const tx={subscription:{findUnique:async()=>({id:'sub-synthetic',userId:'synthetic',plan:options.free?'free':'pro',status:options.free?'canceled':'active',stripeCustomerId:null,currentPeriodEnd:null})},calendarEntry:{count:async()=>{counts++;return options.badCount??count;},create:insert},$queryRawUnsafe:async(sql,user)=>{locks++;if(sql.includes('subscriptions'))return [{id:'sub-synthetic'}];assert.match(sql,/SELECT id,email FROM users WHERE id=\$1 FOR UPDATE/);assert.equal(user,'synthetic');if(options.lockFails)throw Error('Lock failed');return options.owner??[{id:user,email:'synthetic@example.invalid'}];}};
 const prisma={calendarEntry:{count:countUnlocked,create:insert},$transaction:run=>{transactions++;const pending=tail.then(()=>run(tx));tail=pending.catch(()=>{});return pending;}};
 const route=load('app/api/calendar/route.ts',{'next/server':{NextResponse:Response},'@/auth':{auth:async()=>options.unauthenticated?null:{user:{id:'synthetic',email:'synthetic@example.invalid'}}},'@/lib/prisma':{prisma},'@/lib/plans':{getUserPlan:async()=>options.free?'free':'pro',isPaid:plan=>plan==='pro',hasPaidAccess:sub=>sub?.status==='active'}});
 const request=(body={title:'Synthetic title',date:'2026-10-08',description:''},signal)=>new Request('https://example.invalid/api/calendar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
 return{post:(body,signal)=>route.POST(request(body,signal)),state:()=>({count,creates,locks,counts,transactions})};
}
(async()=>{
 await test('two simultaneous additions share the last calendar slot instead of creating entry201',async()=>{
  const f=fixture();const responses=await Promise.all([f.post(),f.post()]);assert.deepEqual(responses.map(r=>r.status).sort(),[201,400]);
  assert.equal(f.state().count,200);assert.equal(f.state().creates,1);assert.deepEqual(await responses.find(r=>r.status===400).json(),{error:'max_entries'});
 });
 for(const value of [-1,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])await test('unknown/invalid count '+String(value)+' cannot admit an entry',async()=>{
  const f=fixture({badCount:value});assert.equal((await f.post()).status,503);assert.equal(f.state().creates,0);
 });
 for(const owner of [[],[{id:'another-user',email:'synthetic@example.invalid'}]])await test('owner lock result '+JSON.stringify(owner)+' cannot admit a calendar entry',async()=>{
  const f=fixture({owner});assert.equal((await f.post()).status,401);assert.equal(f.state().creates,0);assert.equal(f.state().counts,0);
 });
 await test('lock failure cannot fall back to an unprotected writer',async()=>{
  const f=fixture({lockFails:true});assert.equal((await f.post()).status,503);assert.equal(f.state().creates,0);
 });
 await test('create failure remains unconfirmed without a second insertion',async()=>{
  const f=fixture({createFails:true});const response=await f.post();assert.equal(response.status,503);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(f.state().creates,0);
 });
 await test('already aborted request does not consume a calendar slot',async()=>{
  const f=fixture(),controller=new AbortController();controller.abort();assert.equal((await f.post(undefined,controller.signal)).status,503);assert.equal(f.state().creates,0);
 });
 await test('full calendar denies new insertion and preserves existing rows',async()=>{
  const f=fixture({count:200});assert.equal((await f.post()).status,400);assert.equal(f.state().creates,0);assert.equal(f.state().count,200);
 });
 await test('malformed input is rejected before a transaction or insertion',async()=>{
  for(const body of [null,[],{title:7,date:'2026-10-08'},{title:'Valid',date:{}},{title:'Valid',date:'2026-10-08',description:[]},{title:'Valid',date:'2026-10-08',color:7}]){
   const f=fixture();assert.equal((await f.post(body)).status,400);assert.equal(f.state().transactions,0);assert.equal(f.state().creates,0);
  }
 });
 await test('free is denied by the locked source and anonymous cannot enter admission',async()=>{
  for(const options of [{free:true},{unauthenticated:true}]){const f=fixture(options);assert.equal((await f.post()).status,options.free?403:401);assert.equal(f.state().transactions,options.free?1:0);}
 });
 console.log(JSON.stringify({scope:'Actual calendar POST with serialized synthetic database; no production, models or recovery authority',results},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>clearTimeout(watchdog));
