'use strict';
const assert=require('node:assert/strict');
const {create,ready,defaults,testRow,pick,inputs,values,terminal}=require('./ab-page-client.test.cjs');
const {deferred,flush,reply}=require('./chat-widget-harness.cjs');
const writes=h=>h.requests.filter(r=>['POST','PATCH'].includes(r.init.method));
const responseFor=r=>r.init.method==='POST'
 ?reply({test:{...testRow(r.owner,'variant_a'),id:'created-'+r.owner,videoId:r.body.videoId,originalTitle:'Original synthetic video',variantA:r.body.variantA,variantB:r.body.variantB,hoursPerVariant:r.body.hoursPerVariant}},201)
 :reply({ok:true,userId:r.owner,test:{...testRow(r.owner,'cancelled'),completedAt:'2026-10-10T00:00:00.000Z'}});
const sendDefault=r=>['POST','PATCH'].includes(r.init.method)?responseFor(r):r.url.endsWith('ab-test')?(async()=>{const d=await defaults(r).json();d.tests=[testRow(r.owner,'variant_a')];return reply(d);})():defaults(r);
const init=async options=>{const h=create(options);h.state.send=sendDefault;await ready(h);return h;};
const form=h=>{pick(h);h.view();inputs(h)[1].props.onChange({target:{value:'  Candidate B  '}});h.view();};
const button=(h,kind)=>h.button(kind==='create'?'Iniciar A/B test':'Cancelar test');
const start=(h,kind)=>button(h,kind).props.onClick();
const results=[];async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.message});}}
async function run(){
 for(const kind of ['create','cancel'])for(const held of ['headers','JSON'])await test(kind+' '+held+' one total60s wait retains actual original; synchronous double callbacks and opposite mutation blocked',async()=>{
  const h=await init(),gate=deferred();form(h);const callback=button(h,kind).props.onClick;
  h.state.send=r=>['POST','PATCH'].includes(r.init.method)?(held==='headers'?gate.promise:{ok:true,status:kind==='create'?201:200,json:()=>gate.promise}):sendDefault(r);
  const one=callback(),two=callback();await ready(h);assert.equal(writes(h).length,1);assert.equal(writes(h)[0].init.signal,undefined);assert.equal(writes(h)[0].init.method,kind==='create'?'POST':'PATCH');
  assert.equal(JSON.stringify(writes(h)[0].body),JSON.stringify(kind==='create'?{videoId:'Original',variantA:'Original synthetic video',variantB:'Candidate B',hoursPerVariant:48}:{testId:'own-fixture-one',action:'cancel'}));
  assert(button(h,kind==='create'?'cancel':'create').props.disabled);const opposite=start(h,kind==='create'?'cancel':'create');await flush();assert.equal(writes(h).length,1);await terminal(opposite);
  h.advance(60000);await terminal(one);await terminal(two);await ready(h);assert.match(h.text(),/El cambio del test no está confirmado/);assert(button(h,kind).props.disabled);await callback();assert.equal(writes(h).length,1);
  const response=responseFor(writes(h)[0]);gate.resolve(held==='headers'?response:await response.json());await ready(h);
  assert.equal(h.storage.size,0);assert(h.timers.size<=1);assert.doesNotMatch(h.text(),/no está confirmado/);
  if(kind==='create'){assert.match(h.text(),/Candidate B/);assert.equal(inputs(h).length,0);}else{assert.match(h.text(),/CANCELADO/);await callback();assert.equal(writes(h).length,1);}h.unmount();
 });
 for(const kind of ['create','cancel'])for(const mode of ['network','JSON',500,503,202,'malformed','wrong owner','wrong video','wrong variants','wrong status','wrong ID or hours','unknown rejection','provider403'])await test(kind+' '+mode+' never grants replacement or false completion',async()=>{
  const h=await init();form(h);h.state.send=async r=>{if(!r.init.method||r.init.method==='GET')return sendDefault(r);if(mode==='network')throw Error('Private transport');if(mode==='JSON')return{ok:true,status:kind==='create'?201:200,json:async()=>{throw Error('Private JSON');}};
   const data=await responseFor(r).json();if(mode==='malformed')return reply(kind==='cancel'?{ok:true}:{test:{}},kind==='create'?201:200);
   if(mode==='wrong owner')data.test.userId='other';if(mode==='wrong video')data.test.videoId='other';if(mode==='wrong variants')data.test.variantB='different';if(mode==='wrong status')data.test.status=kind==='create'?'cancelled':'variant_a';if(mode==='wrong ID or hours'){if(kind==='create')data.test.hoursPerVariant=72;else data.test.id='other';}
   if(mode==='unknown rejection')return reply({error:'Unknown'},400);if(mode==='provider403')return reply({error:'youtube_reconnect_required'},403);return reply(data,typeof mode==='number'?mode:kind==='create'?201:200);
  };await start(h,kind);await ready(h);assert.match(h.text(),/El cambio del test no está confirmado/);assert.doesNotMatch(h.text(),/Private/);assert(button(h,kind).props.disabled);await start(h,kind);assert.equal(writes(h).length,1);assert.equal(h.storage.size,1);assert(h.timers.size<=1);h.unmount();await flush();assert.equal(h.timers.size,0);
 });
 for(const kind of ['create','cancel'])for(const change of ['account','email','logout','lang','remount'])await test(kind+' original retained through '+change+' with no cross-account acknowledgement or replacement',async()=>{
  const h=await init(),gate=deferred();form(h);h.state.send=r=>['POST','PATCH'].includes(r.init.method)?gate.promise:sendDefault(r);const p=start(h,kind);await ready(h);
  if(change==='remount')h.unmount();else if(change==='lang')h.state.lang='en';else if(change==='account')h.state.user='second';else if(change==='email')h.state.email='second@example.invalid';else h.state.auth='unauthenticated';await ready(h);
  if(change==='account'||change==='email'||change==='logout')assert.doesNotMatch(h.text(),change==='email'?/Creación original|Cancelación original|Candidate B/:/Creación original|Cancelación original|Candidate B|Own history fixture-one/);
  h.advance(60000);await terminal(p);gate.resolve(responseFor(writes(h)[0]));await ready(h);
  if(['account','email','logout'].includes(change)){assert.doesNotMatch(h.text(),change==='email'?/Candidate B/:/Candidate B|Own history fixture-one/);h.state.user='fixture-one';h.state.email='fixture-one@example.invalid';h.state.auth='authenticated';await ready(h);}
  assert.match(h.text(),kind==='create'?/Candidate B/:/CANCELADO|CANCELLED/);assert.equal(writes(h).length,1);assert.equal(h.storage.size,0);h.unmount();
 });
 for(const change of ['video','draft','hours','lang'])await test('create late original after '+change+' preserves edited form and original body',async()=>{
  const h=await init(),gate=deferred();form(h);h.state.send=r=>['POST','PATCH'].includes(r.init.method)?gate.promise:sendDefault(r);const p=start(h,'create');await ready(h);
  if(change==='video'){pick(h,'Other');h.view();}else if(change==='draft'){inputs(h)[0].props.onChange({target:{value:'Edited title'}});h.view();}else if(change==='hours'){h.click('72 h');h.view();}else{h.state.lang='en';await ready(h);}
  gate.resolve(responseFor(writes(h)[0]));await terminal(p);await ready(h);assert.equal(inputs(h).length,2);assert.match(values(h),change==='video'?/Other synthetic video/:change==='draft'?/Edited title/:/Original synthetic video/);assert.equal(writes(h)[0].body.hoursPerVariant,48);assert.equal(writes(h).length,1);h.unmount();
 });
 for(const [status,error]of [[401,'Unauthorized'],[403,'pro_required'],[400,'youtube_not_connected'],[400,'Missing fields'],[400,'active_test_exists'],[400,'max_active_tests'],[404,'video_not_found']])await test('create original pre-effect rejection '+error+' permits another attempt',async()=>{
  const h=await init();form(h);h.state.send=r=>['POST','PATCH'].includes(r.init.method)?reply({error},status):sendDefault(r);await start(h,'create');await ready(h);assert(!button(h,'create').props.disabled);assert.equal(h.storage.size,0);assert.equal(inputs(h).length,2);h.unmount();
 });
 for(const [status,error]of [[401,'Unauthorized'],[400,'Missing fields'],[404,'Test not found']])await test('cancel original pre-effect rejection '+error+' permits another attempt',async()=>{const h=await init();h.state.send=r=>['POST','PATCH'].includes(r.init.method)?reply({error},status):sendDefault(r);await start(h,'cancel');await ready(h);assert(!button(h,'cancel').props.disabled);assert.equal(h.storage.size,0);h.unmount();});
 for(const kind of ['create','cancel'])for(const failure of ['get','set','remove'])await test(kind+' storage '+failure+' denies send/replacement; only original acknowledgement can supply confirmed row',async()=>{
  const h=await init();form(h);h.state.storageFailure=failure;await start(h,kind);await ready(h);assert.equal(writes(h).length,failure==='remove'?1:0);assert.equal(h.storage.size,failure==='get'||failure==='set'?0:1);assert.match(h.text(),failure==='remove'?/Cambio recibido/:/El cambio del test no está confirmado/);h.state.storageFailure=null;
  if(kind==='create'&&failure==='remove'){pick(h,'Other');h.view();inputs(h)[1].props.onChange({target:{value:'Other B'}});h.view();}await start(h,kind==='cancel'&&failure==='remove'?'create':kind);assert.equal(writes(h).length,failure==='remove'?1:0);h.unmount();
 });
 for(const kind of ['create','cancel'])await test(kind+' module loss keeps deny-only marker; elapsed time and GET do not restore producer',async()=>{
  const storage=new Map(),h=await init({storage}),gate=deferred();form(h);h.state.send=r=>['POST','PATCH'].includes(r.init.method)?gate.promise:sendDefault(r);const p=start(h,kind);h.advance(60000);await terminal(p);h.unmount();const fresh=await init({storage});form(fresh);const staleSend=button(fresh,kind).props.onClick;fresh.advance(86400000);await staleSend();assert.equal(writes(fresh).length,0);assert.match(fresh.text(),/El cambio del test no está confirmado/);fresh.unmount();gate.resolve(responseFor(writes(h)[0]));await flush();
 });
 for(const field of ['user','email','auth','lang'])await test(field+' retires create/cancel callbacks before cleanup',async()=>{const h=await init();form(h);const a=button(h,'create').props.onClick,b=button(h,'cancel').props.onClick,count=h.requests.length;h.state[field]=field==='auth'?'unauthenticated':field==='lang'?'en':'other';h.view(true);await terminal(a());await terminal(b());assert.equal(h.requests.length,count);h.runEffects();h.unmount();await flush();});
 await test('form changes retire old create/duration callbacks synchronously before render',async()=>{const h=await init();form(h);const old=button(h,'create').props.onClick,hours=h.button('72 h').props.onClick;inputs(h)[1].props.onChange({target:{value:'New draft'}});await terminal(old());hours();assert.equal(writes(h).length,0);h.view();assert.match(values(h),/New draft/);await start(h,'create');assert.equal(writes(h)[0].body.hoursPerVariant,48);h.unmount();});
 await test('one60s budget includes both headers and JSON',async()=>{const h=await init(),header=deferred(),body=deferred();form(h);h.state.send=r=>['POST','PATCH'].includes(r.init.method)?header.promise:sendDefault(r);const p=start(h,'create');h.advance(20000);header.resolve({ok:true,status:201,json:()=>body.promise});await ready(h);h.advance(40000);await terminal(p);await ready(h);assert.match(h.text(),/no está confirmado/);body.resolve(await responseFor(writes(h)[0]).json());await ready(h);assert.equal(inputs(h).length,0);assert.equal(writes(h).length,1);h.unmount();});
 await test('StrictMode does not duplicate mutation or reset original admission',async()=>{const h=await init(),gate=deferred();form(h);h.state.send=r=>['POST','PATCH'].includes(r.init.method)?gate.promise:sendDefault(r);const p=start(h,'cancel');h.strictEffects();await ready(h);const repeat=start(h,'cancel');await flush();assert.equal(writes(h).length,1);await terminal(repeat);gate.resolve(responseFor(writes(h)[0]));await terminal(p);h.unmount();});
 await test('create then cancel retains both original acknowledgements across remount',async()=>{const h=await init();form(h);await start(h,'create');await ready(h);const buttons=h.nodes().filter(n=>n.type==='button'&&h.text(n)==='Cancelar test');h.state.send=r=>r.init.method==='PATCH'?reply({ok:true,userId:r.owner,test:{...testRow(r.owner,'cancelled'),id:r.body.testId,videoId:'Original',originalTitle:'Original synthetic video',variantA:'Original synthetic video',variantB:'Candidate B',completedAt:'2026-10-10T00:00:00.000Z'}}):sendDefault(r);await buttons.at(-1).props.onClick();await ready(h);h.unmount();await ready(h);assert.match(h.text(),/Candidate B/);assert.match(h.text(),/CANCELADO/);assert.equal(writes(h).length,2);h.unmount();});
 return{status:results.every(r=>r.status==='PASS')?'PASS':'FAIL',scope:'Synthetic React/auth/HTTP/timers/storage; real title effects and operational recovery not exercised',results};
}
module.exports={init,form,start,writes,responseFor,run};
if(require.main===module){const watchdog=setTimeout(()=>{console.error('FAIL: mutation contracts produced no terminal report');process.exit(1);},30000);run().then(report=>{console.log(JSON.stringify(report,null,2));if(report.status!=='PASS')process.exitCode=1;}).catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>clearTimeout(watchdog));}
