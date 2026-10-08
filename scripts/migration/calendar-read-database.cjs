'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {load}=require('./route-harness.cjs'),{harness}=require('./calendar-client-retry.test.cjs');
module.exports=async function(prisma,results){
 const users=await Promise.all([1,2].map(i=>prisma.user.create({data:{email:'calendar-read-'+randomUUID()+'@example.invalid',name:'Synthetic calendar '+i}})));
 let userId=users[0].id;const h=harness(),date=new Date().toISOString().slice(0,10);
 const plans=load('lib/plans.ts',{'@/lib/prisma':{prisma}});
 const route=load('app/api/calendar/route.ts',{'next/server':{NextResponse:Response},'@/auth':{auth:async()=>({user:{id:userId}})},'@/lib/prisma':{prisma},'@/lib/plans':plans});
 const invoke=url=>route.GET(new Request('https://example.invalid'+url));
 const flush=async()=>{for(let i=0;i<16;i++)await Promise.resolve();};
 const retry=()=>h.nodes().find(n=>n.type==='button'&&String(n.props.children).includes('Volver a consultar calendario')).props.onClick();
 try{
  await prisma.subscription.createMany({data:users.map(user=>({userId:user.id,plan:'pro',status:'active',stripeCustomerId:'manual_admin',currentPeriodEnd:new Date(Date.now()+86400000)}))});
  await prisma.calendarEntry.createMany({data:users.map((user,i)=>({userId:user.id,title:'Synthetic own calendar '+(i+1),date,status:'idea'}))});
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
  read.state.list=async url=>{const response=await invoke(url);assert.equal(response.status,200);delivered();return {ok:true,json:()=>new Promise(()=>{})};};
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
 }finally{h.unmount();await prisma.user.deleteMany({where:{id:{in:users.map(u=>u.id)}}});}
};
