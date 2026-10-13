'use strict';
const assert=require('node:assert/strict'),{randomUUID,randomBytes}=require('node:crypto'),bcrypt=require('bcryptjs'),{load}=require('./route-harness.cjs'),direct=require('./direct-email-fixture.cjs');
module.exports=async(prisma,results)=>{
 const users=[],tokens=[],owned=[],release=[],packets=[],baseline={users:await prisma.user.count(),tokens:await prisma.passwordResetToken.count()},syntheticPassword='SyntheticNative2',hash='$2b$12$'+'x'.repeat(53);
 const seed=async(expired=false)=>{
  const user=await prisma.user.create({data:{email:'reset-'+randomUUID()+'@example.invalid',name:'Synthetic <owner>',password:'unchanged-synthetic'}});users.push(user.id);
  const token=randomBytes(32).toString('hex');tokens.push(token);await prisma.passwordResetToken.create({data:{email:user.email,token,expires:expired?new Date('2000-01-01T00:00:00.000Z'):new Date(Date.now()+60000)}});
  return{user,token};
 };
 function instance(database=prisma,realHash=false){
  const input=load('lib/password-reset-input.ts',{'node:buffer':require('node:buffer')});
  const helper=load('lib/password-reset-server.ts',{'bcryptjs':realHash?bcrypt:{hash:async()=>hash},'node:crypto':require('node:crypto'),'@/lib/prisma':{prisma:database},'@/lib/password':load('lib/password.ts'),'@/lib/password-reset-input':input,
   '@/lib/password-change-notice':direct.password({send:async(p,s)=>{packets.push({p,s});return Response.json({id:'synthetic-native-ack'});}})});
  const consume=token=>{const p=helper.consumePasswordResetOriginal(input.parsePasswordResetInput({token,password:syntheticPassword,lang:'es'}),()=>{});owned.push(p);return p;};
  return{helper,consume};
 }
 const current=u=>prisma.user.findUnique({where:{id:u.id}}),remaining=u=>prisma.passwordResetToken.count({where:{email:u.email}});
 try{
  const a=instance(),b=instance(),one=await seed(),many=await Promise.all(Array.from({length:20},(_,i)=>(i%2?a:b).consume(one.token)));
  assert.equal(many.filter(x=>x.status==='changed').length,1);assert.equal(many.filter(x=>x.status==='invalid').length,19);assert.equal((await current(one.user)).password,hash);assert.equal(await remaining(one.user),0);
  const success=many.find(x=>x.status==='changed'),owner=many.indexOf(success)%2?a:b;
  const notice=owner.helper.dispatchPasswordResetNotice(success.change,()=>{},()=>{});owned.push(notice);await Promise.all([notice,owner.helper.dispatchPasswordResetNotice(success.change,()=>{},()=>{})]);assert.equal(packets.length,1);
  assert.equal(await owner.helper.dispatchPasswordResetNotice({...success.change},()=>{},()=>{}),'not_started');
  results.push('Twenty concurrent native consumers in two modules commit one password/token consumption and one same-original synthetic notice; clone cannot recover it.');
  const dual=await seed(),second=randomBytes(32).toString('hex');tokens.push(second);await prisma.passwordResetToken.create({data:{email:dual.user.email,token:second,expires:new Date(Date.now()+60000)}});
  const pair=await Promise.all([a.consume(dual.token),b.consume(second)]);assert.equal(pair.filter(x=>x.status==='changed').length,1);assert.equal(pair.filter(x=>x.status==='invalid').length,1);assert.equal(await remaining(dual.user),0);
  results.push('Two different native reset links for one account serialize to one change and invalidate all its old links atomically.');
  const expired=await seed(true);assert.equal((await a.consume(expired.token)).status,'invalid');assert.equal((await current(expired.user)).password,'unchanged-synthetic');assert.equal(await remaining(expired.user),1);
  results.push('Declared expired native factor remains invalid and unchanged; no clock or expiry renewal.');
  const boundary=await seed();await prisma.$executeRawUnsafe("UPDATE password_reset_tokens SET expires=timezone('UTC',clock_timestamp()) WHERE token=$1",boundary.token);
  assert.equal((await a.consume(boundary.token)).status,'invalid');assert.equal((await current(boundary.user)).password,'unchanged-synthetic');
  results.push('Native UTC clock expiry boundary denies mutation.');
  const held=await seed();await prisma.$executeRawUnsafe("UPDATE password_reset_tokens SET expires=timezone('UTC',clock_timestamp())+INTERVAL '200 milliseconds' WHERE token=$1",held.token);
  let unlock,ready;const released=new Promise(r=>unlock=r),locked=new Promise(r=>ready=r);release.push(unlock);
  const locker=prisma.$transaction(async tx=>{await tx.$queryRawUnsafe('SELECT id FROM users WHERE id=$1 FOR UPDATE',held.user.id);ready();await released;});owned.push(locker);
  await locked;const waiting=a.consume(held.token);await new Promise(r=>setTimeout(r,500));unlock();await locker;assert.equal((await waiting).status,'invalid');assert.equal((await current(held.user)).password,'unchanged-synthetic');assert.equal(await remaining(held.user),1);
  results.push('Factor expiring during native account-lock wait cannot change the password after release.');
  const foreign=await seed();assert.equal((await b.consume(randomBytes(32).toString('hex'))).status,'invalid');assert.equal(await remaining(foreign.user),1);assert.equal((await current(foreign.user)).password,'unchanged-synthetic');
  results.push('Missing factor/account cannot consume or mutate another account.');
  const orphanEmail='orphan-reset-'+randomUUID()+'@example.invalid',orphan=randomBytes(32).toString('hex');tokens.push(orphan);await prisma.passwordResetToken.create({data:{email:orphanEmail,token:orphan,expires:new Date(Date.now()+60000)}});
  assert.equal((await a.consume(orphan)).status,'invalid');assert.equal(await prisma.passwordResetToken.count({where:{token:orphan}}),1);
  results.push('Orphan token is not adopted into a missing account.');
  const lost=await seed();let sqlCalls=0;const uncertain=instance({$queryRawUnsafe:async(...args)=>{sqlCalls++;await prisma.$queryRawUnsafe(...args);throw Error('synthetic lost native commit ACK');}});
  const lostResult=await uncertain.consume(lost.token);assert.equal(lostResult.status,'unconfirmed');assert.equal(sqlCalls,1);assert.equal((await current(lost.user)).password,hash);assert.equal(await remaining(lost.user),0);assert.equal((await b.consume(lost.token)).status,'invalid');assert.equal(packets.length,1);
  results.push('Lost committed native ACK gives no change/notice authority, lookup or retry; consumed factor cannot replay the password mutation.');
  const rollback=await seed(),rollbackInstance=instance({$queryRawUnsafe:async(...args)=>prisma.$transaction(async tx=>{await tx.$queryRawUnsafe(...args);throw Error('synthetic forced native rollback');})});
  assert.equal((await rollbackInstance.consume(rollback.token)).status,'unconfirmed');assert.equal((await current(rollback.user)).password,'unchanged-synthetic');assert.equal(await remaining(rollback.user),1);
  results.push('Native rollback restores both password and token together; no partial consumption or notice.');
  const real=await seed(),realInstance=instance(prisma,true),realResult=await realInstance.consume(real.token);assert.equal(realResult.status,'changed');const persisted=(await current(real.user)).password;assert.equal(bcrypt.getRounds(persisted),12);assert(await bcrypt.compare(syntheticPassword,persisted));assert.equal(await remaining(real.user),0);
  results.push('Actual bcrypt12 hash persists only through the same atomic native factor commit.');
 }finally{
  for(const fn of release)fn();await Promise.allSettled(owned);
  // Only this contract's new synthetic identities, after original promises settle.
  await prisma.passwordResetToken.deleteMany({where:{token:{in:tokens}}});await prisma.user.deleteMany({where:{id:{in:users}}});
  assert.equal(await prisma.user.count(),baseline.users);assert.equal(await prisma.passwordResetToken.count(),baseline.tokens);
 }
};
