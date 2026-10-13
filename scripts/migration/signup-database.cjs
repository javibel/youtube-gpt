'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {load}=require('./route-harness.cjs'),{fixture,body,fixedEpoch}=require('./signup-server.test.cjs');
module.exports=async(prisma,results)=>{
 const prefix='synthetic-signup-'+randomUUID(),emails=[],owned=[],release=[];
 const before={users:await prisma.user.count(),tokens:await prisma.emailVerificationToken.count(),markers:await prisma.emailVerificationResendAdmission.count()};
 const email=suffix=>{const value=prefix+'-'+suffix+'@example.invalid';emails.push(value);return value;};
 const helper=(address,options={})=>fixture({body:{...body,email:address,utmSource:'synthetic-source',ref:'public-ref',aff:'public-aff'},nativeBcrypt:true,sql:(sql,args)=>prisma.$queryRawUnsafe(sql,...args),...options});
 const create=async h=>{const a=await h.authorize();assert.equal(a.status,'verified');return h.notices.createSignupAndNotice(h.input,a.permit);};
 const notice=async(h,p)=>{assert.equal(p.status,'created');const original=h.notices.dispatchVerificationResend(p.notice);owned.push(original);return original;};
 const token=address=>prisma.emailVerificationToken.findFirst({where:{email:address}});
 try{
  const one=email('twenty'),modules=Array.from({length:20},()=>helper(one));
  const preparations=await Promise.all(modules.map(create));
  const winner=preparations.findIndex(x=>x.status==='created');assert.ok(winner>=0);assert.equal(preparations.filter(x=>x.status==='created').length,1);assert.ok(preparations.every(x=>['created','exists','unconfirmed','blocked'].includes(x.status)));
  assert.equal(await prisma.user.count({where:{email:one}}),1);assert.equal(await prisma.emailVerificationToken.count({where:{email:one}}),1);assert.equal(await prisma.emailVerificationResendAdmission.count({where:{email:one}}),1);
  const user=await prisma.user.findUnique({where:{email:one}});assert.equal(await require('bcryptjs').compare(body.password,user.password),true);assert.equal(user.emailVerified,null);assert.equal(user.referredBy,null);assert.equal(user.referredByCode,null);assert.equal(user.referredAt,null);assert.equal(user.utmSource,'synthetic-source');
  const owner=modules[winner];assert.equal(await notice(owner,preparations[winner]),'provider-accepted');assert.equal(owner.calls.mail.length,1);assert.equal(await prisma.emailVerificationResendAdmission.count({where:{email:one}}),0);
  results.push('twenty independent native signup originals commit exactly one account/code/notice with bcrypt12 and unverified/dormant defaults');
  const foreign=email('foreign'),collision=email('collision');assert.equal(await prisma.emailVerificationToken.count({where:{token:'984317'}}),0);
  await prisma.emailVerificationToken.create({data:{email:foreign,token:'984317',expires:new Date(fixedEpoch)}});
  let generated=0;const c=helper(collision,{crypto:{randomUUID,randomInt:()=>{generated++;return 984317;}}});
  assert.equal((await create(c)).status,'unconfirmed');assert.equal(generated,1);assert.equal(await prisma.user.count({where:{email:collision}}),0);assert.equal(await prisma.emailVerificationResendAdmission.count({where:{email:collision}}),0);assert.equal(await prisma.emailVerificationToken.count({where:{email:collision}}),0);assert.equal((await token(foreign)).token,'984317');
  results.push('global code collision atomically rolls back account/code/marker; no code generation retry');
  const lost=email('lost'),l=helper(lost,{sql:async(sql,args)=>{await prisma.$queryRawUnsafe(sql,...args);throw Error('synthetic lost signup commit ACK');}});
  assert.equal((await create(l)).status,'unconfirmed');assert.equal(l.calls.sql.length,1);assert.equal(l.calls.mail.length,0);assert.equal(await prisma.user.count({where:{email:lost}}),1);const saved=await prisma.emailVerificationResendAdmission.findUnique({where:{email:lost}}),savedCode=(await token(lost)).token;
  const replacement=helper(lost);assert.equal((await create(replacement)).status,'exists');assert.equal((await token(lost)).token,savedCode);assert.equal(await replacement.notices.dispatchVerificationResend({...saved,kind:'email-resend-original'}),'not-issued');assert.equal(replacement.calls.mail.length,0);assert.equal(await prisma.emailVerificationResendAdmission.count({where:{email:lost}}),1);
  results.push('lost native signup ACK leaves uncertainty; no lookup/adoption/notice or automatic replacement by another original');
  const orphan=email('orphan');await prisma.emailVerificationToken.create({data:{email:orphan,token:'984318',expires:new Date(fixedEpoch)}});const o=helper(orphan);assert.equal((await create(o)).status,'blocked');assert.equal(await prisma.user.count({where:{email:orphan}}),0);assert.equal((await token(orphan)).expires.getTime(),fixedEpoch);
  const marker=email('orphan-marker');await prisma.emailVerificationResendAdmission.create({data:{email:marker,noticeId:randomUUID(),userId:'synthetic-unknown-owner',createdAt:new Date(fixedEpoch)}});assert.equal((await create(helper(marker))).status,'blocked');assert.equal(await prisma.user.count({where:{email:marker}}),0);assert.equal((await prisma.emailVerificationResendAdmission.findUnique({where:{email:marker}})).createdAt.getTime(),fixedEpoch);
  results.push('orphan code or pending marker blocks signup without deletion, timestamp renewal or reconstructed ownership');
  const held=email('held');let resolve,announce;const pending=new Promise(r=>{resolve=r;}),started=new Promise(r=>{announce=r;});release.push(resolve);
  const h=helper(held,{mail:()=>{announce();return pending;}}),p=await create(h),original=notice(h,p);owned.push(original);await started;
  const other=helper(held);assert.equal((await other.notices.prepareVerificationResend(held,'es')).status,'busy');const code=(await token(held)).token;
  resolve('unconfirmed');assert.equal(await original,'unconfirmed');assert.equal(await h.notices.dispatchVerificationResend(p.notice),'unconfirmed');assert.equal(h.calls.mail.length,1);assert.equal((await token(held)).token,code);assert.equal(await prisma.emailVerificationResendAdmission.count({where:{email:held}}),1);
  results.push('initial pending provider notice excludes resend; uncertain result never repeats or resets the original');
  const verify=load('lib/email-verification-server.ts',{'@/lib/prisma':{prisma}});assert.equal((await verify.consumeEmailVerification(held,code)).status,'verified');assert.equal(await prisma.emailVerificationResendAdmission.count({where:{email:held}}),1);
  results.push('genuine native email factor does not recover or clear an uncertain initial notice');
  const expired=email('expired'),e=helper(expired),ep=await create(e);await prisma.emailVerificationToken.updateMany({where:{email:expired},data:{expires:new Date(fixedEpoch)}});assert.equal(await notice(e,ep),'not-issued');assert.equal(e.calls.mail.length,0);assert.equal((await token(expired)).expires.getTime(),fixedEpoch);
  results.push('expired initial code is denied before dispatch without renewing its declared timestamp');
  const verified=email('verified'),v=helper(verified),vp=await create(v);assert.equal((await verify.consumeEmailVerification(verified,(await token(verified)).token)).status,'verified');assert.equal(await notice(v,vp),'not-issued');assert.equal(v.calls.mail.length,0);
  results.push('native account verified before own initial after-callback prevents notice issuance');
  const routeEmail=email('route'),r=helper(routeEmail),reply=await r.post();assert.equal(reply.status,201);assert.deepEqual(await reply.json(),{success:true});assert.equal(reply.headers.get('set-cookie'),null);assert.equal(r.calls.mail.length,0);assert.equal(r.calls.after.length,1);const after=r.calls.after[0]();owned.push(after);await Promise.all([after,r.calls.after[0]()]);assert.equal(r.calls.mail.length,1);assert.equal((await prisma.user.findUnique({where:{email:routeEmail}})).emailVerified,null);
  results.push('actual signup route acknowledges own atomic native account before one notice, without authentication cookie');
 }finally{
  for(const resolve of release)resolve('unconfirmed');await Promise.allSettled(owned);
  // Teardown only this contract's synthetic identities after own originals settle.
  // No adoption/send/retry follows cleanup; inherited records remain untouched.
  await prisma.emailVerificationResendAdmission.deleteMany({where:{email:{in:emails}}});await prisma.emailVerificationToken.deleteMany({where:{email:{in:emails}}});await prisma.user.deleteMany({where:{email:{in:emails}}});
  assert.equal(await prisma.user.count(),before.users);assert.equal(await prisma.emailVerificationToken.count(),before.tokens);assert.equal(await prisma.emailVerificationResendAdmission.count(),before.markers);
 }
};
