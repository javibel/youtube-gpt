'use strict';
const assert=require('node:assert/strict');
const {load}=require('./route-harness.cjs');
const {taskFixture}=require('./task-fixture.cjs');
const parser=load('lib/parse-claude-json.ts');
const epoch=Date.parse('2026-09-14T12:00:00Z');
class FixedDate extends Date{constructor(...args){super(...(args.length?args:[epoch]));}static now(){return epoch;}}
function harness(options={}){
 const requests=[],timers=[],cleared=[];
 const runtime=taskFixture({taskType:'youtube.analytics-insight',controlUnavailable:options.noKey,respond:async(_payload,init)=>{
  requests.push({url:'fixture-provider',body:runtime.calls.at(-1),signal:init.signal});
  if(options.timeout){timers[0].callback();assert.equal(init.signal.aborted,true);throw Error('Synthetic timeout');}
  if(options.aiError)throw Error('Synthetic AI failure');
  if(options.aiStatus)throw {status:options.aiStatus};
  return {content:[{type:'text',text:options.text??'{"es":"Análisis sintético","en":"Synthetic analysis"}'}],stop_reason:options.stopReason??'end_turn'};
 }});
 const route=load('app/api/youtube/analytics/route.ts',{
  'next/server':{NextResponse:Response},'@/auth':{auth:async()=>options.anonymous?null:{user:{id:'synthetic'}}},
  '@/lib/plans':{getUserPlan:async()=>options.free?'free':'pro',isPaid:plan=>plan!=='free'},
  '@/lib/prisma':{prisma:{youtubeToken:{findUnique:async()=>options.noChannel?null:{channelId:'synthetic-channel',channelName:'Synthetic channel'}}}},
  '@/lib/youtube-auth':{getAccessToken:async()=>options.noToken?null:'synthetic-token'},'@/lib/parse-claude-json':parser,'@/lib/ai/task-runtime':runtime,
 },{Date:FixedDate,URLSearchParams,AbortController,Error,process:{env:options.noKey?{}:{ANTHROPIC_API_KEY:'synthetic-not-a-key'}},
 setTimeout:(callback,ms)=>{timers.push({callback,ms});return timers.length;},clearTimeout:id=>cleared.push(id),
 fetch:async(url,init)=>{
  const u=new URL(url);requests.push({url,body:init?.body?JSON.parse(init.body):null,signal:init?.signal});
  if(u.hostname==='youtubeanalytics.googleapis.com'){
   assert.equal(init.headers.Authorization,'Bearer synthetic-token');assert.equal(u.searchParams.get('ids'),'channel==synthetic-channel');
   const dimension=u.searchParams.get('dimensions');const names=[...(dimension?[dimension]:[]),...u.searchParams.get('metrics').split(',')];
   const values={views:'900',estimatedMinutesWatched:120,averageViewDuration:30,averageViewPercentage:25,subscribersGained:10,subscribersLost:2,likes:30,comments:4,shares:3,insightTrafficSourceType:'YT_SEARCH',country:'ES',video:'synthetic-video',day:'2026-09-01'};
   return Response.json({columnHeaders:names.map(name=>({name})),rows:options.empty?[]:[names.map(name=>values[name])],...(options.analyticsStatus?{error:{message:'Synthetic analytics failure'}}:{})},{status:options.analyticsStatus??200});
  }
  if(u.hostname==='www.googleapis.com'){if(options.titleTransportError)throw Error('Synthetic title lookup failure');return Response.json({items:[{id:'synthetic-video',snippet:{title:'Synthetic video title'}}]},{status:options.titleStatus??200});}
  throw Error('Unexpected external request');
 }});
 async function run(lang='es'){const r=await route.GET(new Request('https://example.invalid/api/youtube/analytics?lang='+lang));return {status:r.status,body:await r.json()};}
 return {run,requests,timers,cleared};
}
const results=[];
async function test(name,fn,known=false){try{await fn();results.push({name,status:known?'KNOWN_DEFECT_REPRODUCED':'PASS'});}catch(error){results.push({name,status:'FAIL',error:error.message});}}
(async()=>{
 for(const [name,options,status]of [['anonymous blocked',{anonymous:true},401],['free blocked',{free:true},403],['no channel',{noChannel:true},400],['no token',{noToken:true},401]])await test(name,async()=>{const h=harness(options);assert.equal((await h.run()).status,status);assert.equal(h.requests.length,0);});
 await test('overview parsed as numbers',async()=>{const r=await harness().run();assert.equal(r.body.overview.views,900);assert.equal(r.body.overview.subscribersGained,10);assert.equal(r.body.channelName,'Synthetic channel');});
 await test('traffic and countries mapped by header',async()=>{const r=await harness().run();assert.equal(r.body.traffic[0].insightTrafficSourceType,'YT_SEARCH');assert.equal(r.body.countries[0].country,'ES');});
 await test('video titles resolved and daily timeline retained',async()=>{const r=await harness().run();assert.equal(r.body.topVideos[0].title,'Synthetic video title');assert.equal(r.body.daily[0].day,'2026-09-01');});
 await test('analytics delay and period preserved',async()=>{const r=await harness().run();assert.deepEqual(r.body.period,{start:'2026-08-15',end:'2026-09-12'});});
 await test('empty analytics rows handled',async()=>{const r=await harness({empty:true}).run();assert.equal(r.status,200);assert.equal(r.body.overview.views,0);assert.deepEqual(r.body.topVideos,[]);});
 await test('analytics API failure controlled',async()=>{assert.equal((await harness({analyticsStatus:403}).run()).status,500);});
 await test('title HTTP error falls back to video ID',async()=>{assert.equal((await harness({titleStatus:503}).run()).body.topVideos[0].title,'synthetic-video');});
 await test('AI timer configured and cleared',async()=>{const h=harness();await h.run();assert.equal(h.timers[0].ms,15000);assert.deepEqual(h.cleared,[1]);assert.ok(h.requests.find(r=>r.body).signal);});
 await test('AI timeout aborts request and preserves analytics',async()=>{const h=harness({timeout:true});const r=await h.run();assert.equal(r.status,200);assert.equal(r.body.overview.views,900);assert.equal(r.body.aiInsight,null);assert.deepEqual(h.cleared,[1]);});
 await test('missing AI control preserves metrics and clears deadline',async()=>{const h=harness({noKey:true});const out=await h.run();assert.equal(out.body.aiInsight,null);assert.equal(out.body.overview.views,900);assert.deepEqual(h.cleared,[1]);assert.equal(h.requests.some(r=>r.body),false);});
 await test('AI HTTP failure preserves analytics',async()=>{assert.equal((await harness({aiStatus:429}).run()).body.aiInsight,null);});
 await test('AI transport failure clears timer',async()=>{const h=harness({aiError:true});assert.equal((await h.run()).status,200);assert.deepEqual(h.cleared,[1]);});
 await test('malformed JSON ignored',async()=>{assert.equal((await harness({text:'not JSON'}).run()).body.aiInsight,null);});
 await test('both languages required in insight',async()=>{assert.equal((await harness({text:'{"en":"Synthetic"}'}).run()).body.aiInsight,null);});
 for(const [lang,word]of [['es','Spanish'],['en','English']])await test(word+' instruction preserved',async()=>{const h=harness();await h.run(lang);assert.match(h.requests.find(r=>r.body).body.messages[0].content,new RegExp('Reply in '+word));});
 await test('non-string insight discarded',async()=>{assert.equal((await harness({text:'{"es":7,"en":8}'}).run()).body.aiInsight,null);});
 await test('truncated insight discarded',async()=>{assert.equal((await harness({stopReason:'max_tokens'}).run()).body.aiInsight,null);});
 await test('optional title transport failure preserves analytics payload',async()=>{const r=await harness({titleTransportError:true}).run();assert.equal(r.status,200);assert.equal(r.body.overview.views,900);assert.equal(r.body.topVideos[0].title,'synthetic-video');});
 console.log(JSON.stringify({scope:'migrated analytics route through common runtime; synthetic reports, store, adapter and explicit cancellation',results},null,2));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})();
