'use strict';
const assert=require('node:assert/strict'),profile=require('./profile-client.test.cjs');
const {harness,deferred,flush}=require('./chat-widget-harness.cjs');
const create=mode=>mode==='sidebar'?harness({profile:true,logoutMode:'sidebar'}):profile.create({logoutMode:mode==='both'?'both':'profile'});
const ready=profile.ready,profileLabel=h=>h.state.lang==='es'?'Cerrar esta sesión':'Sign out of this session';
const button=(h,mode)=>h.button(mode==='sidebar'?(h.state.lang==='es'?'Cerrar sesión':'Sign out'):profileLabel(h));
const observe=h=>h.button(h.state.lang==='es'?'Consultar salida original':'Observe original sign-out');
async function run(){const results=[];
 async function test(name,mode,fn){const h=create(mode);try{await fn(h);results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.stack});}finally{h.unmount();}}
 for(const mode of ['sidebar','profile'])for(const lang of ['es','en'])await test(mode+' '+lang+' own SDK completion navigates once including native session→null',mode,async h=>{
  h.state.lang=lang;await ready(h);const click=button(h,mode).props.onClick;click();click();await ready(h);
  assert.equal(h.state.signouts.length,1);assert.deepEqual(JSON.parse(JSON.stringify(h.state.signouts[0].options)),{redirect:false,callbackUrl:'/'});
  assert.equal(h.state.navigationWrites.length,1);assert.equal(h.state.navigationWrites[0].value,'/');assert.equal(h.timers.size,0);
  assert(!h.text().includes('todos los dispositivos'));assert(!h.text().includes('all devices'));
 });
 for(const mode of ['sidebar','profile'])await test(mode+'30s retires only UI wait; genuine late SDK needs explicit observation without another call',mode,async h=>{
  const held=deferred();h.state.signoutSDK=()=>held.promise;await ready(h);const click=button(h,mode).props.onClick;click();click();await ready(h);
  assert.equal(h.state.signouts.length,1);assert.match(h.text(),/Cerrando sesión/);assert(button(h,mode).props.disabled);
  h.advance(30000);await ready(h);assert.match(h.text(),/Salida sin confirmar/);assert.equal(h.timers.size,0);assert(!h.state.navigationWrites);
  held.resolve({url:'http://127.0.0.1:4300/'});await ready(h);assert(!h.state.navigationWrites);assert(button(h,mode).props.disabled);
  observe(h).props.onClick();await ready(h);assert.equal(h.state.signouts.length,1);assert.equal(h.state.navigationWrites.length,1);
 });
 await test('two real consumers share one genuine operation and one navigation','both',async h=>{
  const held=deferred();h.state.signoutSDK=()=>held.promise;await ready(h);
  const sidebar=h.button('Cerrar sesión').props.onClick,other=h.button('Cerrar esta sesión').props.onClick;
  sidebar();other();await ready(h);assert.equal(h.state.signouts.length,1);assert(h.button('Cerrar esta sesión').props.disabled);
  held.resolve({url:'http://127.0.0.1:4300/'});await ready(h);assert.equal(h.state.navigationWrites.length,1);
 });
 for(const change of ['account','ABA','same-account-new-session','language','unmount'])await test(change+' retires callback; hidden native SDK is not cancelled or reconstructed','profile',async h=>{
  const held=deferred();h.state.signoutSDK=()=>held.promise;await ready(h);button(h,'profile').props.onClick();await ready(h);
  const client=h.load('lib/signout-client.ts'),original=client.currentSignoutOriginal();
  if(change==='account'||change==='ABA'){h.state.user='fixture-other';h.state.email='fixture-other@example.invalid';await ready(h);if(change==='ABA'){h.state.user='fixture-one';h.state.email='fixture-one@example.invalid';await ready(h);}}
  else if(change==='same-account-new-session'){h.state.authRevision++;await ready(h);}
  else if(change==='language'){h.state.lang='en';await ready(h);}
  else h.unmount();
  assert.equal(h.timers.size,0);assert.equal(client.currentSignoutOriginal(),original);
  held.resolve({url:'http://127.0.0.1:4300/'});await flush();if(change!=='unmount')await ready(h);
  assert(!h.state.navigationWrites);assert.equal(h.state.signouts.length,1);assert.equal(client.trustedSignoutOutcome(original).status,'confirmed');
 });
 for(const value of ['https://example.invalid/','javascript:alert(1)','http://127.0.0.1:4300/login','http://127.0.0.1:4300/?foreign=1','http://user@127.0.0.1:4300/'])await test('foreign/altered native URL never becomes a navigation or fresh invocation: '+value,'profile',async h=>{
  h.state.signoutSDK=async()=>({url:value});await ready(h);const click=button(h,'profile').props.onClick;click();await ready(h);click();await ready(h);
  assert.equal(h.state.signouts.length,1);assert(!h.state.navigationWrites);assert.match(h.text(),/Salida sin confirmar/);assert.equal(h.timers.size,0);
 });
 for(const mode of ['sidebar','profile'])for(const [name,result] of [
  ['explicit SDK error with normal home URL',{url:'http://127.0.0.1:4300/',error:'private-denial'}],
  ['HTTP failure metadata with normal home URL',{url:'http://127.0.0.1:4300/',status:503}],
  ['negative success marker with normal home URL',{url:'http://127.0.0.1:4300/',ok:false}],
  ['unknown result fields with normal home URL',{url:'http://127.0.0.1:4300/',extra:'unexpected'}],
 ])await test(mode+' rejects '+name+' without claiming navigation or repeatability',mode,async h=>{
  h.state.signoutSDK=async()=>result;await ready(h);button(h,mode).props.onClick();await ready(h);
  assert.equal(h.state.signouts.length,1);assert(!h.state.navigationWrites);assert.match(h.text(),/Salida sin confirmar/);
  observe(h).props.onClick();await ready(h);button(h,mode).props.onClick();await ready(h);
  assert.equal(h.state.signouts.length,1);assert(!h.state.navigationWrites);assert(!h.text().includes('private-denial'));
  assert.equal(h.timers.size,0);
 });
 await test('SDK rejection stays uncertain, sanitized and excluded across consumers','both',async h=>{
  h.state.signoutSDK=async()=>{throw Error('private-native-failure-token');};await ready(h);
  h.click('Cerrar esta sesión');await ready(h);h.button('Cerrar sesión').props.onClick();observe(h).props.onClick();await ready(h);
  assert.equal(h.state.signouts.length,1);assert(!h.text().includes('private-native'));assert.match(h.text(),/Salida sin confirmar/);assert(!h.state.navigationWrites);
 });
 await test('serialized attempt/result and matching metadata grant no original observation/navigation','profile',async h=>{
  await ready(h);button(h,'profile').props.onClick();await ready(h);const client=h.load('lib/signout-client.ts'),a=client.currentSignoutOriginal(),outcome=client.trustedSignoutOutcome(a);
  const clone=JSON.parse(JSON.stringify(a)),same=JSON.parse(JSON.stringify(outcome));assert.equal(client.trustedSignoutOutcome(clone),undefined);
  assert.equal(client.claimSignoutNavigation(clone,outcome),false);assert.equal(client.claimSignoutNavigation(a,same),false);
  assert.equal((await client.observeSignoutOriginal(clone,()=>true).promise).status,'unconfirmed');assert.equal(h.state.signouts.length,1);
 });
 await test('native navigation failure offers only an explicit home link, never redispatch','profile',async h=>{
  h.state.navigationFailure=true;await ready(h);button(h,'profile').props.onClick();await ready(h);
  assert(h.nodes().some(n=>n.type==='a'&&n.props.href==='/'&&h.text(n)==='Ir a portada'));assert.equal(h.state.signouts.length,1);assert.equal(h.timers.size,0);
 });
 return{status:results.every(r=>r.status==='PASS')?'PASS':'FAIL',scope:'Actual Sidebar/Profile and shared genuine SDK promise; synthetic React/auth/clock only. Does not verify internal CSRF/POST owner binding, server cancellation, device revocation or operational auth.',results};
}
module.exports={run};if(require.main===module)run().then(result=>{console.log(JSON.stringify(result,null,2));if(result.status!=='PASS')process.exitCode=1;}).catch(e=>{console.error(e);process.exitCode=1;});
