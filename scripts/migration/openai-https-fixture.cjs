'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module'),{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
function load(relative,overrides={}){
 const file=path.resolve(__dirname,'../..',relative),entry={exports:{}},requireFile=createRequire(file);
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{module:entry,exports:entry.exports,require:name=>Object.hasOwn(overrides,name)?overrides[name]:requireFile(name),Buffer,AbortSignal,AbortController,Headers,ReadableStream,Promise},{filename:file});return entry.exports;
}
function fixture(options={}){
 const calls=[],agents=[],sends=[],resolutions=[];let current;
 const wire=()=>({status:'completed',output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'Synthetic pinned response',annotations:[]}]}],usage:{input_tokens:15,input_tokens_details:{cached_tokens:3,cache_write_tokens:2},output_tokens:5}});
 const native={Agent:class{constructor(configuration){this.configuration=configuration;this.destroyed=false;agents.push(this);}destroy(){this.destroyed=true;}},request(configuration,onResponse){
  const request=new EventEmitter(),socket=new EventEmitter();socket.encrypted=true;socket.authorized=true;socket.remoteAddress=options.address??'93.184.216.34';socket.servername='api.openai.com';socket.getPeerCertificate=()=>({subjectaltname:options.certificate??'DNS:api.openai.com'});Object.assign(socket,options.socket);
  request.destroyed=false;request.destroy=error=>{if(request.destroyed)return;request.destroyed=true;if(error)queueMicrotask(()=>request.emit('error',error));};
  request.end=body=>{sends.push(body);const response=new PassThrough();response.statusCode=options.status??200;response.headers={'content-type':'application/json',...options.headers};current.response=response;queueMicrotask(()=>{if(request.destroyed){response.destroy();return;}onResponse(response);if(!options.holdBody){response.complete=true;response.end(options.body??JSON.stringify(wire()));}});};
  current={request,socket,configuration};calls.push(current);queueMicrotask(()=>{request.emit('socket',socket);if(!options.holdTLS)socket.emit('secureConnect');});return request;
 }};
 const adapter=load('lib/ai/adapters/openai-https.cjs',{'node:https':native}),factory=load('lib/ai/openai-task-factory.cjs',{'./adapters/openai-https.cjs':adapter});
 const resolveAddress=async value=>{resolutions.push(value);if(options.resolve)return options.resolve(value);return options.address??'93.184.216.34';};
 return{adapter,factory,resolveAddress,calls,agents,sends,resolutions,wire,current:()=>current,createFetch:extra=>adapter.createOpenAIHttpsFetch({resolveAddress,maxRequestBytes:8192,...extra})};
}
module.exports={fixture,load};
