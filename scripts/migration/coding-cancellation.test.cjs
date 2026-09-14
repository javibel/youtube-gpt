'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {ContractError}=require('../../contracts/ai/v1/core.cjs');
const source=fs.readFileSync(path.join(__dirname,'../../contracts/ai/v1/core.cjs'),'utf8');
const start=source.indexOf('async function executeBounded('),end=source.indexOf('\nfunction createRegistry()',start);assert.ok(start>=0&&end>start);
const box={AbortController,ContractError,Promise,clearTimeout,setTimeout:(callback,ms)=>setTimeout(callback,ms===21000?5:ms)};
vm.runInNewContext(source.slice(start,end),box);
const context=executor=>({request:{budget:{currency:'EUR',deadlineMs:1000}},snapshot:{executor}});
(async()=>{
 const controller=new AbortController();const hung=box.executeBounded(()=>{queueMicrotask(()=>controller.abort());return new Promise(()=>{});},context('coding'),controller.signal);const result=await hung;assert.equal(result.status,'failed');assert.equal(result.error.code,'uncertain');assert.equal(result.usage,undefined);
 const lateController=new AbortController();const late=await box.executeBounded(()=>{queueMicrotask(()=>lateController.abort());return new Promise(resolve=>setTimeout(()=>resolve({status:'completed',data:{untrusted:'late'},usage:{costMicros:5}}),1));},context('coding'),lateController.signal);assert.equal(late.status,'cancelled');assert.equal(late.data,null);assert.equal(late.usage.costMicros,5);
 const aiController=new AbortController();const ai=await box.executeBounded(()=>{queueMicrotask(()=>aiController.abort());return new Promise(()=>{});},context('ai'),aiController.signal);assert.equal(ai.status,'cancelled');
 console.log('PASS: 3 cancellation boundary checks: bounded unconfirmed stop, late completion suppressed and unchanged AI cancellation; only the 21-second shutdown grace is shortened in the test VM');
})().catch(error=>{console.error(error);process.exitCode=1;});
