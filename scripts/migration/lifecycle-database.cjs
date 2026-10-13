'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{fixture,deferred}=require('./lifecycle-fixture.cjs');
module.exports=async(prisma,results)=>{
 const ids=[],retained=[],owned=[],releases=[],baseline={users:await prisma.user.count(),markers:await prisma.lifecycleEmailAdmission.count(),logs:await prisma.emailLog.count()};
 const seed=async(extra={})=>{const u=await prisma.user.create({data:{id:randomUUID(),email:'lifecycle-'+randomUUID()+'@example.invalid',name:'Synthetic',lang:'es',emailVerified:new Date(),createdAt:new Date(Date.now()-75*86400000),...extra}});ids.push(u.id);return u;};
 const marker=id=>prisma.lifecycleEmailAdmission.findUnique({where:{userId:id}});
 function instance(u,options={}){
  const native=options.prisma??prisma,h=fixture({prisma:native,account:u,...options});
  function dispatch(step='c3',seq='conv'){const o=h.api.prepareLifecycleOriginal(u.id,seq,step),p=h.api.dispatchLifecycleOriginal(o);owned.push(p);return p;}
  return{h,dispatch};
 }
 async function reach(fn,msg){for(let i=0;i<1000&&!fn();i++)await new Promise(r=>setTimeout(r,5));assert(fn(),msg);}
 try{
  const u=await seed();await prisma.generation.createMany({data:Array.from({length:16},()=>({userId:u.id,template:'synthetic',inputs:{},output:'synthetic',tokensUsed:0}))});
  const gate=deferred();releases.push(gate.resolve);const a=instance(u,{fetch:()=>gate.promise}),b=instance(u,{fetch:()=>gate.promise});let denied=0;
  const attempts=Array.from({length:20},(_,i)=>{const x=i%2?a:b,p=x.dispatch(['c1','c2','c3'][i%3]);p.then(v=>{if(v==='not-required')denied++;});return p;});
  await reach(()=>denied===19,'Nineteen native denials missing');assert.equal(a.h.mail.calls.length+b.h.mail.calls.length,1);assert(await marker(u.id));assert.equal(await prisma.emailLog.count({where:{userId:u.id,sequence:'conv'}}),0);
  gate.resolve(Response.json({id:'synthetic-own-ack'}));const outcomes=await Promise.all(attempts);assert.equal(outcomes.filter(x=>x==='provider-accepted').length,1);assert.equal(await marker(u.id),null);assert.equal(await prisma.emailLog.count({where:{userId:u.id,sequence:'conv'}}),1);
  results.push('Twenty native c1/c2/c3 originals in two modules: one issued HTTP/accepted log; nineteen excluded while native HTTP waits.');
  // Real waiter starts before the first owner commits its log; fresh post-lock snapshot is required.
  const race=await seed(),firstGate=deferred();releases.push(firstGate.resolve);const first=instance(race,{fetch:()=>firstGate.promise}),p=first.dispatch();await reach(()=>first.h.mail.calls.length===1,'First native HTTP missing');
  const locked=deferred(),unlock=deferred();releases.push(unlock.resolve);
  const blocker=prisma.$transaction(async tx=>{await tx.$queryRawUnsafe('SELECT id FROM users WHERE id=$1 FOR UPDATE',race.id);locked.resolve();await unlock.promise;},{timeout:10000});owned.push(blocker);await locked.promise;
  firstGate.resolve(Response.json({id:'own-before-waiter'}));await new Promise(r=>setTimeout(r,40));const second=instance(race),q=second.dispatch('c1');await new Promise(r=>setTimeout(r,40));unlock.resolve();await blocker;assert.equal(await p,'provider-accepted');assert.equal(await q,'not-required');assert.equal(second.h.mail.calls.length,0);
  results.push('A waiter opened before prior close uses a new snapshot after the lock and sees the accepted log, never sends twice.');
  const lost=await seed();let transactions=0;
  const facade={$queryRawUnsafe:(...args)=>prisma.$queryRawUnsafe(...args),user:prisma.user,$transaction:async(cb,opts)=>{const r=await prisma.$transaction(cb,opts);if(++transactions===1)throw Error('synthetic lost native commit ACK');return r;}};
  const uncertain=instance(lost,{prisma:facade});assert.equal(await uncertain.dispatch(),'unconfirmed');assert(await marker(lost.id));assert.equal(uncertain.h.mail.calls.length,0);const next=instance(lost);assert.equal(await next.dispatch('c1'),'not-required');assert.equal(next.h.mail.calls.length,0);retained.push(lost.id);
  results.push('Lost native commit ACK retains its negative marker; another module neither queries/adopts it as mail authority nor reissues.');
  const unknown=await seed(),h=instance(unknown,{fetch:()=>Response.json({id:'looks-successful'},{status:503})});assert.equal(await h.dispatch(),'unconfirmed');assert(await marker(unknown.id));assert.equal(await instance(unknown).dispatch('c1'),'not-required');assert.equal(await instance(unknown).dispatch('a1','onboarding'),'not-required');retained.push(unknown.id);
  results.push('Unknown native provider ACK retains a cross-sequence admission; future conversion/cron requests remain denied without TTL/reset.');
  const logFail=await seed();let n=0;const failClose={$queryRawUnsafe:(...args)=>prisma.$queryRawUnsafe(...args),user:prisma.user,$transaction:async(cb,opts)=>{if(++n===2)throw Error('synthetic native close failure');return prisma.$transaction(cb,opts);}};
  const failed=instance(logFail,{prisma:failClose});assert.equal(await failed.dispatch(),'unconfirmed');assert.equal(failed.h.mail.calls.length,1);assert.equal(await prisma.emailLog.count({where:{userId:logFail.id}}),0);assert(await marker(logFail.id));assert.equal(await instance(logFail).dispatch('c1'),'not-required');retained.push(logFail.id);
  results.push('Native accepted HTTP with unknown log/close remains excluded; no second mail or falsely accepted business counter.');
  for(const extra of [{marketingOptOut:true},{emailVerified:null}]){
   const deniedUser=await seed(extra),x=instance(deniedUser);assert.equal(await x.dispatch(),'not-required');assert.equal(x.h.mail.calls.length,0);assert.equal(await marker(deniedUser.id),null);
  }results.push('Opt-out and unverified native accounts cannot reserve or issue marketing.');
  const paid=await seed();await prisma.subscription.create({data:{userId:paid.id,status:'active',stripeCustomerId:'synthetic-customer'}});assert.equal(await instance(paid).dispatch(),'not-required');
  const expired=await seed();await prisma.subscription.create({data:{userId:expired.id,status:'active',stripeCustomerId:'manual_admin',currentPeriodEnd:new Date(Date.now()-86400000)}});assert.equal(await instance(expired).dispatch(),'provider-accepted');
  results.push('Native paid access denies conversion; expired manual grants use native clock and do not extend themselves.');
  const cooldown=await seed();await prisma.emailLog.create({data:{userId:cooldown.id,sequence:'conv',step:'c1',sentAt:new Date(Date.now()-2*86400000)}});assert.equal(await instance(cooldown).dispatch('c3'),'not-required');const lastDay=await seed();await prisma.emailLog.create({data:{userId:lastDay.id,sequence:'onboarding',step:'a1'}});assert.equal(await instance(lastDay).dispatch('c3'),'not-required');
  results.push('Native 14-day conversion cooldown and common daily marketing limit include prior EmailLog rows.');
  const fresh=await seed({createdAt:new Date()}),small=instance(fresh);assert.equal(await small.dispatch('c2'),'not-required');assert.equal(await small.dispatch('a1','onboarding'),'provider-accepted');assert.equal(await instance(fresh).dispatch('c3'),'not-required');
  results.push('Native cron age/activity eligibility is rechecked; onboarding acceptance and conversion share the daily exclusion.');
  const replay=await seed();await prisma.emailLog.create({data:{userId:replay.id,sequence:'conv',step:'c3',sentAt:new Date(Date.now()-30*86400000)}});assert.equal(await instance(replay).dispatch(),'not-required');
  results.push('A historical step remains sent even after cooldown ends; clock does not authorize same-step replay.');
 }finally{
  for(const release of releases)release(Response.json({id:'synthetic-teardown-own'}));
  await Promise.allSettled(owned);
  // Unknown original fixtures are deliberately retained, not released/adopted from rows.
  await prisma.user.deleteMany({where:{id:{in:ids.filter(id=>!retained.includes(id))}}});
  assert.equal(await prisma.user.count(),baseline.users+retained.length);
  assert.equal(await prisma.lifecycleEmailAdmission.count(),baseline.markers+retained.length);
  assert.equal(await prisma.emailLog.count(),baseline.logs);
 }
 return{retainedSyntheticUnknownOriginals:retained,scope:'No cleanup/recovery of unknown native originals; only completed own fresh fixtures removed.'};
};
