'use strict';
const assert=require('node:assert/strict'),{createRetryOperation}=require('../../lib/ai/retry-operation.cjs');
(async()=>{
 let number=0,dispatch=0,release;const run=createRetryOperation(()=>`synthetic-${++number}`),keys=[];
 const uncertain=async(body,key)=>{keys.push(key);throw Error('Response lost');};
 await assert.rejects(run({title:'one'},uncertain),/Response lost/);
 const recovered=await run({title:'one'},async(body,key)=>{keys.push(key);return 'original output';});
 assert.equal(recovered,'original output');assert.equal(keys[0],keys[1]);
 await run({title:'one'},async(body,key)=>{keys.push(key);});assert.notEqual(keys[1],keys[2]);
 const send=()=>{dispatch++;return new Promise(resolve=>{release=resolve;});};
 const a=run({title:'two'},send),b=run({title:'two'},send);assert.equal(a,b);
 await assert.rejects(run({title:'different'},send),/in progress/);assert.equal(dispatch,1);release('done');assert.equal(await a,'done');
 await assert.rejects(run({title:'three'},uncertain));await run({title:'four'},async(body,key)=>keys.push(key));assert.notEqual(keys.at(-1),keys.at(-2));
 await assert.rejects(createRetryOperation(()=> 'bad key')({},async()=>{}),/Invalid/);
 console.log('PASS: 9 browser retry checks; lost response identity retained, concurrent duplicates merged, completed/new inputs get new identities');
})().catch(error=>{console.error(error);process.exitCode=1;});
