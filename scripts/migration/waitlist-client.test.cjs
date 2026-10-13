'use strict';
const assert=require('node:assert/strict'),{fixture,ack,deferred,flush}=require('./waitlist-client-harness.cjs');
const input={email:' SYNTHETIC@EXAMPLE.INVALID ',lang:'es',source:'launch-page',referrer:'https://referrer.invalid/path?secret=hidden#fragment'};
const posts=h=>h.requests.filter(r=>r.init.method==='POST');
const direct=()=>{const h=fixture(),api=h.load('lib/waitlist-client.ts');return{h,api};};
function begin(d){const context={},attempt=d.api.beginWaitlist({...input},context,()=>true);assert(attempt);return{context,attempt,observer:d.api.observeWaitlist(attempt,context,()=>true)};}
function button(h,re){return h.nodes().find(n=>n.type==='button'&&re.test(h.nodes(n.props.children).filter(x=>typeof x==='string').join(' ')));}
async function run(){
 const results=[];async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(error){results.push({name,status:'FAIL',error:error.stack});}}
 const bad=[
  ['legacy position',()=>Response.json({ok:true,position:4},{status:200})],
  ['mixed receipt',()=>Response.json({ok:true,status:'accepted',position:4},{status:202})],
  ['wrong status',()=>Response.json({ok:true,status:'accepted'},{status:200})],
  ['redirect',()=>{const r=ack();Object.defineProperty(r,'redirected',{value:true});return r;}],
  ['foreign URL',()=>{const r=ack();Object.defineProperty(r,'url',{value:'https://foreign.invalid/api/waitlist'});return r;}],
  ['non-native response',()=>({status:202,ok:true,json:async()=>({ok:true,status:'accepted'})})],
  ['text MIME',()=>new Response('{"ok":true,"status":"accepted"}',{status:202})],
  ['mixed MIME',()=>new Response('{"ok":true,"status":"accepted"}',{status:202,headers:{'content-type':'application/json-wrong'}})],
  ['array',()=>Response.json([{ok:true,status:'accepted'}],{status:202})],
  ['truncated JSON',()=>new Response('{"ok":true',{status:202,headers:{'content-type':'application/json'}})],
  ['oversized native body',()=>new Response(' '.repeat(4097)+JSON.stringify({ok:true,status:'accepted'}),{status:202,headers:{'content-type':'application/json'}})],
  ['invalid UTF8',()=>new Response(new Uint8Array([0xc3,0x28]),{status:202,headers:{'content-type':'application/json'}})],
  ['native body failure',()=>new Response(new ReadableStream({start(c){c.error(Error('PRIVATE_READER'));}}),{status:202,headers:{'content-type':'application/json'}})],
  ['HTTP failure',()=>{throw Error('PRIVATE_FETCH');}],
  ['unknown server result',()=>Response.json({error:'waitlist_unconfirmed'},{status:503})],
  ['mixed denial',()=>Response.json({error:'too_many_requests',ok:true},{status:429})]
 ];
 for(const[name,response]of bad)await test(name+' retains private exclusion without replay',async()=>{
  const d=direct();d.h.control.fetch=response;const o=begin(d);assert.equal((await o.observer.promise).status,'unconfirmed');
  assert.equal(d.api.waitlistBlocked(),true);assert.equal(d.api.beginWaitlist({...input},{},()=>true),undefined);
  assert.equal(d.api.claimWaitlistAccepted(o.attempt,o.context,{status:'accepted'}),false);assert.equal(posts(d.h).length,1);d.h.unmount();
 });
 await test('native split body, canonical captured payload and one private accepted claim',async()=>{
  const d=direct();d.h.control.fetch=()=>new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{"ok":'));c.enqueue(new TextEncoder().encode('true,"status":"accepted"}'));c.close();}}),{status:202,headers:{'content-type':'application/json; charset=utf-8'}});
  const context={},originalInput={...input},attempt=d.api.beginWaitlist(originalInput,context,()=>true);originalInput.email='foreign@example.invalid';originalInput.lang='en';
  const observer=d.api.observeWaitlist(attempt,context,()=>true),outcome=await observer.promise;
  assert.equal(d.api.claimWaitlistAccepted(attempt,context,JSON.parse(JSON.stringify(outcome))),false);assert.equal(d.api.claimWaitlistAccepted({...attempt},context,outcome),false);
  const foreign=fixture().load('lib/waitlist-client.ts');assert.equal(foreign.claimWaitlistAccepted(attempt,context,outcome),false);
  assert.equal(d.api.claimWaitlistAccepted(attempt,context,outcome),true);assert.equal(d.api.claimWaitlistAccepted(attempt,context,outcome),false);
  assert.equal(d.api.beginWaitlist(input,context,()=>true),undefined);assert.equal(d.api.waitlistBlocked(),false);
  const r=posts(d.h)[0];assert.deepEqual(JSON.parse(r.init.body),{email:'synthetic@example.invalid',lang:'es',source:'launch-page',referrer:'https://referrer.invalid/path'});
  for(const[k,v]of [['credentials','omit'],['redirect','error'],['cache','no-store']])assert.equal(r.init[k],v);
  assert.equal(r.init.signal,undefined);assert.equal(d.h.storage.size,0);assert.equal(d.h.navigation.length,0);d.h.unmount();
 });
 for(const[status,error,outcome]of [[400,'invalid_input','invalid'],[429,'too_many_requests','rate-limited']])await test('known native '+outcome+' releases only its own exclusion',async()=>{
  const d=direct();d.h.control.fetch=()=>Response.json({error},{status});const o=begin(d);assert.equal((await o.observer.promise).status,outcome);assert.equal(d.api.waitlistBlocked(),false);assert.equal(d.api.claimWaitlistAccepted(o.attempt,o.context,{status:'accepted'}),false);
  d.h.control.fetch=ack;const next=begin(d);assert.equal((await next.observer.promise).status,'accepted');assert.equal(posts(d.h).length,2);d.h.unmount();
 });
 await test('invalid email/locale/source/referrer/extra properties never dispatch',async()=>{
  const d=direct();for(const patch of [{email:'bad'},{email:'a'.repeat(255)+'@example.invalid'},{lang:'fr'},{source:''},{source:'x'.repeat(161)},{source:'bad\nsource'},{referrer:'https://user:password@foreign.invalid/'},{referrer:'javascript:alert(1)'},{extra:true}])assert.equal(d.api.beginWaitlist({...input,...patch},{},()=>true),undefined);
  assert.equal(posts(d.h).length,0);assert.equal(d.api.waitlistReferrer('campaign_1'),'campaign_1');assert.equal(d.api.waitlistReferrer('https://source.invalid/p?token=private#x'),'https://source.invalid/p');d.h.unmount();
 });
 for(const stage of ['HTTP','body'])await test(stage+' observer timeout retains native original; explicit late consult needs own receipt',async()=>{
  const d=direct(),gate=deferred();let stream;d.h.control.fetch=()=>stage==='HTTP'?gate.promise:new Response(new ReadableStream({start(c){stream=c;}}),{status:202,headers:{'content-type':'application/json'}});
  const o=begin(d);await flush();d.h.advance(60000);assert.equal((await o.observer.promise).status,'unconfirmed');
  assert.equal(d.api.beginWaitlist(input,{},()=>true),undefined);d.h.advance(10*24*3600000);
  assert.equal(d.api.waitlistBlocked(),true);assert.equal(d.api.claimWaitlistAccepted(JSON.parse(JSON.stringify(o.attempt)),o.context,{status:'accepted'}),false);
  if(stage==='HTTP')gate.resolve(ack());else{stream.enqueue(new TextEncoder().encode('{"ok":true,"status":"accepted"}'));stream.close();}
  await flush();assert.equal(d.api.claimWaitlistAccepted(o.attempt,o.context,{status:'accepted'}),false);
  const late=d.api.observeWaitlist(o.attempt,o.context,()=>true),outcome=await late.promise;assert.equal(d.api.claimWaitlistAccepted(o.attempt,o.context,outcome),true);assert.equal(posts(d.h).length,1);d.h.unmount();
 });
 await test('late terminal before delayed timer callback cannot auto-observe acceptance',async()=>{
  const d=direct(),gate=deferred();d.h.control.fetch=()=>gate.promise;const o=begin(d);await flush();d.h.advance(60000,false);gate.resolve(ack());assert.equal((await o.observer.promise).status,'unconfirmed');assert.equal(posts(d.h).length,1);d.h.unmount();
 });
 await test('retirement before first microtask is genuine nonissuance; foreign context cannot retire/recover original',async()=>{
  const d=direct(),o=begin(d);d.api.retireWaitlistProgress({...o.attempt});assert.equal(d.api.waitlistBlocked(),true);d.api.retireWaitlistProgress(o.attempt);assert.equal((await o.observer.promise).status,'unconfirmed');await flush();assert.equal(posts(d.h).length,0);assert.equal(d.api.waitlistBlocked(),false);d.h.unmount();
 });
 for(const mode of ['inline','popup','launch']){
  await test(mode+' actual form double submit, native accepted UI, accessible fields and attribution',async()=>{
   const h=fixture({mode});if(mode==='popup')h.showPopup();h.state.query={ref:'campaign',utm_source:'channel'};h.browser.window.location.search='?ref=campaign&utm_source=channel';await h.ready();h.change('synthetic@example.invalid');const form=h.nodes().find(n=>n.type==='form');
   const field=h.nodes().find(n=>n.type==='input');assert.equal(field.props.autoComplete,'email');assert.equal(field.props.maxLength,254);assert(field.props['aria-label']);assert.equal(field.props.required,true);
   form.props.onSubmit({preventDefault(){}});form.props.onSubmit({preventDefault(){}});await h.ready();assert.equal(posts(h).length,1);assert.match(h.text(),/Solicitud recibida/);assert.match(h.text(),/no la entrega/);
   const data=JSON.parse(posts(h)[0].init.body);assert.equal(data.source,mode==='inline'?'homepage-cta':mode==='popup'?'exit:/title-analyzer':'campaign');assert.equal(data.referrer,'channel');assert.equal(h.navigation.length,0);assert.equal(h.browser.document.cookie,'');h.unmount();
  });
  await test(mode+' actual unknown response blocks subsequent submit and sanitizes diagnostics',async()=>{
   const h=fixture({mode});h.control.fetch=r=>r.init.method==='POST'?Response.json({error:'PRIVATE_DETAIL'},{status:503}):Response.json({count:17});
   if(mode==='popup')h.showPopup();await h.ready();h.change('synthetic@example.invalid');h.submit();await h.ready();h.submit();await h.ready();assert.equal(posts(h).length,1);assert.match(h.text(),/sin confirmar/);assert(!h.text().includes('PRIVATE_DETAIL'));assert.equal(h.nodes().find(n=>n.type==='button'&&n.props.type==='submit').props.disabled,true);h.unmount();
  });
  for(const stage of ['HTTP','body'])for(const change of ['field','ABA','path','query','language','source','unmount','Strict',...(mode==='popup'?['dismiss']:[])])await test(mode+' '+change+' during '+stage+' retires progress without replay',async()=>{
   const h=fixture({mode}),gate=deferred();let stream;h.control.fetch=r=>r.init.method!=='POST'?Response.json({count:17}):stage==='HTTP'?gate.promise:new Response(new ReadableStream({start(c){stream=c;}}),{status:202,headers:{'content-type':'application/json'}});
   if(mode==='popup')h.showPopup();await h.ready();h.change('synthetic@example.invalid');h.submit();await h.ready();
   if(change==='unmount')h.unmount();else if(change==='Strict')h.strictEffects();else if(change==='dismiss'){h.nodes().find(n=>n.type==='button'&&n.props['aria-label']==='Cerrar').props.onClick();h.view();}
   else if(change==='language'){h.state.lang='en';h.view();h.state.lang='es';h.view();}
   else if(change==='source'){if(mode==='inline')h.state.source='other';else h.state.query.utm_source='other';h.view();h.state.source='homepage-cta';delete h.state.query.utm_source;h.view();}
   else if(change==='path'){const p=h.browser.window.location.pathname;h.browser.window.location.pathname='/other';h.view();h.browser.window.location.pathname=p;h.view();}
   else if(change==='query'){h.state.query.other='changed';h.view();delete h.state.query.other;h.view();}
   else{h.change('other@example.invalid');if(change==='ABA')h.change('synthetic@example.invalid');}
   if(stage==='HTTP')gate.resolve(ack());else{stream.enqueue(new TextEncoder().encode('{"ok":true,"status":"accepted"}'));stream.close();}
   await flush();if(change!=='unmount')await h.ready();assert.equal(posts(h).length,1);assert.equal(h.navigation.length,0);if(change!=='unmount')assert(!h.text().includes('Solicitud recibida'));h.unmount();
  });
  await test(mode+' explicit pending consultation observes original only after timeout',async()=>{
   const h=fixture({mode}),gate=deferred();h.control.fetch=r=>r.init.method==='POST'?gate.promise:Response.json({count:17});if(mode==='popup')h.showPopup();await h.ready();h.change('synthetic@example.invalid');h.submit();await h.ready();h.advance(60000);await h.ready();assert.match(h.text(),/sin confirmar/);gate.resolve(ack());await h.ready();assert(!h.text().includes('Solicitud recibida'));assert(button(h,/Consultar solicitud pendiente/));button(h,/Consultar solicitud pendiente/).props.onClick();await h.ready();assert.match(h.text(),/Solicitud recibida/);assert.equal(posts(h).length,1);h.unmount();
  });
  await test(mode+' same-turn change before dispatch prevents native POST',async()=>{
   const h=fixture({mode});if(mode==='popup')h.showPopup();await h.ready();h.change('synthetic@example.invalid');h.submit();h.change('other@example.invalid');await h.ready();assert.equal(posts(h).length,0);assert.equal(h.load('lib/waitlist-client.ts').waitlistBlocked(),false);h.unmount();
  });
  await test(mode+' actual client/server composition consumes uniform receipt before its private after job',async()=>{
   const h=fixture({mode}),server=require('./waitlist-fixture.cjs').fixture();h.control.fetch=r=>r.init.method==='POST'?server.post(JSON.parse(r.init.body)):server.route.GET();
   if(mode==='popup')h.showPopup();await h.ready();h.change('synthetic@example.invalid');h.submit();await h.ready();assert.match(h.text(),/Solicitud recibida/);assert.equal(server.calls.sql.length,0);assert.equal(server.calls.mail.length,0);assert.equal(server.afterJobs.length,1);
   await Promise.all([server.afterJobs[0](),server.afterJobs[0]()]);assert.equal(server.calls.mail.length,1);assert.equal(server.rows.size,1);assert.equal(posts(h).length,1);await server.finish();h.unmount();
  });
 }
 await test('all three mounted forms share one private exclusion independent of count or popup storage',async()=>{
  const h=fixture({mode:'all'}),gate=deferred();h.control.fetch=r=>r.init.method==='POST'?gate.promise:Response.json({count:17});h.showPopup();await h.ready();
  for(let n=0;n<3;n++)h.change('synthetic'+n+'@example.invalid',n);
  const forms=h.nodes().filter(n=>n.type==='form');for(const f of forms)f.props.onSubmit({preventDefault(){}});await h.ready();assert.equal(posts(h).length,1);assert(h.nodes().filter(n=>n.type==='button'&&n.props.type==='submit').every(n=>n.props.disabled));
  h.storage.set('ytv_exit_shown','recovered');h.advance(60000);await h.ready();assert.equal(posts(h).length,1);gate.resolve(ack());await h.ready();h.unmount();
 });
 for(const response of [()=>Response.json({count:0}),()=>Response.json({count:-1}),()=>Response.json({count:4,ok:true}),()=>Response.json({count:4},{status:503}),()=>Response.json({count:1.5}),()=>new Response('bad',{headers:{'content-type':'application/json'}})])await test('launch count displays only native exact nonnegative aggregate, never invented zero or position',async()=>{
  const h=fixture({mode:'launch'});h.control.fetch=r=>r.init.method==='POST'?ack():response();await h.ready();
  const valid=h.requests.length===1&&(await response().json().catch(()=>null))?.count===0;assert.equal(h.text().includes('0 solicitudes registradas'),valid);assert(!h.text().includes('posición'));h.strictEffects();await h.ready();assert.equal(h.requests.filter(r=>r.init.method!=='POST').length,1);h.unmount();
 });
 await test('count timeout retains its original HTTP and does not display late aggregate automatically',async()=>{
  const h=fixture({mode:'launch'}),gate=deferred();h.control.fetch=r=>r.init.method==='POST'?ack():gate.promise;await h.ready();h.advance(60000);await h.ready();gate.resolve(Response.json({count:17}));await h.ready();assert(!h.text().includes('17 solicitudes'));assert.equal(h.requests.length,1);h.unmount();
 });
 await test('popup storage denial still permits its native form without storing request authority',async()=>{
  const h=fixture({mode:'popup'});h.browser.sessionStorage.getItem=()=>{throw Error('Denied');};h.browser.sessionStorage.setItem=()=>{throw Error('Denied');};h.showPopup();h.change('synthetic@example.invalid');h.submit();await h.ready();assert.match(h.text(),/Solicitud recibida/);assert.equal(h.storage.size,0);h.unmount();
 });
 await test('popup same-turn dismissal prevents POST before React unmount',async()=>{
  const h=fixture({mode:'popup'});h.showPopup();h.change('synthetic@example.invalid');h.submit();h.nodes().find(n=>n.type==='button'&&n.props['aria-label']==='Cerrar').props.onClick();await flush();assert.equal(posts(h).length,0);await h.ready();assert.equal(h.load('lib/waitlist-client.ts').waitlistBlocked(),false);h.unmount();
 });
 return{status:results.every(r=>r.status==='PASS')?'PASS':'FAIL',scope:'Original waitlist client HTTP/Reader, shared realm exclusion, actual three form lifetimes and closed server composition. No real browser/account/mail/provider/consent/campaign/freshness or cross-realm recovery acceptance.',results};
}
module.exports={run};
if(require.main===module){const timer=setTimeout(()=>{console.error('Missing waitlist client terminal');process.exit(1);},40000);run().then(r=>{console.log(JSON.stringify(r,null,2));if(r.status!=='PASS')process.exitCode=1;}).catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>clearTimeout(timer));}
