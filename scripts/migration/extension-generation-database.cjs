'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),{load}=require('./route-harness.cjs'),{worker,client,input}=require('./extension-generation-harness.cjs');
module.exports=async function(prisma,results){
 const users=await Promise.all([1,2].map(i=>prisma.user.create({data:{email:'extension-operation-'+crypto.randomUUID()+'@example.invalid',name:'Synthetic extension '+i}})));
 const plans=load('lib/plans.ts',{'@/lib/prisma':{prisma}}),{TEMPLATES}=load('utils/prompts.js');let models=0;
 const route=load('app/api/generate/route.ts',{'node:crypto':crypto,'@/auth':{auth:async()=>null},'@/lib/extension-auth':{getExtensionUser:async request=>{const token=request.headers.get('Authorization');const user=token==='Bearer synthetic-token'?users[0]:token==='Bearer other-token'?users[1]:null;return user?{user,isPro:false}:null;}},'@/lib/prisma':{prisma},'@/lib/plans':plans,'@/utils/prompts':{TEMPLATES},'@/lib/channel-context':{getChannelContext:async()=>null},'@/lib/lifecycle-trigger':{triggerConversionEmail:async()=>{}},'@/lib/ai/task-runtime':{getMessagesTask:async()=>({create:async()=>{models++;return{content:[{text:'Synthetic own extension output'}],usage:{output_tokens:8},stop_reason:'end_turn'};}})}});
 const w=worker({fetch:async(url,init)=>{assert.equal(url,'https://ytubviral.com/api/generate');return route.POST(new Request('https://example.invalid/api/generate',init));}}),c=client(w,{drop:true});
 try{
  await assert.rejects(c.send(input()),/generation_unconfirmed/);assert.equal(models,1);assert.equal(await prisma.generation.count({where:{userId:users[0].id}}),1);
  await prisma.generation.createMany({data:Array.from({length:9},(_,i)=>({userId:users[0].id,template:'title',inputs:{},output:'Synthetic quota row '+i,tokensUsed:0}))});
  const before=(await prisma.$queryRawUnsafe('SELECT hits FROM rate_limits WHERE key=$1','generate:'+users[0].id))[0];assert.equal(Number(before.hits),1);
  const retry=await c.send(input());assert.equal(retry.content,'Synthetic own extension output');assert.equal(models,1);assert.equal(await prisma.generation.count({where:{userId:users[0].id}}),10);assert.equal(w.calls[0].init.headers['Idempotency-Key'],w.calls[1].init.headers['Idempotency-Key']);
  const after=(await prisma.$queryRawUnsafe('SELECT hits FROM rate_limits WHERE key=$1','generate:'+users[0].id))[0];assert.equal(Number(after.hits),1);
  await assert.rejects(c.send(input()),/quota_free/);assert.equal(models,1);
  w.switchToken('other-token');await assert.rejects(c.send(input()),/generation_context_changed/);assert.equal(await prisma.generation.count({where:{userId:users[1].id}}),0);
  c.discard();assert.equal((await c.send(input())).content,'Synthetic own extension output');assert.equal(models,2);assert.equal(await prisma.generation.count({where:{userId:users[1].id}}),1);
  results.push('original extension content/worker to original generate API and real PostgreSQL: lost content ack replays same owned row/key before exhausted free quota, no second synthetic model or rate hit; fresh action hits quota; account switch blocks retained attempt before another owner effect, explicit local discard creates a fresh separately owned operation');
 }finally{for(const user of users)await prisma.$executeRawUnsafe('DELETE FROM rate_limits WHERE key=$1','generate:'+user.id);await prisma.user.deleteMany({where:{id:{in:users.map(u=>u.id)}}});}
};
