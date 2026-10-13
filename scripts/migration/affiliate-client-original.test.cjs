'use strict';
const assert=require('node:assert/strict'),{fixture,ack,deferred,flush}=require('./affiliate-application-client-harness.cjs');
const input={name:' Synthetic <name> ',email:' SYNTHETIC@EXAMPLE.INVALID ',channelInfo:' Own\r\nchannel ',lang:'es'};
const api=h=>h.load('lib/affiliate-application-client.ts');
const direct=()=>{const h=fixture();return{h,api:api(h)};};
function begin(d){const context={},attempt=d.api.beginAffiliateApplication({...input},context,()=>true);assert(attempt);return{context,attempt,observer:d.api.observeAffiliateApplication(attempt,context,()=>true)};}
function change(h,field,value,at=0,render=true){const element=h.nodes().filter(n=>n.props?.name===field)[at];assert(element);element.props.onChange({target:{value}});if(render)h.view();}
async function fill(h,at=0){await h.ready();for(const[field,value]of [['name','Synthetic'],['email','synthetic@example.invalid'],['channelInfo','Own synthetic channel']])change(h,field,value,at);await h.ready();}
function button(h,re){return h.nodes().find(n=>n.type==='button'&&re.test(h.nodes(n.props.children).filter(x=>typeof x==='string').join(' ')));}
async function run(){
 const results=[];async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.stack});}}
 await test('actual dormant flag closes original and actual form before any HTTP/input submission',async()=>{
  const actual=fixture().load('lib/features.ts');assert.equal(actual.AFFILIATES_DORMANT,true);const h=fixture({dormant:actual.AFFILIATES_DORMANT}),a=api(h);
  assert.equal(a.affiliateApplicationDormant(),true);assert.equal(a.beginAffiliateApplication(input,{},()=>true),undefined);await h.ready();assert.equal(h.nodes().some(n=>n.type==='form'),false);assert.match(h.text(),/programa no está disponible/);assert.equal(h.requests.length,0);h.unmount();
 });
 const bad=[
  ['old201',()=>Response.json({ok:true},{status:201})],['mixed202',()=>Response.json({ok:true,status:'accepted',approved:true},{status:202})],
  ['wrong status',()=>Response.json({ok:true,status:'accepted'},{status:200})],
  ['redirect',()=>{const r=ack();Object.defineProperty(r,'redirected',{value:true});return r;}],
  ['foreign URL',()=>{const r=ack();Object.defineProperty(r,'url',{value:'https://foreign.invalid/api/affiliates/apply'});return r;}],
  ['non-native object',()=>({status:202,ok:true,json:async()=>({ok:true,status:'accepted'})})],
  ['wrong MIME',()=>new Response('{"ok":true,"status":"accepted"}',{status:202,headers:{'content-type':'application/json-wrong'}})],
  ['array',()=>Response.json([{ok:true,status:'accepted'}],{status:202})],
  ['truncated JSON',()=>new Response('{"ok":true',{status:202,headers:{'content-type':'application/json'}})],
  ['oversized Reader',()=>new Response(' '.repeat(4097)+'{"ok":true,"status":"accepted"}',{status:202,headers:{'content-type':'application/json'}})],
  ['invalid UTF8',()=>new Response(new Uint8Array([0xc3,0x28]),{status:202,headers:{'content-type':'application/json'}})],
  ['Reader failure',()=>new Response(new ReadableStream({start(c){c.error(Error('PRIVATE_READER'));}}),{status:202,headers:{'content-type':'application/json'}})],
  ['fetch failure',()=>{throw Error('PRIVATE_HTTP');}],
  ['server unknown',()=>Response.json({error:'application_unconfirmed'},{status:503})],
  ['mixed denial',()=>Response.json({error:'not_found',ok:true},{status:404})]
 ];
 for(const[name,response]of bad)await test(name+' retains private exclusion without replay or metadata success',async()=>{
  const d=direct();d.h.control.fetch=response;const o=begin(d);assert.equal((await o.observer.promise).status,'unconfirmed');assert.equal(d.api.affiliateApplicationBlocked(),true);assert.equal(d.api.beginAffiliateApplication(input,{},()=>true),undefined);assert.equal(d.api.claimAffiliateApplicationAccepted(o.attempt,o.context,{status:'accepted'}),false);assert.equal(d.h.requests.length,1);d.h.unmount();
 });
 await test('native split body and canonical captured payload; observed receipt is private and one-use',async()=>{
  const d=direct();d.h.control.fetch=()=>new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{"ok":'));c.enqueue(new TextEncoder().encode('true,"status":"accepted"}'));c.close();}}),{status:202,headers:{'content-type':'application/json; charset=utf-8'}});
  const context={},value={...input},attempt=d.api.beginAffiliateApplication(value,context,()=>true);value.name='Foreign';value.email='foreign@example.invalid';value.channelInfo='foreign';value.lang='en';
  const observer=d.api.observeAffiliateApplication(attempt,context,()=>true),outcome=await observer.promise;
  assert.equal(d.api.claimAffiliateApplicationAccepted(attempt,context,JSON.parse(JSON.stringify(outcome))),false);
  for(const clone of [{...attempt},JSON.parse(JSON.stringify(attempt))])assert.equal(d.api.claimAffiliateApplicationAccepted(clone,context,outcome),false);
  assert.equal(fixture().load('lib/affiliate-application-client.ts').claimAffiliateApplicationAccepted(attempt,context,outcome),false);
  assert.equal(d.api.claimAffiliateApplicationAccepted(attempt,{},outcome),false);assert.equal(d.api.claimAffiliateApplicationAccepted(attempt,context,outcome),true);assert.equal(d.api.claimAffiliateApplicationAccepted(attempt,context,outcome),false);
  assert.equal(d.api.beginAffiliateApplication(input,context,()=>true),undefined);assert.equal(d.api.affiliateApplicationBlocked(),false);
  const r=d.h.requests[0];assert.deepEqual(JSON.parse(r.init.body),{name:'Synthetic <name>',email:'synthetic@example.invalid',lang:'es',channelInfo:'Own\nchannel'});
  for(const[k,v]of [['credentials','omit'],['redirect','error'],['cache','no-store']])assert.equal(r.init[k],v);
  assert.equal(r.init.signal,undefined);assert.equal(d.h.storage.size+d.h.navigation.length,0);d.h.unmount();
 });
 for(const[status,error,outcome]of [[400,'invalid_input','invalid'],[429,'too_many_requests','rate-limited'],[404,'not_found','unavailable']])await test('known native '+outcome+' releases only its own nonissuance',async()=>{
  const d=direct();d.h.control.fetch=()=>Response.json({error},{status});const o=begin(d);assert.equal((await o.observer.promise).status,outcome);assert.equal(d.api.affiliateApplicationBlocked(),false);assert.equal(d.api.claimAffiliateApplicationAccepted(o.attempt,o.context,{status:'accepted'}),false);d.h.control.fetch=ack;const next=begin(d);assert.equal((await next.observer.promise).status,'accepted');assert.equal(d.h.requests.length,2);d.h.unmount();
 });
 await test('invalid/bounded/disposable input cannot dispatch or echo private data',async()=>{
  const d=direct();for(const patch of [{name:''},{name:'x'.repeat(101)},{name:'bad\nname'},{email:'bad'},{email:'x'.repeat(255)+'@example.invalid'},{email:'x@mailinator.com'},{lang:'fr'},{channelInfo:'x'.repeat(2001)},{channelInfo:'bad\0text'},{channelInfo:{}},{to:'foreign@example.invalid'},{resume:true}])assert.equal(d.api.beginAffiliateApplication({...input,...patch},{},()=>true),undefined);
  assert.equal(d.h.requests.length,0);d.h.unmount();
 });
 for(const stage of ['HTTP','body'])await test(stage+' observer timeout preserves original and exclusion; late explicit observation sends no HTTP',async()=>{
  const d=direct(),gate=deferred();let stream;d.h.control.fetch=()=>stage==='HTTP'?gate.promise:new Response(new ReadableStream({start(c){stream=c;}}),{status:202,headers:{'content-type':'application/json'}});
  const o=begin(d);await flush();d.h.advance(60000);assert.equal((await o.observer.promise).status,'unconfirmed');d.h.advance(30*86400000);
  assert.equal(d.api.affiliateApplicationBlocked(),true);assert.equal(d.api.beginAffiliateApplication(input,{},()=>true),undefined);
  assert.equal(d.api.claimAffiliateApplicationAccepted(JSON.parse(JSON.stringify(o.attempt)),o.context,{status:'accepted'}),false);
  if(stage==='HTTP')gate.resolve(ack());else{stream.enqueue(new TextEncoder().encode('{"ok":true,"status":"accepted"}'));stream.close();}
  await flush();assert.equal(d.api.claimAffiliateApplicationAccepted(o.attempt,o.context,{status:'accepted'}),false);
  const late=d.api.observeAffiliateApplication(o.attempt,o.context,()=>true),outcome=await late.promise;assert.equal(d.api.claimAffiliateApplicationAccepted(o.attempt,o.context,outcome),true);assert.equal(d.h.requests.length,1);d.h.unmount();
 });
 await test('native monotonic deadline before timer callback does not auto-observe late acceptance',async()=>{
  const d=direct(),gate=deferred();d.h.control.fetch=()=>gate.promise;const o=begin(d);await flush();d.h.advance(60000,false);gate.resolve(ack());assert.equal((await o.observer.promise).status,'unconfirmed');assert.equal(d.h.requests.length,1);d.h.unmount();
 });
 await test('native retirement before first dispatch microtask is known nonissuance, no timer/foreign release',async()=>{
  const d=direct(),o=begin(d);d.api.retireAffiliateApplicationProgress({...o.attempt});assert.equal(d.api.affiliateApplicationBlocked(),true);d.api.retireAffiliateApplicationProgress(o.attempt);assert.equal((await o.observer.promise).status,'unconfirmed');await flush();assert.equal(d.h.requests.length,0);assert.equal(d.api.affiliateApplicationBlocked(),false);d.h.unmount();
 });
 await test('actual form same-turn double submit produces one POST and accepted request only',async()=>{
  const h=fixture();await fill(h);const form=h.nodes().find(n=>n.type==='form');form.props.onSubmit({preventDefault(){}});form.props.onSubmit({preventDefault(){}});await h.ready();assert.equal(h.requests.length,1);assert.match(h.text(),/Solicitud recibida/);assert.match(h.text(),/no confirma aprobación ni entrega/);assert.equal(h.storage.size+h.navigation.length,0);h.unmount();
 });
 await test('actual unknown body disables resubmit and never displays transport diagnostics',async()=>{
  const h=fixture();h.control.fetch=()=>Response.json({error:'PRIVATE_EMAIL_DIAGNOSTIC'},{status:503});await fill(h);h.submit();await h.ready();h.submit();await h.ready();assert.equal(h.requests.length,1);assert.match(h.text(),/sin confirmar/);assert(!h.text().includes('PRIVATE_EMAIL_DIAGNOSTIC'));assert.equal(h.nodes().find(n=>n.type==='button'&&n.props.type==='submit').props.disabled,true);h.unmount();
 });
 for(const stage of ['HTTP','body'])for(const changeKind of ['name','email','channelInfo','ABA-name','ABA-email','ABA-channelInfo','language','path','query','unmount','Strict','remount'])await test('actual '+changeKind+' during '+stage+' retires progress without adoption',async()=>{
  const h=fixture(),gate=deferred();let stream;h.control.fetch=()=>stage==='HTTP'?gate.promise:new Response(new ReadableStream({start(c){stream=c;}}),{status:202,headers:{'content-type':'application/json'}});await fill(h);h.submit();await h.ready();
  if(changeKind==='unmount'||changeKind==='remount'){h.unmount();if(changeKind==='remount')await h.ready();}
  else if(changeKind==='Strict')h.strictEffects();
  else if(changeKind==='language'){h.state.lang='en';h.view();h.state.lang='es';h.view();}
  else if(changeKind==='path'){h.browser.window.location.pathname='/other';h.view();h.browser.window.location.pathname='/affiliates';h.view();}
  else if(changeKind==='query'){h.state.query.extra='different';h.view();delete h.state.query.extra;h.view();}
  else{const field=changeKind.replace('ABA-',''),prior=h.nodes().find(n=>n.props?.name===field).props.value;change(h,field,field==='email'?'changed@example.invalid':'Changed');if(changeKind.startsWith('ABA-'))change(h,field,prior);}
  if(stage==='HTTP')gate.resolve(ack());else{stream.enqueue(new TextEncoder().encode('{"ok":true,"status":"accepted"}'));stream.close();}
  await flush();if(changeKind!=='unmount')await h.ready();assert.equal(h.requests.length,1);assert.equal(h.navigation.length,0);if(changeKind!=='unmount')assert(!h.text().includes('Solicitud recibida.'));h.unmount();
 });
 for(const field of ['name','email','channelInfo'])for(const ABA of [false,true])await test('same-turn '+field+' change'+(ABA?' ABA':'')+' before dispatch prevents POST',async()=>{
  const h=fixture();await fill(h);const element=h.nodes().find(n=>n.props?.name===field),prior=element.props.value;h.submit();
  element.props.onChange({target:{value:field==='email'?'changed@example.invalid':'Changed'}});if(ABA)element.props.onChange({target:{value:prior}});await h.ready();
  assert.equal(h.requests.length,0);assert.equal(api(h).affiliateApplicationBlocked(),false);assert(!h.text().includes('Solicitud recibida.'));h.unmount();
 });
 for(const kind of ['path','query'])await test('actual browser '+kind+' mismatch before dispatch independently denies POST',async()=>{
  const h=fixture();await fill(h);h.submit();if(kind==='path')h.browser.window.location.pathname='/other';else h.browser.window.location.search='?other=changed';
  await flush();assert.equal(h.requests.length,0);assert.equal(api(h).affiliateApplicationBlocked(),false);h.unmount();
 });
 for(const stage of ['HTTP','body'])await test('actual '+stage+' timeout needs explicit consultation of its same original',async()=>{
  const h=fixture(),gate=deferred();let stream;h.control.fetch=()=>stage==='HTTP'?gate.promise:new Response(new ReadableStream({start(c){stream=c;}}),{status:202,headers:{'content-type':'application/json'}});await fill(h);h.submit();await h.ready();h.advance(60000);await h.ready();
  assert.match(h.text(),/sin confirmar/);if(stage==='HTTP')gate.resolve(ack());else{stream.enqueue(new TextEncoder().encode('{"ok":true,"status":"accepted"}'));stream.close();}
  await h.ready();assert(!h.text().includes('Solicitud recibida.'));const consult=button(h,/Consultar solicitud pendiente/);assert(consult);consult.props.onClick();await h.ready();assert.match(h.text(),/Solicitud recibida/);assert.equal(h.requests.length,1);h.unmount();
 });
 await test('two actual forms share exclusion and have unique accessible label/field IDs',async()=>{
  const h=fixture({mode:'two'}),gate=deferred();h.control.fetch=()=>gate.promise;await fill(h,0);await fill(h,1);
  const fields=h.nodes().filter(n=>n.type==='input'||n.type==='textarea');assert.equal(new Set(fields.map(n=>n.props.id)).size,6);
  for(const label of h.nodes().filter(n=>n.type==='label'))assert.equal(fields.filter(n=>n.props.id===label.props.htmlFor).length,1);
  const forms=h.nodes().filter(n=>n.type==='form');for(const f of forms)f.props.onSubmit({preventDefault(){}});await h.ready();assert.equal(h.requests.length,1);assert(h.nodes().filter(n=>n.type==='button'&&n.props.type==='submit').every(n=>n.props.disabled));
  gate.resolve(ack());await h.ready();assert.equal(h.requests.length,1);h.unmount();
 });
 for(const serverKind of ['positive','dormant','scheduling-unknown'])await test('actual client/server '+serverKind+' composition does not confuse receipt with creation/mail/approval',async()=>{
  const h=fixture(),server=require('./affiliate-application-fixture.cjs').fixture({dormant:serverKind==='dormant',afterThrow:serverKind==='scheduling-unknown'});
  h.control.fetch=r=>server.post(JSON.parse(r.init.body));await fill(h);h.submit();await h.ready();assert.equal(h.requests.length,1);assert.equal(server.calls.sql.length+server.calls.mail.length,0);
  if(serverKind==='dormant'){assert.match(h.text(),/programa no está disponible/);assert.equal(server.afterJobs.length,0);assert(!h.text().includes('Solicitud recibida.'));}
  else{assert.equal(server.afterJobs.length,1);assert.equal(h.text().includes('Solicitud recibida.'),serverKind==='positive');await Promise.all([server.afterJobs[0](),server.afterJobs[0]()]);assert.equal(server.calls.mail.length,1);assert.equal(server.rows.size,1);if(serverKind==='scheduling-unknown'){h.submit();await h.ready();assert.equal(h.requests.length,1);}}
  assert.equal(h.navigation.length+h.storage.size,0);await server.finish();h.unmount();
 });
 return{status:results.every(r=>r.status==='PASS')?'PASS':'FAIL',scope:'Actual affiliate private native HTTP/Reader, observer/context/form lifetimes and closed server composition. Real AFFILIATES_DORMANT remains true. No real browser/mail/Stripe/program/approval/cost/consent/source/freshness/delivery, cross-realm recovery or integral acceptance.',results};
}
module.exports={run};if(require.main===module){const timer=setTimeout(()=>{console.error('Missing affiliate client native terminal');process.exit(1);},40000);run().then(r=>{console.log(JSON.stringify(r,null,2));if(r.status!=='PASS')process.exitCode=1;}).catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(()=>clearTimeout(timer));}
