'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {load}=require('./route-harness.cjs'),{harness}=require('./calendar-client-retry.test.cjs');
module.exports=async function(prisma,results){
 const users=await Promise.all([1,2].map(i=>prisma.user.create({data:{email:'calendar-read-'+randomUUID()+'@example.invalid',name:'Synthetic calendar '+i}})));
 let userId=users[0].id;const h=harness(),date=new Date().toISOString().slice(0,10);
 const plans=load('lib/plans.ts',{'@/lib/prisma':{prisma}});
 const route=load('app/api/calendar/route.ts',{'next/server':{NextResponse:Response},'@/auth':{auth:async()=>({user:{id:userId,email:users.find(u=>u.id===userId).email}})},'@/lib/prisma':{prisma},'@/lib/plans':plans});
 const invoke=url=>route.GET(new Request('https://example.invalid'+url));
 const flush=async()=>{for(let i=0;i<16;i++)await Promise.resolve();};
 const retry=()=>h.nodes().find(n=>n.type==='button'&&String(n.props.children).includes('Volver a consultar calendario')).props.onClick();
 try{
  await prisma.subscription.createMany({data:users.map(user=>({userId:user.id,plan:'pro',status:'active',stripeCustomerId:'manual_admin',currentPeriodEnd:new Date(Date.now()+86400000)}))});
  await prisma.calendarEntry.createMany({data:users.map((user,i)=>({userId:user.id,title:'Synthetic own calendar '+(i+1),date,status:'idea'}))});
  // Hold the acknowledgement of a real SELECT, not a fabricated database result.
  {
   const {deferred,flush:drain}=require('./calendar-http-read-deadline.test.cjs');
   const selected=deferred(),ack=deferred(),timers=new Map();let elapsed=0,queryCount=0;
   const bounded=load('app/api/calendar/route.ts',{
    'next/server':{NextResponse:Response},'@/auth':{auth:async()=>({user:{id:userId,email:users.find(u=>u.id===userId).email}})},'@/lib/plans':plans,
    '@/lib/prisma':{prisma:{$transaction:(fn,opts)=>prisma.$transaction(tx=>fn({...tx,calendarEntry:{...tx.calendarEntry,findMany:async input=>{
     queryCount++;const rows=await tx.calendarEntry.findMany(input);selected.resolve(rows);await ack.promise;return rows;
    }}}),opts)}},
   },{performance:{now:()=>elapsed},setTimeout(fn,ms){timers.set(1,fn);return 1;},clearTimeout(id){timers.delete(id);}});
   const original=bounded.GET(new Request('https://example.invalid/api/calendar'));
   const rows=await selected.promise;assert.equal(rows.length,1);assert.equal(rows[0].userId,userId);
   elapsed=25000;for(const fn of [...timers.values()])fn();const response=await original;
   assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'calendar_read_unconfirmed'});assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(timers.size,0);
   ack.resolve();await drain();assert.equal(queryCount,1);assert.equal(response.status,503);
   assert.equal(await prisma.calendarEntry.count({where:{userId:{in:users.map(u=>u.id)}}}),2);
   assert.equal(await prisma.generation.count({where:{userId:{in:users.map(u=>u.id)}}}),0);
   results.push('calendar GET retires at its total HTTP deadline after original native own-row SELECT; late original acknowledgement cannot confirm an empty calendar or dispatch another query; both accounts unchanged');
  }
  {
   const {deferred,flush:drain}=require('./calendar-http-read-deadline.test.cjs');
   const authorization=deferred(),started=deferred(),controller=new AbortController();let planCalls=0,queryCalls=0;
   const bounded=load('app/api/calendar/route.ts',{'next/server':{NextResponse:Response},
    '@/auth':{auth:()=>{started.resolve();return authorization.promise;}},
    '@/lib/plans':{...plans,getUserPlan:async id=>{planCalls++;return plans.getUserPlan(id);}},
    '@/lib/prisma':{prisma:{calendarEntry:{findMany:async input=>{queryCalls++;return prisma.calendarEntry.findMany(input);}}}},
   });
   const original=bounded.GET(new Request('https://example.invalid/api/calendar',{signal:controller.signal}));
   await started.promise;controller.abort();const response=await original;assert.equal(response.status,503);
   authorization.resolve({user:{id:userId,email:users.find(u=>u.id===userId).email}});await drain();assert.equal(planCalls,0);assert.equal(queryCalls,0);
   assert.equal(await prisma.calendarEntry.count({where:{userId:{in:users.map(u=>u.id)}}}),2);
   results.push('calendar GET aborted while original authorization is held does not start stored-plan or PostgreSQL reads after late authorization, and leaves native calendar rows intact');
  }
  h.state.user=userId;h.state.email=users[0].email;let release,ready;
  const received=new Promise(resolve=>{ready=resolve;}),held=new Promise(resolve=>{release=resolve;});
  h.state.list=async url=>{const response=await invoke(url);assert.equal(response.status,200);ready(response);return held;};
  h.render();const old=await received;await flush();
  userId=users[1].id;h.state.user=userId;h.state.email=users[1].email;
  let nextReady;const nextReceived=new Promise(resolve=>{nextReady=resolve;});
  h.state.list=async url=>{const response=await invoke(url);nextReady();return response;};h.render();await nextReceived;await flush();
  assert.match(h.text(),/Synthetic own calendar 2/);release(old);await flush();
  assert.doesNotMatch(h.text(),/Synthetic own calendar 1/);assert.equal(h.listRequests.length,2);
  assert.equal(h.listRequests[0].signal.aborted,true);assert.equal(h.requests.length,0);
  results.push('original calendar component/GET/plans/PostgreSQL shows only current account rows; late prior-account response cannot replace them');
  h.unmount();
  const read=harness();read.state.user=userId;read.state.email=users[1].email;
  let delivered;const complete=new Promise(resolve=>{delivered=resolve;});
  read.state.list=async url=>{const response=await invoke(url);assert.equal(response.status,200);delivered();return {ok:true,status:200,json:()=>new Promise(()=>{})};};
  try{
   read.render();await complete;await flush();read.advance(30000);await flush();assert.ok(read.alert());assert.equal(read.timers.size,0);
   await prisma.subscription.updateMany({where:{userId},data:{currentPeriodEnd:new Date(Date.now()-1000)}});
   read.state.list=invoke;const action=()=>read.nodes().find(n=>n.type==='button'&&String(n.props.children).includes('Volver a consultar calendario')).props.onClick();
   await action();assert.ok(read.alert());assert.doesNotMatch(read.text(),/Synthetic own calendar 2/);
   await prisma.subscription.updateMany({where:{userId},data:{currentPeriodEnd:new Date(Date.now()+86400000)}});
   await action();assert.equal(read.alert(),undefined);assert.match(read.text(),/Synthetic own calendar 2/);
   assert.equal(await prisma.calendarEntry.count({where:{userId:{in:users.map(u=>u.id)}}}),2);
   assert.equal(await prisma.generation.count({where:{userId:{in:users.map(u=>u.id)}}}),0);assert.equal(read.requests.length,0);
   results.push('calendar read timeout and explicit retry respect stored Pro expiration/restoration; no calendar writes, generations or model requests');
  }finally{read.unmount();}
  const editor=harness();editor.state.user=userId;editor.state.email=users[1].email;let lastRead;
  editor.state.list=url=>(lastRead=invoke(url));
  const write=(url,init)=>route[init.method](new Request('https://example.invalid'+url,init));
  try{
   editor.render();await lastRead;await flush();editor.open();editor.field('title','Synthetic newly created entry');
   let lost=true;editor.state.write=async(url,init)=>{const response=await write(url,init);assert.equal(response.status,201);
    if(lost){lost=false;throw Error('Lost create acknowledgement after original PostgreSQL commit');}return response;};
   const save=editor.button('saveEntry');await save();assert.ok(editor.alert());await save();
   assert.equal(editor.writeRequests.length,1);assert.equal(await prisma.calendarEntry.count({where:{userId,title:'Synthetic newly created entry'}}),1);
   const consult=editor.nodes().find(n=>n.type==='button'&&n.props.children==='Consultar calendario').props.onClick;
   await consult();assert.ok(editor.alert());assert.equal(editor.writeRequests.length,1);assert.match(editor.text(),/Synthetic newly created entry/);
   results.push('original calendar create commits once in PostgreSQL after lost acknowledgement; blocked duplicate and explicit GET cannot authorize another write or certify the uncertain draft');
   editor.button('discardUnconfirmedWrite')();editor.button('closeModal')();editor.edit('Synthetic newly created entry');
   editor.field('title','Synthetic edited entry');editor.field('status','scheduled');editor.state.write=write;
   await editor.button('saveEntry')();await lastRead;await flush();assert.equal(editor.alert(),undefined);
   assert.equal(await prisma.calendarEntry.count({where:{userId,title:'Synthetic edited entry',status:'scheduled'}}),1);
   editor.edit('Synthetic edited entry');await editor.button('deleteEntry')();await lastRead;await flush();
   assert.equal(await prisma.calendarEntry.count({where:{userId,title:'Synthetic edited entry'}}),0);assert.equal(editor.alert(),undefined);
   editor.open();editor.field('title','Old account unsent draft');const stale=editor.button('saveEntry'),before=editor.writeRequests.length;
   userId=users[0].id;editor.state.user=userId;editor.state.email=users[0].email;editor.render();await lastRead;await flush();await stale();
   assert.equal(editor.writeRequests.length,before);assert.equal(await prisma.calendarEntry.count({where:{title:'Old account unsent draft',userId:{in:users.map(u=>u.id)}}}),0);
   assert.equal(await prisma.calendarEntry.count({where:{userId:{in:users.map(u=>u.id)}}}),2);
   assert.equal(await prisma.generation.count({where:{userId:{in:users.map(u=>u.id)}}}),0);assert.equal(editor.requests.length,0);
   results.push('actual calendar edit/delete acknowledgements refresh own PostgreSQL rows; old-account captured draft cannot dispatch under the new session or alter either account');
  }finally{editor.unmount();}
 }finally{h.unmount();await prisma.user.deleteMany({where:{id:{in:users.map(u=>u.id)}}});}
};
