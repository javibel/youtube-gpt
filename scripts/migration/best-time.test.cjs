'use strict';
const assert=require('node:assert/strict');
const {load}=require('./route-harness.cjs');
const {taskFixture}=require('./task-fixture.cjs');
const epoch=Date.parse('2026-09-14T12:00:00Z');
class FixedDate extends Date{constructor(...args){super(...(args.length?args:[epoch]));}static now(){return epoch;}}
const video=(date,views='100')=>({snippet:{publishedAt:date},statistics:{viewCount:views}});
const sample=[video('2026-09-07T10:00:00Z','1000'),video('2026-09-07T18:00:00Z','300'),video('2026-09-06T12:00:00Z','100')];
function harness(options={}){
 const requests=[],saved=[],reads=[];
 const runtime=taskFixture({taskType:'youtube.best-time-tip',controlUnavailable:options.controlUnavailable,respond:async()=>{if(options.aiError)throw Error('Synthetic AI failure');return {content:[{type:'text',text:options.text??'{"es":"Consejo sintético","en":"Synthetic tip"}'}],stop_reason:options.stopReason??'end_turn'};}});
 const calls=runtime.calls;
 const store={findUnique:async query=>{reads.push(query);return options.cached??null;},upsert:async query=>{if(options.saveError)throw Error('Synthetic storage failure');saved.push(query);return query.create;}};
 const prisma={bestTimeAnalysis:store,$transaction:async fn=>fn({$executeRawUnsafe:async sql=>{assert.equal(sql,'SET TRANSACTION READ ONLY');return 0;},user:{findUnique:async()=>({id:'synthetic',email:'synthetic@example.invalid'})},bestTimeAnalysis:store})};
 const route=load('app/api/youtube/best-time/route.ts',{
  'next/server':{NextResponse:Response},'@/lib/ai/task-runtime':runtime,'@/auth':{auth:async()=>options.anonymous?null:{user:{id:'synthetic',email:'synthetic@example.invalid'}}},
  '@/lib/plans':{getUserPlan:async()=>options.free?'free':'pro',isPaid:plan=>plan!=='free'},'@/lib/youtube-auth':{getAccessToken:async()=>options.noToken?null:'synthetic-token'},
  '@/lib/prisma':{prisma},
 },{Date:FixedDate,Error,process:{env:{ANTHROPIC_API_KEY:'synthetic-not-a-key'}},fetch:async(url,init)=>{
  requests.push(url);assert.equal(init.headers.Authorization,'Bearer synthetic-token');const u=new URL(url);assert.equal(u.hostname,'www.googleapis.com');
  if(u.pathname==='/youtube/v3/search')return Response.json({items:options.noVideos?[]:(options.videos??sample).map((_,i)=>({id:{videoId:'synthetic-'+i}}))},{status:options.searchStatus??200});
  assert.equal(u.pathname,'/youtube/v3/videos');return Response.json({items:options.videos??sample},{status:options.videoStatus??200});
 }});
 async function run(method='POST'){const r=await route[method]();return {status:r.status,body:await r.json()};}
 return {run,calls,requests,saved,reads};
}
const results=[];
async function test(name,fn,known=false){try{await fn();results.push({name,status:known?'KNOWN_DEFECT_REPRODUCED':'PASS'});}catch(error){results.push({name,status:'FAIL',error:error.message});}}
(async()=>{
 for(const [name,options,status] of [['anonymous blocked',{anonymous:true},401],['free POST blocked',{free:true},403],['no token blocked',{noToken:true},400]])await test(name,async()=>{const h=harness(options);assert.equal((await h.run()).status,status);assert.equal(h.requests.length,0);assert.equal(h.calls.length,0);});
 await test('anonymous cache access blocked',async()=>{const h=harness({anonymous:true});assert.equal((await h.run('GET')).status,401);assert.equal(h.reads.length,0);});
 await test('missing cache contract',async()=>{const h=harness();assert.deepEqual(await h.run('GET'),{status:200,body:{owner:{id:'synthetic',email:'synthetic@example.invalid'},data:null}});assert.equal(h.reads[0].where.userId,'synthetic');});
 await test('cached response remains readable',async()=>{const cached={userId:'synthetic',heatmap:Array.from({length:7},()=>Array(24).fill(0)),topSlots:[],videoCount:3,aiTip:null,analyzedAt:new Date(epoch)};assert.equal((await harness({cached}).run('GET')).body.data.analyzedAt,'2026-09-14T12:00:00.000Z');});
 await test('no videos blocks analysis',async()=>{const h=harness({noVideos:true});assert.equal((await h.run()).body.error,'no_videos');assert.equal(h.calls.length,0);});
 await test('fewer than three points blocks analysis',async()=>{const h=harness({videos:sample.slice(0,2)});assert.equal((await h.run()).body.error,'not_enough_videos');assert.equal(h.calls.length,0);});
 await test('older than twelve months excluded',async()=>{const h=harness({videos:[...sample.slice(0,2),video('2025-01-01T12:00:00Z')]});assert.equal((await h.run()).body.videoCount,2);});
 await test('six month window used with enough recent videos',async()=>{const h=harness({videos:[...Array(10).fill(sample[0]),video('2026-01-01T12:00:00Z')]});assert.equal((await h.run()).body.data.videoCount,10);});
 await test('up to twelve months retained with sparse channel',async()=>{const h=harness({videos:[...sample,video('2026-01-01T12:00:00Z')]});assert.equal((await h.run()).body.data.videoCount,4);});
 await test('matrix dimensions and score range',async()=>{const r=await harness().run();assert.equal(r.body.data.heatmap.length,7);for(const row of r.body.data.heatmap){assert.equal(row.length,24);for(const score of row)assert.ok(Number.isInteger(score)&&score>=0&&score<=100);}});
 await test('UTC Monday mapping and best slot',async()=>{const r=await harness().run();assert.equal(r.body.data.heatmap[0][10],100);assert.equal(r.body.data.topSlots[0].day,0);assert.equal(r.body.data.topSlots[0].hour,10);});
 await test('Sunday mapping',async()=>{assert.ok((await harness().run()).body.data.heatmap[6][12]>0);});
 await test('top slots separated by at least four hours within day',async()=>{const r=await harness({videos:[...sample,video('2026-09-07T11:00:00Z','900')]}).run();const slots=r.body.data.topSlots;for(let i=0;i<slots.length;i++)for(let j=i+1;j<slots.length;j++)if(slots[i].day===slots[j].day)assert.ok(Math.abs(slots[i].hour-slots[j].hour)>=4);});
 await test('saved snapshot belongs to authenticated user',async()=>{const h=harness();await h.run();assert.equal(h.saved[0].where.userId,'synthetic');assert.equal(h.saved[0].create.userId,'synthetic');assert.equal(h.saved[0].create.videoCount,3);});
 await test('YouTube errors do not save analysis',async()=>{const h=harness({searchStatus:403});assert.equal((await h.run()).status,500);assert.equal(h.saved.length,0);assert.equal(h.calls.length,0);});
 await test('AI failure preserves deterministic matrix',async()=>{const r=await harness({aiError:true}).run();assert.equal(r.status,200);assert.equal(r.body.data.aiTip,null);});
 await test('fenced bilingual tip parsed',async()=>{assert.equal((await harness({text:'```json\n{"es":"Sintético","en":"Synthetic"}\n```'}).run()).body.data.aiTip.en,'Synthetic');});
 await test('storage error is not reported as saved',async()=>{assert.equal((await harness({saveError:true}).run()).status,500);});
 await test('wrong JSON type discarded without losing matrix',async()=>{const out=await harness({text:'7'}).run();assert.equal(out.body.data.aiTip,null);assert.equal(out.body.data.heatmap.length,7);});
 await test('truncated tip discarded',async()=>{assert.equal((await harness({stopReason:'max_tokens'}).run()).body.data.aiTip,null);});
 await test('unavailable AI control preserves non-AI analysis',async()=>{const out=await harness({controlUnavailable:true}).run();assert.equal(out.status,200);assert.equal(out.body.data.aiTip,null);assert.equal(out.body.data.videoCount,3);});
 console.log(JSON.stringify({scope:'migrated best-time route through real contract runner and adapter; synthetic YouTube, store, transport and clock',results},null,2));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})();
