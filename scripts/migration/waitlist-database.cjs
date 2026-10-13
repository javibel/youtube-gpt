'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{fixture,deferred}=require('./waitlist-fixture.cjs');
module.exports=async(prisma,results)=>{
 const emails=[],retained=[],owned=[],releases=[],baseline={rows:await prisma.launchWaitlist.count(),admissions:await prisma.waitlistWelcomeAdmission.count()};
 const email=()=>{const value='waitlist-'+randomUUID()+'@example.invalid';emails.push(value);return value;};
 const registration=e=>prisma.launchWaitlist.findUnique({where:{email:e}}),admission=e=>prisma.waitlistWelcomeAdmission.findUnique({where:{email:e}});
 function instance(options={}){const h=fixture({prisma,...options}),dispatch=e=>{const p=h.dispatch({email:e,lang:'es',source:'synthetic',referrer:null});owned.push(p);return p;};return{h,dispatch};}
 async function reach(fn,msg){for(let i=0;i<1000&&!fn();i++)await new Promise(r=>setTimeout(r,5));assert(fn(),msg);}
 try{
  const e=email(),gate=deferred();releases.push(gate.resolve);const a=instance({fetch:()=>gate.promise}),b=instance({fetch:()=>gate.promise});let denied=0;
  const attempts=Array.from({length:20},(_,i)=>{const p=(i%2?a:b).dispatch(e);p.then(v=>{if(v==='not-required')denied++;});return p;});
  await reach(()=>denied===19,'Native exclusions did not finish');assert.equal(a.h.calls.mail.length+b.h.calls.mail.length,1);const original=await registration(e),originalAdmission=await admission(e);assert(original);assert(originalAdmission);assert.equal(originalAdmission.status,'pending');
  gate.resolve(Response.json({id:'own-native'}));const outcomes=await Promise.all(attempts);assert.equal(outcomes.filter(x=>x==='provider-accepted').length,1);assert.deepEqual(await registration(e),original);assert.equal((await admission(e)).status,'provider-accepted');assert((await admission(e)).completedAt instanceof Date);
  results.push('Twenty native jobs in two modules atomically create one waitlist record/admission and issue one held HTTP; permanent native acceptance remains negative to replay.');
  const legacy=email();await prisma.launchWaitlist.create({data:{email:legacy,source:'synthetic-old',referrer:'old-reference',lang:'en'}});const old=await registration(legacy),legacyJob=instance();assert.equal(await legacyJob.dispatch(legacy),'not-required');assert.equal(legacyJob.h.calls.mail.length,0);assert.equal(await admission(legacy),null);assert.deepEqual(await registration(legacy),old);
  results.push('Legacy native registrations without an admission are not adopted, mutated, welcomed again or converted into campaign consent.');
  const lost=email();let queries=0;const facade={$queryRawUnsafe:async(...v)=>{queries++;const r=await prisma.$queryRawUnsafe(...v);if(queries===1)throw Error('synthetic lost original SQL ACK');return r;},launchWaitlist:prisma.launchWaitlist};
  const uncertain=instance({prisma:facade});assert.equal(await uncertain.dispatch(lost),'unconfirmed');assert.equal(uncertain.h.calls.mail.length,0);const lostRow=await registration(lost),lostAdmission=await admission(lost);assert.equal(lostAdmission.status,'pending');assert.equal(await instance().dispatch(lost),'not-required');assert.deepEqual(await registration(lost),lostRow);assert.deepEqual(await admission(lost),lostAdmission);retained.push(lost);
  results.push('Lost native create ACK retains registration/admission; another module cannot reconstruct original authority or replay from those rows.');
  const unknown=email(),notAccepted=instance({fetch:()=>Response.json({id:'public-looking'},{status:503})});assert.equal(await notAccepted.dispatch(unknown),'unconfirmed');const before=await admission(unknown);assert.equal(await instance().dispatch(unknown),'not-required');assert.deepEqual(await admission(unknown),before);retained.push(unknown);
  results.push('Unknown native HTTP/body ACK retains its pending admission/date and original registration; no timeout/reset release or fresh welcome.');
  const closeLost=email();const failedComplete={$queryRawUnsafe:async(q,...v)=>{if(q.startsWith('UPDATE waitlist_welcome_admissions'))throw Error('synthetic completion failure');return prisma.$queryRawUnsafe(q,...v);},launchWaitlist:prisma.launchWaitlist};
  const close=instance({prisma:failedComplete});assert.equal(await close.dispatch(closeLost),'unconfirmed');assert.equal(close.h.calls.mail.length,1);assert.equal((await admission(closeLost)).status,'pending');assert.equal(await instance().dispatch(closeLost),'not-required');retained.push(closeLost);
  results.push('Accepted provider with failed completion ACK is unconfirmed and excluded; a later row never permits another emission.');
  for(const opts of [{missing:true},{env:{WAITLIST_EMAILS_LIVE:'false'}}]){const id=email(),h=instance(opts);assert(['not-configured','not-issued'].includes(await h.dispatch(id)));assert.equal(h.h.calls.mail.length,0);assert.equal((await admission(id)).status,'not-issued');assert.equal(await instance().dispatch(id),'not-required');}
  results.push('Known no emission leaves a permanent negative native admission, not a recoverable queue entry when transport/LIVE changes.');
  const blocker=email();await prisma.launchWaitlist.create({data:{email:blocker,source:'synthetic-original'}});const source=await registration(blocker);await prisma.waitlistWelcomeAdmission.create({data:{email:blocker,rowId:source.id,noticeId:randomUUID(),status:'pending'}});
  const collide=email(),collision={$queryRawUnsafe:async(q,...v)=>{if(q.includes('WITH created'))v[5]=(await admission(blocker)).noticeId;return prisma.$queryRawUnsafe(q,...v);},launchWaitlist:prisma.launchWaitlist};
  const failed=instance({prisma:collision});assert.equal(await failed.dispatch(collide),'unconfirmed');assert.equal(await registration(collide),null);assert.equal(await admission(collide),null);assert.equal(failed.h.calls.mail.length,0);assert.deepEqual(await registration(blocker),source);
  // Test-owned collision fixture is known and pre-created, not an uncertain business original.
  results.push('Native admission nonce collision rolls back new registration/admission atomically; earlier fixture registration remains unchanged.');
  const scheduled=email(),h=instance();const response=await h.h.post({email:scheduled,lang:'es'});assert.equal(response.status,202);assert.equal(await registration(scheduled),null);assert.equal(h.h.calls.mail.length,0);await h.h.runAfter();assert(await registration(scheduled));assert.equal((await admission(scheduled)).status,'provider-accepted');
  results.push('Actual route replies uniform202 before native creation; its retained original after callback owns the single later registration/welcome, not count/lookup JSON.');
 }finally{
  for(const release of releases)release(Response.json({id:'synthetic-own-teardown'}));await Promise.allSettled(owned);
  const cleaned=emails.filter(e=>!retained.includes(e));
  await prisma.waitlistWelcomeAdmission.deleteMany({where:{email:{in:cleaned}}});await prisma.launchWaitlist.deleteMany({where:{email:{in:cleaned}}});
  assert.equal(await prisma.launchWaitlist.count(),baseline.rows+retained.length);assert.equal(await prisma.waitlistWelcomeAdmission.count(),baseline.admissions+retained.length);
 }
 return{retainedSyntheticUnknownOriginals:retained,scope:'Known completed own fixtures cleaned without replay; unknown native originals and prior baseline retained; no operational consent/source/freshness acceptance.'};
};
