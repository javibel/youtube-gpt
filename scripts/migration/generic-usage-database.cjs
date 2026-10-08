'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),{load}=require('./route-harness.cjs');
module.exports=async function(prisma,results){
 const users=await Promise.all(Array.from({length:4},()=>prisma.user.create({data:{email:'generic-usage-'+crypto.randomUUID()+'@example.invalid'}})));
 const plans=load('lib/plans.ts',{'@/lib/prisma':{prisma}}),quota=require('./generation-quota-fixture.cjs')(prisma),{TEMPLATES}=load('utils/prompts.js');
 try{
  await prisma.subscription.createMany({data:users.map(user=>({userId:user.id,plan:'pro',status:'active',stripeCustomerId:'manual_admin',currentPeriodEnd:new Date(Date.now()+86400000)}))});
  for(let i=0;i<users.length;i++){
   const user=users[i],extension=i>=2,keyed=i%2===1;let reply,models=0;
   const route=load('app/api/generate/route.ts',{'node:crypto':crypto,'@/auth':{auth:async()=>extension?null:{user:{id:user.id,email:user.email}}},'@/lib/extension-auth':{getExtensionUser:async()=>extension?{user,isPro:true}:null},'@/lib/prisma':{prisma},'@/lib/plans':plans,'@/lib/generation-quota':quota,'@/lib/text-generation-attempt':require('./text-generation-attempt-fixture.cjs')(prisma,plans),'@/utils/prompts':{TEMPLATES},'@/lib/channel-context':{getChannelContext:async()=>null},'@/lib/lifecycle-trigger':{triggerConversionEmail:async()=>{}},'@/lib/ai/task-runtime':{getMessagesTask:async()=>({create:async()=>{models++;return reply;}})}});
   const request=key=>new Request('https://example.invalid/api/generate',{method:'POST',headers:{'content-type':'application/json',...(keyed?{'Idempotency-Key':key}:{})},body:JSON.stringify({template:'title',inputs:{tema:'Synthetic usage'},lang:'en'})});
   let n=0;for(const candidate of [{},{usage:{}},{usage:{output_tokens:null}},{incomplete:true}]){
    reply={content:[{text:'Unknown usage'}],...candidate};const response=await route.POST(request('unknown-'+n)),body=await response.json();n++;
    assert.equal(response.status,502);assert.deepEqual(body,{error:'Generation result unavailable'});assert.equal(models,n);assert.equal(await prisma.generation.count({where:{userId:user.id}}),0);assert.equal(await prisma.textGenerationAttempt.count({where:{userId:user.id,state:'pending'}}),keyed?0:n);
   }
   reply={content:[{text:'Synthetic measured zero'}],usage:{output_tokens:0}};const response=await route.POST(request('measured-zero'));assert.equal(response.status,200);assert.deepEqual(await response.json(),{content:'Synthetic measured zero',truncated:false});assert.equal(models,5);
   const row=await prisma.generation.findFirst({where:{userId:user.id}});assert.equal(row.userId,user.id);assert.equal(await prisma.generation.count({where:{userId:user.id}}),1);assert.equal(row.tokensUsed,0);assert.equal(row.output,'Synthetic measured zero');assert.equal(await prisma.textGenerationAttempt.count({where:{userId:user.id,state:'pending'}}),keyed?0:4);assert.equal(await prisma.textGenerationAttempt.count({where:{userId:user.id,state:'complete'}}),keyed?0:1);
   if(keyed){const replay=await route.POST(request('measured-zero'));assert.equal(replay.status,200);assert.equal(models,5);assert.equal(await prisma.generation.count({where:{userId:user.id}}),1);}
   results.push('native original '+(extension?'extension':'web')+' '+(keyed?'keyed':'keyless')+' generic text rejects absent/empty/null and partial unknown usage with502 and zero history; '+(keyed?'explicit measured zero saved once and business replay precedes another model; durable keyed admission still pending':'uncertain replies retain four real pending quota slots; explicit measured zero atomically completes one separate slot')+'; exact owner retained');
  }
 }finally{for(const user of users)await prisma.$executeRawUnsafe('DELETE FROM rate_limits WHERE key=$1','generate:'+user.id);await prisma.user.deleteMany({where:{id:{in:users.map(x=>x.id)}}});}
};
