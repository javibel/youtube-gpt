'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{load}=require('./route-harness.cjs');
const {deferred,flush}=require('./calendar-http-read-deadline.test.cjs');
module.exports=async(prisma,results)=>{
 const users=await Promise.all([1,2].map(()=>prisma.user.create({data:{email:'calendar-http-write-'+randomUUID()+'@example.invalid'}}))),owner=users[0].id,other=users[1].id;
 const plans=load('lib/plans.ts',{'@/lib/prisma':{prisma}}),fields=e=>({title:e.title,description:e.description,date:e.date,status:e.status,color:e.color});
 const api=(db=prisma,globals={})=>load('app/api/calendar/route.ts',{'next/server':{NextResponse:Response},'@/auth':{auth:async()=>({user:{id:owner,email:users[0].email}})},'@/lib/plans':plans,'@/lib/prisma':{prisma:db}},globals);
 const request=(method,key,body,id,recovery=false,signal)=>new Request('https://example.invalid/api/calendar'+(method==='DELETE'?'?id='+id:''),{method,headers:{'Content-Type':'application/json','Idempotency-Key':key,...(recovery?{'X-Calendar-Write-Recovery':'retained-only-v1'}:{})},body:JSON.stringify(body),signal});
 const snapshot=async()=>({rows:await prisma.calendarEntry.findMany({where:{userId:owner},orderBy:{id:'asc'}}),creations:await prisma.calendarCreationReceipt.findMany({where:{userId:owner},orderBy:{id:'asc'}}),mutations:await prisma.calendarMutationReceipt.findMany({where:{userId:owner},orderBy:{id:'asc'}})});
 try{
  await prisma.subscription.createMany({data:users.map(u=>({userId:u.id,plan:'pro',status:'active',stripeCustomerId:'manual_admin',currentPeriodEnd:new Date(Date.now()+86400000)}))});
  const neighbor=await prisma.calendarEntry.create({data:{userId:other,title:'Unchanged neighboring owner',date:'2026-10-10',status:'idea'}});
  for(const method of ['POST','PUT','DELETE']){
   const entry=method==='POST'?null:await prisma.calendarEntry.create({data:{userId:owner,title:'Native original '+method,date:'2026-10-10',status:'idea'}});
   const body=method==='POST'?{title:'Native original POST',date:'2026-10-10',status:'idea'}:method==='PUT'?{id:entry.id,title:'Native edited PUT',expected:fields(entry)}:{expected:fields(entry)};
   const key='native-http-'+method,committed=deferred(),ack=deferred(),finished=deferred(),timers=new Map();let elapsed=0,transactions=0;
   const held={$transaction:async(fn,options)=>{
    transactions++;const value=await prisma.$transaction(fn,options);committed.resolve(value);await ack.promise;finished.resolve();return value;
   }};
   const bounded=api(held,{performance:{now:()=>elapsed},setTimeout(fn){timers.set(1,fn);return 1;},clearTimeout(id){timers.delete(id);}});
   const original=bounded[method](request(method,key,body,entry?.id)),output=await committed.promise;
   const before=await snapshot();assert.equal(method==='POST'?before.creations.filter(r=>r.key===key).length:before.mutations.filter(r=>r.key===key).length,1);
   elapsed=30000;for(const fn of [...timers.values()])fn();const failed=await original;assert.equal(failed.status,503);assert.deepEqual(await failed.json(),{error:'calendar_write_unconfirmed'});assert.equal(failed.headers.get('cache-control'),'no-store');assert.equal(timers.size,0);
   ack.resolve();await finished.promise;await flush();assert.equal(failed.status,503);assert.equal(transactions,1);
   const retained=await api()[method](request(method,key,body,entry?.id,true));assert.equal(retained.status,method==='POST'?201:200);
   assert.deepEqual(await retained.json(),JSON.parse(JSON.stringify(method==='POST'?{entry:output.entry}:output.output)));assert.deepEqual(await snapshot(),before);
   assert.deepEqual(await prisma.calendarEntry.findUnique({where:{id:neighbor.id}}),neighbor);assert.equal(await prisma.generation.count({where:{userId:{in:users.map(u=>u.id)}}}),0);
   results.push('calendar '+method+' original native commit and durable receipt precede HTTP timeout503; late acknowledgement stays uncertain and explicit identical retained query returns original output without another mutation, neighboring owner unchanged');
  }
  {
   const body=deferred(),started=deferred(),controller=new AbortController();let transactions=0;
   const db={$transaction:(...args)=>{transactions++;return prisma.$transaction(...args);}},bounded=api(db),before=await snapshot();
   const req=request('POST','native-aborted-body',{title:'Never admitted body',date:'2026-10-10'},undefined,false,controller.signal);req.json=()=>{started.resolve();return body.promise;};
   const original=bounded.POST(req);await started.promise;controller.abort();const response=await original;assert.equal(response.status,503);body.resolve({title:'Never admitted body',date:'2026-10-10'});await flush();assert.equal(transactions,0);assert.deepEqual(await snapshot(),before);
   assert.equal(await prisma.calendarCreationReceipt.count({where:{userId:owner,key:'native-aborted-body'}}),0);
   results.push('calendar POST abort during original body wait before any native paid-source admission cannot admit a late body or create an entry/receipt in PostgreSQL');
  }
 }finally{await prisma.user.deleteMany({where:{id:{in:users.map(u=>u.id)}}});}
};
