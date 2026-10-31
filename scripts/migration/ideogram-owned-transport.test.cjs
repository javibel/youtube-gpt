'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module'),{EventEmitter}=require('node:events');
const {createIdeogramHttp}=require('../../lib/ai/adapters/ideogram-http.cjs');
const file=path.resolve(__dirname,'../../lib/ai/adapters/ideogram-https.cjs'),results=[];
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
const payload={prompt:'Synthetic topic. No text, no words, no letters.',resolution:'1024x1024',rendering_speed:'TURBO',magic_prompt:'ON',style_type:'REALISTIC',negative_prompt:'text, words, letters, numbers, watermark, logo, blurry, low quality, distorted'};
function fixture(options={}){
 const calls=[],sends=[],resolutions=[],agents=[];const native={Agent:class{constructor(config){this.config=config;agents.push(this);}createConnection(){return this.socket;}destroy(){this.destroyed=true;}},request(config,receive){
  const request=new EventEmitter(),socket=new EventEmitter(),response=new EventEmitter();
  Object.assign(socket,{encrypted:true,authorized:true,remoteAddress:'93.184.216.34',servername:'api.ideogram.ai',getPeerCertificate:()=>({subjectaltname:'DNS:api.ideogram.ai'}),...options.socket});
  config.agent.socket=socket;config.agent.createConnection();
  for(const object of [request,socket,response]){object.destroy=()=>{object.destroyed=true;};}
  Object.assign(response,{statusCode:200,headers:{'content-type':'application/json'},pause(){},resume(){}});
  request.end=body=>{sends.push(body);queueMicrotask(()=>{receive(response);if(!options.holdBody){response.complete=true;response.emit('data',Buffer.from(JSON.stringify({data:[{url:'https://images.example.com/synthetic.png'}]})));response.emit('end');}});};
  const call={request,socket,response,config};calls.push(call);queueMicrotask(()=>{request.emit('socket',socket);if(!options.holdTLS)socket.emit('secureConnect');});return request;
 }};
 const entry={exports:{}},requireFile=createRequire(file);
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{module:entry,exports:entry.exports,require:n=>n==='node:https'?native:requireFile(n),Buffer,AbortSignal,AbortController,Headers,ReadableStream,FormData,Promise},{filename:file});
 const fetch=entry.exports.createIdeogramHttpsFetch({resolveAddress:context=>{resolutions.push(context);return options.resolve?options.resolve(context):Promise.resolve('93.184.216.34');},maxRequestBytes:8192});
 const http=createIdeogramHttp({apiKey:'synthetic-key',downloadHosts:['images.example.com'],fetch});
 const close=(...kinds)=>{for(const call of calls)for(const k of kinds.length?kinds:['request','response','socket'])call[k].emit('close');};
 return {fetch,http,calls,sends,resolutions,agents,close,create:(timeout=1000)=>http.create(payload,{timeout,maxRetries:0})};
}
async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(error){results.push({name,status:'FAIL',error:error.stack});}}
(async()=>{
 await test('original HTTPS is inert until create, pins multipart route and TLS, and drains only after native closes',async()=>{
  const r=fixture({holdTLS:true});assert.equal(r.calls.length,0);assert.equal(r.resolutions.length,0);const pending=r.create();await flush();assert.equal(r.sends.length,0);const c=r.calls[0].config;assert.equal(c.hostname,'api.ideogram.ai');assert.equal(c.path,'/v1/ideogram-v3/generate');assert.equal(c.servername,c.hostname);assert.equal(c.rejectUnauthorized,true);assert.equal(c.agent.config.keepAlive,false);assert.equal(c.agent.config.maxCachedSessions,0);assert.equal(c.family,4);assert.equal(c.maxHeaderSize,16384);assert.equal(c.minVersion,'TLSv1.2');assert.equal(c.headers['Api-Key'],'synthetic-key');r.calls[0].socket.emit('secureConnect');assert.equal((await pending).kind,'brand-image-reference-v1');const bytes=r.sends[0];assert.equal(String(bytes.length),c.headers['Content-Length']);assert(bytes.toString().includes('name="rendering_speed"\r\n\r\nTURBO'));r.close();assert.equal((await r.http.stop({timeoutMs:100})).drained,true);await assert.rejects(r.create());assert.equal(r.calls.length,1);
 });
 await test('a timed out original resolver stays pending and late DNS cannot start HTTPS or clear uncertainty',async()=>{
  let release;const r=fixture({resolve:()=>new Promise(resolve=>{release=resolve;})});await assert.rejects(r.create(10));const result=await r.http.stop({timeoutMs:15});assert.equal(result.uncertain,true);assert.equal(result.native?.dnsPending,1);release('93.184.216.34');await flush();assert.equal(r.calls.length,0);assert.strictEqual(await r.http.stop({timeoutMs:100}),result);
 });
 await test('a successful body and cancellation are not request/socket close acknowledgements',async()=>{
  const r=fixture();await r.create();const result=await r.http.stop({timeoutMs:15});assert.equal(result.drained,false);assert.equal(result.native?.nativePending,3);r.close();await flush();assert.strictEqual(await r.http.stop({timeoutMs:100}),result);assert.equal(result.uncertain,true);
 });
 await test('retirement retains each original native waiter, including the socket, until actual close',async()=>{
  const r=fixture({holdBody:true});const create=r.create();void create.catch(()=>{});await flush();let finished=false;const stopped=r.http.stop({timeoutMs:500}).then(x=>{finished=true;return x;});await flush();await assert.rejects(create);assert.equal(r.calls[0].request.destroyed,true);assert.equal(r.calls[0].response.destroyed,true);r.close('request','response');await flush();assert.equal(finished,false);r.close('socket');assert.equal((await stopped).drained,true);assert.equal(r.sends.length,1);
 });
 await test('generic fetch and stalled cancellation never manufacture a native stop capability',async()=>{
  let release;const response={ok:true,redirected:false,headers:new Headers({'content-type':'application/json'}),body:{getReader:()=>({read:()=>new Promise(()=>{}),cancel:()=>new Promise(resolve=>{release=resolve;})})};
  const http=createIdeogramHttp({apiKey:'synthetic-key',downloadHosts:['images.example.com'],fetch:async()=>response});await assert.rejects(http.create(payload,{timeout:10,maxRetries:0}));const result=await http.stop({timeoutMs:15});assert.equal(result.drained,false);assert(result.pending>=1);release();assert.strictEqual(await http.stop({timeoutMs:100}),result);
 });
 await test('native field/host/TLS rejection precedes wire dispatch and unconfirmed native objects remain owned',async()=>{
  const r=fixture({socket:{authorized:false}});await assert.rejects(r.create());assert.equal(r.sends.length,0);const result=await r.http.stop({timeoutMs:15});assert.equal(result.uncertain,true);r.close();
  const invalid=fixture();for(const patch of [{rendering_speed:'QUALITY'},{file:new Blob(['synthetic'])},{prompt:'x'.repeat(4097)}])await assert.rejects(invalid.http.create({...payload,...patch},{timeout:100,maxRetries:0}));assert.equal(invalid.resolutions.length,0);
 });
 console.log(JSON.stringify({scope:'New original Ideogram ownership/retirement only. Synthetic native HTTPS events and multipart bytes; no sockets, credentials, generation, previous suites or operational authority.',results},null,2));if(results.some(x=>x.status!=='PASS'))process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
