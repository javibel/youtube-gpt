'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{fixture,deferred}=require('./affiliate-application-fixture.cjs');
module.exports=async(prisma,results)=>{
 const emails=[],retained=new Set(),owned=[],releases=[],baseline={rows:await prisma.affiliate.count(),admissions:await prisma.affiliateApplicationAdmission.count()};
 const email=()=>{const e='affiliate-'+randomUUID()+'@example.invalid';emails.push(e);return e;};
 const registration=e=>prisma.affiliate.findFirst({where:{email:e}}),admission=e=>prisma.affiliateApplicationAdmission.findUnique({where:{email:e}});
 function instance(options={}){const h=fixture({prisma,...options}),dispatch=e=>{const p=h.dispatch({name:'Synthetic <channel>',email:e,lang:'es',channelInfo:'Own synthetic & channel'});owned.push(p);return p;};return{h,dispatch};}
 async function reach(fn,msg){for(let i=0;i<1000&&!fn();i++)await new Promise(r=>setTimeout(r,5));assert(fn(),msg);}
 try{
  const e=email(),gate=deferred();releases.push(gate.resolve);const a=instance({fetch:()=>gate.promise}),b=instance({fetch:()=>gate.promise});let denied=0;
  const attempts=Array.from({length:20},(_,i)=>{const p=(i%2?a:b).dispatch(e);p.then(v=>{if(v==='not-required')denied++;});return p;});
  await reach(()=>denied===19,'Native canonical admissions did not exclude other modules');assert.equal(a.h.calls.mail.length+b.h.calls.mail.length,1);assert.equal(await prisma.affiliate.count({where:{email:e}}),1);
  const row=await registration(e),mark=await admission(e);assert(row);assert(mark);assert.equal(mark.status,'pending');assert.equal(row.status,'pending');assert.equal(mark.affiliateId,row.id);
  gate.resolve(Response.json({id:'own-native'}));const outcomes=await Promise.all(attempts);assert.equal(outcomes.filter(v=>v==='provider-accepted').length,1);assert.deepEqual(await registration(e),row);assert.equal((await admission(e)).status,'provider-accepted');
  results.push('Twenty originals in two modules reserve one canonical email first, create one affiliate/admission and issue one held admin HTTP; no orphan duplicates.');
  const legacy=email();await prisma.affiliate.create({data:{email:' '+legacy.toUpperCase()+' ',code:'legacy-'+randomUUID(),name:'Legacy synthetic',status:'paused',channelInfo:'prior'}});const legacyRow=await prisma.affiliate.findFirst({where:{email:' '+legacy.toUpperCase()+' '}}),old=instance();
  assert.equal(await old.dispatch(legacy),'not-required');assert.equal(old.h.calls.mail.length,0);assert.equal(await admission(legacy),null);assert.deepEqual(await prisma.affiliate.findUnique({where:{id:legacyRow.id}}),legacyRow);
  // Cleanup below uses this exact test-owned creation, not adoption of a business original.
  emails.push(' '+legacy.toUpperCase()+' ');
  results.push('Legacy mixed-case/whitespace affiliate is a negative guard only: no admission, new registration, overwrite or welcome/consent adoption.');
  const lost=email();let queries=0;const lostFacade={$queryRawUnsafe:async(...v)=>{queries++;const r=await prisma.$queryRawUnsafe(...v);if(queries===1)throw Error('synthetic lost native create ACK');return r;}};
  const uncertain=instance({prisma:lostFacade});assert.equal(await uncertain.dispatch(lost),'unconfirmed');assert.equal(uncertain.h.calls.mail.length,0);const lostRow=await registration(lost),lostMark=await admission(lost);assert.equal(lostMark.status,'pending');
  assert.equal(await instance().dispatch(lost),'not-required');assert.deepEqual(await registration(lost),lostRow);assert.deepEqual(await admission(lost),lostMark);retained.add(lost);
  results.push('Lost native creation ACK retains exact affiliate/admission; another module cannot reconstruct permission from rows/IDs/email.');
  const unknown=email(),unaccepted=instance({fetch:()=>Response.json({id:'public-looking'},{status:503})});assert.equal(await unaccepted.dispatch(unknown),'unconfirmed');const unknownMark=await admission(unknown);
  assert.equal(await instance().dispatch(unknown),'not-required');assert.deepEqual(await admission(unknown),unknownMark);retained.add(unknown);
  results.push('Unknown native HTTP/body acceptance retains pending admission/native date; another request never retries or renews it.');
  for(const lostAck of [false,true]){
   const id=email(),facade={$queryRawUnsafe:async(q,...v)=>{if(q.startsWith('UPDATE affiliate_application_admissions')){if(lostAck)await prisma.$queryRawUnsafe(q,...v);throw Error('synthetic completion ACK unavailable');}return prisma.$queryRawUnsafe(q,...v);}};
   const h=instance({prisma:facade});assert.equal(await h.dispatch(id),'unconfirmed');assert.equal(h.h.calls.mail.length,1);const nativeMark=await admission(id);assert.equal(nativeMark.status,lostAck?'provider-accepted':'pending');
   assert.equal(await instance().dispatch(id),'not-required');assert.deepEqual(await admission(id),nativeMark);retained.add(id);
   results.push(lostAck?'Lost native close ACK is not recovered from completed row; permanent exclusion remains, no second provider call.':'Accepted provider with failed close leaves pending admission; another module cannot reissue.');
  }
  for(const options of [{missing:true},{admin:''},{env:{AFFILIATE_APPLICATION_EMAILS_LIVE:'false'}}]){
   const id=email(),h=instance(options);assert(['not-issued','not-configured'].includes(await h.dispatch(id)));assert.equal(h.h.calls.mail.length,0);assert.equal((await admission(id)).status,'not-issued');assert.equal(await instance().dispatch(id),'not-required');
  }
  results.push('Known no emission permanently retains application/admission even with new configured transport/LIVE; never adopted as a queue.');
  const changed=email(),eligibilityGate=deferred();releases.push(eligibilityGate.resolve);let eligibilityEntered=false;
  const changedFacade={$queryRawUnsafe:async(q,...v)=>{if(q.includes('AS eligible')){eligibilityEntered=true;await eligibilityGate.promise;}return prisma.$queryRawUnsafe(q,...v);}};
  const changedJob=instance({prisma:changedFacade}),changedOriginal=changedJob.dispatch(changed);await reach(()=>eligibilityEntered,'Dependent native eligibility not reached');
  await prisma.affiliate.update({where:{id:(await registration(changed)).id},data:{status:'paused',name:'Changed synthetic'}});
  eligibilityGate.resolve();assert.equal(await changedOriginal,'not-issued');assert.equal(changedJob.h.calls.mail.length,0);assert.equal((await admission(changed)).status,'not-issued');
  results.push('Dependent native eligibility denies a changed/paused application before admin HTTP; captured original cannot send changed data.');
  const blocker=email();await prisma.affiliate.create({data:{email:blocker,code:'collision-'+randomUUID(),name:'Known synthetic'}});const blockerRow=await registration(blocker);
  await prisma.affiliateApplicationAdmission.create({data:{email:blocker,noticeId:randomUUID(),affiliateId:blockerRow.id,lang:'es'}});
  const collide=email(),notice=(await admission(blocker)).noticeId,collisionFacade={$queryRawUnsafe:async(q,...v)=>{if(q.includes('WITH admitted'))v[1]=notice;return prisma.$queryRawUnsafe(q,...v);}};
  const collision=instance({prisma:collisionFacade});assert.equal(await collision.dispatch(collide),'unconfirmed');assert.equal(await registration(collide),null);assert.equal(await admission(collide),null);assert.equal(collision.h.calls.mail.length,0);assert.deepEqual(await registration(blocker),blockerRow);retained.add(collide);
  results.push('Native nonce collision rolls back statement atomically before creating an orphan affiliate; earlier known fixture remains unchanged.');
  const deferredFail=email(),deferredFacade={$queryRawUnsafe:async(q,...v)=>prisma.$queryRawUnsafe(q.includes('WITH admitted')?q.replace('FROM admitted a\n        RETURNING','FROM admitted a WHERE false\n        RETURNING'):q,...v)};
  const empty=instance({prisma:deferredFacade});assert.equal(await empty.dispatch(deferredFail),'unconfirmed');assert.equal(await registration(deferredFail),null);assert.equal(await admission(deferredFail),null);assert.equal(empty.h.calls.mail.length,0);retained.add(deferredFail);
  results.push('Deferred FK commit failure rolls back the reservation when no affiliate was created; no empty-row receipt is mistaken for success.');
  const scheduled=email(),h=instance(),response=await h.h.post({name:'Scheduled synthetic',email:scheduled,lang:'en'});assert.equal(response.status,202);assert.equal(await registration(scheduled),null);assert.equal(h.h.calls.mail.length,0);
  await h.h.runAfter();assert.equal((await registration(scheduled)).status,'pending');assert.equal((await admission(scheduled)).status,'provider-accepted');
  results.push('Actual route replies202 before native affiliate creation; same retained after job alone creates pending application and admin notice, never approval/commission.');
 }finally{
  for(const release of releases)release(Response.json({id:'synthetic-own-teardown'}));await Promise.allSettled(owned);
  const cleaned=emails.filter(e=>!retained.has(e));await prisma.affiliateApplicationAdmission.deleteMany({where:{email:{in:cleaned}}});await prisma.affiliate.deleteMany({where:{email:{in:cleaned}}});
  const retainedEmails=[...retained],rows=await prisma.affiliate.count({where:{email:{in:retainedEmails}}}),admissions=await prisma.affiliateApplicationAdmission.count({where:{email:{in:retainedEmails}}});
  assert.equal(rows,4);assert.equal(admissions,4);assert.equal(await prisma.affiliate.count(),baseline.rows+rows);assert.equal(await prisma.affiliateApplicationAdmission.count(),baseline.admissions+admissions);
 }
 return{retainedSyntheticUnknownOriginals:[...retained],retainedRecords:4,scope:'Own completed fixtures cleaned; six unknown original identities (four retained records, two atomic rollbacks) and prior baseline never adopted/deleted/replayed. No operative approval/consent/source/freshness/delivery.'};
};
