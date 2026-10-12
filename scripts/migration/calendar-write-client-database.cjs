'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{load}=require('./route-harness.cjs'),{harness}=require('./calendar-client-retry.test.cjs');
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
module.exports=async(prisma,results)=>{
 const users=await Promise.all([1,2].map(i=>prisma.user.create({data:{email:'calendar-write-client-'+randomUUID()+'@example.invalid',name:'Synthetic write client '+i}}))),period=new Date(Date.now()+86400000);
 const plans=load('lib/plans.ts',{'@/lib/prisma':{prisma}}),api=u=>load('app/api/calendar/route.ts',{'next/server':{NextResponse:Response},'@/auth':{auth:async()=>({user:{id:u.id,email:u.email}})},'@/lib/plans':plans,'@/lib/prisma':{prisma}});
 await prisma.subscription.createMany({data:users.map(u=>({userId:u.id,plan:'pro',status:'active',stripeCustomerId:'manual_admin',currentPeriodEnd:period}))});
 const rows=()=>prisma.calendarEntry.findMany({where:{userId:users[0].id},orderBy:{id:'asc'}}),receipts=()=>Promise.all([prisma.calendarCreationReceipt.findMany({where:{userId:users[0].id},orderBy:{id:'asc'}}),prisma.calendarMutationReceipt.findMany({where:{userId:users[0].id},orderBy:{id:'asc'}})]);
 async function setup(method){const h=harness();h.state.user=users[0].id;h.state.email=users[0].email;h.state.key=randomUUID();let read;
  h.state.list=url=>(read=api(users.find(u=>u.id===h.state.user)??users[0]).GET(new Request('https://example.invalid'+url)));
  let e;if(method!=='POST'){const range=load('lib/calendar-read-contract.ts').calendarMonthRange(new Date().getFullYear(),new Date().getMonth());e=await prisma.calendarEntry.create({data:{userId:users[0].id,title:'Own original '+randomUUID(),date:range.from,status:'idea'}});}
  h.render();await read;await flush();
  if(method==='POST'){h.open();h.field('title','Own new '+randomUUID());}else{h.edit(e.title);if(method==='PUT')h.field('title','Own edited '+randomUUID());}
  const send=(url,init)=>api(users[0])[init.method](new Request('https://example.invalid'+url,init));
  return {h,e,send,run:()=>h.button(method==='DELETE'?'deleteEntry':'saveEntry')(),retry:()=>h.button(method==='POST'?'retryCalendarCreation':'retryCalendarMutation'),read:()=>read};
 }
 try{
  for(const method of ['POST','PUT','DELETE'])for(const stage of ['headers','json']){
   const {h,send,run,retry}=await setup(method);try{
    const reads=h.listRequests.length;h.state.write=async(url,init)=>{const response=await send(url,init);assert.equal(response.status,method==='POST'?201:200);if(stage==='headers')h.elapseWithoutTimers(30000);return {ok:response.ok,status:response.status,json:async()=>{if(stage==='json')h.elapseWithoutTimers(30000);return response.json();}};};
    await run();assert(retry());assert.equal(h.storage.size,1);assert.equal(h.listRequests.length,reads);const original=h.writeRequests[0],snapshot={rows:await rows(),receipts:await receipts()};
    h.state.write=send;await retry()();await flush();assert.equal(retry(),undefined);assert.equal(h.storage.size,0);assert.equal(h.writeRequests.length,2);assert.equal(h.writeRequests[1].body,original.body);assert.equal(h.writeRequests[1].headers['Idempotency-Key'],original.headers['Idempotency-Key']);assert.equal(h.writeRequests[1].headers['X-Calendar-Write-Recovery'],'retained-only-v1');assert.deepEqual(await rows(),snapshot.rows);assert.deepEqual(await receipts(),snapshot.receipts);
    results.push('Calendar write client native '+method+' actual committed '+stage+' delayed beyond monotonic budget remains uncertain; explicit same-key/body original query confirms once without new SQL effect');
   }finally{h.unmount();}
  }
  for(const method of ['POST','PUT','DELETE'])for(const change of ['status','closed-fields']){
   const {h,send,run,retry}=await setup(method);try{
    const reads=h.listRequests.length;h.state.write=async(url,init)=>{const response=await send(url,init),body=await response.json();if(change==='closed-fields'){if(method==='DELETE')body.authority=true;else delete body.entry.updatedAt;}return {ok:true,status:change==='status'?206:response.status,json:async()=>body};};
    await run();assert(retry());assert.equal(h.storage.size,1);assert.equal(h.listRequests.length,reads);const snapshot={rows:await rows(),receipts:await receipts()};h.state.write=send;await retry()();await flush();assert.equal(retry(),undefined);assert.deepEqual(await rows(),snapshot.rows);assert.deepEqual(await receipts(),snapshot.receipts);assert.equal(h.writeRequests.length,2);
    results.push('Calendar write client native '+method+' original real SQL commit with altered '+change+' cannot clear pending selector; exact original retained response leaves current rows/receipts unchanged');
   }finally{h.unmount();}
  }
  for(const method of ['POST','PUT','DELETE']){
   const {h,send,run,retry}=await setup(method);try{
    let ready,release;const received=new Promise(r=>ready=r),held=new Promise(r=>release=r);h.state.write=async(url,init)=>{const response=await send(url,init);ready(response);return held;};
    const pending=run(),response=await Promise.race([received,pending.then(()=>{throw Error('Writer returned before original native response was captured');})]);const snapshot={rows:await rows(),receipts:await receipts()};h.state.user=users[1].id;h.state.email=users[1].email;h.render(true);release(response);await pending;h.runEffects();await flush();assert.equal(h.writeRequests.length,1);assert.equal(h.storage.size,1);assert.equal(retry(),undefined);assert.deepEqual(await rows(),snapshot.rows);assert.deepEqual(await receipts(),snapshot.receipts);assert.equal(await prisma.calendarEntry.count({where:{userId:users[1].id}}),0);
    results.push('Calendar write client native '+method+' actual old-account commit/response cannot act on next account before effects; original selector preserved and neighboring owner unchanged');
   }finally{h.unmount();}
  }
  for(const u of users)assert.equal((await prisma.subscription.findUnique({where:{userId:u.id}})).currentPeriodEnd.toISOString(),period.toISOString());assert.equal(await prisma.generation.count({where:{userId:{in:users.map(u=>u.id)}}}),0);
  results.push('Calendar write client native all cases preserve declared paid periods and generation records; cleanup only accounts created by this original fixture, no operational authority');
 }finally{await prisma.user.deleteMany({where:{id:{in:users.map(u=>u.id)}}});}
};
