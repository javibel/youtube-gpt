'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{load}=require('./route-harness.cjs');
const {deferred,flush}=require('./calendar-http-read-deadline.test.cjs');
module.exports=async(prisma,results)=>{
 const stages=['throttle','daily','create','save','prune','delete'],users=await Promise.all([...stages,'neighbor'].map(()=>prisma.user.create({data:{email:'chat-send-wait-'+randomUUID()+'@example.invalid'}}))),neighbor=users.at(-1);
 try{
  await prisma.chatMessage.create({data:{userId:neighbor.id,role:'user',content:'Synthetic neighboring conversation'}});
  const neighborBefore=await prisma.chatMessage.findMany({where:{userId:neighbor.id}});
  for(const[index,held]of stages.entries()){
   const owner=users[index],entered=deferred(),ack=deferred(),saveDone=deferred(),owned=[],calls=[],controller=new AbortController();let now=0;
   await prisma.chatMessage.createMany({data:Array.from({length:51},(_,i)=>({userId:owner.id,role:i%2?'assistant':'user',content:'Original '+i,createdAt:new Date(Date.UTC(2026,8,1,0,i))}))});
   const old=await prisma.chatMessage.findMany({where:{userId:owner.id},orderBy:{createdAt:'asc'}}),timers=new Map();
   const hold=async(stage,operation)=>{calls.push(stage);const original=(async()=>{const result=await operation();if(stage==='save')saveDone.resolve();if(stage===held){entered.resolve();await ack.promise;}return result;})();owned.push(original);return original;};
   const db={user:prisma.user,$queryRaw:(...args)=>hold(String(args[1]).startsWith('chat_throttle:')?'throttle':'daily',()=>prisma.$queryRaw(...args)),chatMessage:{findMany:query=>hold(query.skip?'prune':'context',()=>prisma.chatMessage.findMany(query)),createMany:query=>hold('save',()=>prisma.chatMessage.createMany(query)),deleteMany:query=>hold('delete',()=>prisma.chatMessage.deleteMany(query))}};
   const route=load('app/api/chat/route.ts',{'next/server':{NextResponse:Response},'@/auth':{auth:async()=>({user:{email:owner.email}})},'@/lib/prisma':{prisma:db},'@/lib/plans':{getUserPlan:async()=>'free',getLimits:()=>({chatMessagesPerDay:5}),isPaid:()=>false},'@/lib/ai/task-runtime':{getMessagesTask:async()=>({create:()=>hold('create',async()=>({content:[{text:'Original synthetic task answer'}]}))})}},{performance:{now:()=>now},setTimeout(fn){const id={};timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)});
   const original=route.POST(new Request('https://example.invalid/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'Original question',lang:'es'}),signal:controller.signal}));await entered.promise;
   const before=await prisma.chatMessage.findMany({where:{userId:owner.id},orderBy:{id:'asc'}}),callsBefore=[...calls];
   if(index%2===0){now=55000;for(const fn of [...timers.values()])fn();}else controller.abort();
   const response=await original;assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'chat_send_unconfirmed'});assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(timers.size,0);
   ack.resolve();await Promise.all(owned);if(held==='create')await saveDone.promise;await Promise.all(owned);await flush();
   assert.equal(response.status,503);assert.equal(calls.filter(x=>x==='throttle').length,1);assert.equal(calls.filter(x=>x==='daily').length,held==='throttle'?0:1);assert.equal(Number((await prisma.$queryRaw`SELECT hits FROM rate_limits WHERE key=${'chat_throttle:'+owner.id}`)[0].hits),1);
   const daily=await prisma.$queryRaw`SELECT hits FROM rate_limits WHERE key=${'chat_day:'+owner.id}`;assert.equal(daily.length,held==='throttle'?0:1);if(daily.length)assert.equal(Number(daily[0].hits),1);
   const after=await prisma.chatMessage.findMany({where:{userId:owner.id},orderBy:{id:'asc'}});assert.deepEqual(await prisma.chatMessage.findMany({where:{userId:neighbor.id}}),neighborBefore);
   if(held==='throttle'||held==='daily'){
    assert.deepEqual(calls,callsBefore);assert.deepEqual(after,before);assert.equal(after.length,51);assert(!calls.includes('create'));assert(!calls.includes('save'));
   }else{
    assert.equal(calls.filter(x=>x==='create').length,1);assert.equal(calls.filter(x=>x==='save').length,1);assert.equal(after.filter(x=>x.content==='Original question').length,1);assert.equal(after.filter(x=>x.content==='Original synthetic task answer').length,1);
    assert.equal(after.length,held==='delete'?50:53);if(held!=='create')assert.deepEqual(after,before);
    if(held==='create'||held==='save'){assert(!calls.includes('prune'));assert(!calls.includes('delete'));assert(after.some(x=>x.id===old[0].id));}
    if(held==='prune'){assert(!calls.includes('delete'));assert(after.some(x=>x.id===old[0].id));}
    if(held==='delete'){assert.equal(calls.filter(x=>x==='delete').length,1);assert(!after.some(x=>x.id===old[0].id));}
   }
   results.push('chat POST original '+held+' '+(index%2===0?'55s deadline':'HTTP abort')+': HTTP503/no-store; actual PostgreSQL quota/history/pruning acknowledged only by original, no repeated write or task, no later prerequisite effect, neighboring account intact (auth/task/HTTP/clock synthetic; no AI or recovery authority)');
  }
 }finally{
  for(const user of users)for(const prefix of ['chat_throttle:','chat_day:'])await prisma.$executeRaw`DELETE FROM rate_limits WHERE key=${prefix+user.id}`;
  await prisma.user.deleteMany({where:{id:{in:users.map(u=>u.id)}}});
 }
};
