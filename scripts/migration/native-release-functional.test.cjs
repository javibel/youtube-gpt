'use strict';
// One full changed bootstrap flow: original release factory -> native role
// owner -> actual TLS fixture SQL -> installed guarded task -> counted native
// provider wire -> durable result/retrieval -> SAME owner shutdown.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),Module=require('node:module'),{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const root=path.resolve(__dirname,'../../../..'),repo=path.join(root,'work/migration-web'),fixture=path.resolve(process.argv[2]??path.join(root,'work/migration-reporting/native-release-2026-11-05/postgres'));
assert.equal(path.dirname(fixture),path.join(root,'work/migration-reporting/native-release-2026-11-05'));assert(/^postgres(?:-v[2-9])?$/.test(path.basename(fixture)));
const config=JSON.parse(fs.readFileSync(path.join(fixture,'synthetic-config.json')));assert.equal(config.port,55666+Number(path.basename(fixture).match(/v(\d)$/)?.[1]??1));assert.equal(config.host,'127.0.0.1');
const {Pool}=require('pg'),ts=require('typescript'),release=require('../../lib/ai/ytubviral-native-release.json');
const pgOptions={host:config.host,port:config.port,user:config.user,password:config.password,database:'neondb',ssl:{rejectUnauthorized:true,ca:fs.readFileSync(config.caFile)},max:2,connectionTimeoutMillis:2500,idleTimeoutMillis:500};
const admin=new Pool({...pgOptions,database:'postgres'}),pools=[],calls=[],agents=[],results=[];let deployment,host,stage='fixture-schema',metadata=0,counts=0,generations=0,nativeOpened=0,nativeClosed=0,holdGeneration=false,generationEntered;
const originalLoad=Module._load,originalTs=Module._extensions['.ts'];
const socketClose=(request,socket)=>{if(socket.closed)return;socket.closed=true;nativeClosed++;queueMicrotask(()=>{request.emit('close');socket.emit('close');});};
const https={Agent:class{constructor(options){this.options=options;this.destroyed=false;agents.push(this);}destroy(){this.destroyed=true;}},request(options,onResponse){
 assert.equal(options.hostname,'api.anthropic.com');assert.equal(options.port,443);assert.equal(options.rejectUnauthorized,true);assert.equal(options.headers['x-api-key'],'synthetic-native-release-key');
 const request=new EventEmitter(),socket=new EventEmitter();nativeOpened++;Object.assign(socket,{encrypted:true,authorized:true,remoteAddress:'93.184.216.34',servername:'api.anthropic.com',getPeerCertificate:()=>({subjectaltname:'DNS:api.anthropic.com'})});
 socket.destroy=()=>socketClose(request,socket);request.destroy=error=>{if(request.destroyed)return;request.destroyed=true;if(error)queueMicrotask(()=>request.emit('error',error));socketClose(request,socket);};
 request.end=body=>{const input=body===undefined?null:JSON.parse(body);calls.push({path:options.path,input});const response=new PassThrough();response.statusCode=200;response.headers={'content-type':'application/json'};let wire;
  if(options.path.startsWith('/v1/models/')){metadata++;wire={id:decodeURIComponent(options.path.slice(11))};}
  else if(options.path==='/v1/messages/count_tokens'){counts++;assert(input.messages.length);assert(!Object.hasOwn(input,'max_tokens'));wire={input_tokens:100};}
  else{assert.equal(options.path,'/v1/messages');generations++;if(holdGeneration){generationEntered?.();return;}wire={id:'synthetic-message',type:'message',role:'assistant',model:input.model,stop_reason:'end_turn',content:[{type:'text',text:'{"answer":"synthetic complete"}'}],usage:{input_tokens:10,output_tokens:5,cache_read_input_tokens:0,cache_creation_input_tokens:0,service_tier:'standard',inference_geo:'global',speed:'standard',server_tool_use:{web_search_requests:input.tools?1:0,web_fetch_requests:0}}};}
  response.once('close',()=>socketClose(request,socket));queueMicrotask(()=>{if(request.destroyed){response.destroy();return;}onResponse(response);response.complete=true;response.end(JSON.stringify(wire));});
 };
 queueMicrotask(()=>{request.emit('socket',socket);socket.emit('secureConnect');});return request;
}};
Module._load=function(id,parent,isMain){
 if(id==='node:https')return https;
 if(id==='node:dns')return{lookup(hostname,options,done){assert.equal(hostname,'api.anthropic.com');queueMicrotask(()=>done(null,[{address:'93.184.216.34',family:4}]));}};
 if(id==='server-only')return{};
 if(id==='@/lib/auth-guards')return{requireAdmin:async()=>({ok:true,email:'synthetic-admin@example.invalid'})};
 if(id==='pg'&&parent?.filename===path.join(repo,'lib/ai/operational-deployment.cjs'))return{Pool:class extends Pool{constructor(options){assert.equal(options.host,release.database.host);assert.equal(options.port,5432);assert.equal(options.database,'neondb');assert.equal(options.password,config.password);super({...options,...pgOptions,user:options.user});pools.push(this);const end=this.end.bind(this);this.endCount=0;this.end=async()=>{this.endCount++;return end();};}}};
 const loaded=originalLoad.call(this,id,parent,isMain);
 if(id==='./platform-web-bootstrap'&&parent?.filename===path.join(repo,'lib/ai/platform-web-host.ts'))return{...loaded,providePlatformWebDeployment(...args){deployment=loaded.providePlatformWebDeployment(...args);return deployment;}};
 return loaded;
};
Module._extensions['.ts']=(module,file)=>{if(!file.startsWith(repo+path.sep))throw Error('Fixture TS path');module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);};
const parameters=(vision=false,search=false)=>({system:'Synthetic bounded task.',messages:[{role:'user',content:vision?[{type:'text',text:'Inspect synthetic image'},{type:'image',source:{type:'url',url:'https://example.invalid/synthetic.png'}}]:'Synthetic request'}],max_tokens:20,...(search?{tools:[{name:'web_search',maxCalls:3}]}:{})});
const safeError=e=>({stage,code:e?.code??null,message:String(e?.message??'Unknown synthetic failure').slice(0,220),stack:String(e?.stack??'').split('\n').slice(0,5).join('\n')});
let db,complete=false,error;
(async()=>{try{
 await admin.query('CREATE DATABASE neondb');db=new Pool(pgOptions);
 await db.query(fs.readFileSync(path.join(repo,'contracts/ai/v1/control-operational.sql'),'utf8'));
 await db.query(fs.readFileSync(path.join(root,'work/migration-reporting/operational-budget-2026-10-27/operating-models-budget.sql'),'utf8'));
 await db.query(fs.readFileSync(path.join(repo,'scripts/migration/sql/observer-channel.candidate.sql'),'utf8'));
 for(const role of ['reader','activator','executor'])await db.query('ALTER ROLE ytv_ai_'+role+" PASSWORD '"+config.password+"'");
 await db.query('INSERT INTO ytv_ai_v1.revisions(revision,contract_version,payload,actor) VALUES($1,$2,$3,$4)',[release.configuration.revision,'1.0',release.configuration,'synthetic-owner']);
 await db.query('INSERT INTO ytv_ai_v1.active_revision(singleton,revision) VALUES(true,$1)',[release.configuration.revision]);
 await db.query('INSERT INTO ytv_ai_v1.budgets(budget_id,currency,limit_micros) VALUES($1,$2,$3)',[release.operatingBudget.budgetId,'USD',30000000]);
 process.env.NEXT_RUNTIME='nodejs';process.env.YTV_OPERATIONAL_RUNTIME='1';process.env.ANTHROPIC_API_KEY='synthetic-native-release-key';for(const r of ['READER','ACTIVATOR','EXECUTOR'])process.env['YTV_AI_'+r+'_PASSWORD']=config.password;
 stage='instrumentation';const {register}=require('../../instrumentation.ts');await register();host=require('../../lib/ai/platform-web-host.ts');assert(deployment);assert.equal(pools.length,3);assert.equal(metadata,8);assert.equal(counts,0);assert.equal(generations,0);
 const bundle=globalThis[Symbol.for('ytubviral.ai.shared-runtime.v1')];assert(bundle);const service=require('../../lib/ai/configuration-runtime.ts').getConfigurationService();assert.equal((await service.current()).revision,release.configuration.revision);
 results.push({name:'one native preparation and atomic publication of the same guarded owner',status:'PASS',metadataObservations:metadata,pools:pools.length});
 stage='unfunded-image';const {getMessagesTask}=require('../../lib/ai/task-runtime.ts');const before=calls.length;await assert.rejects(getMessagesTask({taskType:'brand.image-generation',serviceId:'brand-agent',language:'es',instructionsVersion:'synthetic-v1'}),e=>e.code==='quota');assert.equal(calls.length,before);
 const {registerYTubViralNativeRelease}=require('../../lib/ai/ytubviral-native-release.cjs');registerYTubViralNativeRelease();assert.equal(metadata,8);
 results.push({name:'catalog50/policies31 retained; unfunded image rejected without observation or transport',status:'PASS'});
 stage='counted-task';
 const identity={taskType:'brand.social-post',serviceId:'brand-agent',language:'es',instructionsVersion:'synthetic-v1',operationKey:'combined_native_flow',requiredCapabilities:['vision','json'],outputSchema:{type:'object',properties:{answer:{type:'string'}},required:['answer'],additionalProperties:false}};
 const task=await getMessagesTask(identity),params=parameters(true,true),value=await task.create(params);assert(value.content[0].text.includes('synthetic complete'));const n=calls.length;assert.deepEqual(await task.retrieve(params),value);assert.equal(calls.length,n);
 assert.equal(counts,1);assert.equal(generations,1);assert.equal(metadata,8);
 const budget=(await db.query('SELECT reserved_micros,settled_micros FROM ytv_ai_v1.budgets WHERE budget_id=$1',[release.operatingBudget.budgetId])).rows[0];assert.equal(Number(budget.reserved_micros),0);assert(Number(budget.settled_micros)>10000);assert(Number(budget.settled_micros)<20000);
 const rows=(await db.query('SELECT status,usage FROM ytv_ai_v1.runs')).rows;assert.equal(rows.length,1);assert(rows.every(r=>r.status==='completed'&&r.usage.estimated===false));results.push({name:'combined text/JSON/vision/bounded-search counted pricing, durable settlement and idempotent retrieval',status:'PASS',countRequests:counts,generations,settledMicros:Number(budget.settled_micros)});
 // Preserve the original conservative $3 request ceiling. After a nonzero
 // settlement the next full-$3 reservation exceeds the remaining daily cap;
 // deny before any token count/generation, without resetting the native day.
 const second=await getMessagesTask({taskType:'brand.image-prompt',userId:'synthetic-user',language:'es',instructionsVersion:'synthetic-v1',operationKey:'daily_cap'});await assert.rejects(second.create(parameters()));assert.equal(counts,1);assert.equal(generations,1);
 results.push({name:'unchanged full-$3 per-request reservation respects remaining daily headroom without reset',status:'PASS',throughputLimitation:'A nonzero settlement prevents another full-$3 reservation on that native day.'});
 stage='shutdown';const closing=host.retireConfiguredPlatformWebHost();const terminal=await closing;assert.equal(terminal.drained,true);assert.equal(terminal.deploymentDrained,true);assert.equal(metadata,8);assert(pools.every(p=>p.endCount===1));await assert.rejects(task.create(parameters()));assert.equal(await host.retireConfiguredPlatformWebHost(),terminal);
 assert.equal(nativeOpened,nativeClosed);assert(agents.every(a=>a.destroyed));results.push({name:'published task admission seals and drains the same native owner before exactly three pools close',status:'PASS',nativeOpened,nativeClosed});complete=true;
 }catch(e){error=safeError(e);}
 finally{if(host)try{await host.retireConfiguredPlatformWebHost();}catch{}for(const pool of pools)if(!pool.endCount)try{await pool.end();}catch{}if(db)await db.end();await admin.end();Module._load=originalLoad;Module._extensions['.ts']=originalTs;console.log(JSON.stringify({complete,results,error,scope:'Synthetic TLS PostgreSQL and Anthropic HTTPS socket facade; original public release factory/native owners/shared runtime/task/store/pricing code. No original credentials, remote model call, live enrollment, startup or operational acceptance.',nativeOpened,nativeClosed}));process.exitCode=complete?0:1;}
})().catch(()=>{process.exitCode=1;});
