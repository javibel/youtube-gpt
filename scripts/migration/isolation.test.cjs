'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {validate,simulatedEffects}=require('./isolation.cjs');
const temporary=fs.mkdtempSync(path.join(__dirname,'fixture-'));
const root=path.join(temporary,'test');
const originals=[path.join(temporary,'operational-web'),path.join(temporary,'operational-agent')];
for(const dir of [root,...originals,...['web','agent','database','memory','reports','logs'].map(x=>path.join(root,x))])fs.mkdirSync(dir,{recursive:true});
const baseline={version:1,mode:'migration-test',providerMode:'simulated',effects:Object.fromEntries(['email','publication','payments','restart','repair'].map(x=>[x,'simulated'])),gitPush:false,vercelDeploy:false,scheduler:'none',paths:Object.fromEntries(['web','agent','database','memory','reports','logs'].map(x=>[x,x])),databaseUrl:'postgresql://migration_test:synthetic_local_only@127.0.0.1:55432/ytubviral_migration_test',ports:{web:4300,agent:4301}};
const context={root,operationalRoots:originals};
const results=[];
async function test(name,fn){try{await fn();results.push({name,result:'PASS'});}catch(error){results.push({name,result:'FAIL',message:error.message});}}
function rejects(name,change,ctx=context){return test(name,()=>{const config=structuredClone(baseline);change(config);assert.throws(()=>validate(config,ctx),/ISOLATION_BLOCKED/);});}
(async()=>{
await test('accept separate local test destinations',()=>assert.equal(validate(baseline,context).externalEffects,'simulated'));
await test('reject missing config',()=>assert.throws(()=>validate(null,context),/ISOLATION_BLOCKED/));
await rejects('reject production mode',c=>c.mode='production');
await rejects('reject production database hostname',c=>c.databaseUrl='postgresql://redacted:redacted@production.example.invalid/app');
await rejects('reject local production database name',c=>c.databaseUrl=c.databaseUrl.replace('ytubviral_migration_test','production'));
await rejects('reject database URL options',c=>c.databaseUrl+='?host=production.example.invalid');
await rejects('reject database fallback or missing URL',c=>delete c.databaseUrl);
await rejects('reject real provider',c=>c.providerMode='openai');
await rejects('reject inherited credential',()=>{},{...context,environment:{ANTHROPIC_API_KEY:'synthetic'}});
await rejects('reject inherited node preload',()=>{},{...context,environment:{NODE_OPTIONS:'--require=unsafe.cjs'}});
await rejects('reject push',c=>c.gitPush=true);
await rejects('reject Vercel preview',c=>c.vercelDeploy='preview');
await rejects('reject operational scheduler',c=>c.scheduler='pm2');
await rejects('reject operational web port',c=>c.ports.web=3011);
await rejects('reject path traversal',c=>c.paths.memory='../operational-agent');
await rejects('reject absolute storage',c=>c.paths.memory=originals[1]);
await rejects('reject overlapping storage',c=>c.paths.logs=c.paths.reports);
await rejects('reject operational root',()=>{},{...context,root:originals[0]});
await rejects('reject missing storage',c=>c.paths.logs='missing');
for(const effect of Object.keys(baseline.effects))await rejects(`reject real ${effect}`,c=>c.effects[effect]='real');
await test('reject dotenv before startup',()=>{const file=path.join(root,'web','.env.local');fs.writeFileSync(file,'SYNTHETIC=true');try{assert.throws(()=>validate(baseline,context),/ISOLATION_BLOCKED/);}finally{fs.unlinkSync(file);}});
await test('simulated effects have no external side effects and retain no payload',async()=>{const {adapters,events}=simulatedEffects();for(const adapter of Object.values(adapters))assert.equal((await adapter({private:'synthetic'})).status,'simulated');assert.equal(events.length,5);assert.ok(!JSON.stringify(events).includes('private'));});
// Windows junction creation may require capabilities absent in the sandbox; report skipped explicitly.
try{fs.symlinkSync(originals[1],path.join(root,'linked'),'junction');await rejects('reject junction',c=>c.paths.agent='linked');}catch(error){results.push({name:'reject junction',result:'SKIP',reason:error.code});}finally{const link=path.join(root,'linked');if(fs.existsSync(link)&&fs.lstatSync(link).isSymbolicLink())fs.unlinkSync(link);}
const result={scope:'offline unit tests; application startup remains deliberately blocked',results};
fs.writeFileSync(path.join(__dirname,'test-result.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
if(results.some(r=>r.result==='FAIL'))process.exitCode=1;
})();
