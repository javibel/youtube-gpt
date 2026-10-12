'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{load}=require('./route-harness.cjs');
const {create,ready,reads,posts,analyze,retry,sample}=require('./best-time-client.test.cjs'),{deferred,flush,reply}=require('./chat-widget-harness.cjs');
module.exports=async function(prisma,results){
 const users=await Promise.all([0,1,2].map(i=>prisma.user.create({data:{email:'best-time-ui-'+randomUUID()+'@example.invalid',name:'Synthetic cache UI '+i}})));
 const handles=[],pending=[];
 const fixture=()=>{const h=create();h.state.user=users[0].id;h.state.email=users[0].email;handles.push(h);return h;};
 const forbidden=()=>{throw Error('GET may not invoke providers or effects');};
 const get=async request=>{
  assert.equal(request.init.method,'GET');
  const route=load('app/api/youtube/best-time/route.ts',{'next/server':{NextResponse:Response},'@/auth':{auth:async()=>({user:{id:request.owner,email:request.email}})},'@/lib/prisma':{prisma},'@/lib/best-time-cache':load('lib/best-time-cache.ts'),'@/lib/youtube-auth':{getAccessToken:forbidden},'@/lib/plans':{getUserPlan:forbidden,isPaid:forbidden},'@/lib/ai/task-runtime':{getMessagesTask:forbidden}});
  const promise=route.GET(new Request('https://example.invalid/api/youtube/best-time'));pending.push(promise);const response=await promise;
  return {ok:response.ok,status:response.status,json:()=>response.json()};
 };
 try{
  const c=sample();await Promise.all(users.slice(0,2).map((u,i)=>prisma.bestTimeAnalysis.create({data:{userId:u.id,...c,analyzedAt:new Date(c.analyzedAt),aiTip:{es:i?'Caché privado vecino':'Caché original privado',en:i?'Neighbor private cache':'Original private cache'}}})));
  const baseline=await prisma.bestTimeAnalysis.findMany({where:{userId:{in:users.map(u=>u.id)}},orderBy:{userId:'asc'}});
  {const h=fixture();h.state.send=get;await ready(h);await Promise.allSettled(pending);await ready(h);assert.match(h.text(),/Caché original privado/);assert.equal(reads(h).length,1);assert.equal(posts(h).length,0);h.unmount();}
  results.push('best-time client native GET/page renders only own cache and retains original epoch with no POST');
  {const h=fixture(),selected=deferred(),gate=deferred();h.state.send=async r=>{const response=await get(r);if(r.owner===users[0].id){const body=await response.json();selected.resolve();return {...response,json:()=>gate.promise.then(()=>body)};}return response;};
   await ready(h);await selected.promise;h.state.user=users[1].id;h.state.email=users[1].email;const tree=h.view(true);assert(!h.text(tree).includes('Caché original privado'));h.runEffects();await ready(h);await Promise.allSettled(pending);await ready(h);assert.match(h.text(),/Caché privado vecino/);gate.resolve();await ready(h);assert(!h.text().includes('Caché original privado'));assert.equal(reads(h).length,2);assert.equal(posts(h).length,0);h.unmount();}
  results.push('best-time client native old SQL cache body cannot cross owner switch before effects or after late delivery');
  {const h=fixture();h.state.user=users[2].id;h.state.email=users[2].email;h.state.send=get;await ready(h);await Promise.allSettled(pending);await ready(h);assert.match(h.text(),/No hay un análisis guardado/);assert.equal(posts(h).length,0);h.unmount();}
  results.push('best-time client native cache absence is explicit empty and never replaces it with neighbor cache or generation');
  {await prisma.bestTimeAnalysis.update({where:{userId:users[0].id},data:{heatmap:[]}});const h=fixture();h.state.send=get;await ready(h);await Promise.allSettled(pending);await ready(h);assert.match(h.text(),/No se pudo cargar/);assert(!h.text().includes('No hay un análisis guardado'));assert.deepEqual((await prisma.bestTimeAnalysis.findUnique({where:{userId:users[0].id}})).heatmap,[]);h.unmount();await prisma.bestTimeAnalysis.update({where:{userId:users[0].id},data:{heatmap:c.heatmap}});}
  results.push('best-time client actual malformed SQL cache remains unconfirmed without repairing data or false empty');
  {const h=fixture(),selected=deferred(),gate=deferred();let first=true;h.state.send=async r=>{const response=await get(r);if(first){first=false;const body=await response.json();selected.resolve();return {...response,json:()=>gate.promise.then(()=>body)};}return response;};
   await ready(h);await selected.promise;h.advance(30000);await ready(h);assert(retry(h).props.disabled);
   await prisma.bestTimeAnalysis.update({where:{userId:users[0].id},data:{aiTip:{es:'Caché SQL posterior',en:'Later SQL cache'}}});gate.resolve();await ready(h);assert(!h.text().includes('Caché original privado'));assert.equal(reads(h).length,1);retry(h).props.onClick();await ready(h);await Promise.allSettled(pending);await ready(h);assert.match(h.text(),/Caché SQL posterior/);assert.equal(reads(h).length,2);assert.equal(posts(h).length,0);h.unmount();
   await prisma.bestTimeAnalysis.update({where:{userId:users[0].id},data:{aiTip:c.aiTip}});}
  results.push('best-time client native cached body30s retires display; only explicit new GET shows later SQL facts without renewing analyzedAt');
  {const h=fixture(),selected=deferred(),gate=deferred();let first=true;h.state.send=async r=>{if(r.init.method==='POST')return reply({error:'Synthetic unavailable'},503);const response=await get(r);if(first){first=false;const body=await response.json();selected.resolve();return {...response,json:()=>gate.promise.then(()=>body)};}return response;};
   await ready(h);await selected.promise;analyze(h).props.onClick();await ready(h);assert(analyze(h).props.disabled);gate.resolve();await ready(h);assert(!h.text().includes('Caché original privado'));retry(h).props.onClick();await ready(h);await Promise.allSettled(pending);await ready(h);assert.match(h.text(),/Caché original privado/);assert(analyze(h).props.disabled);assert.equal(posts(h).length,1);h.unmount();}
  results.push('best-time client native old GET cannot overwrite an explicitly unconfirmed synthetic POST; current GET facts do not release local generation exclusion');
  {const h=fixture(),selected=deferred(),gate=deferred();h.state.send=async r=>{const response=await get(r),body=await response.json();selected.resolve();return {...response,json:()=>gate.promise.then(()=>body)};};await ready(h);await selected.promise;h.state.lang='en';h.view(true);h.runEffects();await ready(h);gate.resolve();await ready(h);assert.match(h.text(),/Original private cache/);assert.equal(reads(h).length,1);assert.equal(posts(h).length,0);h.unmount();}
  results.push('best-time client native same owner language reattachment shares original GET/body and displays only current language');
  assert.deepEqual(await prisma.bestTimeAnalysis.findMany({where:{userId:{in:users.map(u=>u.id)}},orderBy:{userId:'asc'}}),baseline);
  assert.equal(await prisma.generation.count({where:{userId:{in:users.map(u=>u.id)}}}),0);
 }finally{for(const h of handles)h.unmount();await Promise.allSettled(pending);await prisma.user.deleteMany({where:{id:{in:users.map(u=>u.id)}}});}
};
