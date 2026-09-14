'use strict';
// Node-side guard for the isolated build and its worker threads.
const net=require('node:net');
const tls=require('node:tls');
const http=require('node:http');
const https=require('node:https');
const child=require('node:child_process');
const threads=require('node:worker_threads');
const {syncBuiltinESMExports}=require('node:module');
const {allowsSocket}=require('./build-network-policy.cjs');
const events=[];
function block(kind){events.push({kind});throw Error('ISOLATION_BLOCKED: build forbids '+kind);}
const connect=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args){
 const values=Array.isArray(args[0])?args[0]:args;
 const options=values[0]&&typeof values[0]==='object'?values[0]:{port:values[0],host:values[1]};
 if(!allowsSocket(options))block('external socket');
 return connect.apply(this,args);
};
tls.connect=()=>block('TLS connection');
http.request=http.get=https.request=https.get=()=>block('HTTP connection');
global.fetch=async()=>block('fetch request');
for(const name of ['exec','execSync','execFile','execFileSync','spawn','spawnSync','fork'])child[name]=()=>block('process '+name);
const NativeWorker=threads.Worker;
threads.Worker=class GuardedBuildWorker extends NativeWorker {
 constructor(filename,options={}) {
  super(filename,{...options,execArgv:[...(options.execArgv??process.execArgv),'--require',__filename]});
 }
};
syncBuiltinESMExports();
global.__ytvBuildGuard=true;
module.exports={events};
