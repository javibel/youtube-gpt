'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createFixtureLifecycle}=require('../../lib/migration/local-fixture-lifecycle.cjs');
const {load}=require('./route-harness.cjs');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const flush=async()=>{for(let i=0;i<16;i++)await Promise.resolve();};
const results=[];async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.stack});}}
async function run(){
 await test('stop joins listener, request, original, application and exact resource once in order',async()=>{
  const events=[],request=deferred(),original=deferred(),pool=deferred();
  const l=createFixtureLifecycle({beforeDrain:()=>{events.push('listener');},afterDrain:()=>{events.push('app');}});
  const resource=await l.openResource(async()=>({close:()=>{events.push('pool');return pool.promise;}}));
  const work=l.runWork(()=>request.promise),run=l.runOriginal(()=>({original:original.promise,waiter:Promise.resolve({status:503})}));
  assert.equal(run.original,original.promise);const stopped=l.stop();assert.equal(l.stop(),stopped);assert.throws(()=>l.runWork(()=>{throw Error('new work');}));assert.throws(()=>l.runOriginal(()=>{throw Error('new original');}));await assert.rejects(async()=>l.openResource(async()=>resource));
  let terminal=false;stopped.then(()=>{terminal=true;});await flush();assert.deepEqual(events,['listener']);request.resolve();await work;await flush();assert.equal(terminal,false);assert.deepEqual(events,['listener']);
  original.resolve({status:503});await flush();assert.deepEqual(events,['listener','app','pool']);assert.equal(terminal,false);assert.throws(()=>l.closeResource({...resource}),/Original fixture resource/);
  pool.resolve();const receipt=await stopped;assert.equal(receipt.status,'drained');assert.equal(receipt.businessRecovery,false);assert.equal(receipt.originalsSettled,1);assert.equal(receipt.resourcesClosed,1);await l.closeResource(resource);assert.deepEqual(events,['listener','app','pool']);
 });
 await test('stop during pool opening waits for the original opening and closes it without reinstalling',async()=>{
  const opening=deferred(),events=[],l=createFixtureLifecycle(),pending=l.openResource(()=>opening.promise),stopped=l.stop();await flush();let finished=false;stopped.then(()=>{finished=true;});await flush();assert.equal(finished,false);
  const resource={close:async()=>{events.push('close');}};opening.resolve(resource);assert.equal(await pending,resource);assert.throws(()=>l.check(),/stopping/);const r=await stopped;assert.equal(r.status,'drained');assert.equal(r.resourcesClosed,1);assert.deepEqual(events,['close']);
 });
 await test('retired HTTP waiter cannot close pool while the same original source/model promise remains live',async()=>{
  const held=deferred(),marker={state:'pending'},events=[],l=createFixtureLifecycle();await l.openResource(async()=>({close:async()=>{events.push('close');}}));
  const run=l.runOriginal(()=>({original:held.promise,waiter:Promise.resolve({status:503})}));assert.equal((await run.waiter).status,503);const stopped=l.stop();await flush();assert.deepEqual(events,[]);
  held.resolve({status:503});const r=await stopped;assert.equal(r.status,'drained');assert.deepEqual(marker,{state:'pending'});assert.equal(r.businessRecovery,false);assert.deepEqual(events,['close']);assert.equal(l.reset,undefined);assert.equal(l.recover,undefined);
 });
 for(const stage of ['listener','application','resource'])await test(stage+' close rejection is terminal failure and still joins other owned resources',async()=>{
  let calls=0;const fail=async()=>{throw Error('synthetic close failure');},l=createFixtureLifecycle({beforeDrain:stage==='listener'?fail:undefined,afterDrain:stage==='application'?fail:undefined});
  const resource=await l.openResource(async()=>({close:async()=>{calls++;if(stage==='resource')await fail();}}));const stopped=l.stop(),r=await stopped;assert.equal(r.status,'failed');assert.ok(r.errors.includes(stage));assert.equal(l.stop(),stopped);assert.equal(calls,1);if(stage==='resource')await assert.rejects(l.closeResource(resource));else await l.closeResource(resource);assert.equal(calls,1);
 });
 await test('lost original or resource close capability never fabricates successful drainage',async()=>{
  const a=createFixtureLifecycle();assert.throws(()=>a.runOriginal(()=>({original:{status:'completed'}})));assert.equal((await a.stop()).status,'failed');
  const b=createFixtureLifecycle();await assert.rejects(b.openResource(async()=>({close:'serialized-close'})));const r=await b.stop();assert.equal(r.status,'failed');assert.equal(r.resourcesClosed,0);
 });
 await test('independent bundles share one genuine guarded lifecycle; JSON/clones/replace/reset cannot install',async()=>{
  const source=fs.readFileSync(require.resolve('../../lib/migration/local-fixture-lifecycle.cjs'),'utf8'),shared={__ytvRuntimeGuard:true},load=env=>{const module={exports:{}};vm.runInNewContext(source,{module,globalThis:shared,process:{env},Promise});return module.exports;};
  const first=load({YTV_MIGRATION_WEB_TEST:'1'}),second=load({YTV_MIGRATION_WEB_TEST:'1'}),closed=load({});const lifecycle=first.createFixtureLifecycle();assert.throws(()=>first.installFixtureLifecycle({...lifecycle}));assert.throws(()=>closed.installFixtureLifecycle(lifecycle));first.installFixtureLifecycle(lifecycle);assert.equal(second.getFixtureLifecycle(),lifecycle);assert.throws(()=>second.installFixtureLifecycle(second.createFixtureLifecycle()));assert.throws(()=>closed.getFixtureLifecycle());assert.throws(()=>Object.defineProperty(shared,Symbol.for('ytubviral.migration.fixture-lifecycle.v1'),{value:JSON.parse('{}')}));assert.equal(second.reset,undefined);
 });
 await test('guarded Prisma is one immutable physical client across bundles, with disconnect joined once',async()=>{
  let created=0,closed=0;const disconnect=deferred(),lifecycle=createFixtureLifecycle(),shared={};
  class PrismaClient{constructor(){created++;}$disconnect(){closed++;return disconnect.promise;}}
  const mocks={'@prisma/client':{PrismaClient},'./migration/local-fixture-lifecycle.cjs':{getFixtureLifecycle:()=>lifecycle}},globals={globalThis:shared,process:{env:{YTV_MIGRATION_WEB_TEST:'1',NODE_ENV:'production'}}};
  const a=load('lib/prisma.ts',mocks,globals),b=load('lib/prisma.ts',mocks,globals);assert.equal(a.prisma,b.prisma);assert.equal(created,1);
  assert.throws(()=>Object.defineProperty(shared,Symbol.for('ytubviral.migration.fixture-prisma.v1'),{value:JSON.parse('{}')}));
  const stopped=lifecycle.stop();let finished=false;stopped.then(()=>{finished=true;});await flush();assert.equal(closed,1);assert.equal(finished,false);assert.throws(()=>load('lib/prisma.ts',mocks,globals),/stopping/);assert.equal(created,1);
  disconnect.resolve();const r=await stopped;assert.equal(r.status,'drained');assert.equal(r.resourcesClosed,1);assert.equal(closed,1);
 });
 await test('missing lifecycle or forged Prisma object blocks fixture construction; ordinary legacy client stays separate',async()=>{
  let created=0,checked=0;class PrismaClient{constructor(){created++;}$disconnect(){return Promise.resolve();}}
  const mocks={'@prisma/client':{PrismaClient},'./migration/local-fixture-lifecycle.cjs':{getFixtureLifecycle(){checked++;throw Error('Fixture lifecycle is not installed');}}};
  assert.throws(()=>load('lib/prisma.ts',mocks,{globalThis:{},process:{env:{YTV_MIGRATION_WEB_TEST:'1',NODE_ENV:'production'}}}),/not installed/);assert.equal(created,0);
  const legacy=new PrismaClient(),ordinary=load('lib/prisma.ts',mocks,{globalThis:{prisma:legacy},process:{env:{NODE_ENV:'production'}}});assert.equal(ordinary.prisma,legacy);assert.equal(checked,1);
  const shared={[Symbol.for('ytubviral.migration.fixture-prisma.v1')]:{status:'completed'}},lifecycle=createFixtureLifecycle();mocks['./migration/local-fixture-lifecycle.cjs']={getFixtureLifecycle:()=>lifecycle};assert.throws(()=>load('lib/prisma.ts',mocks,{globalThis:shared,process:{env:{YTV_MIGRATION_WEB_TEST:'1'}}}),/Original fixture Prisma/);assert.equal(created,1);
 });
 return {status:results.every(r=>r.status==='PASS')?'PASS':'FAIL',scope:'Owned fixture promise/pool drainage only, no business acceptance/recovery, services or real transports.',results};
}
if(require.main===module){const watchdog=setTimeout(()=>{console.error('Fixture drainage verification missing terminal');process.exit(1);},15000);run().then(r=>{clearTimeout(watchdog);console.log(JSON.stringify(r,null,2));if(r.status!=='PASS')process.exitCode=1;},e=>{clearTimeout(watchdog);console.error(e);process.exitCode=1;});}
module.exports={run};
