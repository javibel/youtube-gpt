'use strict';
const assert=require('node:assert/strict'),{fixture,deferred,flush}=require('./password-recovery-client-harness.cjs');
const inputForgot={mode:'forgot',email:' SYNTHETIC@EXAMPLE.INVALID ',lang:'es'},inputReset={mode:'reset',token:'a'.repeat(64),password:'SyntheticPassword1',lang:'es'};
const reply=mode=>Response.json(mode==='forgot'?{ok:true,status:'accepted'}:{ok:true,status:'updated',notification:'acknowledged'},{status:mode==='forgot'?202:200});
const api=h=>h.load('lib/password-recovery-client.ts'),lane=h=>h.load('lib/session-cookie-writer.ts');
const requests=h=>h.requests.filter(x=>x.url.includes('forgot-password')||x.url.includes('reset-password'));
function direct(mode='forgot'){const h=fixture({mode});return{h,api:api(h),input:mode==='forgot'?{...inputForgot}:{...inputReset}};}
function begin(d,active=()=>true){const context={},attempt=d.api.beginPasswordRecovery(d.input,context,active);assert(attempt);return{context,attempt,view:d.api.observePasswordRecovery(attempt,context,active)};}
async function fill(h,mode){await h.ready();if(mode==='forgot')h.change('email','synthetic@example.invalid');else{for(const id of ['recovery-password','recovery-confirm'])h.nodes().find(n=>n.type==='input'&&n.props.id===id).props.onChange({target:{value:'SyntheticPassword1'}});}await h.ready();}
function button(h,pattern){return h.nodes().find(n=>n.type==='button'&&h.nodes(n).filter(x=>typeof x==='string').join(' ').match(pattern));}
async function run(){const results=[];async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.stack});}}
 for(const mode of ['forgot','reset'])await test(mode+' exact native ACK owns one private completion, fixed request and no cookies/auth/storage',async()=>{
  const d=direct(mode),own=begin(d);await flush();const outcome=await own.view.promise;assert.equal(outcome.status,mode==='forgot'?'accepted':'updated');assert.equal(requests(d.h).length,1);
  const r=requests(d.h)[0];assert.equal(r.init.method,'POST');assert.equal(r.init.redirect,'error');assert.equal(r.init.cache,'no-store');assert.equal(r.init.credentials,'omit');const b=JSON.parse(r.init.body);assert.equal(b.mode,undefined);assert.equal(b.lang,'es');assert.equal(b.email??b.token,mode==='forgot'?'synthetic@example.invalid':inputReset.token);
  assert.equal(d.api.claimRecoveryCompletion({...own.attempt},own.context,outcome),false);assert.equal(d.api.claimRecoveryCompletion(own.attempt,own.context,JSON.parse(JSON.stringify(outcome))),false);assert.equal(d.api.claimRecoveryCompletion(own.attempt,{},outcome),false);
  assert.equal(d.api.claimRecoveryCompletion(own.attempt,own.context,outcome),mode==='forgot'?'accepted':'/login?reset=1');assert.equal(d.api.claimRecoveryCompletion(own.attempt,own.context,outcome),false);assert.equal(d.h.storage.size,0);assert.equal(d.h.state.sdkCalls,0);assert.equal(d.api.beginPasswordRecovery(d.input,own.context,()=>true),undefined);d.h.unmount();
 });
 const uncertain=[
 ['200 empty',()=>Response.json({})],['wrong status',()=>Response.json({ok:true,status:'accepted'})],['503 claimed update',()=>Response.json({ok:true,status:'updated',notification:'acknowledged'},{status:503})],
 ['mixed',()=>Response.json({ok:true,status:'accepted',delivered:true},{status:202})],['array',()=>Response.json([],{status:202})],['null',()=>Response.json(null,{status:202})],
 ['private text',()=>new Response('PRIVATE_DETAIL',{status:200})],['bad JSON',()=>new Response('{',{headers:{'content-type':'application/json'}})],['oversized',()=>Response.json({ok:true,detail:'x'.repeat(5000)},{status:202})],
 ['invalid UTF8',()=>new Response(new Uint8Array([0xc3,0x28]),{headers:{'content-type':'application/json'}})],['redirect',()=>Response.redirect('https://foreign.invalid',302)],['fetch throw',()=>{throw Error('PRIVATE_DETAIL');}],
 ['unknown error',()=>Response.json({error:'password_reset_unconfirmed'},{status:503})],['unrecognized denial',()=>Response.json({error:'foreign-denial'},{status:400})]];
 for(const mode of ['forgot','reset'])for(const[name,response]of uncertain)await test(mode+' '+name+' retains its original and excludes new recovery/auth',async()=>{
  const d=direct(mode);d.h.control.recovery=response;const own=begin(d);await flush();const o=await own.view.promise;assert.equal(o.status,'unconfirmed');assert.equal(d.api.claimRecoveryCompletion(own.attempt,own.context,o),false);assert.equal(d.api.beginPasswordRecovery(d.input,{},()=>true),undefined);assert.equal(lane(d.h).admitSessionCookieWriter('google'),undefined);assert.equal(requests(d.h).length,1);d.h.unmount();
 });
 for(const kind of ['totp','signout','refresh','credentials','google','email','signup','recovery'])await test('shared '+kind+' exclusion prevents recovery before any native HTTP',async()=>{
  const d=direct();const p=lane(d.h).admitSessionCookieWriter(kind);assert(p);assert.equal(d.api.beginPasswordRecovery(d.input,{},()=>true),undefined);assert.equal(requests(d.h).length,0);if(kind==='recovery'){assert.equal(lane(d.h).markSessionCookiePost(p),false);assert.equal(lane(d.h).markSessionCookieRead(p),false);}d.h.unmount();
 });
 for(const mode of ['forgot','reset'])for(const stage of ['HTTP','body'])await test(mode+' held '+stage+' timeout retains lane; explicit late observation joins without new HTTP',async()=>{
  const d=direct(mode),g=deferred();let stream;d.h.control.recovery=()=>stage==='HTTP'?g.promise:new Response(new ReadableStream({start(c){stream=c;}}),{status:mode==='forgot'?202:200,headers:{'content-type':'application/json'}});
  const own=begin(d);await flush();d.h.advance(60000);await flush();assert.equal((await own.view.promise).status,'unconfirmed');assert.equal(d.api.beginPasswordRecovery(d.input,{},()=>true),undefined);assert.equal(lane(d.h).admitSessionCookieWriter('credentials'),undefined);
  if(stage==='HTTP')g.resolve(reply(mode));else{stream.enqueue(new TextEncoder().encode(JSON.stringify(mode==='forgot'?{ok:true,status:'accepted'}:{ok:true,status:'updated',notification:'not_started'})));stream.close();}
  await flush();assert.equal(requests(d.h).length,1);const late=d.api.observePasswordRecovery(own.attempt,own.context,()=>true);assert.equal((await late.promise).status,mode==='forgot'?'accepted':'updated');assert.equal(requests(d.h).length,1);d.h.unmount();
 });
 await test('monotonic observation budget before timer callback does not auto-claim a late terminal',async()=>{
  const d=direct('reset'),g=deferred();d.h.control.recovery=()=>g.promise;const own=begin(d);await flush();d.h.advance(60000,false);g.resolve(reply('reset'));await flush();assert.equal((await own.view.promise).status,'unconfirmed');assert.equal(d.api.claimRecoveryCompletion(own.attempt,own.context,{status:'updated'}),false);assert.equal(requests(d.h).length,1);d.h.unmount();
 });
 for(const [mode,error,status,result]of [['forgot','invalid_input',400,'invalid'],['reset','invalid_or_expired_link',400,'expired'],['reset','too_many_requests',429,'rate-limited']])await test(mode+' known denial '+result+' releases only its genuine noncookie terminal',async()=>{
  const d=direct(mode);d.h.control.recovery=()=>Response.json({error},{status});const own=begin(d);await flush();assert.equal((await own.view.promise).status,result);assert.equal(lane(d.h).sessionCookieWriterBusy(),false);d.h.control.recovery=()=>reply(mode);assert(d.api.beginPasswordRecovery(d.input,{},()=>true));await flush();assert.equal(requests(d.h).length,2);d.h.unmount();
 });
 await test('retirement before fetch is genuine nonissuance, not a metadata/clock release',async()=>{
  const d=direct(),own=begin(d);d.api.retireRecoveryProgress(own.attempt);await flush();assert.equal(requests(d.h).length,0);assert.equal(lane(d.h).sessionCookieWriterBusy(),false);assert.equal((await own.view.promise).status,'unconfirmed');d.h.unmount();
 });
 await test('captured secret/email/locale cannot mutate delayed original payload',async()=>{
  for(const mode of ['forgot','reset']){const d=direct(mode),own=begin(d);d.input.email='foreign@example.invalid';d.input.token='foreign';d.input.password='foreign';d.input.lang='en';await flush();const b=JSON.parse(requests(d.h)[0].init.body);assert.equal(b.lang,'es');assert.equal(b.email??b.token,mode==='forgot'?'synthetic@example.invalid':inputReset.token);await own.view.promise;d.h.unmount();}
 });
 for(const mode of ['forgot','reset'])await test('actual '+mode+' form same-turn double submit has one HTTP and exact UI/navigation',async()=>{
  const h=fixture({mode});await fill(h,mode);const form=h.nodes().find(n=>n.type==='form');form.props.onSubmit({preventDefault(){}});form.props.onSubmit({preventDefault(){}});await h.ready();assert.equal(requests(h).length,1);if(mode==='forgot'){assert.match(h.text(),/Solicitud aceptada/);assert(!h.text().includes('Email enviado'));assert.match(h.text(),/no garantiza/);assert.equal(h.navigation.length,0);}else assert.deepEqual(h.navigation,['/login?reset=1']);assert.equal(h.storage.size,0);h.unmount();
 });
 for(const mode of ['forgot','reset'])await test('actual '+mode+' unknown terminal disables fresh submit and private diagnostics never render',async()=>{
  const h=fixture({mode});h.control.recovery=()=>Response.json({error:'PRIVATE_DETAIL'},{status:503});await fill(h,mode);await h.submit();await h.ready();assert.match(h.text(),/sin confirmar/);assert(!h.text().includes('PRIVATE_DETAIL'));assert.equal(h.nodes().find(n=>n.type==='button'&&n.props.type==='submit').props.disabled,true);assert.equal(requests(h).length,1);h.unmount();
 });
 for(const mode of ['forgot','reset'])for(const stage of ['HTTP','body'])for(const change of ['field','ABA','path','query','language','unmount','Strict'])await test('actual '+mode+' '+change+' during '+stage+' cannot adopt late success',async()=>{
  const h=fixture({mode}),g=deferred();let stream;h.control.recovery=()=>stage==='HTTP'?g.promise:new Response(new ReadableStream({start(c){stream=c;}}),{status:mode==='forgot'?202:200,headers:{'content-type':'application/json'}});await fill(h,mode);h.submit();await h.ready();
  if(change==='unmount')h.unmount();else if(change==='Strict')h.strictEffects();else if(change==='language'){button(h,/ES.*EN/).props.onClick();h.view();}else if(change==='path'){h.browser.window.location.pathname='/other';h.view();h.browser.window.location.pathname=mode==='forgot'?'/forgot-password':'/reset-password';h.view();}else if(change==='query'){h.state.query.other='different';h.view();delete h.state.query.other;h.view();}else if(mode==='forgot'){h.change('email','changed@example.invalid');if(change==='ABA')h.change('email','synthetic@example.invalid');}else{const field=h.nodes().find(n=>n.type==='input'&&n.props.id==='recovery-password');field.props.onChange({target:{value:'DifferentPassword1'}});h.view();if(change==='ABA'){h.nodes().find(n=>n.type==='input'&&n.props.id==='recovery-password').props.onChange({target:{value:'SyntheticPassword1'}});h.view();}}
  if(stage==='HTTP')g.resolve(reply(mode));else{stream.enqueue(new TextEncoder().encode(JSON.stringify(mode==='forgot'?{ok:true,status:'accepted'}:{ok:true,status:'updated',notification:'acknowledged'})));stream.close();}
  await flush();if(change!=='unmount')await h.ready();assert.equal(h.navigation.length,0);assert.equal(requests(h).length,1);if(mode==='forgot'&&change!=='unmount')assert(!h.text().includes('Solicitud aceptada'));h.unmount();
 });
 for(const mode of ['forgot','reset'])await test('actual '+mode+' timeout needs explicit same-original observation before UI/navigation',async()=>{
  const h=fixture({mode}),g=deferred();h.control.recovery=()=>g.promise;await fill(h,mode);h.submit();await h.ready();h.advance(60000);await h.ready();assert.match(h.text(),/sin confirmar/);g.resolve(reply(mode));await h.ready();assert.equal(h.navigation.length,0);if(mode==='forgot')assert(!h.text().includes('Solicitud aceptada'));button(h,/Consultar solicitud pendiente/).props.onClick();await h.ready();assert.equal(requests(h).length,1);if(mode==='reset')assert.deepEqual(h.navigation,['/login?reset=1']);else assert.match(h.text(),/Solicitud aceptada/);h.unmount();
 });
 await test('invalid reset link/confirmation/UTF8 limit and email never dispatch native work',async()=>{
  const h=fixture({mode:'reset'});h.state.query.token='bad';await h.ready();assert.match(h.text(),/Enlace inválido/);assert.equal(h.nodes().some(n=>n.type==='form'),false);assert.equal(requests(h).length,0);h.unmount();
  const d=direct('reset');assert.equal(d.api.beginPasswordRecovery({...inputReset,password:'A1'+'é'.repeat(36)}, {},()=>true),undefined);assert.equal(d.api.beginPasswordRecovery({...inputReset,token:'A'.repeat(64)}, {},()=>true),undefined);assert.equal(requests(d.h).length,0);d.h.unmount();
  const f=fixture({mode:'reset'});await fill(f,'reset');f.nodes().find(n=>n.type==='input'&&n.props.id==='recovery-confirm').props.onChange({target:{value:'Other1'}});await f.ready();await f.submit();await f.ready();assert.match(f.text(),/no coinciden/);assert.equal(requests(f).length,0);f.unmount();
 });
 await test('labels/autocomplete/statuses are accessible and storage denial is tolerated without storing a factor',async()=>{
  const h=fixture({mode:'reset'});h.browser.localStorage.getItem=()=>{throw Error('Storage denied');};h.browser.localStorage.setItem=()=>{throw Error('Storage denied');};await fill(h,'reset');assert(h.nodes().filter(n=>n.type==='label').every(n=>h.nodes().some(i=>i.type==='input'&&i.props.id===n.props.htmlFor)));assert(h.nodes().filter(n=>n.type==='input'&&n.props.id?.startsWith('recovery-')).every(n=>n.props.autoComplete==='new-password'));button(h,/ES.*EN/).props.onClick();await h.ready();assert.equal(h.storage.size,0);h.unmount();
 });
 for(const mode of ['forgot','reset'])await test('actual '+mode+' client/server route composition requires native body and never authenticates',async()=>{
  const h=fixture({mode}),server=require('./'+(mode==='forgot'?'forgot-password-server.test.cjs':'password-reset-server.test.cjs')).fixture();
  h.control.recovery=request=>server.post(JSON.parse(request.init.body));await fill(h,mode);
  if(mode==='reset'){for(const id of ['recovery-password','recovery-confirm'])h.nodes().find(n=>n.type==='input'&&n.props.id===id).props.onChange({target:{value:'SyntheticNew2'}});await h.ready();}
  await h.submit();await h.ready();assert.equal(requests(h).length,1);assert.equal(h.state.sdkCalls,0);assert.equal(h.storage.size,0);
  if(mode==='forgot'){assert.match(h.text(),/Solicitud aceptada/);assert.equal(server.calls.sql.length,0);assert.equal(server.calls.mail.length,0);assert.equal(server.calls.after.length,1);await Promise.all([server.calls.after[0](),server.calls.after[0]()]);assert.equal(server.calls.mail.length,1);}
  else{assert.deepEqual(h.navigation,['/login?reset=1']);assert.equal(server.queries.length,1);assert.equal(server.packets.length,1);}
  h.unmount();
 });
 for(const mode of ['forgot','reset'])await test('actual '+mode+' same-turn field change before dispatch genuinely prevents HTTP',async()=>{
  const h=fixture({mode});await fill(h,mode);h.submit();if(mode==='forgot')h.change('email','other@example.invalid');else{h.nodes().find(n=>n.type==='input'&&n.props.id==='recovery-password').props.onChange({target:{value:'DifferentPassword2'}});h.view();}
  await h.ready();assert.equal(requests(h).length,0);assert.equal(lane(h).sessionCookieWriterBusy(),false);assert.equal(h.navigation.length,0);h.unmount();
 });
 return{status:results.every(r=>r.status==='PASS')?'PASS':'FAIL',scope:'Actual recovery original, native Response streams, hooks/form/pages and shared writer. Closed synthetic browser/HTTP only; no real factor/mail/account/authentication/consent/freshness acceptance or durable/cross-realm recovery.',results};
}
module.exports={run,direct,begin,fill,requests,button};
if(require.main===module){const timer=setTimeout(()=>{console.error('Missing recovery client terminal');process.exit(1);},40000);run().then(r=>{console.log(JSON.stringify(r,null,2));if(r.status!=='PASS')process.exitCode=1;}).catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>clearTimeout(timer));}
