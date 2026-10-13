'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {consumer,authFor,nativeUpdate,fixedEpoch,secret}=require('./admin-totp-consumption-fixture.cjs');
module.exports=async function(prisma,results){
 const prefix='synthetic-totp-consumption-'+randomUUID(),keys=new Set(),rateKeys=new Set();
 const native={$queryRawUnsafe:async(sql,key,...args)=>{(sql.includes('INSERT INTO totp_consumptions')?keys:rateKeys).add(key);return prisma.$queryRawUnsafe(sql,key,...args);}};
 const baseline=await prisma.totpConsumption.count();
 try{
  const a=consumer(native),b=consumer(native);
  const accepted=await Promise.all(Array.from({length:30},(_,i)=>(i%2?a:b).consume(prefix+'-concurrent',a.code,secret)));
  assert.equal(accepted.filter(Boolean).length,1);assert.equal(await prisma.totpConsumption.count(),baseline+1);
  results.push('native OTP has one atomic PostgreSQL admission across thirty concurrent consumers');
  const next=consumer(native,fixedEpoch+30000);assert.equal(await next.consume(prefix+'-concurrent',next.code,secret),true);assert.equal(await a.consume(prefix+'-concurrent',a.code,secret),false);
  assert.equal((await prisma.totpConsumption.findMany({where:{key:{in:[...keys]}}}))[0].counter,BigInt(Math.floor((fixedEpoch+30000)/30000)));
  results.push('permanent PostgreSQL watermark advances for next step and denies clock rollback');
  const lost={$queryRawUnsafe:async(sql,key,counter)=>{keys.add(key);await prisma.$queryRawUnsafe(sql,key,counter);throw Error('synthetic-lost-consumption-ack');}};
  const first=consumer(lost);assert.equal(await first.consume(prefix+'-lost',first.code,secret),false);assert.equal(await consumer(native).consume(prefix+'-lost',first.code,secret),false);
  results.push('lost SQL commit acknowledgment preserves consumption and replay denial');
  const one=authFor(native,{id:prefix+'-both',nativeRate:true}),two=authFor(native,{id:prefix+'-both',nativeRate:true});
  const [login,update]=await Promise.all([one.authorize({}),nativeUpdate(two)]);assert.equal(Number(login!==null)+Number(update.token.requiresTotp===false),1);
  const third=authFor(native,{id:prefix+'-both',nativeRate:true});assert.equal(await third.authorize({}),null);assert.equal((await nativeUpdate(third,{ref:'new-instance'})).token.requiresTotp,true);
  assert.equal((await prisma.rateLimit.findUnique({where:{key:'admin-totp-factor:'+one.user.id}})).hits,4);
  results.push('credentials and native Auth.js encrypted session share atomic durable consumption, including a new session reference');
 }finally{
  // Own random test identities only, after every original has settled. This cleanup
  // never touches inherited factors or restores authentication/recovery authority.
  await prisma.totpConsumption.deleteMany({where:{key:{in:[...keys]}}});
  await prisma.rateLimit.deleteMany({where:{key:{in:[...rateKeys]}}});
  assert.equal(await prisma.totpConsumption.count(),baseline);
 }
};
