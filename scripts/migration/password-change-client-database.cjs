'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),bcrypt=require('bcryptjs'),{load}=require('./route-harness.cjs'),{deferred,flush}=require('./chat-widget-harness.cjs'),client=require('./password-change-client.test.cjs');
module.exports=async(prisma,results)=>{
 const users=[],pages=[],gates=[],running=[],counts=async()=>({users:await prisma.user.count(),passwords:await prisma.passwordChangeAttempt.count(),profiles:await prisma.profileUpdateAttempt.count(),emails:await prisma.emailLog.count(),teams:await prisma.team.count(),generations:await prisma.generation.count()}),baseline=await counts(),seed=await bcrypt.hash(client.old,4);
 const fixture=async()=>{const u=await prisma.user.create({data:{email:'password-client-'+randomUUID()+'@example.invalid',name:'Synthetic <owner>',lang:'es',password:seed,marketingOptOut:true}});users.push(u.id);return u;};
 function bind(u,options={}){
  const h=client.create({storage:options.storage}),gate=deferred(),entered=deferred(),pending=[],packets=[];pages.push(h);gates.push(gate);h.state.user=u.id;h.state.email=u.email;h.state.lang=options.lang??'es';
  h.state.send=r=>{
   const p=(async()=>{
    const common={'node:crypto':require('node:crypto'),'node:buffer':require('node:buffer'),'bcryptjs':bcrypt,'@/lib/password':load('lib/password.ts'),'@/lib/prisma':{prisma}};
    let db=prisma,transactions=0;
    if(options.lostAck)db={user:prisma.user,passwordChangeAttempt:prisma.passwordChangeAttempt,$transaction:async(...a)=>{const i=++transactions,result=await prisma.$transaction(...a);if(i===2)throw Error('PRIVATE_LOST_ACK');return result;}};
    const helper=load('lib/password-change.ts',{...common,'@/lib/prisma':{prisma:db}}),notice=require('./direct-email-fixture.cjs').password({noProvider:options.notice==='not_started',
     send:async(packet,settings)=>{packets.push({packet,settings});if(options.notice==='unconfirmed')throw Error('PRIVATE_MOCK_FAILURE');return Response.json({id:'synthetic-only-ack'});}});

    const deps={'next/server':{NextResponse:Response},'node:crypto':require('node:crypto'),'@/auth':{auth:async()=>({user:{id:r.owner,email:r.email}})},'@/lib/prisma':{prisma},'@/lib/password-change':helper,'@/lib/password-change-notice':notice,
     '@/lib/plans':load('lib/plans.ts',{'@/lib/prisma':{prisma}}),'@/lib/generation-quota':require('./generation-quota-fixture.cjs')(prisma)};
    const isPassword=r.url==='/api/user/change-password',route=load(isPassword?'app/api/user/change-password/route.ts':'app/api/user/stats/route.ts',deps);
    const response=await route[r.init.method](new Request('https://example.invalid'+r.url,{method:r.init.method,...(isPassword?{headers:r.init.headers,body:JSON.stringify(r.body)}:{})})),body=await response.json();
    if(isPassword){entered.resolve({status:response.status,notification:body.notification});if(options.corrupt)options.corrupt(body);if(options.held==='headers')await gate.promise;}
    return{ok:response.ok,status:response.status,json:()=>isPassword&&options.held==='JSON'?gate.promise.then(()=>body):Promise.resolve(body)};
   })();pending.push(p);running.push(p);p.catch(()=>{});return p;
  };
  async function settle(){let n=0;do{const batch=pending.slice(n);n=pending.length;await Promise.all(batch);await client.ready(h);}while(n<pending.length);}
  async function ready(){await client.ready(h);await settle();}
  async function start(values){await ready();await client.edit(h,values);client.submit(h);await client.ready(h);}
  return{h,gate,entered,packets,start,ready,settle};
 }
 const row=(u,h)=>prisma.passwordChangeAttempt.findUnique({where:{userId_key:{userId:u.id,key:client.mutations(h)[0].init.headers['Idempotency-Key']}}});
 const current=u=>prisma.user.findUnique({where:{id:u.id}});
 async function changed(u){const after=await current(u);assert(await bcrypt.compare(client.next,after.password),'Expected only new synthetic credential');assert.equal(bcrypt.getRounds(after.password),12);for(const f of ['name','email','lang','marketingOptOut','onboardingStep'])assert.deepEqual(after[f],u[f]);}
 const note=s=>results.push('Password change client native '+s);
 try{
  for(const lang of ['es','en'])for(const notice of ['acknowledged','unconfirmed','not_started']){
   const u=await fixture(),x=bind(u,{lang,notice});await x.start();await x.settle();await changed(u);const a=await row(u,x.h),r=client.mutations(x.h)[0];assert.equal(a.state,'complete');assert.equal(a.lang,lang);assert.equal(x.packets.length,notice==='not_started'?0:1);assert.equal(client.mutations(x.h).length,1);assert.equal(client.inputs(x.h).length,0);assert.equal(x.h.storage.size,0);assert.match(x.h.text(),lang==='en'?/Password updated\./:/Contraseña actualizada\./);assert.match(x.h.text(),notice==='acknowledged'?lang==='en'?/delivery is not confirmed/:/entrega no está confirmada/:notice==='unconfirmed'?lang==='en'?/send is unconfirmed/:/envío del aviso está sin confirmar/:lang==='en'?/notice was not sent/:/aviso no se ha enviado/);
   assert(!JSON.stringify([...x.h.storage]).includes(client.old));assert.equal(r.init.signal,undefined);assert(!x.h.text().includes('PRIVATE'));
   note(lang+' actual profile UI/routed POST/bcrypt12/CAS complete with notice '+notice+'; one mock provider only and no inbox delivery claim');
  }
  for(const held of ['headers','JSON']){
   const u=await fixture(),x=bind(u,{held});await x.start();assert.equal((await x.entered.promise).status,200);await changed(u);assert.equal((await row(u,x.h)).state,'complete');x.h.advance(60000);await client.ready(x.h);assert.match(x.h.text(),/sin confirmar/);assert(x.h.button('Guardar contraseña').props.disabled);client.submit(x.h);assert.equal(client.mutations(x.h).length,1);x.gate.resolve();await x.settle();assert(!x.h.text().includes('Contraseña actualizada'));assert(x.h.button('Guardar contraseña').props.disabled);client.originalButton(x.h).props.onClick();await client.ready(x.h);assert.match(x.h.text(),/Contraseña actualizada/);assert.equal(client.inputs(x.h)[1].props.value,client.next);assert.equal(x.packets.length,1);
   note(held+'60s leaves real SQL commit unaccepted until deliberate same live original; row read never releases denial and no POST/mail replay');
  }
  {
   const u=await fixture(),x=bind(u,{held:'JSON'});await x.start();await x.entered.promise;client.inputs(x.h)[1].props.onChange({target:{value:'OtherSynthetic3'}});x.h.view();x.gate.resolve();await x.settle();assert(!x.h.text().includes('Contraseña actualizada'));assert.equal(client.inputs(x.h)[1].props.value,'OtherSynthetic3');client.originalButton(x.h).props.onClick();await client.ready(x.h);assert.match(x.h.text(),/Contraseña actualizada/);assert.equal(client.inputs(x.h)[1].props.value,'OtherSynthetic3');await changed(u);assert.equal(x.packets.length,1);
   note('draft changed after real SQL complete cannot be cleared/hidden by old UI callback; explicit original receipt preserves new credentials');
  }
  {
   const u=await fixture(),x=bind(u,{held:'JSON'});await x.start();await x.entered.promise;x.h.strictEffects();x.h.unmount();await client.ready(x.h);x.gate.resolve();await x.settle();assert(!x.h.text().includes('Contraseña actualizada'));client.originalButton(x.h).props.onClick();await client.ready(x.h);assert.match(x.h.text(),/Contraseña actualizada/);assert.equal(client.mutations(x.h).length,1);assert.equal(x.packets.length,1);
   note('Strict/remount retains same original without automatic UI acceptance, POST resend or regenerated capability');
  }
  {
   const u=await fixture(),x=bind(u,{held:'JSON'});await x.start();await x.entered.promise;const lost=bind(u,{storage:x.h.storage});await lost.ready();await client.edit(lost.h);client.submit(lost.h);await client.ready(lost.h);assert(lost.h.button('Guardar contraseña').props.disabled);assert.equal(client.mutations(lost.h).length,0);assert(!lost.h.text().includes('Contraseña actualizada'));assert.equal(lost.h.load('lib/password-change-client.ts').retainedPasswordChange({userId:u.id,email:u.email}),undefined);x.gate.resolve();await x.settle();await changed(u);assert.equal(x.packets.length,1);
   note('new module plus existing complete SQL and denial marker cannot restore original, accept password or invoke providers');
  }
  {
   const u=await fixture(),x=bind(u,{corrupt:b=>b.key='foreign'});await x.start();await x.settle();await changed(u);assert.equal((await row(u,x.h)).state,'complete');assert.match(x.h.text(),/sin confirmar/);client.originalButton(x.h).props.onClick();await client.ready(x.h);assert(!x.h.text().includes('Contraseña actualizada'));client.submit(x.h);assert.equal(client.mutations(x.h).length,1);assert.equal(x.packets.length,1);
   note('foreign HTTP key after real SQL commit remains unconfirmed and blocks new intent; private rows never replace exact receipt');
  }
  {
   const u=await fixture(),x=bind(u,{lostAck:true});await x.start();await x.settle();await changed(u);assert.equal((await row(u,x.h)).state,'complete');assert.match(x.h.text(),/sin confirmar/);assert.equal(x.packets.length,0);client.originalButton(x.h).props.onClick();await client.ready(x.h);assert(!x.h.text().includes('Contraseña actualizada'));client.submit(x.h);assert.equal(client.mutations(x.h).length,1);
   note('lost second transaction acknowledgement leaves real changed password/complete marker unconfirmed; no notice/recovery from SQL or retry');
  }
  {
   const u=await fixture(),x=bind(u,{held:'headers'});await x.start();await x.entered.promise;x.h.state.auth='unauthenticated';x.h.view(true);x.gate.resolve();await x.settle();assert(!x.h.text().includes('Contraseña actualizada'));assert(x.h.storage.size>0);await changed(u);assert.equal(x.packets.length,1);
   note('logout after committed SQL retires former account body/UI authority while original server effect and denial remain intact');
  }
  {
   const u=await fixture(),x=bind(u);await x.start(['WrongSynthetic3',client.next,client.next]);await x.settle();assert((await current(u)).password===u.password,'Wrong synthetic credential must not mutate');assert.equal(await prisma.passwordChangeAttempt.count({where:{userId:u.id}}),0);assert.match(x.h.text(),/no es correcta/);assert.equal(x.h.storage.size,0);const prior=client.mutations(x.h)[0].init.headers['Idempotency-Key'];await client.edit(x.h);client.submit(x.h);await x.settle();await changed(u);assert.notEqual(client.mutations(x.h)[1].init.headers['Idempotency-Key'],prior);assert.equal(x.packets.length,1);
   note('known wrong current password denies before SQL admission; deliberate corrected intent uses fresh key and changes once');
  }
  {
   const u=await fixture(),x=bind(u,{held:'JSON'});await x.start();await x.entered.promise;x.h.state.storageFailure='remove';x.gate.resolve();await x.settle();await changed(u);assert.match(x.h.text(),/Cambio confirmado, pero/);assert(x.h.storage.size>0);assert.equal(x.packets.length,1);
   note('storage removal failure keeps denial despite genuine password confirmation; only safe original effect occurs and no credentials are persisted');
  }
 }catch(e){throw Error('Password change client native contract failed: '+e.name+'; '+(e.stack?.split('\n').find(x=>x.includes('password-change-client-database.cjs'))?.trim()??'native fixture'));}finally{
  for(const g of gates)g.resolve();await Promise.allSettled(running);for(const h of pages)h.unmount();if(users.length)await prisma.user.deleteMany({where:{id:{in:users}}});assert.deepEqual(await counts(),baseline,'Own password client fixtures only; inherited rows remain untouched');await flush();
 }
};
