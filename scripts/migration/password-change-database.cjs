'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),bcrypt=require('bcryptjs'),{load}=require('./route-harness.cjs'),{deferred,flush}=require('./chat-widget-harness.cjs');
module.exports=async(prisma,results)=>{
 const users=[],instances=[],gates=[],running=[],oldInput='SyntheticOld1',newInput='SyntheticNew2',seedHash=await bcrypt.hash(oldInput,4);
 const counts=async()=>({users:await prisma.user.count(),passwords:await prisma.passwordChangeAttempt.count(),profiles:await prisma.profileUpdateAttempt.count(),emails:await prisma.emailLog.count(),teams:await prisma.team.count(),generations:await prisma.generation.count()});
 const baseline=await counts();
 async function user(options={}){const u=await prisma.user.create({data:{email:'password-'+randomUUID()+'@example.invalid',name:'Synthetic <owner>',lang:'es',password:options.noPassword?null:seedHash,marketingOptOut:true}});users.push(u.id);return u;}
 function bind(u,options={}){
  let now=1000,serial=0,transactions=0;const timers=new Map(),controller=new AbortController(),gate=deferred(),entered=deferred(),calls=[],packets=[],effects=[];gates.push(gate);
  const key=options.key??randomUUID(),body=options.body??{currentPassword:oldInput,newPassword:newInput,lang:options.lang??'es'};
  const stage=async(name,work)=>{calls.push(name);const p=(async()=>{const value=await work();if(options.held===name){entered.resolve();await gate.promise;}if(options.reject===name)throw Error('PRIVATE_LOST_ACK');return value;})();running.push(p);void p.catch(()=>{});return p;};
  const db={user:{findUnique:q=>stage('read',()=>prisma.user.findUnique(q))},passwordChangeAttempt:{findFirst:q=>stage('prior0',()=>prisma.passwordChangeAttempt.findFirst(q))},
   $transaction:(fn,settings)=>{const i=++transactions;return stage('ack'+i,()=>prisma.$transaction(tx=>fn({
    $queryRawUnsafe:(...args)=>stage('lock'+i,()=>tx.$queryRawUnsafe(...args)),
    passwordChangeAttempt:{findFirst:q=>stage('prior1',()=>tx.passwordChangeAttempt.findFirst(q)),create:q=>stage('admit',()=>tx.passwordChangeAttempt.create(q)),
     findUnique:q=>stage('attempt',async()=>{const v=await tx.passwordChangeAttempt.findUnique(q);return options.foreignAttempt?{...v,key:'foreign'}:v;}),
     updateMany:q=>stage('mark',()=>options.noMark?{count:0}:tx.passwordChangeAttempt.updateMany(q))},
    user:{updateMany:q=>stage('mutate',()=>options.noEffect?{count:0}:tx.user.updateMany(q))}
   }),settings));}};
  const realBcrypt={compare:(...a)=>stage('compare',()=>bcrypt.compare(...a)),hash:(...a)=>stage('hash',()=>bcrypt.hash(...a))};
  const globals={performance:{now:()=>now},setTimeout(fn,ms){const id=++serial;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id)};
  const helper=load('lib/password-change.ts',{'node:crypto':require('node:crypto'),'node:buffer':require('node:buffer'),'bcryptjs':realBcrypt,'@/lib/prisma':{prisma:db},'@/lib/password':load('lib/password.ts')},globals);
  const notice=load('lib/password-change-notice.ts',{'resend':{Resend:class{constructor(){this.emails={send:(packet,settings)=>{packets.push({packet,settings});return stage('mail',async()=>({data:{id:'synthetic-only-ack'}}));}};}}},
   '@/lib/emails':{passwordChangedEmail:load('lib/emails.ts').passwordChangedEmail}},{...globals,process:{env:options.noProvider?{}:{RESEND_API_KEY:'SYNTHETIC_NOT_A_SECRET'}}});
  const route=load('app/api/user/change-password/route.ts',{'next/server':{NextResponse:Response},'node:crypto':require('node:crypto'),'@/auth':{auth:async()=>({user:options.owner??{id:u.id,email:u.email}})},
   '@/lib/password-change':{...helper,changePasswordOriginal(...args){const p=helper.changePasswordOriginal(...args);effects.push(p);running.push(p);return p;}},'@/lib/password-change-notice':notice},globals);
  const headers={'content-type':'application/json',...(!options.legacy?{'Idempotency-Key':key}:{})};
  const original=route.POST(new Request('https://example.invalid/api/user/change-password',{method:'POST',headers,signal:controller.signal,body:JSON.stringify(body)}));running.push(original);
  const instance={u,key,original,entered,controller,calls,packets,timers,
   advance(){now+=55000;for(const[id,t]of [...timers])if(t.at<=now){timers.delete(id);t.fn();}},
   async observe(status){const r=await original;assert.equal(r.status,status);assert.equal(r.headers.get('cache-control'),'no-store');const b=await r.json();assert(!JSON.stringify(b).includes(oldInput)&&!JSON.stringify(b).includes(newInput),'Synthetic credential in public receipt');if(status===503)assert.deepEqual(b,{error:'password_change_unconfirmed'});return b;},
   async finish(){gate.resolve();await Promise.allSettled(effects);await flush();}
  };instances.push(instance);return instance;
 }
 const row=x=>prisma.passwordChangeAttempt.findUnique({where:{userId_key:{userId:x.u.id,key:x.key}}}),current=u=>prisma.user.findUnique({where:{id:u.id}});
 const changed=async u=>{const v=await current(u);assert(await bcrypt.compare(newInput,v.password),'Expected only the new synthetic credential');assert.equal(bcrypt.getRounds(v.password),12);return v;};
 const untouched=async u=>assert((await current(u)).password===u.password,'Original synthetic credential must remain unchanged');
 const note=t=>results.push('Password change native '+t);
 try{
  for(const lang of ['es','en']){
   const u=await user(),x=bind(u,{lang}),b=await x.observe(200),after=await changed(u),a=await row(x);
   assert.deepEqual(b,{ok:true,userId:u.id,email:u.email,key:x.key,status:'updated',lang,notification:'acknowledged'});assert.equal(a.state,'complete');assert.equal(a.lang,lang);
   assert.deepEqual(Object.keys(a).sort(),['id','userId','email','key','lang','state','createdAt'].sort());assert(!JSON.stringify(b).includes(a.id));assert.equal(x.packets[0].settings.idempotencyKey,a.id);assert(x.packets[0].packet.html.includes('&lt;owner&gt;'));
   for(const field of ['name','email','lang','marketingOptOut','emailVerified','onboardingStep'])assert.deepEqual(after[field],u[field]);
   await bind(after,{key:x.key,body:{currentPassword:newInput,newPassword:oldInput,lang}}).observe(503);assert.equal(await prisma.passwordChangeAttempt.count({where:{userId:u.id}}),1);
   note(lang+' actual bcrypt12/CAS and completion atomic; public receipt/metadata/mail contain no credential/hash; retained complete key denies reuse');
  }
  for(const held of ['compare','hash','admission-ack','mutate','completion-ack'])for(const action of ['timeout','abort']){
   const mapped=held==='admission-ack'?'ack1':held==='completion-ack'?'ack2':held,u=await user(),x=bind(u,{held:mapped});await x.entered.promise;
   if(action==='timeout')x.advance();else x.controller.abort();await x.observe(503);await x.finish();
   const a=await row(x);
   if(['compare','hash'].includes(held)){assert.equal(a,null);await untouched(u);}
   else{assert.equal(a.state,held==='admission-ack'?'pending':'complete');if(held==='admission-ack')await untouched(u);else await changed(u);
    await bind(await current(u),{key:x.key,body:{currentPassword:held==='admission-ack'?oldInput:newInput,newPassword:oldInput,lang:'es'}}).observe(503);
   }
   assert.equal(x.calls.filter(c=>c===mapped).length,1);assert.equal(x.packets.length,0);
   note(held+'/'+action+' original real bcrypt/SQL settles once after HTTP55s retirement; no late notice, password replay or reconstructed owner');
  }
  for(const fault of ['noEffect','noMark','foreignAttempt']){
   const u=await user(),x=bind(u,{[fault]:true});await x.observe(503);await untouched(u);assert.equal((await row(x)).state,'pending');await bind(u).observe(503);
   note(fault+' true SQL transaction rollback retains original pending admission and old password; another key cannot take over');
  }
  for(const reject of ['ack1','ack2']){
   const u=await user(),x=bind(u,{reject});await x.observe(503);const a=await row(x);assert.equal(a.state,reject==='ack1'?'pending':'complete');if(reject==='ack1')await untouched(u);else await changed(u);
   await bind(await current(u),{key:x.key,body:{currentPassword:reject==='ack1'?oldInput:newInput,newPassword:oldInput}}).observe(503);assert.equal(x.packets.length,0);
   note(reject+' lost original committed acknowledgement is503, never accepted from an independent row read or replayed for notice');
  }
  {
   const u=await user(),key=randomUUID(),xs=[bind(u,{key}),bind(u,{key}),bind(u,{key})],rs=await Promise.all(xs.map(x=>x.original));
   assert.equal(rs.filter(r=>r.status===200).length,1);assert(rs.every(r=>[200,409,503].includes(r.status)));await changed(u);assert.equal(await prisma.passwordChangeAttempt.count({where:{userId:u.id}}),1);assert.equal(xs.reduce((n,x)=>n+x.packets.length,0),1);
   note('independent same-key originals use physical user lock and unique admission to commit one bcrypt change and one mock notice');
  }
  {
   const u=await user(),x=bind(u,{held:'ack1'});await x.entered.promise;await bind(u).observe(503);await untouched(u);const foreign=await user();await bind(foreign).observe(200);await x.finish();await x.observe(200);
   note('pending owned admission excludes other fresh key while a different real synthetic account remains independent');
  }
  for(const field of ['email','password']){
   const u=await user(),x=bind(u,{held:'ack1'});await x.entered.promise;
   if(field==='email')await prisma.user.update({where:{id:u.id},data:{email:'changed-'+randomUUID()+'@example.invalid'}});
   else await prisma.user.update({where:{id:u.id},data:{password:await bcrypt.hash('DifferentSynthetic3',4)}});
   const after=await current(u);await x.finish();await x.observe(503);assert((await current(u)).password===after.password,'Concurrent synthetic write overwritten');assert.equal((await row(x)).state,'pending');assert.equal(x.packets.length,0);
   note(field+' changes after original admission are revalidated before effect; retained marker cannot redirect or overwrite concurrent account');
  }
  {
   const u=await user(),x=bind(u,{held:'hash'});await x.entered.promise;const external=await bcrypt.hash('DifferentSynthetic3',4);await prisma.user.update({where:{id:u.id},data:{password:external}});await x.finish();const b=await x.observe(409);assert.equal(b.error,'password_changed');assert((await current(u)).password===external,'Late bcrypt overwrote newer password');assert.equal(await row(x),null);
   note('genuine concurrent password write during bcrypt work produces409 before admission, preserving external state');
  }
  {
   const u=await user(),x=bind(u,{held:'mutate'});await x.entered.promise;let finished=false;const legacy=prisma.user.update({where:{id:u.id},data:{name:'Concurrent synthetic name'}}).then(()=>{finished=true;});running.push(legacy);
   let blocked=false;for(let i=0;i<100&&!blocked;i++){blocked=(await prisma.$queryRawUnsafe("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND state='active' AND wait_event_type='Lock' AND query LIKE '%users%'"))[0].n>0;if(!blocked)await new Promise(r=>setTimeout(r,5));}
   assert(blocked&&!finished,'Real user row lock must span dispatched CAS/marker');await x.finish();await x.observe(200);await legacy;await changed(u);assert.equal((await row(x)).state,'complete');
   note('real PostgreSQL row lock holds through password CAS and completion marker, excluding a concurrent legacy user writer');
  }
  for(const action of ['timeout','abort','rejection']){
   const u=await user(),x=bind(u,action==='rejection'?{reject:'mail'}:{held:'mail'});if(action!=='rejection'){await x.entered.promise;if(action==='timeout')x.advance();else x.controller.abort();}
   const b=await x.observe(200);assert.equal(b.notification,'unconfirmed');await x.finish();await changed(u);assert.equal((await row(x)).state,'complete');assert.equal(x.packets.length,1);
   await bind(await current(u),{key:x.key,body:{currentPassword:newInput,newPassword:oldInput}}).observe(503);assert.equal(x.packets.length,1);
   note('notice '+action+' leaves observed password confirmed200 and one mock original uncertain; no duplicate mutation/fallback/notice retry');
  }
  {
   const u=await user(),x=bind(u,{noProvider:true}),b=await x.observe(200);assert.equal(b.notification,'not_started');await changed(u);assert.equal(x.packets.length,0);
   note('missing synthetic sender distinguishes not-started notice from confirmed password; no Gmail fallback or real transport loaded');
  }
  for(const kind of ['id','email','passwordless','utf8-limit','wrong-current']){
   const u=await user({noPassword:kind==='passwordless'}),options={};
   if(kind==='id')options.owner={id:'foreign',email:u.email};if(kind==='email')options.owner={id:u.id,email:'foreign@example.invalid'};
   if(kind==='utf8-limit')options.body={currentPassword:oldInput,newPassword:'a1'+'🙂'.repeat(18)};
   if(kind==='wrong-current')options.body={currentPassword:'WrongSynthetic9',newPassword:newInput};
   const x=bind(u,options);await x.observe(['id','email'].includes(kind)?401:400);await untouched(u);assert.equal(await row(x),null);assert.equal(x.packets.length,0);
   note(kind+' denies before admission/notice; actual identity/password policy and bcrypt do not grant foreign writes');
  }
  {
   const u=await user(),x=bind(u,{legacy:true}),b=await x.observe(200);assert.equal(b.status,'updated');await changed(u);assert.equal(await prisma.passwordChangeAttempt.count({where:{userId:u.id}}),1);
   note('legacy POST without client key remains one fresh original with server-generated denial key, preserving current form compatibility');
  }
  {
   const u=await user(),x=bind(u,{held:'ack1'});await x.entered.promise;const a=await row(x);
   await assert.rejects(prisma.passwordChangeAttempt.create({data:{...a,id:randomUUID(),key:randomUUID()}}));assert.equal(await prisma.passwordChangeAttempt.count({where:{userId:u.id}}),1);await x.finish();await x.observe(200);
   const columns=(await prisma.$queryRawUnsafe("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='password_change_attempts'")).map(v=>v.column_name).sort();assert.deepEqual(columns,['id','userId','email','key','lang','state','createdAt'].sort());
   note('actual partial unique pending-user constraint denies alternate key; physical schema has no password/hash/digest or mail body columns');
  }
 }finally{
  for(const g of gates)g.resolve();for(const x of instances)await x.finish();await Promise.allSettled(running);await prisma.user.deleteMany({where:{id:{in:users}}});assert.deepEqual(await counts(),baseline);
 }
 note('cleanup only exact synthetic user IDs preserves all inherited rows and email counts; no credential, mail, model, provider or recovery effects');
};
