'use strict';
const assert=require('node:assert/strict');const {load}=require('./route-harness.cjs');const {taskFixture}=require('./task-fixture.cjs');
const samples={subscribers:{audienceProfile:'Synthetic profile',interests:['Synthetic interest'],collaborationSuggestions:[{channel:'Synthetic type',reason:'Synthetic overlap'}],growthTips:['Synthetic tip']}};
function harness(name,options={}){
 const calls=[],requests=[];
 const runtime=taskFixture({taskType:`youtube.${name}-insights`,controlUnavailable:options.noControl,respond:async payload=>{calls.push(payload);if(options.aiError)throw Error('Synthetic error');return {content:[{type:'text',text:options.text??JSON.stringify(samples[name])}],stop_reason:options.stopReason??'end_turn'};}});
 const route=load(`app/api/youtube/${name}/route.ts`,{'next/server':{NextResponse:Response},'@/auth':{auth:async()=>options.anonymous?null:{user:{id:'synthetic'}}},'@/lib/plans':{getUserPlan:async()=>options.free?'free':'pro',isPaid:p=>p==='pro'},'@/lib/youtube-auth':{getAccessToken:async()=>options.noToken?null:'synthetic-token'},'@/lib/ai/task-runtime':runtime,'@/lib/prisma':{prisma:{youtubeToken:{findUnique:async()=>options.noChannel?null:{channelId:'synthetic-channel',channelName:'Synthetic channel'}},trackedCompetitor:{findMany:async()=>[]}}}},{URLSearchParams,process:{env:{YOUTUBE_API_KEY:'synthetic'}},fetch:async(url,init)=>{
  const u=new URL(url);requests.push(url);
  if(u.hostname==='www.googleapis.com'){if(options.titleError)throw Error('Synthetic optional titles error');return Response.json({items:[]});}
  assert.equal(u.hostname,'youtubeanalytics.googleapis.com');assert.equal(init.headers.Authorization,'Bearer synthetic-token');
  if(options.analyticsError)return Response.json({error:{message:'Synthetic unavailable'}},{status:503});
  const dim=u.searchParams.get('dimensions'),metrics=u.searchParams.get('metrics');
  const keys=[...dim.split(','),...metrics.split(',')];const values={ageGroup:'age25-34',gender:'female',viewerPercentage:60,country:'US',views:1000,estimatedMinutesWatched:5000,subscribersGained:12,subscribersLost:3,insightTrafficSourceType:'YT_SEARCH',day:'2026-09-01'};
  return Response.json({columnHeaders:keys.map(name=>({name})),rows:[keys.map(k=>values[k])]});
 }});
 async function run(lang='es'){const r=await route.GET(new Request('https://example.invalid/?lang='+lang));return {status:r.status,body:await r.json()};}
 return {run,calls,requests};
}
const results=[];async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.message});}}
(async()=>{
 for(const name of ['subscribers']){
  for(const [options,status] of [[{anonymous:true},401],[{free:true},403],[{noChannel:true},400],[{noToken:true},401]])await test(name+' entry restriction '+JSON.stringify(options),async()=>{const h=harness(name,options);assert.equal((await h.run()).status,status);assert.equal(h.calls.length,0);assert.equal(h.requests.length,0);});
  await test(name+' successful typed advice and metrics',async()=>{const h=harness(name);const r=await h.run();assert.equal(r.status,200);assert.deepEqual(r.body.aiInsights,samples[name]);assert.equal(h.calls.length,1);{assert.deepEqual(r.body.summary,{totalSubsGained:12,totalSubsLost:3,netGrowth:9});assert.deepEqual(r.body.ageGroups,[{group:'25-34',percentage:60}]);}});
  for(const options of [{noControl:true},{aiError:true},{text:'invalid'},{text:'{"tips":[7]}'},{stopReason:'max_tokens'}])await test(name+' AI failure preserves metrics '+JSON.stringify(options),async()=>{const h=harness(name,options);const r=await h.run();assert.equal(r.status,200);assert.equal(r.body.aiInsights,null);assert.equal(r.body.summary.netGrowth,9);});
  await test(name+' English prompt preserved',async()=>{const h=harness(name);await h.run('en');assert.match(h.calls[0].messages[0].content[0].text,/Reply in English/);});
  await test(name+' optional title lookup failure preserves analysis',async()=>{const h=harness(name,{titleError:true});const r=await h.run();assert.equal(r.status,200);assert.deepEqual(r.body.aiInsights,samples[name]);});
 }
 await test('unavailable audience metrics avoid AI call',async()=>{const h=harness('subscribers',{analyticsError:true});assert.equal((await h.run()).status,500);assert.equal(h.calls.length,0);});
 console.log(JSON.stringify({scope:'Actual audience route;synthetic analytics/provider/storage. Revenue is covered by its separate native original/client/SQL contracts,not legacy CPM fixtures.',results},null,2));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})();
