'use strict';
const assert=require('node:assert/strict'),{load}=require('./route-harness.cjs');
(async()=>{
 const shared={};
 const first=load('lib/ai/task-runtime.ts',{}, {globalThis:shared});
 const second=load('lib/ai/task-runtime.ts',{}, {globalThis:shared});
 const task={create:async()=>({content:[]})};first.installTaskRuntime(async()=>task);
 assert.equal(await second.getMessagesTask({userId:'synthetic',taskType:'synthetic',language:'es',instructionsVersion:'v1'}),task);
 assert.throws(()=>second.installTaskRuntime(async()=>task),/already installed/);
 assert.throws(()=>Object.defineProperty(shared,Symbol.for('ytubviral.ai.task-runtime.v1'),{value:null}));
 const service={current:async()=>null};const mocks={'server-only':{},'node:crypto':require('node:crypto'),'@/lib/auth-guards':{requireAdmin:async()=>({ok:false})},'./configuration-service.cjs':{createConfigurationService:()=>service}};
 const a=load('lib/ai/configuration-runtime.ts',mocks,{globalThis:shared});
 const b=load('lib/ai/configuration-runtime.ts',mocks,{globalThis:shared});
 a.installConfigurationRuntime({});assert.equal(b.getConfigurationService(),service);
 assert.throws(()=>b.installConfigurationRuntime({}),/already installed/);
 assert.throws(()=>Object.defineProperty(shared,Symbol.for('ytubviral.ai.configuration-runtime.v1'),{value:null}));
 console.log('PASS: 6 independent bundle checks; shared server composition and immutable installation');
})().catch(error=>{console.error(error);process.exitCode=1;});
