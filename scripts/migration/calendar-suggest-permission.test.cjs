'use strict';
const assert=require('node:assert/strict'),{harness}=require('./calendar-suggest-deadline.test.cjs');
const {flush}=require('./calendar-http-read-deadline.test.cjs');
const results=[];async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.message});}}
function ready(options={},setup=()=>{}){const h=harness({...options,held:options.held??'auth'});setup(h);if(h.calls.includes('auth')||h.state.auth)h.gates.auth.resolve(h.state.auth);return h;}
const contextCalls=h=>h.calls.filter(x=>['bestTime','trends','competitors','entries','token'].includes(x));
(async()=>{
 for(const user of [{id:'synthetic-suggest-owner'}, {email:'synthetic-suggest-owner@example.invalid'}, {id:42,email:'e'}, {id:'',email:'e'}, {id:'x',email:''}])
  await test('incomplete/non-string identity denied before own SQL '+JSON.stringify(user),async()=>{
   const h=harness({auth:{user}});assert.equal((await h.original).status,401);assert.equal(h.captures.filter(c=>c.ownerQuery).length,0);assert.equal(h.captures.filter(c=>c.identity).length,0);
  });
 for(const owner of [null,{id:'foreign',email:'synthetic-suggest-owner@example.invalid'},{id:'synthetic-suggest-owner',email:'foreign@example.invalid'}])
  await test('stored owner must match both captured identity fields '+JSON.stringify(owner),async()=>{
   const h=ready({},h=>{h.state.owner=owner;});assert.equal((await h.original).status,owner===null?404:401);assert.equal(h.calls.includes('plan'),false);assert.equal(h.calls.includes('factory'),false);
  });
 await test('auth object mutation after owner selection cannot redirect captured ID or email',async()=>{
  const h=harness({held:'owner'});await h.started.owner.promise;h.state.auth.user.id='foreign';h.state.auth.user.email='foreign@example.invalid';h.gates.owner.resolve(h.state.owner);
  assert.equal((await h.original).status,200);assert.equal(h.captures.find(c=>c.ownerQuery).ownerQuery.where.email,'synthetic-suggest-owner@example.invalid');assert.equal(h.captures.find(c=>c.planQuery).planQuery.where.userId,'synthetic-suggest-owner');
  assert.equal(h.captures.find(c=>c.identity).identity.userId,'synthetic-suggest-owner');
 });
 await test('captured operation key cannot follow header mutation during permission await',async()=>{
  const h=harness({held:'plan'});await h.started.plan.promise;h.request.headers.set('Idempotency-Key','late-other-key');h.gates.plan.resolve(h.state.subscription);
  assert.equal((await h.original).status,200);assert.equal(h.captures.find(c=>c.identity).identity.operationKey,'original-suggest-key');
 });
 for(const patch of [{userId:'foreign'},{plan:'unexpected'},{status:null},{stripeCustomerId:42},{currentPeriodEnd:'2099-01-01'},{currentPeriodEnd:new Date(NaN)}])
  await test('malformed/foreign permission unconfirmed '+JSON.stringify(patch),async()=>{
   const h=ready({},h=>Object.assign(h.state.subscription,patch));assert.equal((await h.original).status,503);assert.equal(h.calls.includes('factory'),false);assert.deepEqual(contextCalls(h),[]);
  });
 for(const patch of [null,{plan:'free'},{status:'canceled'},{stripeCustomerId:'manual_admin',currentPeriodEnd:null},{stripeCustomerId:'manual_admin',currentPeriodEnd:new Date('2000-01-01')}])
  await test('missing, free or expired permission denies without renewal '+JSON.stringify(patch),async()=>{
   const h=ready({},h=>{if(patch===null)h.state.subscription=null;else Object.assign(h.state.subscription,patch);});const before=JSON.stringify(h.state.subscription);
   assert.equal((await h.original).status,403);assert.equal(JSON.stringify(h.state.subscription),before);assert.equal(h.calls.includes('factory'),false);assert.deepEqual(contextCalls(h),[]);
  });
 for(const body of [null,[],{lang:'fr'},{lang:null},{lang:42},{lang:'en',userId:'foreign'},{lang:'es',provider:'other'}])
  await test('closed language input rejects unsupported data '+JSON.stringify(body),async()=>{
   const h=ready({},h=>{h.state.body=body;});assert.equal((await h.original).status,400);assert.equal(h.calls.includes('factory'),false);assert.deepEqual(contextCalls(h),[]);
  });
 await test('explicit Spanish default uses immutable empty input',async()=>{
  const h=ready({},h=>{h.state.body={};});assert.equal((await h.original).status,200);assert.equal(h.captures.find(c=>c.identity).identity.language,'es');assert.match(h.captures.find(c=>c.method).parameters.messages[0].content,/Reply in Spanish/);
 });
 await test('body mutation after task factory selection cannot change original language',async()=>{
  const h=harness({held:'factory'});await h.started.factory.promise;h.state.body.lang='es';h.gates.factory.resolve(h.state.factory);
  assert.equal((await h.original).status,200);assert.equal(h.captures.find(c=>c.identity).identity.language,'en');assert.match(h.captures.find(c=>c.method).parameters.messages[0].content,/Reply in English/);
 });
 for(const stage of ['transaction','factory','entries','create','retrieve'])
  await test('captured manual expiry at '+stage+' never renews or admits a later task',async()=>{
   const h=harness({held:['auth',stage],recovery:stage==='retrieve'});h.state.subscription.stripeCustomerId='manual_admin';h.state.subscription.currentPeriodEnd=new Date('2026-10-07T12:00:01Z');h.gates.auth.resolve(h.state.auth);await h.started[stage].promise;
   h.state.subscription.currentPeriodEnd.setUTCFullYear(2099);h.wallAdvance(1001);h.gates[stage].resolve(h.state[stage]);const r=await h.original;assert.equal(r.status,403);assert.deepEqual(await r.json(),{error:'pro_required'});
   assert.equal(h.captures.filter(c=>c.method).length,stage==='create'||stage==='retrieve'?1:0);assert.equal(h.timers.size,0);
  });
 await test('owner/subscription transaction uses RepeatableRead and retains one shared wait',async()=>{
  const h=harness();assert.equal((await h.original).status,200);assert.deepEqual(JSON.parse(JSON.stringify(h.captures.find(c=>c.transactionOptions).transactionOptions)), {isolationLevel:'RepeatableRead',maxWait:55000,timeout:55000});assert.equal(h.captures.filter(c=>c.transactionOptions).length,1);assert.equal(h.timers.size,0);
 });
 await test('abort after own SQL selection never constructs a task when late ACK arrives',async()=>{
  const h=harness({held:'transaction'});await h.started.transaction.promise;h.controller.abort();assert.equal((await h.original).status,503);h.gates.transaction.resolve(h.state.transaction);await flush();assert.equal(h.calls.includes('factory'),false);assert.equal(h.calls.includes('body'),false);
 });
 console.log(JSON.stringify({scope:'actual calendar suggestions owner/input/permission prelude; synthetic clock/auth/SQL/AI, no operational acceptance or native context claim',status:results.every(r=>r.status==='PASS')?'PASS':'FAIL',results},null,2));
 if(results.some(r=>r.status!=='PASS'))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
