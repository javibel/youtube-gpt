'use strict';
// Creation cases using ab-create-legacy-http-fixture exercise only the shared
// producer/metadata/deadline contract. Native POST authority is independently
// exercised by ab-create-native and ab-create-native-pg with the actual cookie.
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),path=require('node:path'),{execFile}=require('node:child_process');
const fixture=require('./ab-creation-fixture.cjs');
async function within(p,label){let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Missing native '+label)),10000);})]);}finally{clearTimeout(timer);}}
module.exports=async(prisma,results)=>{
 const owners=[],originals=[],harnesses=[];
 async function owner(name,plan='pro'){
  const user=await prisma.user.create({data:{email:'ab-admission-'+name+'-'+randomUUID()+'@example.invalid'}});owners.push(user);
  if(plan!=='free')await prisma.subscription.create({data:{userId:user.id,status:'active',plan,stripeCustomerId:'manual_admin',currentPeriodEnd:new Date(Date.now()+86400000)}});
  return user;
 }
 const video=name=>'synthetic-admission-'+name,make=(u,options)=>{const h=fixture(prisma,u,options);harnesses.push(h);return h;},track=p=>{originals.push(p);void p.catch(()=>{});return p;};
 async function rows(u){return{tests:await prisma.abTest.findMany({where:{userId:u.id}}),attempts:await prisma.abTestCreationAttempt.findMany({where:{userId:u.id}})};}
 async function blocked(u,v){const h=make(u),r=await h.create(v);assert.deepEqual(JSON.parse(JSON.stringify(r)),{ok:false,status:503,error:'ab_creation_unconfirmed'});assert.equal(h.puts.length,0);}
 async function child(u,v,mode){const allowed=new Set(['PATH','SystemRoot','ComSpec','PATHEXT','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA']),env=Object.fromEntries(Object.entries(process.env).filter(([k])=>allowed.has(k)));return within(new Promise((resolve,reject)=>execFile(process.execPath,[path.join(__dirname,'ab-creation-native-child.cjs'),u.id,v,mode],{cwd:path.resolve(__dirname,'../..'),env,windowsHide:true,timeout:20000},(error,stdout,stderr)=>{
  if(mode==='interrupt'){if(error?.code!==72)return reject(Error('Missing original native interruption: '+stderr));return resolve({exitCode:72});}
  if(error)return reject(Error('Native fresh admission failed: '+stderr));try{resolve(JSON.parse(stdout));}catch(e){reject(e);}
 })),'child '+mode);}
 async function test(name,fn){await fn();results.push('A/B durable admission '+name+': actual shared helper/Pro plan/PostgreSQL transactions; synthetic auth/title only; no recovery, operational authority or quota release');}
 try{
  const neighbor=await owner('neighbor'),neighborTest=await prisma.abTest.create({data:{userId:neighbor.id,videoId:video('neighbor'),originalTitle:'Neighbor original',variantA:'Neighbor A',variantB:'Neighbor B'}});
  const neighborAttempt=await prisma.abTestCreationAttempt.create({data:{id:randomUUID(),userId:neighbor.id,videoId:video('neighbor-held')}});
  const subscription=await prisma.subscription.findUnique({where:{userId:neighbor.id}});
  await prisma.generation.create({data:{userId:neighbor.id,template:'title',inputs:{},output:'Neighbor synthetic',tokensUsed:0}});const generations=await prisma.generation.findMany({where:{userId:neighbor.id}});
  await test('web and extension race on one video admits one original title',async()=>{
   const u=await owner('same-video'),v=video('same-video'),h=make(u,{holdTitle:true}),original=track(h.web(v));await within(h.entered.promise,'first title');
   const second=make(u),response=await second.extensionCreate(v);assert.equal(response.status,503);assert.equal(second.puts.length,0);let saved=await rows(u);assert.equal(saved.tests.length,0);assert.equal(saved.attempts.length,1);assert.equal(saved.attempts[0].state,'pending');
   h.release();assert.equal((await within(original,'web completion')).status,201);saved=await rows(u);assert.equal(saved.tests.length,1);assert.equal(saved.attempts[0].state,'complete');assert.equal(saved.attempts[0].testId,saved.tests[0].id);assert.equal(h.puts.length,1);
  });
  await test('last Pro capacity is reserved before title acknowledgement',async()=>{
   const u=await owner('last-slot');await prisma.abTest.createMany({data:[0,1].map(i=>({userId:u.id,videoId:video('existing-'+i),originalTitle:'Existing',variantA:'A',variantB:'B'}))});
   const h=make(u,{holdTitle:true}),original=track(h.create(video('last-slot')));await within(h.entered.promise,'last capacity title');const second=make(u),r=await second.create(video('overflow'));assert.deepEqual(JSON.parse(JSON.stringify(r)),{ok:false,status:400,error:'max_active_tests',limit:3});assert.equal(second.puts.length,0);h.release();assert.equal((await original).status,201);assert.equal((await rows(u)).tests.length,3);
  });
  await test('five parallel distinct videos never exceed Pro capacity three',async()=>{
   const u=await owner('five-race'),hs=Array.from({length:5},()=>make(u,{holdTitle:true})),ps=hs.map((h,i)=>track(h.create(video('parallel-'+i))));
   await within((async()=>{while(await prisma.abTestCreationAttempt.count({where:{userId:u.id}})<3)await new Promise(r=>setTimeout(r,10));})(),'three admissions');
   const saved=await rows(u);assert.equal(saved.tests.length,0);assert.equal(saved.attempts.length,3);hs.forEach(h=>h.release());const replies=await Promise.all(ps);assert.equal(replies.filter(r=>r.status===201).length,3);assert.equal(replies.filter(r=>r.error==='max_active_tests').length,2);assert.equal(hs.reduce((n,h)=>n+h.puts.length,0),3);assert.equal((await rows(u)).tests.length,3);
  });
  for(const reason of ['deadline','abort'])await test(reason+' retires HTTP; a fresh native process cannot take over the pending title',async()=>{
   const u=await owner('native-'+reason),v=video(reason),h=make(u,{holdTitle:true}),controller=new AbortController(),original=track(h.web(v,controller.signal));await within(h.entered.promise,'held native title');if(reason==='abort')controller.abort();else h.expire();
   const response=await original;assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'ab_mutation_unconfirmed'});assert.equal(h.timers.size,0);
   const separate=await child(u,v,'fresh');assert.equal(separate.status,'TERMINAL');assert.equal(separate.result.error,'ab_creation_unconfirmed');assert.equal(separate.puts,0);
   h.release();await within(h.settled(),'original persistence');assert.equal((await rows(u)).attempts[0].state,'complete');assert.equal(response.status,503);assert.equal(h.puts.length,1);
  });
  for(const options of [{titleStatus:403},{titleThrows:true}])await test('original title failure '+JSON.stringify(options)+' preserves exclusive pending capacity',async()=>{
   const u=await owner('title-failure'),v=video('title-failure'),h=make(u,options),r=await h.create(v);assert.equal(r.status,options.titleStatus?403:503);assert.equal(h.puts.length,1);const saved=await rows(u);assert.equal(saved.tests.length,0);assert.equal(saved.attempts[0].state,'pending');await blocked(u,v);
  });
  await test('completion failure rolls back test and leaves original reservation held',async()=>{
   const u=await owner('completion-failure'),v=video('completion-failure'),h=make(u,{completionFails:true});assert.equal((await h.create(v)).status,503);const saved=await rows(u);assert.equal(saved.tests.length,0);assert.equal(saved.attempts[0].state,'pending');assert.equal(h.puts.length,1);await blocked(u,v);
  });
  await test('lost admission commit acknowledgement starts no title and cannot be recovered by reading a row',async()=>{
   const u=await owner('ack-lost'),v=video('ack-lost'),h=make(u,{admissionAcknowledgement(){throw Error('Synthetic commit acknowledgement loss');}});assert.equal((await h.create(v)).status,503);assert.equal(h.puts.length,0);assert.equal((await rows(u)).attempts[0].state,'pending');await blocked(u,v);
  });
  await test('late acknowledged admission cannot begin title after original waiter deadline',async()=>{
   const u=await owner('late-admission'),v=video('late-admission'),h=make(u,{admissionAcknowledgement(){h.expire();}}),r=await h.web(v);assert.equal(r.status,503);assert.equal(h.puts.length,0);await blocked(u,v);
  });
  await test('lost completion commit acknowledgement remains unconfirmed and never replays the title',async()=>{
   const u=await owner('completion-ack-lost'),v=video('completion-ack-lost'),h=make(u,{completionAcknowledgement(){throw Error('Synthetic completion acknowledgement loss');}});assert.equal((await h.create(v)).status,503);const saved=await rows(u);assert.equal(saved.tests.length,1);assert.equal(saved.attempts[0].state,'complete');assert.equal(h.puts.length,1);const fresh=make(u);assert.equal((await fresh.create(v)).error,'active_test_exists');assert.equal(fresh.puts.length,0);assert.deepEqual(await rows(u),saved);
  });
  await test('expired guard inside original transaction rolls back unused reservation',async()=>{
   const u=await owner('rollback-admission'),v=video('rollback-admission');let retired=false;const h=make(u,{afterReservation(){retired=true;}}),r=await h.helper.createAbTest(u.id,h.input(v),()=>{if(retired)throw Error('Synthetic original deadline');});assert.equal(r.status,503);assert.equal(h.puts.length,0);assert.equal((await rows(u)).attempts.length,0);
  });
  await test('original native process interruption is durable denial across a separate fresh process',async()=>{
   const u=await owner('process-loss'),v=video('process-loss'),interruption=await child(u,v,'interrupt');assert.equal(interruption.exitCode,72);const saved=await rows(u);assert.equal(saved.tests.length,0);assert.equal(saved.attempts[0].state,'pending');const fresh=await child(u,v,'fresh');assert.equal(fresh.result.error,'ab_creation_unconfirmed');assert.equal(fresh.puts,0);assert.deepEqual(await rows(u),saved);
  });
  await test('Free plan, invalid input and missing category admit no capacity or title',async()=>{
   const free=await owner('free','free'),h=make(free);assert.equal((await h.create(video('free'))).status,403);assert.equal(h.puts.length,0);assert.equal((await rows(free)).attempts.length,0);
   const u=await owner('invalid'),invalid=make(u);assert.equal((await invalid.helper.createAbTest(u.id,{...invalid.input(video('invalid')),hoursPerVariant:NaN})).status,400);assert.equal((await invalid.helper.createAbTest(u.id,{...invalid.input(video('invalid')),hoursPerVariant:48.5})).status,400);const category=make(u,{invalidCategory:true});assert.equal((await category.create(video('invalid'))).status,503);assert.equal(invalid.puts.length+category.puts.length,0);assert.equal((await rows(u)).attempts.length,0);
  });
  await test('complete reservation is never replayed and a cancelled test permits a fresh original admission',async()=>{
   const u=await owner('fresh-after-cancel'),v=video('fresh-after-cancel'),h=make(u),first=await h.create(v);assert.equal(first.status,201);const other=make(u);assert.equal((await other.create(v)).error,'active_test_exists');assert.equal(other.puts.length,0);await prisma.abTest.update({where:{id:first.test.id},data:{status:'cancelled'}});assert.equal((await other.create(v)).status,201);const saved=await rows(u);assert.equal(saved.tests.length,2);assert.equal(saved.attempts.length,2);assert.equal(new Set(saved.attempts.map(r=>r.id)).size,2);assert(saved.attempts.every(r=>r.state==='complete'));assert.equal(h.puts.length+other.puts.length,2);
  });
  await test('neighbor records and subscription/generation accounting remain unchanged',async()=>{
   assert.deepEqual(await prisma.abTest.findUnique({where:{id:neighborTest.id}}),neighborTest);assert.deepEqual(await prisma.abTestCreationAttempt.findUnique({where:{id:neighborAttempt.id}}),neighborAttempt);assert.deepEqual(await prisma.subscription.findUnique({where:{userId:neighbor.id}}),subscription);assert.deepEqual(await prisma.generation.findMany({where:{userId:neighbor.id}}),generations);
  });
 }finally{harnesses.forEach(h=>h.release());await within(Promise.allSettled(originals),'original cleanup');await within(Promise.all(harnesses.map(h=>h.settled())),'all original producer results');await prisma.user.deleteMany({where:{id:{in:owners.map(u=>u.id)}}});}
};
