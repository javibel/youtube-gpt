'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),{load}=require('./route-harness.cjs');
module.exports=async function(prisma,results){
 const users=await Promise.all(Array.from({length:4},()=>prisma.user.create({data:{email:'storyboard-usage-'+crypto.randomUUID()+'@example.invalid'}})));
 const plans=load('lib/plans.ts',{'@/lib/prisma':{prisma}}),quota=require('./generation-quota-fixture.cjs')(prisma);
 try{
  await prisma.subscription.createMany({data:users.slice(2).map(user=>({userId:user.id,plan:'pro',status:'active',stripeCustomerId:'manual_admin',currentPeriodEnd:new Date(Date.now()+86400000)}))});

  {
   const user=await prisma.user.create({data:{email:'storyboard-confirmed-reload-'+crypto.randomUUID()+'@example.invalid'}});users.push(user);
   let models=0;const story='0s-6s: HOOK | A creator opens a notebook\n6s-12s: IDEA | A creator draws a simple outline';
   const route=load('app/api/storyboard/route.ts',{'@/lib/text-generation-attempt':require('./text-generation-attempt-fixture.cjs')(prisma),'next/server':{NextResponse:Response},'node:crypto':crypto,'@/auth':{auth:async()=>({user:{id:user.id}})},'@/lib/prisma':{prisma},'@/lib/plans':plans,'@/lib/generation-quota':quota,'@/lib/ai/task-runtime':{getMessagesTask:async()=>({create:async()=>{models++;return {content:[{text:story}],usage:{output_tokens:5}};}})}});
   const {harness}=require('./storyboard-client-retry.test.cjs'),invoke=init=>route.POST(new Request('https://example.invalid/api/storyboard',init));
   const a=harness({user:user.id,email:user.email,generationId:'confirmed-reload-native',send:invoke});await a.click();assert.equal(models,1);assert.equal(a.recorders.length,1);assert.equal(a.storage.size,1);const original=a.requests[0],generations=await prisma.generation.findMany({where:{userId:user.id},orderBy:{id:'asc'}}),attempts=await prisma.textGenerationAttempt.findMany({where:{userId:user.id},orderBy:{id:'asc'}});assert.equal(generations.length,1);assert.equal(attempts.length,1);assert.equal(attempts[0].state,'complete');a.unmount();
   const b=harness({user:user.id,email:user.email,generationId:'confirmed-reload-native',storage:a.storage,send:invoke});b.render();assert.equal(b.requests.length,0);assert.equal(b.recorders.length,0);assert.deepEqual(b.callbacks,[]);await b.click();assert.equal(b.requests[0].headers['Idempotency-Key'],original.headers['Idempotency-Key']);assert.equal(b.requests[0].headers['X-Storyboard-Recovery'],'retained-only-v1');assert.equal(b.requests[0].body,original.body);assert.equal(models,1);assert.equal(b.recorders.length,1);assert.deepEqual(b.callbacks,['generated']);assert.deepEqual(await prisma.generation.findMany({where:{userId:user.id},orderBy:{id:'asc'}}),generations);assert.deepEqual(await prisma.textGenerationAttempt.findMany({where:{userId:user.id},orderBy:{id:'asc'}}),attempts);b.unmount();results.push('actual component/API/PostgreSQL confirmed free Storyboard survives same-tab reload as explicit retained-only query; original key/body/result/history/admission unchanged, no second mock model call or credit admission even after Free Video Tips cap');
  }

  {
   const user=await prisma.user.create({data:{email:'storyboard-multiple-'+crypto.randomUUID()+'@example.invalid'}});users.push(user);
   await prisma.subscription.create({data:{userId:user.id,plan:'pro',status:'active',stripeCustomerId:'manual_admin',currentPeriodEnd:new Date(Date.now()+86400000)}});
   let models=0;const story='0s-6s: HOOK | A creator opens a notebook\n6s-12s: IDEA | A creator draws a simple outline';
   const route=load('app/api/storyboard/route.ts',{'@/lib/text-generation-attempt':require('./text-generation-attempt-fixture.cjs')(prisma),'next/server':{NextResponse:Response},'node:crypto':crypto,'@/auth':{auth:async()=>({user:{id:user.id}})},'@/lib/prisma':{prisma},'@/lib/plans':plans,'@/lib/generation-quota':quota,'@/lib/ai/task-runtime':{getMessagesTask:async()=>({create:async()=>{models++;return {content:[{text:story}],usage:{output_tokens:5}};}})}});
   const {harness}=require('./storyboard-client-retry.test.cjs'),invoke=init=>route.POST(new Request('https://example.invalid/api/storyboard',init)),storage=new Map(),originals=[];
   for(const id of ['first','second']){const h=harness({user:user.id,email:user.email,storage,generationId:id,scriptContent:'Native script '+id,scriptTitle:'Native title '+id,send:invoke});await h.click();assert.equal(h.recorders.length,1);originals.push(h.requests[0]);h.unmount();}
   assert.equal(models,2);assert.equal(storage.size,2);const generations=await prisma.generation.findMany({where:{userId:user.id},orderBy:{id:'asc'}}),attempts=await prisma.textGenerationAttempt.findMany({where:{userId:user.id},orderBy:{id:'asc'}});assert.equal(generations.length,2);assert.equal(attempts.length,2);assert(attempts.every(a=>a.state==='complete'));
   for(const [i,id]of ['first','second'].entries()){const h=harness({user:user.id,email:user.email,storage,generationId:id,scriptContent:'Native script '+id,scriptTitle:'Native title '+id,send:invoke});h.render();assert.equal(h.requests.length,0);assert.equal(h.recorders.length,0);await h.click();assert.equal(h.requests[0].headers['Idempotency-Key'],originals[i].headers['Idempotency-Key']);assert.equal(h.requests[0].body,originals[i].body);assert.equal(h.requests[0].headers['X-Storyboard-Recovery'],'retained-only-v1');assert.equal(h.recorders.length,1);assert.equal(models,2);assert.deepEqual(await prisma.generation.findMany({where:{userId:user.id},orderBy:{id:'asc'}}),generations);assert.deepEqual(await prisma.textGenerationAttempt.findMany({where:{userId:user.id},orderBy:{id:'asc'}}),attempts);h.unmount();}
   results.push('actual component/API/PostgreSQL two original Storyboards remain selectable in one tab; explicit reload queries original keys and exact bodies with unchanged two histories, admissions and mock inference count; no new credit or model call');
  }
  for(let i=0;i<4;i++){
   const user=users[i],paid=i>=2,keyed=i%2===1;let currentUser=user,reply,models=0;
   const route=load('app/api/storyboard/route.ts',{'@/lib/text-generation-attempt':require('./text-generation-attempt-fixture.cjs')(prisma),'next/server':{NextResponse:Response},'node:crypto':crypto,'@/auth':{auth:async()=>({user:{id:currentUser.id}})},'@/lib/prisma':{prisma},'@/lib/plans':plans,'@/lib/generation-quota':quota,'@/lib/ai/task-runtime':{getMessagesTask:async()=>({create:async()=>{models++;return reply;}})}});
   const request=key=>new Request('https://example.invalid/api/storyboard',{method:'POST',headers:{'content-type':'application/json',...(keyed?{'Idempotency-Key':key}:{})},body:JSON.stringify({script:'Synthetic usage',lang:'en'})});
   let n=0;for(const candidate of [{},{usage:{}},{usage:{output_tokens:null}},...[-1,0.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1].map(output_tokens=>({usage:{output_tokens}})),{content:[{text:' '}],usage:{output_tokens:4}},{incomplete:true,usage:{output_tokens:4}}]){
    if(!paid&&n>0){currentUser=await prisma.user.create({data:{email:'storyboard-usage-fresh-'+crypto.randomUUID()+'@example.invalid'}});users.push(currentUser);}
    await prisma.$executeRawUnsafe('DELETE FROM rate_limits WHERE key=$1','storyboard:'+currentUser.id);
    reply={content:[{text:'Synthetic storyboard'}],...candidate};const response=await route.POST(request('invalid-'+n)),body=await response.json();n++;
    assert.equal(response.status,502);assert.deepEqual(body,{error:'Storyboard result unavailable'});assert.equal(models,n);assert.equal(await prisma.generation.count({where:{userId:currentUser.id}}),0);
    assert.equal(await prisma.textGenerationAttempt.count({where:{userId:currentUser.id,state:'pending'}}),paid?n:1);
    if(keyed){assert.equal((await route.POST(request('invalid-'+(n-1)))).status,503);assert.equal(models,n);}
    if(!paid){const capped=await route.POST(request('same-owner-cap'));assert.equal(capped.status,429);assert.equal((await capped.json()).videoTipsCapped,true);assert.equal(models,n);}
   }
   if(!paid){currentUser=await prisma.user.create({data:{email:'storyboard-usage-positive-'+crypto.randomUUID()+'@example.invalid'}});users.push(currentUser);}
   await prisma.$executeRawUnsafe('DELETE FROM rate_limits WHERE key=$1','storyboard:'+currentUser.id);
   reply={content:[{text:'Synthetic measured zero'}],usage:{output_tokens:0}};const response=await route.POST(request('measured-zero'));assert.equal(response.status,200);assert.deepEqual(await response.json(),{storyboard:'Synthetic measured zero'});assert.equal(models,n+1);
   const row=await prisma.generation.findFirst({where:{userId:currentUser.id}});assert.equal(row.userId,currentUser.id);assert.equal(row.template,'video_preview');assert.equal(row.tokensUsed,0);assert.equal(await prisma.generation.count({where:{userId:currentUser.id}}),1);
   if(keyed){const replay=await route.POST(request('measured-zero'));assert.equal(replay.status,200);assert.equal(models,n+1);assert.equal(await prisma.generation.count({where:{userId:currentUser.id}}),1);}
   else if(!paid){const capped=await route.POST(request('free-cap'));assert.equal(capped.status,429);assert.equal((await capped.json()).videoTipsCapped,true);assert.equal(models,n+1);}
   assert.equal(await prisma.textGenerationAttempt.count({where:{userId:currentUser.id,state:'complete'}}),1);
   results.push('native original '+(paid?'paid':'free')+' '+(keyed?'keyed':'keyless')+' Storyboard rejects ten unknown/invalid usage, empty and incomplete replies before real history; measured zero saved once with exact owner and Video Tips template; '+(keyed?'business replay precedes further inference; unknown same-key retry without retrieve is503 with zero new model calls':paid?'original paid entitlement retained':'original Free Video Tips cap retained')+'; fresh admission retains all unknown reservations; Free variants use distinct fixture owners and same-owner cap blocks further models without resetting pending rows');
  }
 }finally{for(const user of users)await prisma.$executeRawUnsafe('DELETE FROM rate_limits WHERE key=$1','storyboard:'+user.id);await prisma.user.deleteMany({where:{id:{in:users.map(x=>x.id)}}});}
};
