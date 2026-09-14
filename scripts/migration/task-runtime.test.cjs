'use strict';
const assert=require('node:assert/strict');const {load}=require('./route-harness.cjs');
(async()=>{
 const runtime=load('lib/ai/task-runtime.ts');
 const identity={taskType:'fixture-task',userId:'fixture-user',language:'es',instructionsVersion:'test-v1',outputSchema:{type:'string'}};
 await assert.rejects(runtime.getMessagesTask(identity),/unavailable/);
 assert.throws(()=>runtime.installTaskRuntime(null),/trusted task factory/);
 let received;const task={create:async()=>({content:[{type:'text',text:'Synthetic'}]})};
 runtime.installTaskRuntime(async value=>{received=value;return value.taskType==='stalled-control'?new Promise(()=>{}):task;});
 assert.equal(await runtime.getMessagesTask(identity),task);assert.deepEqual(received,identity);
 assert.throws(()=>runtime.installTaskRuntime(async()=>task),/already installed/);
 const cancelled=new AbortController();cancelled.abort();await assert.rejects(runtime.getMessagesTask(identity,{signal:cancelled.signal}),/cancelled/);
 const deadline=new AbortController();const waiting=runtime.getMessagesTask({...identity,taskType:'stalled-control'},{signal:deadline.signal});deadline.abort();await assert.rejects(waiting,/cancelled/);
 console.log('PASS: absent control, invalid installer, identity forwarding, immutable installation, pre-cancellation and stalled control cancellation');
})().catch(error=>{console.error(error);process.exitCode=1;});
