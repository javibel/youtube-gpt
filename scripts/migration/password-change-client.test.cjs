'use strict';
const assert=require('node:assert/strict'),profile=require('./profile-client.test.cjs'),{deferred,flush,reply}=require('./chat-widget-harness.cjs');
const old='SyntheticOld1',next='SyntheticNew2';
function create(options={}){const h=profile.create(options),base=h.state.send;h.passwordAck=r=>({ok:true,userId:r.owner,email:r.email,key:r.init.headers['Idempotency-Key'],status:'updated',lang:r.body.lang,notification:'acknowledged'});h.state.send=r=>r.url==='/api/user/change-password'?reply(h.passwordAck(r)):base(r);return h;}
const mutations=h=>h.requests.filter(r=>r.url==='/api/user/change-password'),inputs=h=>h.nodes().filter(n=>n.type==='password-input'),own=h=>({userId:h.state.user,email:h.state.email});
async function ready(h){await profile.ready(h);}
function change(h,i,value){inputs(h)[i].props.onChange({target:{value}});h.view();}
async function edit(h,values=[old,next,next]){await ready(h);if(!inputs(h).length)h.click(h.state.lang==='en'?'Change password':'Cambiar contraseña');for(let i=0;i<3;i++)change(h,i,values[i]);await ready(h);}
const form=h=>h.nodes().find(n=>n.type==='form'),submit=h=>form(h).props.onSubmit({preventDefault(){}});
const originalButton=h=>h.button(h.state.lang==='en'?'Observe original request':'Consultar solicitud original');
async function run(){const results=[],test=async(name,fn)=>{const h=create();try{await fn(h);results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.name+'; '+(e.stack?.split('\n').find(l=>l.includes('password-change-client.test.cjs'))?.trim()??'directed contract failed')});}finally{h.unmount();}};
 for(const lang of ['es','en'])for(const notice of ['acknowledged','unconfirmed','not_started'])await test(lang+' original own200 confirms password separately from notice '+notice,async h=>{
  h.state.lang=lang;const base=h.state.send;h.state.send=r=>r.url==='/api/user/change-password'?reply({...h.passwordAck(r),notification:notice,noticeId:'private-nonce',password:'private-extra'}):base(r);
  await edit(h);const cb=form(h).props.onSubmit;cb({preventDefault(){}});cb({preventDefault(){}});await ready(h);
  assert.equal(mutations(h).length,1);const r=mutations(h)[0];assert.deepEqual(r.body,{currentPassword:old,newPassword:next,lang});assert.match(r.init.headers['Idempotency-Key'],/^[\w-]{1,128}$/);assert.equal(r.init.cache,'no-store');assert.equal(r.init.signal,undefined);
  assert.match(h.text(),lang==='en'?/Password updated\./:/Contraseña actualizada\./);assert.match(h.text(),notice==='acknowledged'?lang==='en'?/delivery is not confirmed/:/entrega no está confirmada/:notice==='unconfirmed'?lang==='en'?/send is unconfirmed/:/envío del aviso está sin confirmar/:lang==='en'?/notice was not sent/:/aviso no se ha enviado/);
  assert(!h.text().includes('private-extra'));assert(!h.text().includes('has been sent.'));assert.equal(inputs(h).length,0);assert.equal(h.timers.size,0);
  const c=h.load('lib/password-change-client.ts'),a=c.retainedPasswordChange(own(h)),result=c.trustedPasswordOutcome(a);
  assert.equal(Object.keys(a).sort().join(','),'key,lang,owner');assert(!JSON.stringify(a).includes(old)&&!JSON.stringify(a).includes(next));assert(Object.isFrozen(a));assert(Object.isFrozen(result.receipt));assert.equal(Object.keys(result.receipt).length,7);assert.equal(h.storage.size,0);
 });
 for(const held of ['headers','JSON'])await test(held+'60s bounds only waiter; genuine late result needs explicit same-original observation',async h=>{
  const g=deferred(),base=h.state.send;let bodies=0;h.state.send=r=>r.url!=='/api/user/change-password'?base(r):held==='headers'?g.promise.then(()=>reply(h.passwordAck(r))):{ok:true,status:200,json:()=>{bodies++;return g.promise.then(()=>h.passwordAck(r));}};
  await edit(h);submit(h);await ready(h);h.advance(60000);await ready(h);assert.match(h.text(),/Cambio de contraseña sin confirmar/);assert.match(h.text(),/original sigue pendiente/);assert(h.button('Guardar contraseña').props.disabled);
  g.resolve();await ready(h);assert(!h.text().includes('Contraseña actualizada.'));assert(h.button('Guardar contraseña').props.disabled);assert.equal(mutations(h).length,1);originalButton(h).props.onClick();await ready(h);assert.match(h.text(),/Contraseña actualizada/);assert.equal(inputs(h)[1].props.value,next);assert.equal(mutations(h).length,1);assert.equal(h.timers.size,0);
 });
 await test('headers/body share one60s budget and delayed timer callback cannot manufacture acceptance',async h=>{
  const headers=deferred(),body=deferred(),base=h.state.send;h.state.send=r=>r.url==='/api/user/change-password'?headers.promise.then(()=>({ok:true,status:200,json:()=>body.promise.then(()=>h.passwordAck(r))})):base(r);
  await edit(h);submit(h);await ready(h);h.advance(40000);headers.resolve();await ready(h);h.advance(20000,false);body.resolve();await ready(h);assert.match(h.text(),/sin confirmar/);assert(!h.text().includes('Contraseña actualizada.'));assert.equal(mutations(h).length,1);originalButton(h).props.onClick();await ready(h);assert.match(h.text(),/Contraseña actualizada/);
 });
 await test('explicit original observation gets a new local wait but never a new POST',async h=>{
  const g=deferred(),base=h.state.send;h.state.send=r=>r.url==='/api/user/change-password'?g.promise.then(()=>reply(h.passwordAck(r))):base(r);await edit(h);submit(h);await ready(h);h.advance(60000);await ready(h);originalButton(h).props.onClick();await ready(h);h.advance(60000);await ready(h);assert.match(h.text(),/sin confirmar/);assert.equal(mutations(h).length,1);g.resolve();await ready(h);assert(!h.text().includes('Contraseña actualizada.'));originalButton(h).props.onClick();await ready(h);assert.match(h.text(),/Contraseña actualizada/);
 });
 for(const field of ['userId','email','key','status','ok','lang','notification'])await test('foreign public receipt '+field+' cannot settle or release original',async h=>{
  const base=h.state.send;h.state.send=r=>r.url==='/api/user/change-password'?reply({...h.passwordAck(r),[field]:field==='ok'?false:'foreign'}):base(r);await edit(h);submit(h);await ready(h);assert.match(h.text(),/sin confirmar/);assert(!h.text().includes('Contraseña actualizada.'));submit(h);originalButton(h).props.onClick();await ready(h);assert.equal(mutations(h).length,1);assert(h.button('Guardar contraseña').props.disabled);
 });
 for(const status of [201,202,400,500,503])await test('success-shaped HTTP'+status+' cannot acknowledge password',async h=>{
  const base=h.state.send;h.state.send=r=>r.url==='/api/user/change-password'?reply(h.passwordAck(r),status):base(r);await edit(h);submit(h);await ready(h);assert.match(h.text(),/sin confirmar/);assert.equal(mutations(h).length,1);
 });
 for(const held of ['transport','JSON'])await test(held+' rejection preserves uncertainty without private diagnostic or retry',async h=>{
  const base=h.state.send;h.state.send=r=>r.url==='/api/user/change-password'?held==='transport'?Promise.reject(Error('PRIVATE_PROVIDER_CREDENTIAL')):{ok:true,status:200,json:()=>Promise.reject(Error('PRIVATE_PROVIDER_CREDENTIAL'))}:base(r);await edit(h);submit(h);await ready(h);assert.match(h.text(),/sin confirmar/);assert(!h.text().includes('PRIVATE'));submit(h);await ready(h);assert.equal(mutations(h).length,1);
 });
 for(const [status,error,expected]of [[400,'invalid_input','rechazada antes'],[401,'No autorizado','No autorizado'],[409,'password_changed','contraseña cambió'],[400,'La contraseña actual no es correcta','no es correcta'],[400,'No se puede cambiar la contraseña de esta cuenta','esta cuenta']])await test('known before-effect rejection '+status+' permits only a deliberate fresh intent',async h=>{
  const base=h.state.send;h.state.send=r=>r.url==='/api/user/change-password'?reply({error},status):base(r);await edit(h);submit(h);await ready(h);assert(h.text().includes(expected));assert.equal(h.storage.size,0);const first=mutations(h)[0].init.headers['Idempotency-Key'];submit(h);await ready(h);assert.equal(mutations(h).length,2);assert.notEqual(mutations(h)[1].init.headers['Idempotency-Key'],first);
 });
 await test('unknown error never grants a fresh intent even with a familiar HTTP status',async h=>{
  const base=h.state.send;h.state.send=r=>r.url==='/api/user/change-password'?reply({error:'PRIVATE_PROVIDER_CREDENTIAL'},400):base(r);await edit(h);submit(h);await ready(h);assert.match(h.text(),/sin confirmar/);assert(!h.text().includes('PRIVATE'));assert(h.button('Guardar contraseña').props.disabled);
 });
 for(const changeScope of ['account','email','auth','language','draft','close'])await test(changeScope+' synchronously retires old submit and cycling never revives its callback',async h=>{
  await edit(h);const cb=form(h).props.onSubmit,prior={...h.state};if(changeScope==='account')h.state.user='foreign';if(changeScope==='email')h.state.email='foreign@example.invalid';if(changeScope==='auth')h.state.auth='unauthenticated';if(changeScope==='language')h.state.lang='en';if(changeScope==='draft')change(h,1,'OtherSynthetic3');if(changeScope==='close')h.click('Cerrar formulario');h.view(true);cb({preventDefault(){}});await ready(h);Object.assign(h.state,prior);await edit(h);cb({preventDefault(){}});await ready(h);assert.equal(mutations(h).length,0);
 });
 for(const changeScope of ['account','email','auth'])for(const held of ['headers','JSON'])await test(changeScope+' after '+held+' withdraws body/UI authority from former original',async h=>{
  const g=deferred(),base=h.state.send;let bodies=0;h.state.send=r=>r.url!=='/api/user/change-password'?base(r):held==='headers'?g.promise.then(()=>({ok:true,status:200,json:async()=>{bodies++;return h.passwordAck(r);}})):{ok:true,status:200,json:()=>{bodies++;return g.promise.then(()=>h.passwordAck(r));}};
  await edit(h);submit(h);await ready(h);if(changeScope==='account')h.state.user='foreign';if(changeScope==='email')h.state.email='foreign@example.invalid';if(changeScope==='auth')h.state.auth='unauthenticated';h.view(true);await ready(h);g.resolve();await ready(h);assert(!h.text().includes('Contraseña actualizada'));assert.equal(bodies,held==='headers'?0:1);assert.equal(mutations(h).length,1);assert(h.storage.size>0);
 });
 await test('editing a pending draft preserves new credentials; only explicit observation shows prior confirmation',async h=>{
  const g=deferred(),base=h.state.send;h.state.send=r=>r.url==='/api/user/change-password'?g.promise.then(()=>reply(h.passwordAck(r))):base(r);await edit(h);submit(h);await ready(h);change(h,1,'OtherSynthetic3');change(h,2,'OtherSynthetic3');g.resolve();await ready(h);assert(!h.text().includes('Contraseña actualizada'));assert.equal(inputs(h)[1].props.value,'OtherSynthetic3');assert(h.button('Guardar contraseña').props.disabled);originalButton(h).props.onClick();await ready(h);assert.match(h.text(),/Contraseña actualizada/);assert.equal(inputs(h)[1].props.value,'OtherSynthetic3');assert.equal(mutations(h).length,1);
 });
 await test('Strict/remount has no automatic POST or late UI confirmation; retained live original alone is observable',async h=>{
  const g=deferred(),base=h.state.send;h.state.send=r=>r.url==='/api/user/change-password'?g.promise.then(()=>reply(h.passwordAck(r))):base(r);await edit(h);submit(h);await ready(h);h.strictEffects();h.unmount();await ready(h);g.resolve();await ready(h);assert(!h.text().includes('Contraseña actualizada'));originalButton(h).props.onClick();await ready(h);assert.match(h.text(),/Contraseña actualizada/);assert.equal(mutations(h).length,1);
 });
 await test('lost module only sees a denial marker; neither current values nor synthetic JSON restore original',async h=>{
  const g=deferred(),base=h.state.send;h.state.send=r=>r.url==='/api/user/change-password'?g.promise.then(()=>reply(h.passwordAck(r))):base(r);await edit(h);submit(h);await ready(h);const lost=create({storage:h.storage});await edit(lost);assert.match(lost.text(),/sin confirmar/);assert(lost.button('Guardar contraseña').props.disabled);assert.equal(lost.load('lib/password-change-client.ts').retainedPasswordChange(own(lost)),undefined);submit(lost);await ready(lost);assert.equal(mutations(lost).length,0);lost.unmount();g.resolve();await ready(h);
 });
 for(const failure of ['get','set','remove'])await test('storage '+failure+' denial never discards uncertainty or persists credentials',async h=>{
  await edit(h);h.state.storageFailure=failure;submit(h);await ready(h);assert.equal(mutations(h).length,failure==='remove'?1:0);assert(h.storage.size===0||[...h.storage.values()].every(x=>x==='pending'));assert(!inputs(h).length||h.button('Guardar contraseña').props.disabled);assert(!JSON.stringify([...h.storage]).includes(old));if(failure==='remove')assert.match(h.text(),/Cambio confirmado, pero/);
 });
 await test('copied or forged handle/receipt grants no original observation or release',async h=>{
  const g=deferred(),base=h.state.send;h.state.send=r=>r.url==='/api/user/change-password'?g.promise.then(()=>reply(h.passwordAck(r))):base(r);await edit(h);submit(h);await ready(h);const c=h.load('lib/password-change-client.ts'),a=c.retainedPasswordChange(own(h));assert.equal(c.trustedPasswordOutcome({...a}),undefined);assert.equal(c.acknowledgePasswordOriginal({...a}),false);assert.equal((await c.observePasswordOriginal({...a})).status,'unconfirmed');assert.throws(()=>Object.defineProperty(a,'key',{value:'forged'}));assert(c.passwordChangeBlocked(own(h)));g.resolve();await ready(h);const b={...a,original:Promise.resolve({status:'confirmed'})};assert.equal(c.acknowledgePasswordOriginal(b),false);
 });
 for(const [label,values]of [['mismatch',[old,next,'DifferentSynthetic3']],['empty',['',next,next]],['policy',[old,'short','short']],['currentUTF8',['🙂'.repeat(19),next,next]],['newUTF8',[old,'a1'+'🙂'.repeat(18),'a1'+'🙂'.repeat(18)]]])await test('local '+label+' validation blocks before POST/key/storage',async h=>{
  await edit(h,values);submit(h);await ready(h);assert.equal(mutations(h).length,0);assert.equal(h.storage.size,0);assert(h.nodes().some(n=>n.props?.role==='alert'));if(label.includes('UTF8'))assert.match(h.text(),/72 bytes UTF-8/);
 });
 const report={suite:'password-change-client',status:results.every(x=>x.status==='PASS')?'PASS':'FAIL',results};return report;
}
if(require.main===module)run().then(report=>{console.log(JSON.stringify(report,null,2));if(report.status!=='PASS')process.exitCode=1;});
module.exports={run,create,ready,edit,submit,mutations,inputs,originalButton,old,next};
