'use strict';
const assert=require('node:assert/strict'),{harness,deferred,flush,reply}=require('./chat-widget-harness.cjs'),{stats}=require('./dashboard-stats.test.cjs');
const guide=slug=>({slug,title:{es:'Guía sintética pública',en:'Public synthetic guide'},description:{es:'Artículo gratuito',en:'Free article'},level:'beginner',readMin:3,icon:'/fixture/icon.png',steps:{es:['Paso gratuito'],en:['Free step']},videoId:'synthetic-video'});
const fixtureData={getGuide:slug=>['body-guide','fallback-guide'].includes(slug)?guide(slug):null,getRelatedGuides:()=>[],GUIDE_BODIES:{'body-guide':{es:[{type:'paragraph',text:'Texto público ES'},{type:'video',videoId:'synthetic-inline'}],en:[{type:'paragraph',text:'Public EN text'},{type:'video',videoId:'synthetic-inline'}]}}};
const create=options=>harness({learn:true,...options});
async function ready(h){h.view();await flush();h.view();await flush();h.view();}
function ack(h,plan='pro'){
 const data=stats(h.state.email);data.user.id=h.state.user;
 if(plan!=='free'){const limit=plan==='business'?999999:200;data.stats={...data.stats,plan,isPro:true,limit,remaining:limit-data.stats.quotaOccupied,videoTipsRemaining:null};}
 return data;
}
const frames=(h,tree)=>h.nodes(tree).filter(n=>n?.type==='iframe');
const previews=(h,tree)=>h.nodes(tree).filter(n=>n?.props?.style?.backgroundImage?.includes('img.youtube.com'));
const publicContent=(h,slug=h.state.slug)=>{assert.match(h.text(),/Guía sintética pública|Public synthetic guide/);assert(slug==='body-guide'?h.nodes().some(n=>n.type==='public-article'):h.text().includes('Paso gratuito')||h.text().includes('Free step'));};
async function run(){
 const results=[],test=async(name,fn)=>{try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.stack});}};
 for(const slug of ['body-guide','fallback-guide'])for(const plan of ['free','pro','business'])await test(slug+'/'+plan+' uses nested authenticated own stats.plan, actual existing video gate and public content',async()=>{
  const h=create();h.state.slug=slug;h.state.send=()=>reply(ack(h,plan));await ready(h);publicContent(h);
  assert.match(h.text(),new RegExp('Plan confirmado: '+(plan==='free'?'Free':plan==='pro'?'Pro':'Business')));
  assert.equal(frames(h).length,plan==='free'?0:1);assert.equal(previews(h).length,plan==='free'?1:0);
  assert.equal(h.requests.length,1);assert.equal(h.requests[0].url,'/api/user/stats');assert.equal(h.requests[0].init.cache,'no-store');assert(h.requests[0].init.signal);h.unmount();
 });
 for(const slug of ['body-guide','fallback-guide'])await test(slug+' pending first read keeps public article, no paid iframe or Free preview/default',async()=>{
  const h=create(),g=deferred();h.state.slug=slug;h.state.send=()=>g.promise;await ready(h);publicContent(h);assert.match(h.text(),/Comprobando tu plan/);assert.equal(frames(h).length,0);assert.equal(previews(h).length,0);assert(!h.text().includes('Plan confirmado'));
  g.resolve(reply(ack(h,'pro')));await ready(h);assert.equal(frames(h).length,1);h.unmount();
 });
 for(const auth of ['loading','unauthenticated'])await test(auth+' session keeps public content and performs no stats read or video/default',async()=>{
  const h=create();h.state.auth=auth;await ready(h);publicContent(h);assert.equal(h.requests.length,0);assert.equal(frames(h).length,0);assert.equal(previews(h).length,0);assert.match(h.text(),auth==='loading'?/Comprobando sesión/:/Inicia sesión/);assert(!h.text().includes('Plan confirmado'));h.unmount();
 });
 for(const field of ['user','email'])await test('missing authenticated '+field+' requires sign-in without SQL request or Free assumption',async()=>{
  const h=create();h.state[field]=null;await ready(h);assert.equal(h.requests.length,0);assert.match(h.text(),/Inicia sesión/);assert.equal(frames(h).length,0);assert.equal(previews(h).length,0);h.unmount();
 });
 for(const failure of [401,404,503,'headers','JSON','missing plan','root plan only','wrong owner','wrong email','wrong paid','incoherent quota','bad subscription'])await test(failure+' first response produces explicit error/retry while content stays public; retry confirms own Pro',async()=>{
  const h=create();h.state.send=async()=>{
   if(failure==='headers')throw Error('NEVER_PUBLIC');if(failure==='JSON')return{ok:true,status:200,json:async()=>{throw Error('NEVER_PUBLIC');}};
   const b=ack(h);if(failure==='missing plan')delete b.stats.plan;if(failure==='root plan only'){delete b.stats.plan;b.plan='pro';}
   if(failure==='wrong owner')b.user.id='foreign';if(failure==='wrong email')b.user.email='foreign@example.invalid';if(failure==='wrong paid')b.stats.isPro=false;if(failure==='incoherent quota')b.stats.remaining=200;if(failure==='bad subscription')b.subscription={status:'active'};
   return reply(b,typeof failure==='number'?failure:200);
  };
  await ready(h);publicContent(h);assert.match(h.text(),/No hemos podido comprobar tu plan/);assert(!h.text().includes('NEVER_PUBLIC'));assert(!h.text().includes('Plan confirmado:'));assert.equal(frames(h).length,0);assert.equal(previews(h).length,0);
  h.state.send=()=>reply(ack(h));await h.click('Reintentar plan');await ready(h);assert.equal(frames(h).length,1);assert.equal(h.requests.length,2);assert(!h.text().includes('No hemos'));h.unmount();
 });
 for(const held of ['headers','JSON'])await test(held+' withheld30s closes UI wait; late body cannot grant videos and explicit retry rereads',async()=>{
  const h=create(),g=deferred(),body=ack(h);h.state.send=()=>held==='headers'?g.promise:Promise.resolve({ok:true,status:200,json:()=>g.promise});await ready(h);h.advance(30000);await ready(h);
  assert.match(h.text(),/No hemos podido comprobar tu plan/);assert.equal(frames(h).length,0);assert.equal(previews(h).length,0);assert(h.requests[0].init.signal.aborted);
  g.resolve(held==='headers'?reply(body):body);await ready(h);assert.equal(frames(h).length,0);
  h.state.send=()=>reply(ack(h,'business'));await h.click('Reintentar plan');await ready(h);assert.equal(frames(h).length,1);assert.match(h.text(),/Business/);h.unmount();
 });
 await test('headers20s plus JSON10s share30s and never grant late paid access',async()=>{
  const h=create(),a=deferred(),b=deferred();h.state.send=()=>a.promise;await ready(h);h.advance(20000);a.resolve({ok:true,status:200,json:()=>b.promise});await ready(h);h.advance(10000);await ready(h);assert.match(h.text(),/No hemos podido/);b.resolve(ack(h));await ready(h);assert.equal(frames(h).length,0);h.unmount();
 });
 await test('refresh temporarily removes verified paid iframe, labels retained snapshot, failed refresh cannot keep access and retry confirms changed Free',async()=>{
  const h=create();await ready(h);assert.equal(frames(h).length,1);
  const g=deferred();h.state.send=()=>g.promise;const pending=h.click('Actualizar plan');await ready(h);
  assert.equal(frames(h).length,0);assert.equal(previews(h).length,0);assert.match(h.text(),/Último plan confirmado: Pro/);assert(h.button('Actualizar plan').props.disabled);
  g.resolve(reply({},503));await pending;await ready(h);assert.match(h.text(),/No hemos podido/);assert.match(h.text(),/Último plan confirmado: Pro/);assert.equal(frames(h).length,0);
  h.state.send=()=>reply(ack(h,'free'));await h.click('Reintentar plan');await ready(h);assert.match(h.text(),/Plan confirmado: Free/);assert.equal(previews(h).length,1);assert(!h.text().includes('Último plan confirmado: Pro'));h.unmount();
 });
 await test('repeated stale retry handler joins the same active read and normal button is disabled while refreshing',async()=>{
  const h=create();h.state.send=()=>reply({},503);await ready(h);const old=h.button('Reintentar plan'),g=deferred();h.state.send=()=>g.promise;const one=old.props.onClick(),two=old.props.onClick();await ready(h);assert.equal(h.requests.length,2);assert(!h.nodes().some(n=>n.type==='button')); 
  g.resolve(reply(ack(h)));await Promise.all([one,two]);await ready(h);assert.equal(frames(h).length,1);h.unmount();
 });
 for(const transition of ['user','email','auth','unmount'])await test(transition+' hides existing paid content immediately and ignores late old response/callback without waiting for effects',async()=>{
  const h=create();await ready(h);const old=h.button('Actualizar plan'),g=deferred(),oldBody=ack(h);h.state.send=()=>g.promise;const pending=old.props.onClick();await ready(h);
  if(transition==='unmount'){h.unmount();g.resolve(reply(oldBody));await pending;return;}
  if(transition==='user')h.state.user='fixture-two';if(transition==='email')h.state.email='fixture-two@example.invalid';if(transition==='auth')h.state.auth='unauthenticated';
  const immediate=h.view(true);assert.equal(frames(h,immediate).length,0);assert.equal(previews(h,immediate).length,0);assert(!h.text(immediate).includes('Último plan confirmado'));
  const before=h.requests.length;await old.props.onClick();assert.equal(h.requests.length,before);
  h.state.send=()=>reply(ack(h,'free'));h.runEffects();await ready(h);g.resolve(reply(oldBody));await pending;await ready(h);assert.equal(frames(h).length,0);assert.equal(previews(h).length,transition==='auth'?0:1);h.unmount();
 });
 await test('authenticated session loading transition withdraws paid projection before effects and rechecks when ready',async()=>{
  const h=create();await ready(h);h.state.auth='loading';assert.equal(frames(h,h.view(true)).length,0);h.runEffects();await ready(h);h.state.auth='authenticated';h.state.send=()=>reply(ack(h,'free'));await ready(h);assert.equal(frames(h).length,0);assert.equal(previews(h).length,1);h.unmount();
 });
 await test('Strict Mode shares one initial read; English UI, article and real gate remain coherent',async()=>{
  const h=create();h.state.lang='en';h.strictEffects();await ready(h);assert.equal(h.requests.length,1);assert.match(h.text(),/Confirmed plan: Pro/);assert.equal(frames(h).length,1);assert(h.nodes().some(n=>n.type==='public-article'&&n.props.block.text==='Public EN text'));h.unmount();
 });
 await test('unknown slug preserves not-found/back-link and never renders a video',async()=>{const h=create();h.state.slug='missing';await ready(h);assert.match(h.text(),/Guía no encontrada/);assert.equal(frames(h).length,0);assert(h.nodes().some(n=>n.type==='link'&&n.props.href==='/learn'));h.unmount();});
 console.log(JSON.stringify({status:results.every(r=>r.status==='PASS')?'PASS':'FAIL',scope:'Actual Learn page/dashboard hook/renderer/video JSX with synthetic session/HTTP/guide; no browser/resources/effects',results},null,2));
 if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
}
module.exports={fixtureData,create,ack,ready,frames,previews,publicContent};if(require.main===module)run();
