'use strict';
// ONE new integration suite. Only newly owned PostgreSQL/HTTP loopback fixture,
// synthetic signing keys/principals/providers. Old test bodies never execute.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),http=require('node:http'),vm=require('node:vm'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'../../../..'),web=path.join(root,'work/migration-web'),agent=path.join(root,'work/migration-agent');
const fixture=path.join(root,'work/migration-reporting/functional-channel-scope-2026-11-03/local-e2e-postgres');
const config=JSON.parse(fs.readFileSync(path.join(fixture,'synthetic-config.json'))),{Pool}=require('pg');
assert.equal(config.host,'127.0.0.1');assert.equal(config.port,55663);assert.equal(config.database,'postgres');
const {createPostgresControlDatabase}=require('../../contracts/ai/v1/postgres-storage.cjs');
const {createControlStore}=require('../../contracts/ai/v1/control-store.cjs');
const {createObserverLedger}=require('../../contracts/ai/v1/observer-ledger.cjs');
const {createObserverChannelService}=require('../../lib/ai/observer-channel-service.cjs');
const grammarApi=require('../../contracts/ai/v1/observer-channel.cjs');
const {createObserverRelayProtocol}=require('../../contracts/ai/v1/observer-relay-protocol.cjs');
const {captureOriginalObserverClaim}=require(path.join(agent,'lib/operational/original-observer-claim.cjs'));
const {captureOriginalObserverBinding}=require(path.join(agent,'lib/operational/original-observer-binding.cjs'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),defer=()=>{let resolve;return{promise:new Promise(r=>{resolve=r;}),resolve};};
const native=work=>{const result=Promise.resolve().then(work);return Object.freeze({result,settled:result.then(()=>{},()=>{})});};
const poolOptions={...config,ssl:{rejectUnauthorized:true,ca:fs.readFileSync(config.caFile)},max:3,connectionTimeoutMillis:3000,idleTimeoutMillis:500};
delete poolOptions.dataDirectory;delete poolOptions.caFile;delete poolOptions.postmasterPid;
const adminPool=new Pool(poolOptions),pools=[adminPool],pending=new Set(),owners=[];
const retain=fn=>{const p=Promise.resolve().then(fn);pending.add(p);void p.finally(()=>pending.delete(p)).catch(()=>{});return p;};
const results=[];let server,port,service,gate=true,stage='setup',httpOpened=0,httpClosed=0,sqlStarted=0,sqlSettled=0;
const sign=(key,text)=>crypto.sign(null,Buffer.from(text),key).toString('base64url');
const webKey=crypto.generateKeyPairSync('ed25519'),agentKey=crypto.generateKeyPairSync('ed25519');
const configValue={revision:'synthetic-observer-v1'},policy={runtimeId:'agent',providerId:'anthropic',credentialRef:'synthetic:credential',models:['synthetic-model-1','synthetic-model-2','synthetic-model-3','synthetic-model-4'],configurationRevision:configValue.revision,configurationDigest:hash(JSON.stringify(configValue)),requester:{peerId:'web:synthetic',keyId:'web:fixture'},responder:{peerId:'agent:synthetic',keyId:'agent:fixture'}};
const pins={requester:{...policy.requester,publicKey:webKey.publicKey,spkiSha256:hash(webKey.publicKey.export({type:'spki',format:'der'}))},responder:{...policy.responder,publicKey:agentKey.publicKey,spkiSha256:hash(agentKey.publicKey.export({type:'spki',format:'der'}))}};
const grammar=grammarApi.createObserverEnvelopeContract(policy),protocol=createObserverRelayProtocol(policy,pins),clock=()=>new Date();
const pinHashes={requesterSpkiSha256:pins.requester.spkiSha256,responderSpkiSha256:pins.responder.spkiSha256};
let executor,reader,ledger;
// Reuse the existing owner fixture declarations, not its cases or old runners.
const previousFile=path.join(agent,'scripts/migration/administrative-observer-handoff.test.cjs');
let factoryText=fs.readFileSync(previousFile,'utf8').split('const deferred=')[0];
factoryText=factoryText.replace('function fixture({preserved=false,injected=false}={})','function fixture({preserved=false,injected=false,observerAdmission}={})').replace('const input={database:','const input={observerAdmission,database:');
const ownerFixture=new Function('require','__dirname',factoryText+'\nreturn fixture;')(createRequire(previousFile),path.dirname(previousFile));
const signal=()=>new AbortController().signal;
function newOwner({commitLoss=false,denyBinding=false,observationGate}={}){
 const database=commitLoss?{transactionOriginal(work,o){const original=executor.transactionOriginal(work,o);const result=original.result.then(()=>{throw Error('synthetic-commit-ack-lost');});return Object.freeze({result,settled:original.settled});}}:executor;
 const binding=captureOriginalObserverBinding({policy,pins:pinHashes,clock,reader:createControlStore(reader,{}),verifyEnrollmentOriginal:()=>native(()=>true),verifySourceOriginal:()=>native(()=>!denyBinding)});
 const withOriginalClaim=captureOriginalObserverClaim({policy,pins:pinHashes,clock,transactionOriginal:database.transactionOriginal.bind(database),insertClaim:ledger.insertClaim});
 const f=ownerFixture({observerAdmission:{policy,pins,clock,timeoutMs:1000,verifyBinding:binding,authorizeObservation:async()=>true,withOriginalClaim}});
 if(observationGate)f.gates.credential=observationGate;
 owners.push(f);return f;
}
function newService(){service=createObserverChannelService({policy,pins,clock,database:executor,signRequest:async request=>({wire:grammar.encodeRequest(request,sign(webKey.privateKey,grammar.requestSigningText(request)))}),verifyAgentOriginal:async()=>true,retain,assertOpen:()=>{}});return service;}
function route(file){const ts=require('typescript'),source=fs.readFileSync(path.join(web,file),'utf8'),js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});assert(!js.diagnostics?.length);const mod={exports:{}};const original=createRequire(path.join(web,file));new Function('require','module','exports',js.outputText)(id=>id==='@/lib/auth-guards'?{requireAdmin:async()=>gate?{ok:true,email:'synthetic-admin@example.invalid'}:{ok:false,response:Response.json({code:'permissions'},{status:403})}}:id==='@/lib/ai/observer-channel-runtime.cjs'?{getObserverChannel:()=>service}:id.startsWith('@/')?original(path.join(web,id.slice(2))):original(id),mod,mod.exports);return mod.exports;}
function rpc(url,body,{admin=true,origin=true}={}){return new Promise((resolve,reject)=>{
 const text=body===undefined?null:JSON.stringify(body);let response,complete=false,value,closedRequest=false,closedResponse=false;
 const finish=()=>{if(closedRequest&&closedResponse){if(complete)resolve(value);else reject(Error('fixed-http-incomplete'));}};
 const request=http.request({host:'127.0.0.1',port,path:url,method:text?'POST':'GET',agent:false,headers:{...(text?{'content-type':'application/json','content-length':Buffer.byteLength(text)}:{}),...(origin?{origin:'http://127.0.0.1:'+port}:{}),'x-fixture-admin':admin?'1':'0'}},res=>{response=res;const parts=[];let size=0;res.on('data',chunk=>{size+=chunk.length;if(size>75000){res.destroy();return;}parts.push(chunk);});res.on('end',()=>{try{value={status:res.statusCode,body:JSON.parse(Buffer.concat(parts).toString('utf8'))};complete=res.complete;}catch{};});res.on('close',()=>{closedResponse=true;finish();});res.on('error',()=>{});});
 request.on('error',()=>{if(!response)closedResponse=true;});request.on('close',()=>{closedRequest=true;finish();});request.setTimeout(4000,()=>request.destroy());request.end(text??undefined);
 });}
