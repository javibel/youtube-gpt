'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),native=require('./ab-history-native.test.cjs');
module.exports=async(prisma,results)=>{
 const bindings=[],users=[];try{
 for(const mode of ['cookie-deadline','cookie-abort','rows-deadline','rows-abort','rows-success-owner']){
  const owner=await prisma.user.create({data:{email:'ab-read-'+randomUUID()+'@example.invalid',emailVerified:new Date(Date.now()-10000)}});users.push(owner);
  await prisma.abTest.createMany({data:Array.from({length:23},(_,i)=>({userId:owner.id,videoId:'video-'+i,originalTitle:'Original '+i,variantA:'A '+i,variantB:'B '+i,status:'cancelled',startedAt:new Date(Date.UTC(2026,9,1,0,i)),completedAt:new Date(Date.UTC(2026,9,1,1,i))}))});
  const before=await prisma.abTest.findMany({where:{userId:owner.id},orderBy:{id:'asc'}}),stage=mode.startsWith('cookie')?'cookie':'rows',b=await native.bound({account:owner,db:prisma,held:stage});bindings.push(b);
  const p=b.start();await native.reached(b,stage);
  if(mode==='rows-success-owner'){b.f.setAccount({...b.f.account(),id:'neighbor'});b.release();const d=await native.reply(p,200);assert.equal(d.userId,owner.id);assert.equal(d.tests.length,20);assert.deepEqual(d.tests.map(t=>t.videoId),Array.from({length:20},(_,i)=>'video-'+(22-i)));}
  else{if(mode.endsWith('abort'))b.controller.abort();else b.advance(25000);assert.deepEqual(await native.reply(p,503),{error:'ab_read_unconfirmed'});}
  await native.drain(b);assert.equal(b.state.sql.length,stage==='cookie'?0:1);assert.deepEqual(await prisma.abTest.findMany({where:{userId:owner.id},orderBy:{id:'asc'}}),before);
  results.push('A/B native GET '+mode+': installed native issuer with closed credential account,actual owner-scoped SQL,25s/abort and original reader only;latest20 and stored rows unchanged;no writer/recovery/operative authority');
 }
 }finally{for(const b of bindings)await native.drain(b);await prisma.user.deleteMany({where:{id:{in:users.map(v=>v.id)}}});}
};
