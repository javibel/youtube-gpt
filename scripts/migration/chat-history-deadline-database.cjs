'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{load}=require('./route-harness.cjs');
const {deferred,flush}=require('./calendar-http-read-deadline.test.cjs');
module.exports=async(prisma,results)=>{
 const users=await Promise.all([1,2].map(()=>prisma.user.create({data:{email:'chat-history-wait-'+randomUUID()+'@example.invalid'}}))),owner=users[0],neighbor=users[1];
 try{
  await prisma.chatMessage.createMany({data:Array.from({length:51},(_,i)=>({userId:owner.id,role:i%2?'assistant':'user',content:'Synthetic original message '+i,createdAt:new Date(Date.UTC(2026,8,1,0,i))})).concat([{userId:neighbor.id,role:'user',content:'Synthetic neighboring message'}])});
  const allBefore=await prisma.chatMessage.findMany({where:{userId:{in:users.map(u=>u.id)}},orderBy:{id:'asc'}});
  for(const held of ['user','history']){
   const entered=deferred(),ack=deferred(),finished=deferred(),controller=new AbortController();let elapsed=0,userReads=0,historyReads=0;
   const timers=new Map(),globals={performance:{now:()=>elapsed},setTimeout(fn){const timer={};timers.set(timer,fn);return timer;},clearTimeout:timer=>timers.delete(timer)};
   const forbidden=()=>{throw Error('History GET may not write, read quota or execute tasks');};
   const db={user:{findUnique:async query=>{userReads++;assert.equal(query.where.email,owner.email);const value=await prisma.user.findUnique(query);if(held==='user'){entered.resolve();await ack.promise;finished.resolve();}return value;}},chatMessage:{findMany:async query=>{historyReads++;assert.equal(query.where.userId,owner.id);assert.equal(query.take,50);const rows=await prisma.chatMessage.findMany(query);assert.equal(rows.length,50);assert.equal(rows[0].content,'Synthetic original message 50');assert.equal(rows.at(-1).content,'Synthetic original message 1');if(held==='history'){entered.resolve();await ack.promise;finished.resolve();}return rows;},createMany:forbidden,deleteMany:forbidden},$queryRaw:forbidden};
   const route=load('app/api/chat/route.ts',{'next/server':{NextResponse:Response},'@/auth':{auth:async()=>({user:{email:owner.email}})},'@/lib/prisma':{prisma:db},'@/lib/plans':{getUserPlan:forbidden},'@/lib/ai/task-runtime':{getMessagesTask:forbidden}},globals);
   const original=route.GET(new Request('https://example.invalid/api/chat',{signal:controller.signal}));await entered.promise;
   if(held==='user'){elapsed=30000;for(const fn of [...timers.values()])fn();}else controller.abort();
   const response=await original;assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'chat_history_unconfirmed'});assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(timers.size,0);
   ack.resolve();await finished.promise;await flush();assert.equal(response.status,503);assert.equal(userReads,1);assert.equal(historyReads,held==='history'?1:0);assert.deepEqual(await prisma.chatMessage.findMany({where:{userId:{in:users.map(u=>u.id)}},orderBy:{id:'asc'}}),allBefore);assert.equal(await prisma.generation.count({where:{userId:{in:users.map(u=>u.id)}}}),0);
   results.push('chat history '+(held==='user'?'actual owner-email PostgreSQL user SELECT acknowledgement withheld past30s deadline; late user cannot start message SELECT':'actual last-fifty chronological PostgreSQL message SELECT acknowledgement withheld through HTTP abort; late rows cannot become empty or successful history')+': HTTP503/no-store, original and neighboring conversations intact, no quota/write/task (auth/clock/HTTP synthetic)');
  }
 }finally{await prisma.user.deleteMany({where:{id:{in:users.map(u=>u.id)}}});}
};