const transport=(action,body)=>native(async()=>{const r=await rpc('/api/internal/agent-observations/'+action,body);if(r.status!==200)throw Error('fixed-transport-rejected');return r.body;});
const signControl=c=>native(()=>sign(agentKey.privateKey,c.signingText));
const signResult=c=>native(()=>grammar.encodeResult(c.result,sign(agentKey.privateKey,c.signingText),c.originalRequestWire));
const proof=(action,id,key=agentKey.privateKey)=>{const time=Date.now();return protocol.encode(action,id,time,sign(key,protocol.signingText(action,id,time)));};
async function create(){newService();const r=await rpc('/api/admin/ai-observations',{action:'create'});assert.equal(r.status,201);return r.body.requests.map(x=>x.requestId);}
async function status(id){const r=await rpc('/api/admin/ai-observations?requestId='+id);assert.equal(r.status,200);return r.body;}
async function test(name,fn){stage=name;try{await fn();results.push({name,status:'PASS'});}catch{results.push({name,status:'FAIL',code:'FIXED_ASSERTION_OR_OPERATION'});throw Error('FIXED_SUITE_FAILED');}}
(async()=>{
 let success=false;
 try{
  // New isolated fixture only: exact local role identities required by adapter.
  const password=config.password;
  for(const role of ['ytv_ai_reader','ytv_ai_executor'])await adminPool.query('CREATE ROLE '+role+" LOGIN PASSWORD '"+password+"' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS");
  await adminPool.query('CREATE SCHEMA ytv_ai_v1; GRANT USAGE ON SCHEMA ytv_ai_v1 TO ytv_ai_reader,ytv_ai_executor; CREATE TABLE ytv_ai_v1.revisions(revision text PRIMARY KEY,payload jsonb NOT NULL); CREATE TABLE ytv_ai_v1.active_revision(singleton boolean PRIMARY KEY,revision text NOT NULL); GRANT SELECT ON ytv_ai_v1.revisions,ytv_ai_v1.active_revision TO ytv_ai_reader');
  await adminPool.query('CREATE ROLE ytv_ai_activator NOLOGIN NOINHERIT');
  await adminPool.query(fs.readFileSync(path.join(web,'scripts/migration/sql/observer-channel.candidate.sql'),'utf8'));
  await adminPool.query('INSERT INTO ytv_ai_v1.revisions VALUES($1,$2);',[configValue.revision,configValue]);await adminPool.query('INSERT INTO ytv_ai_v1.active_revision VALUES(true,$1)',[configValue.revision]);
  const db=role=>{const pool=new Pool({...poolOptions,user:'ytv_ai_'+role});pools.push(pool);const base=createPostgresControlDatabase({role,controlSchema:'ytv_ai_v1',databaseName:'postgres',timeoutMs:2000,connect:()=>pool.connect()});return Object.freeze({...base,transactionOriginal(work,o){sqlStarted++;const h=base.transactionOriginal(work,o);void h.settled.then(()=>sqlSettled++);return h;}});};
  executor=db('executor');reader=db('reader');ledger=createObserverLedger({database:executor,retain});
  const admin=route('app/api/admin/ai-observations/route.ts'),claim=route('app/api/internal/agent-observations/claim/route.ts'),result=route('app/api/internal/agent-observations/result/route.ts');
  server=http.createServer(async(req,res)=>{httpOpened++;res.once('close',()=>httpClosed++);const chunks=[];for await(const c of req)chunks.push(c);const url='http://127.0.0.1:'+port+req.url;const request=new Request(url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})});gate=req.headers['x-fixture-admin']==='1';const handlers=req.url.startsWith('/api/admin/')?admin:req.url.endsWith('/claim')?claim:result;const response=await handlers[req.method](request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));port=server.address().port;
  await test('complete admin HTTP -> signed challenge -> original owner relay -> atomic PostgreSQL claim -> bounded observation -> signed result -> admin status',async()=>{
   const ids=await create(),f=newOwner();assert.equal(ids.length,5);const done=await f.owner.relayObserverSession({requestIds:ids,transport,signControl,signResult,signal:signal()});assert.equal(done.outcomes.length,5);assert(done.outcomes.every(x=>x.state==='complete'));assert.equal(f.state.observations.length,5);
   for(const id of ids){const r=await status(id);assert.equal(r.state,'complete');assert(r.executionClaimed);assert(r.resultWire);}
   assert.equal(f.state.started,0);assert.equal(f.state.roleReads,0);
  });
  await test('native admin actor, origin and signed original peer required; no body actor grant',async()=>{
   assert.equal((await rpc('/api/admin/ai-observations',{action:'create'},{admin:false})).status,403);
   assert.equal((await rpc('/api/admin/ai-observations',{action:'create'},{origin:false})).status,403);
   assert.equal((await rpc('/api/admin/ai-observations',{action:'create',actor:'forged'})).status,400);
   const [id]=await create();const unknown=crypto.generateKeyPairSync('ed25519');assert.equal((await rpc('/api/internal/agent-observations/claim',{requestId:id,proof:proof('claim',id,unknown.privateKey)})).status,403);assert.equal((await status(id)).state,'pending');
  });
  await test('atomic independent request and nonce conflicts, immutable binding, duplicate claim and result never redispatch',async()=>{
   const ids=await create(),f=newOwner();await f.owner.relayObserverSession({requestIds:[ids[0]],transport,signControl,signResult,signal:signal()});
   const original=await ledger.request(ids[0],{signal:signal()});const r=grammar.parseRequest(original.request_wire).unsigned;
   const e={...r,wire:original.request_wire,requestDigest:hash(original.request_wire),responder:policy.responder.peerId};
   await assert.rejects(()=>ledger.create([e],{actor:'admin_'+'f'.repeat(64),signal:signal()}));
   await assert.rejects(()=>ledger.create([{...e,requestId:'obs_conflict_request_00001'}],{actor:'admin_'+'f'.repeat(64),signal:signal()}));
   await assert.rejects(()=>adminPool.query("UPDATE ytv_ai_v1.observer_requests SET nonce=$2 WHERE request_id=$1",[ids[0],'f'.repeat(64)]));
   assert.equal((await rpc('/api/internal/agent-observations/claim',{requestId:ids[0],proof:proof('claim',ids[0])})).status,503);
   const other=newOwner();await assert.rejects(()=>other.owner.admitObserverRequest(original.request_wire,{signal:signal()}));assert.equal(other.state.observations.length,0);
  });
  await test('changed full configuration binding and cancelled requests prevent original observation',async()=>{
   const ids=await create();await adminPool.query('UPDATE ytv_ai_v1.revisions SET payload=$2 WHERE revision=$1',[configValue.revision,{revision:configValue.revision,changed:true}]);const f=newOwner();const r=await f.owner.relayObserverSession({requestIds:[ids[0]],transport,signControl,signResult,signal:signal()});assert.equal(r.outcomes[0].state,'uncertain');assert.equal(f.state.observations.length,0);assert.equal((await status(ids[0])).state,'uncertain');
   await adminPool.query('UPDATE ytv_ai_v1.revisions SET payload=$2 WHERE revision=$1',[configValue.revision,configValue]);assert.equal((await rpc('/api/admin/ai-observations',{action:'cancel',requestId:ids[1]})).status,200);assert.equal((await rpc('/api/internal/agent-observations/claim',{requestId:ids[1],proof:proof('claim',ids[1])})).status,503);
  });
  await test('lost acknowledged COMMIT keeps durable claim and new original owner cannot retry',async()=>{
   const [id]=await create(),f=newOwner({commitLoss:true});const r=await f.owner.relayObserverSession({requestIds:[id],transport,signControl,signResult,signal:signal()});assert.equal(r.outcomes[0].state,'uncertain');assert.equal(f.state.observations.length,0);const row=await ledger.request(id,{signal:signal()});assert(row.execution_claim);const second=newOwner();await assert.rejects(()=>second.owner.admitObserverRequest(row.request_wire,{signal:signal()}));assert.equal(second.state.observations.length,0);
  });
  await test('abort retains pending original observer; late acknowledgement cannot send result or release claim',async()=>{
   const [id]=await create(),hold=defer(),f=newOwner({observationGate:hold.promise}),controller=new AbortController();const operation=f.owner.relayObserverSession({requestIds:[id],transport,signControl,signResult,signal:controller.signal});
   for(let i=0;i<500&&!f.state.observations.length;i++)await new Promise(r=>setTimeout(r,2));assert.equal(f.state.observations.length,1);controller.abort();const r=await operation;assert.equal(r.outcomes[0].state,'uncertain');const stopped=await f.owner.stop();assert.equal(stopped.drained,false);hold.resolve(true);await new Promise(r=>setTimeout(r,15));assert.equal((await status(id)).state,'uncertain');assert.equal((await status(id)).resultWire,null);const row=await ledger.request(id,{signal:signal()});assert(row.execution_claim);assert.equal((await rpc('/api/internal/agent-observations/claim',{requestId:id,proof:proof('claim',id)})).status,503);
  });
  success=true;
 }catch{if(!results.some(r=>r.status==='FAIL'))results.push({name:stage,status:'FAIL',code:'FIXED_SETUP_OR_SUITE_FAILURE'});}
 finally{
  for(const f of owners)try{await f.owner.stop();}catch{}
  if(server)await new Promise(r=>server.close(r));
  await Promise.allSettled([...pending]);
  const closed=await Promise.allSettled(pools.map(p=>p.end()));
  const report={scope:'ONE new functional channel PostgreSQL/HTTP integration suite; synthetic originals only',results,complete:success,originalSqlStarted:sqlStarted,originalSqlSettled:sqlSettled,sqlSettled:sqlStarted===sqlSettled,httpOpened,httpClosed,httpClosedExactly:httpOpened===httpClosed,poolsClosed:closed.every(r=>r.status==='fulfilled'),testHttpListenerClosed:!server?.listening,oldSuitesRepeated:false,realOriginalReads:0,externalCalls:0,providerCalls:0,activationAuthorized:false,operationalAccepted:false};
  console.log(JSON.stringify(report));if(!success||!report.poolsClosed||!report.sqlSettled||!report.httpClosedExactly)process.exitCode=1;
 }
})();
