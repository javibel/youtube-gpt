'use strict';
const assert=require('node:assert/strict'),{randomUUID,randomBytes}=require('node:crypto'),{load}=require('./route-harness.cjs'),{fixture}=require('./forgot-password-server.test.cjs'),{deferred}=require('./chat-widget-harness.cjs');
module.exports=async(prisma,results)=>{
 const users=[],emails=[],owned=[],release=[],before={users:await prisma.user.count(),tokens:await prisma.passwordResetToken.count(),markers:await prisma.passwordResetRequestAdmission.count()};
 const seed=async suffix=>{const u=await prisma.user.create({data:{email:'forgot-'+suffix+'-'+randomUUID()+'@example.invalid',name:'Synthetic',password:'synthetic-old'}});users.push(u.id);emails.push(u.email);return u;};
 async function nativeReach(h,stage){for(let i=0;i<400&&!h.entered[stage];i++)await new Promise(r=>setTimeout(r,5));assert(h.entered[stage],'Original native stage unavailable: '+stage);}
 const token=email=>prisma.passwordResetToken.findFirst({where:{email}}),marker=email=>prisma.passwordResetRequestAdmission.findUnique({where:{email}});
 const old=async u=>{const t=randomBytes(32).toString('hex');await prisma.passwordResetToken.create({data:{email:u.email,token:t,expires:new Date(Date.now()+60000)}});return t;};
 function instance(options={}){
  const h=fixture({sql:(sql,args)=>prisma.$queryRawUnsafe(sql,...args),...options});
  release.push(()=>{for(const g of Object.values(h.gates))g.resolve();});
  const job=u=>h.job({email:u.email,lang:'es'}),dispatch=j=>{const p=h.api.dispatchForgotPasswordJob(j);owned.push(p);return p;};
  return{h,job,dispatch};
 }
 try{
  const u=await seed('twenty'),previous=await old(u),held=deferred(),busyDone=deferred();release.push(held.resolve);
  const a=instance({response:()=>held.promise}),b=instance({response:()=>held.promise});let busy=0;
  const attempts=Array.from({length:20},(_,i)=>{const x=i%2?a:b,p=x.dispatch(x.job(u));p.then(r=>{if(r==='busy'&&++busy===19)busyDone.resolve();});return p;});
  let guard;try{await Promise.race([busyDone.promise,new Promise((_,reject)=>guard=setTimeout(()=>reject(Error('Concurrent marker exclusion did not settle')),5000))]);}finally{clearTimeout(guard);}
  assert.equal((a.h.calls.mail.length+b.h.calls.mail.length),1);assert.equal(await prisma.passwordResetToken.count({where:{email:u.email}}),1);assert.notEqual((await token(u.email)).token,previous);assert(await marker(u.email));
  held.resolve(Response.json({id:'native-ack'}));const outcomes=await Promise.all(attempts);assert.equal(outcomes.filter(x=>x==='provider-accepted').length,1);assert.equal(outcomes.filter(x=>x==='busy').length,19);assert.equal(await marker(u.email),null);
  results.push('Twenty native scheduled originals in two modules produce one token replacement and one held native notice; nineteen are busy, same original closes only its marker.');
  const lost=await seed('lost-prepare');let queryCalls=0;const uncertain=instance({sql:async(sql,args)=>{queryCalls++;await prisma.$queryRawUnsafe(sql,...args);throw Error('synthetic lost prepare ACK');}});
  assert.equal(await uncertain.dispatch(uncertain.job(lost)),'unconfirmed');assert.equal(queryCalls,1);assert.equal(uncertain.h.calls.mail.length,0);const saved=await token(lost.email),savedMarker=await marker(lost.email),next=instance();
  assert.equal(await next.dispatch(next.job(lost)),'busy');assert.equal((await token(lost.email)).token,saved.token);assert.equal(await next.h.api.dispatchForgotPasswordJob({...savedMarker,kind:'forgot-password-job-original'}),'not-issued');assert.equal(next.h.calls.mail.length,0);
  results.push('Lost committed native prepare ACK retains exclusion; matching SQL/JSON/token/IDs and a new module cannot adopt or replace its original.');
  const lostMail=await seed('lost-provider'),m=instance({response:()=>Response.json({id:'id'},{status:503})}),mj=m.job(lostMail);
  assert.equal(await m.dispatch(mj),'unconfirmed');assert(await marker(lostMail.email));const savedCode=(await token(lostMail.email)).token;assert.equal(await instance().dispatch(instance().job(lostMail)),'not-issued');
  const sibling=instance();assert.equal(await sibling.dispatch(sibling.job(lostMail)),'busy');assert.equal((await token(lostMail.email)).token,savedCode);assert.equal(await m.dispatch(mj),'unconfirmed');assert.equal(m.h.calls.mail.length,1);
  results.push('Native provider uncertainty retains marker/token and original promise; repeated/new invocations do not emit or rotate.');
  const input=load('lib/password-reset-input.ts',{'node:buffer':require('node:buffer')}),reset=load('lib/password-reset-server.ts',{'bcryptjs':{hash:async()=>'$2b$12$'+'x'.repeat(53)},'node:crypto':require('node:crypto'),'@/lib/prisma':{prisma},'@/lib/password':load('lib/password.ts'),'@/lib/password-reset-input':input,'@/lib/password-change-notice':{preparePasswordChangeNotice(){throw Error('No notice expected');}}});
  const resetResult=await reset.consumePasswordResetOriginal(input.parsePasswordResetInput({token:savedCode,password:'SyntheticNative2'}),()=>{});assert.equal(resetResult.status,'changed');assert.equal(await prisma.passwordResetToken.count({where:{email:lostMail.email}}),0);assert(await marker(lostMail.email));
  assert.equal(await sibling.dispatch(sibling.job(lostMail)),'busy');
  results.push('Native reset factor can change its own password but never closes or recovers an uncertain forgot-password notice; no expiry/time reset releases that marker.');
  const collision=await seed('collision'),foreign=await seed('foreign'),previousCollision=await old(collision),foreignCode=await old(foreign);let generated=0;
  const c=instance({crypto:{randomUUID,randomBytes:n=>{assert.equal(n,32);generated++;return Buffer.from(foreignCode,'hex');}}});assert.equal(await c.dispatch(c.job(collision)),'unconfirmed');assert.equal(generated,1);assert.equal((await token(collision.email)).token,previousCollision);assert.equal((await token(foreign.email)).token,foreignCode);assert.equal(await marker(collision.email),null);assert.equal(c.h.calls.mail.length,0);
  results.push('Native token collision rolls back admission and previous-token deletion atomically, without entropy retry or foreign-row change.');
  const expired=await seed('expired'),e=instance({held:'eligible'}),ej=e.job(expired),ep=e.dispatch(ej);await nativeReach(e.h,'eligible');const expiredAt=new Date('2000-01-01T00:00:00.000Z');await prisma.passwordResetToken.updateMany({where:{email:expired.email},data:{expires:expiredAt}});e.h.gates.eligible.resolve();assert.equal(await ep,'not-issued');assert.equal(e.h.calls.mail.length,0);assert.equal((await token(expired.email)).expires.getTime(),expiredAt.getTime());assert.equal(await marker(expired.email),null);
  results.push('Genuine unissued original is denied after fixed declared expiry without renewing it, then closes only its marker; eligibility is not delivery/freshness proof.');
  const consumed=await seed('consumed'),cs=instance({held:'eligible'}),cp=cs.dispatch(cs.job(consumed));await nativeReach(cs.h,'eligible');const csToken=(await token(consumed.email)).token;
  assert.equal((await reset.consumePasswordResetOriginal(input.parsePasswordResetInput({token:csToken,password:'SyntheticNative2'}),()=>{})).status,'changed');cs.h.gates.eligible.resolve();assert.equal(await cp,'not-issued');assert.equal(cs.h.calls.mail.length,0);assert.equal(await marker(consumed.email),null);
  results.push('Reset consumption before original dependent eligibility suppresses its unissued link mail, without recovering the reset/change original.');
  const closed=await seed('lost-close'),cl=instance({sql:async(sql,args)=>{const r=await prisma.$queryRawUnsafe(sql,...args);if(sql.startsWith('DELETE FROM password_reset_request_admissions'))throw Error('synthetic lost close ACK');return r;}}),clj=cl.job(closed);
  assert.equal(await cl.dispatch(clj),'unconfirmed');assert.equal(cl.h.calls.mail.length,1);assert.equal(await marker(closed.email),null);assert.equal(await cl.dispatch(clj),'unconfirmed');assert.equal(cl.h.calls.mail.length,1);
  results.push('Lost original marker-close ACK remains unconfirmed even when deletion committed; same original never sends or closes twice.');
  const unconfigured=await seed('no-transport'),nc=instance({noProvider:true}),nj=nc.job(unconfigured);assert.equal(await nc.dispatch(nj),'not-configured');assert.equal(nc.h.calls.mail.length,0);assert.equal(await marker(unconfigured.email),null);const firstToken=(await token(unconfigured.email)).token;
  assert.equal(await nc.dispatch(nj),'not-configured');assert.equal((await token(unconfigured.email)).token,firstToken);const explicit=nc.job(unconfigured);assert.equal(await nc.dispatch(explicit),'not-configured');assert.notEqual((await token(unconfigured.email)).token,firstToken);
  results.push('Known original nonissuance closes its own marker; a new explicit captured request is distinct, never a resumed old job.');
  const missing={email:'missing-forgot-'+randomUUID()+'@example.invalid'},no=instance();assert.equal(await no.dispatch(no.job(missing)),'not-required');assert.equal(no.h.calls.mail.length,0);assert.equal(await marker(missing.email),null);assert.equal(await prisma.passwordResetToken.count({where:{email:missing.email}}),0);
  results.push('Missing native account produces no token, marker, provider call or public existence result.');
  const route=await seed('route'),r=instance(),reply=await r.h.post({email:route.email,lang:'en'});assert.equal(reply.status,202);assert.deepEqual(await reply.json(),{ok:true,status:'accepted'});assert.equal(r.h.calls.sql.length,0);assert.equal(r.h.calls.mail.length,0);
  const after=r.h.calls.after[0]();owned.push(after);await Promise.all([after,r.h.calls.after[0]()]);assert.equal(r.h.calls.mail.length,1);const mail=r.h.calls.mail[0].p,live=await token(route.email);assert(mail.text.includes(live.expires.toISOString()));assert(mail.html.includes(live.token));assert.equal((await prisma.user.findUnique({where:{id:route.id}})).password,'synthetic-old');
  results.push('Actual native route accepts before account lookup; one original callback sends captured link with exact native expiry, without password/authentication mutation.');
 }finally{
  for(const fn of release)fn(Response.json({id:'released-native-ack'}));await Promise.allSettled(owned);
  await prisma.passwordResetRequestAdmission.deleteMany({where:{email:{in:emails}}});await prisma.passwordResetToken.deleteMany({where:{email:{in:emails}}});await prisma.user.deleteMany({where:{id:{in:users}}});
  assert.equal(await prisma.user.count(),before.users);assert.equal(await prisma.passwordResetToken.count(),before.tokens);assert.equal(await prisma.passwordResetRequestAdmission.count(),before.markers);
 }
};
