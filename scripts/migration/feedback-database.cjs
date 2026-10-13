'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{fixture,deferred}=require('./feedback-fixture.cjs'),{fixture:lifecycle}=require('./lifecycle-fixture.cjs');
module.exports=async(prisma,results)=>{
 const ids=[],retained=[],owned=[],releases=[],baseline={users:await prisma.user.count(),forms:await prisma.userFeedback.count(),markers:await prisma.lifecycleEmailAdmission.count(),logs:await prisma.emailLog.count()};
 const seed=async(extra={})=>{const u=await prisma.user.create({data:{id:randomUUID(),email:'feedback-'+randomUUID()+'@example.invalid',name:'Synthetic',lang:'es',emailVerified:new Date(),createdAt:new Date(Date.now()-10*86400000),...extra}});ids.push(u.id);return u;};
 const marker=id=>prisma.lifecycleEmailAdmission.findUnique({where:{userId:id}}),form=id=>prisma.userFeedback.findUnique({where:{userId:id}});
 function instance(u,options={}){const ownDatabase={$queryRawUnsafe:(...v)=>prisma.$queryRawUnsafe(...v),$transaction:(...v)=>prisma.$transaction(...v),user:{findUnique:(...v)=>prisma.user.findUnique(...v),findMany:q=>prisma.user.findMany({...q,where:{...q.where,id:u.id}})}};const h=fixture({prisma:ownDatabase,account:u,...options}),dispatch=()=>{const p=h.dispatch(u.email);owned.push(p);return p;};return{h,dispatch};}
 async function reach(fn,msg){for(let i=0;i<1000&&!fn();i++)await new Promise(r=>setTimeout(r,5));assert(fn(),msg);}
 try{
  const u=await seed(),gate=deferred();releases.push(gate.resolve);const a=instance(u,{fetch:()=>gate.promise}),b=instance(u,{fetch:()=>gate.promise});let denied=0;
  const attempts=Array.from({length:20},(_,i)=>{const p=(i%2?a:b).dispatch();p.then(v=>{if(v==='not-required')denied++;});return p;});
  await reach(()=>denied===19,'Nineteen feedback originals not excluded');assert.equal(a.h.mail.calls.length+b.h.mail.calls.length,1);const originalForm=await form(u.id);assert(originalForm);assert(await marker(u.id));assert.equal((await prisma.user.findUnique({where:{id:u.id}})).feedbackEmailSentAt,null);
  gate.resolve(Response.json({id:'own-native-ack'}));const outcomes=await Promise.all(attempts);assert.equal(outcomes.filter(x=>x==='provider-accepted').length,1);assert.equal(await marker(u.id),null);assert.equal((await form(u.id)).token,originalForm.token);assert.equal(await prisma.emailLog.count({where:{userId:u.id,sequence:'feedback'}}),1);assert((await prisma.user.findUnique({where:{id:u.id}})).feedbackEmailSentAt instanceof Date);
  results.push('Twenty feedback originals in two modules create one native form/token, one shared reservation and one HTTP; only original acceptance logs/timestamps.');
  const shared=await seed(),hold=deferred();releases.push(hold.resolve);const mail=instance(shared,{fetch:()=>hold.promise}),p=mail.dispatch();await reach(()=>mail.h.mail.calls.length===1,'Feedback HTTP missing');
  const other=lifecycle({prisma,account:shared});assert.equal(await other.dispatch('a1','onboarding'),'not-required');assert.equal(other.mail.calls.length,0);hold.resolve(Response.json({id:'same-native'}));assert.equal(await p,'provider-accepted');assert.equal(await lifecycle({prisma,account:shared}).dispatch('c3'),'not-required');
  results.push('Pending feedback excludes lifecycle cron; accepted feedback also participates in native shared daily limit.');
  const reverse=await seed();assert.equal(await lifecycle({prisma,account:reverse}).dispatch('c3'),'provider-accepted');const deniedFeedback=instance(reverse);assert.equal(await deniedFeedback.dispatch(),'not-required');assert.equal(await form(reverse.id),null);
  results.push('Accepted lifecycle excludes feedback until its native daily limit, without creating a fresh feedback token.');
  const old=await seed();await prisma.userFeedback.create({data:{userId:old.id,token:randomUUID(),lang:'es',rating:5,comment:'Synthetic retained response',submittedAt:new Date()}});const previous=await form(old.id),manual=instance(old);assert.equal((await manual.h.post()).status,409);assert.equal((await manual.h.agent.runFeedbackAgent()).sent,0);assert.deepEqual(await form(old.id),previous);assert.equal(manual.h.mail.calls.length,0);
  results.push('Actual admin and agent never delete, replace or adopt a previous submitted feedback form/token for resend.');
  const lost=await seed();let commits=0;const facade={$queryRawUnsafe:(...v)=>prisma.$queryRawUnsafe(...v),user:prisma.user,$transaction:async(cb,opts)=>{const r=await prisma.$transaction(cb,opts);if(++commits===1)throw Error('synthetic lost commit ACK');return r;}};
  const uncertain=instance(lost,{prisma:facade});assert.equal(await uncertain.dispatch(),'unconfirmed');const kept=await form(lost.id);assert(kept);assert(await marker(lost.id));assert.equal(await instance(lost).dispatch(),'not-required');assert.deepEqual(await form(lost.id),kept);assert.equal(uncertain.h.mail.calls.length,0);retained.push(lost.id);
  results.push('Lost native admission commit ACK retains its original form/marker; a later instance cannot recover or renew it.');
  const unknown=await seed(),unknownMail=instance(unknown,{fetch:()=>Response.json({id:'looks-accepted'},{status:503})});assert.equal(await unknownMail.dispatch(),'unconfirmed');const original=await form(unknown.id);assert.equal((await instance(unknown).h.post()).status,409);assert.equal(await instance(unknown).dispatch(),'not-required');assert.deepEqual(await form(unknown.id),original);assert.equal((await prisma.user.findUnique({where:{id:unknown.id}})).feedbackEmailSentAt,null);retained.push(unknown.id);
  results.push('Unknown native HTTP ACK retains token/date/marker and blocks manual/cron retry; no timestamp or accepted counter.');
  const closeFailed=await seed();let tx=0;const failClose={$queryRawUnsafe:(...v)=>prisma.$queryRawUnsafe(...v),user:prisma.user,$transaction:async(cb,opts)=>{if(++tx===2)throw Error('synthetic close failure');return prisma.$transaction(cb,opts);}};
  const acceptedUnknown=instance(closeFailed,{prisma:failClose});assert.equal(await acceptedUnknown.dispatch(),'unconfirmed');assert.equal(acceptedUnknown.h.mail.calls.length,1);assert(await marker(closeFailed.id));assert.equal(await prisma.emailLog.count({where:{userId:closeFailed.id}}),0);assert.equal(await instance(closeFailed).dispatch(),'not-required');retained.push(closeFailed.id);
  results.push('Accepted provider with failed native log/timestamp transaction stays excluded; no fresh send is manufactured.');
  for(const extra of [{marketingOptOut:true},{emailVerified:null},{createdAt:new Date()}]){const negative=await seed(extra);assert.equal(await instance(negative).dispatch(),'not-required');assert.equal(await form(negative.id),null);assert.equal(await marker(negative.id),null);}
  results.push('Native unverified/opt-out/younger-than-three-days accounts cannot create feedback or issue marketing.');
  const rollback=await seed();
  const oldToken=(await form(old.id)).token;
  const collide={$queryRawUnsafe:(...v)=>prisma.$queryRawUnsafe(...v),user:prisma.user,$transaction:async(cb,opts)=>prisma.$transaction(async tx=>{
   return cb({$queryRawUnsafe:async(sql,...args)=>{if(sql.includes('WITH locked_clock'))args[2]=oldToken;return tx.$queryRawUnsafe(sql,...args);}});
  },opts)};
  const collision=instance(rollback,{prisma:collide});assert.equal(await collision.dispatch(),'unconfirmed');assert.equal(await marker(rollback.id),null);assert.equal(await form(rollback.id),null);assert.equal(collision.h.mail.calls.length,0);assert.equal((await form(old.id)).token,oldToken);
  results.push('Native feedback token uniqueness rolls back admission+form atomically; prior forms unchanged, no provider dispatch.');
 }finally{
  for(const release of releases)release(Response.json({id:'synthetic-own-teardown'}));await Promise.allSettled(owned);
  await prisma.user.deleteMany({where:{id:{in:ids.filter(id=>!retained.includes(id))}}});
  assert.equal(await prisma.user.count(),baseline.users+retained.length);assert.equal(await prisma.userFeedback.count(),baseline.forms+retained.length);assert.equal(await prisma.lifecycleEmailAdmission.count(),baseline.markers+retained.length);assert.equal(await prisma.emailLog.count(),baseline.logs);
 }
 return{retainedSyntheticUnknownOriginals:retained,scope:'Only known completed own fixtures cleaned; uncertain forms/markers and earlier baseline retained. No business recovery from SQL/IDs/time.'};
};
