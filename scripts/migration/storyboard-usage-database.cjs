'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),{load}=require('./route-harness.cjs');
module.exports=async function(prisma,results){
 const users=await Promise.all(Array.from({length:4},()=>prisma.user.create({data:{email:'storyboard-usage-'+crypto.randomUUID()+'@example.invalid'}})));
 const plans=load('lib/plans.ts',{'@/lib/prisma':{prisma}}),quota=require('./generation-quota-fixture.cjs')(prisma);
 try{
  await prisma.subscription.createMany({data:users.slice(2).map(user=>({userId:user.id,plan:'pro',status:'active',stripeCustomerId:'manual_admin',currentPeriodEnd:new Date(Date.now()+86400000)}))});
  for(let i=0;i<4;i++){
   const user=users[i],paid=i>=2,keyed=i%2===1;let currentUser=user,reply,models=0;
   const route=load('app/api/storyboard/route.ts',{'@/lib/text-generation-attempt':require('./text-generation-attempt-fixture.cjs')(prisma),'next/server':{NextResponse:Response},'node:crypto':crypto,'@/auth':{auth:async()=>({user:{id:currentUser.id}})},'@/lib/prisma':{prisma},'@/lib/plans':plans,'@/lib/generation-quota':quota,'@/lib/ai/task-runtime':{getMessagesTask:async()=>({create:async()=>{models++;return reply;}})}});
   const request=key=>new Request('https://example.invalid/api/storyboard',{method:'POST',headers:{'content-type':'application/json',...(keyed?{'Idempotency-Key':key}:{})},body:JSON.stringify({script:'Synthetic usage',lang:'en'})});
   let n=0;for(const candidate of [{},{usage:{}},{usage:{output_tokens:null}},...[-1,0.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1].map(output_tokens=>({usage:{output_tokens}})),{content:[{text:' '}],usage:{output_tokens:4}},{incomplete:true,usage:{output_tokens:4}}]){
    if(!paid&&!keyed&&n>0){currentUser=await prisma.user.create({data:{email:'storyboard-usage-fresh-'+crypto.randomUUID()+'@example.invalid'}});users.push(currentUser);}
    await prisma.$executeRawUnsafe('DELETE FROM rate_limits WHERE key=$1','storyboard:'+currentUser.id);
    reply={content:[{text:'Synthetic storyboard'}],...candidate};const response=await route.POST(request('invalid-'+n)),body=await response.json();n++;
    assert.equal(response.status,502);assert.deepEqual(body,{error:'Storyboard result unavailable'});assert.equal(models,n);assert.equal(await prisma.generation.count({where:{userId:currentUser.id}}),0);
    if(!keyed){assert.equal(await prisma.textGenerationAttempt.count({where:{userId:currentUser.id,state:'pending'}}),paid?n:1);if(!paid){const capped=await route.POST(request('same-owner-cap'));assert.equal(capped.status,429);assert.equal((await capped.json()).videoTipsCapped,true);assert.equal(models,n);}}
   }
   if(!paid&&!keyed){currentUser=await prisma.user.create({data:{email:'storyboard-usage-positive-'+crypto.randomUUID()+'@example.invalid'}});users.push(currentUser);}
   await prisma.$executeRawUnsafe('DELETE FROM rate_limits WHERE key=$1','storyboard:'+currentUser.id);
   reply={content:[{text:'Synthetic measured zero'}],usage:{output_tokens:0}};const response=await route.POST(request('measured-zero'));assert.equal(response.status,200);assert.deepEqual(await response.json(),{storyboard:'Synthetic measured zero'});assert.equal(models,n+1);
   const row=await prisma.generation.findFirst({where:{userId:currentUser.id}});assert.equal(row.userId,currentUser.id);assert.equal(row.template,'video_preview');assert.equal(row.tokensUsed,0);assert.equal(await prisma.generation.count({where:{userId:currentUser.id}}),1);
   if(keyed){const replay=await route.POST(request('measured-zero'));assert.equal(replay.status,200);assert.equal(models,n+1);assert.equal(await prisma.generation.count({where:{userId:currentUser.id}}),1);}
   else if(!paid){const capped=await route.POST(request('free-cap'));assert.equal(capped.status,429);assert.equal((await capped.json()).videoTipsCapped,true);assert.equal(models,n+1);}
   results.push('native original '+(paid?'paid':'free')+' '+(keyed?'keyed':'keyless')+' Storyboard rejects ten unknown/invalid usage, empty and incomplete replies before real history; measured zero saved once with exact owner and Video Tips template; '+(keyed?'business replay precedes further inference':paid?'original paid entitlement retained':'original Free Video Tips cap retained')+'; keyless fresh admission retains all unknown reservations; Free variants use distinct fixture owners and same-owner cap blocks further models without resetting pending rows');
  }
 }finally{for(const user of users)await prisma.$executeRawUnsafe('DELETE FROM rate_limits WHERE key=$1','storyboard:'+user.id);await prisma.user.deleteMany({where:{id:{in:users.map(x=>x.id)}}});}
};
