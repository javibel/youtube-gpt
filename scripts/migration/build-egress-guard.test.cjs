'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {Worker}=require('node:worker_threads');
const guard=path.join(__dirname,'build-egress-guard.cjs');
const {allowsSocket}=require('./build-network-policy.cjs');
const helper={entry:path.resolve(__dirname,'../../.next/build/postcss.js'),ipcPort:'45678'};
assert.equal(allowsSocket({host:'127.0.0.1',port:45678},helper),true);
assert.equal(allowsSocket({host:'127.0.0.1',port:45679},helper),false);
assert.equal(allowsSocket({host:'example.invalid',port:45678},helper),false);
assert.equal(allowsSocket({host:'127.0.0.1',port:45678},{entry:__filename,ipcPort:'45678'}),false);
require(guard);
(async()=>{
 for(const endpoint of [{host:'example.invalid',port:443},{host:'127.0.0.1',port:5432},{path:'synthetic-pipe'}])assert.throws(()=>require('node:net').connect(endpoint),/ISOLATION_BLOCKED/);
 assert.throws(()=>require('node:https').request('https://example.invalid'),/ISOLATION_BLOCKED/);
 assert.throws(()=>require('node:tls').connect({host:'example.invalid',port:443}),/ISOLATION_BLOCKED/);
 assert.throws(()=>require('node:child_process').spawn('synthetic'),/ISOLATION_BLOCKED/);
 await assert.rejects(fetch('https://example.invalid'),/ISOLATION_BLOCKED/);
 await new Promise((resolve,reject)=>{
  const worker=new (require('node:worker_threads').Worker)("const {parentPort}=require('node:worker_threads');fetch('https://example.invalid').catch(error=>parentPort.postMessage({guard:global.__ytvBuildGuard,message:error.message}));",{eval:true,execArgv:[]});
  worker.once('message',value=>{try{assert.equal(value.guard,true);assert.match(value.message,/ISOLATION_BLOCKED/);resolve();}catch(error){reject(error);}});
  worker.once('error',reject);
 });
 console.log('Build egress guard: sockets, HTTP, TLS, fetch, processes and worker inheritance pass');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
