'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {load}=require('./route-harness.cjs'),{fixture}=require('./email-verification-server.test.cjs');
module.exports=async function(prisma,results){
 const prefix='synthetic-email-'+randomUUID(),emails=[],ids=[],tokens=[];
 const baseline=await prisma.emailVerificationToken.count();
 const fresh=async(suffix,token,expires)=>{
  const email=prefix+'-'+suffix+'@example.invalid';emails.push(email);tokens.push(token);
  assert.equal(await prisma.emailVerificationToken.count({where:{token}}),0,'fixture code must not replace an inherited token');
  const user=await prisma.user.create({data:{email,name:'Synthetic'},select:{id:true,email:true}});ids.push(user.id);
  await prisma.emailVerificationToken.create({data:{email,token,expires:expires??new Date(Date.now()+60000)}});
  return user;
 };
 const a=load('lib/email-verification-server.ts',{'@/lib/prisma':{prisma}}),b=load('lib/email-verification-server.ts',{'@/lib/prisma':{prisma}});
 try{
  const one=await fresh('one','913001');
  const replies=await Promise.all(Array.from({length:20},(_,i)=>(i%2?a:b).consumeEmailVerification(one.email,'913001')));
  assert.equal(replies.filter(x=>x.status==='verified').length,1);
  assert.equal(replies.filter(x=>x.status==='invalid').length,19);
  assert.ok((await prisma.user.findUnique({where:{id:one.id}})).emailVerified);
  assert.equal(await prisma.emailVerificationToken.count({where:{email:one.email}}),0);
  results.push('one code has exactly one PostgreSQL verification acknowledgment across twenty original consumers in two module instances');
  const two=await fresh('two','913002');tokens.push('913003');assert.equal(await prisma.emailVerificationToken.count({where:{token:'913003'}}),0);
  await prisma.emailVerificationToken.create({data:{email:two.email,token:'913003',expires:new Date(Date.now()+60000)}});
  const dual=await Promise.all([a.consumeEmailVerification(two.email,'913002'),b.consumeEmailVerification(two.email,'913003')]);
  assert.equal(dual.filter(x=>x.status==='verified').length,1);assert.equal(dual.filter(x=>x.status==='invalid').length,1);
  results.push('different codes for the same native account serialize to one verification, without broad token deletion');
  const expired=await fresh('expired','913004',new Date(Date.UTC(2026,9,13,0,0,0)));
  assert.equal((await a.consumeEmailVerification(expired.email,'913004')).status,'expired');
  assert.equal((await prisma.user.findUnique({where:{id:expired.id}})).emailVerified,null);
  assert.equal(await prisma.emailVerificationToken.count({where:{email:expired.email}}),0);
  results.push('declared expired fixture is consumed as expired without account grant, never refreshed');
  const boundary=await fresh('boundary','913005');await prisma.$executeRawUnsafe('UPDATE email_verification_tokens SET expires = timezone('UTC', clock_timestamp()) WHERE email = $1',boundary.email);
  assert.equal((await a.consumeEmailVerification(boundary.email,'913005')).status,'expired');
  assert.equal((await prisma.user.findUnique({where:{id:boundary.id}})).emailVerified,null);
  results.push('native database clock expiry boundary denies verification');
  const own=await fresh('own','913006'),foreign=await fresh('foreign','913007');
  assert.equal((await a.consumeEmailVerification(foreign.email,'913006')).status,'invalid');
  assert.equal(await prisma.emailVerificationToken.count({where:{email:own.email,token:'913006'}}),1);
  assert.equal((await prisma.user.findUnique({where:{id:foreign.id}})).emailVerified,null);
  results.push('foreign email cannot consume or verify a different account code');
  const lost=await fresh('lost','913008');let writes=0;
  const uncertain=load('lib/email-verification-server.ts',{'@/lib/prisma':{prisma:{$queryRawUnsafe:async(...args)=>{writes++;await prisma.$queryRawUnsafe(...args);throw Error('synthetic lost commit acknowledgment');}}}});
  assert.equal((await uncertain.consumeEmailVerification(lost.email,'913008')).status,'unconfirmed');assert.equal(writes,1);
  assert.equal((await b.consumeEmailVerification(lost.email,'913008')).status,'invalid');
  assert.ok((await prisma.user.findUnique({where:{id:lost.id}})).emailVerified);
  results.push('lost committed acknowledgment never retries or claims verification; consumed code cannot grant again');
  const route=await fresh('route','913009'),h=fixture({sql:(...args)=>prisma.$queryRawUnsafe(...args)});
  const responses=await Promise.all(Array.from({length:8},()=>h.post({email:route.email,code:'913009'})));
  assert.equal(responses.filter(r=>r.status===200).length,1);assert.equal(h.calls.after.length,1);assert.equal(h.calls.mail.length,0);
  await Promise.all([h.calls.after[0](),h.calls.after[0]()]);assert.equal(h.calls.mail.length,1);
  results.push('actual route concurrency schedules one closed synthetic welcome only after verification acknowledgment');
  const held=await fresh('lock-expiry','913010',new Date(Date.now()+500));
  let release,ready;const hold=new Promise(r=>{release=r;}),locked=new Promise(r=>{ready=r;});
  const locker=prisma.$transaction(async tx=>{await tx.$queryRawUnsafe('SELECT id FROM users WHERE id = $1 FOR UPDATE',held.id);ready();await hold;});
  await locked;const pending=a.consumeEmailVerification(held.email,'913010');
  await new Promise(r=>setTimeout(r,750));release();await locker;
  assert.equal((await pending).status,'expired');assert.equal((await prisma.user.findUnique({where:{id:held.id}})).emailVerified,null);
  results.push('code expiring while waiting for its native account lock cannot verify after the lock is released');
  const missing=prefix+'-missing@example.invalid';
  assert.equal((await a.consumeEmailVerification(missing,'913006')).status,'invalid');
  assert.equal(await prisma.emailVerificationToken.count({where:{email:own.email,token:'913006'}}),1);
  results.push('missing account and replay cannot consume unrelated tokens');
 }finally{
  // Own random fixture accounts only; join all original promises before cleanup.
  // No inherited tokens, consent, clocks or recovery authority are rewritten.
  await prisma.emailVerificationToken.deleteMany({where:{email:{in:emails}}});
  await prisma.user.deleteMany({where:{id:{in:ids}}});
  assert.equal(await prisma.emailVerificationToken.count(),baseline);
 }
};
