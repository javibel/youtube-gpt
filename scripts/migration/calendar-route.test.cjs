'use strict';
const assert=require('node:assert/strict');
const {load}=require('./route-harness.cjs');
const {taskFixture}=require('./task-fixture.cjs');
const epoch=Date.parse('2026-09-14T08:00:00Z');
class FixedDate extends Date {constructor(...args){super(...(args.length?args:[epoch]));}static now(){return epoch;}}
const suggestion={title:'Synthetic idea',date:'2026-09-15',hour:14,reason:'Synthetic reason',description:'Synthetic outline'};
function harness(options={}) {
 const requests=[],reads=[];
 const runtime=taskFixture({taskType:'calendar.suggestions',controlUnavailable:options.noKey,respond:async()=>{requests.push({url:'fixture-provider',body:runtime.calls.at(-1)});if(options.transportError)throw Error('Synthetic failure');if(options.providerStatus)throw {status:options.providerStatus};return {content:[{type:'text',text:options.text??JSON.stringify(options.suggestions??[suggestion])}],stop_reason:options.stopReason??'end_turn'};}});
 const read=(name,value)=>async query=>{reads.push({name,query});return value;};
 const route=load('app/api/calendar/suggest/route.ts',{
  '@/lib/ai/task-runtime':runtime,
  'next/server':{NextResponse:Response},'@/auth':{auth:async()=>options.anonymous?null:{user:{id:'synthetic'}}},
  '@/lib/plans':{getUserPlan:async()=>options.free?'free':'pro',isPaid:plan=>plan!=='free'},
  '@/lib/prisma':{prisma:{bestTimeAnalysis:{findUnique:read('times',options.times??null)},trendAlert:{findMany:read('trends',options.trends??[])},trackedCompetitor:{findMany:read('competitors',options.competitors??[])},calendarEntry:{findMany:read('calendar',options.entries??[])},youtubeToken:{findUnique:read('youtube',options.channel??null)}}},
 },{Date:FixedDate,Error,process:{env:{...(options.noKey?{}:{ANTHROPIC_API_KEY:'synthetic-not-a-key'}),...(options.youtube?{YOUTUBE_API_KEY:'synthetic-youtube'}:{})}},fetch:async(url,init)=>{
  requests.push({url,body:init?.body?JSON.parse(init.body):null});
  if(new URL(url).hostname==='www.googleapis.com')return Response.json({items:[{snippet:{title:'Synthetic recent upload',channelTitle:'Synthetic competitor'}}]},{status:options.youtubeStatus??200});
  throw Error('Unexpected external request');
 }});
 async function run(body={lang:'es'},headers={}){const r=await route.POST(new Request('https://example.invalid/api/calendar/suggest',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)}));return {status:r.status,body:await r.json()};}
 return {run,requests,reads};
}
const results=[];
async function test(name,fn,known=false){try{await fn();results.push({name,status:known?'KNOWN_DEFECT_REPRODUCED':'PASS'});}catch(error){results.push({name,status:'FAIL',error:error.message});}}
(async()=>{
 for (const [name, headers] of [
  ['recovery without key', {'X-Calendar-Recovery':'retained-only-v1'}],
  ['unknown recovery mode', {'Idempotency-Key':'fixture-key','X-Calendar-Recovery':'fresh'}],
  ['invalid operation key', {'Idempotency-Key':'invalid key'}],
 ]) await test(name+' rejected before context or inference',async()=>{
  const h=harness();assert.deepEqual(await h.run({lang:'es'},headers),{status:400,body:{error:'invalid_recovery'}});
  assert.equal(h.reads.length,0);assert.equal(h.requests.length,0);
 });
 await test('missing original result does not fall back to a fresh model call',async()=>{
  const h=harness();assert.deepEqual(await h.run({lang:'es'},{'Idempotency-Key':'fixture-key','X-Calendar-Recovery':'retained-only-v1'}),
   {status:503,body:{error:'suggestions_unconfirmed',retryMayConsume:false}});assert.equal(h.requests.length,0);
 });
 await test('synthetic create output alone grants no retained retrieval authority',async()=>{
  const h=harness();assert.equal((await h.run({lang:'es'},{'Idempotency-Key':'fixture-key'})).status,200);
  assert.equal((await h.run({lang:'es'},{'Idempotency-Key':'fixture-key','X-Calendar-Recovery':'retained-only-v1'})).status,503);
  assert.equal(h.requests.length,1);
 });
 for(const [name,options,status] of [['anonymous blocked',{anonymous:true},401],['free account blocked',{free:true},403],['missing task control blocked',{noKey:true},500]])await test(name,async()=>{const h=harness(options);assert.equal((await h.run()).status,status);assert.equal(h.requests.length,0);assert.equal(h.reads.length,0);});
 await test('successful response shape',async()=>assert.deepEqual(await harness().run(),{status:200,body:{suggestions:[suggestion]}}));
 await test('all database reads scoped to authenticated user',async()=>{const h=harness();await h.run();assert.equal(h.reads.length,5);for(const read of h.reads)assert.equal(read.query.where.userId,'synthetic');});
 await test('Spanish default',async()=>{const h=harness();await h.run();assert.match(h.requests[0].body.messages[0].content,/Reply in Spanish/);});
 await test('English request',async()=>{const h=harness();await h.run({lang:'en'});assert.match(h.requests[0].body.messages[0].content,/Reply in English/);});
 await test('existing calendar and trends included',async()=>{const h=harness({entries:[{date:'2026-09-16',title:'Scheduled synthetic',status:'draft'}],trends:[{title:'Synthetic trend',relevance:80,category:'test'}]});await h.run();assert.match(h.requests[0].body.messages[0].content,/Scheduled synthetic/);assert.match(h.requests[0].body.messages[0].content,/Synthetic trend/);});
 await test('YouTube data obtained only through fixture',async()=>{const h=harness({youtube:true,channel:{channelId:'synthetic',channelName:'Synthetic channel'}});await h.run();assert.equal(h.requests.length,2);assert.match(h.requests[1].body.messages[0].content,/Synthetic recent upload/);});
 await test('YouTube failure still permits suggestion without invented context',async()=>{const h=harness({youtube:true,youtubeStatus:503,channel:{channelId:'synthetic'}});assert.equal((await h.run()).status,200);assert.match(h.requests[1].body.messages[0].content,/Recent videos: none/);});
 await test('markdown JSON accepted',async()=>{assert.equal((await harness({text:'```json\n'+JSON.stringify([suggestion])+'\n```'}).run()).body.suggestions.length,1);});
 await test('malformed JSON controlled',async()=>{assert.deepEqual(await harness({text:'not JSON'}).run(),{status:500,body:{error:'ai_parse_error'}});});
 await test('provider failure controlled',async()=>{assert.equal((await harness({providerStatus:429}).run()).status,500);});
 await test('transport failure controlled',async()=>{assert.equal((await harness({transportError:true}).run()).status,500);});
 await test('output limited to five',async()=>{assert.equal((await harness({suggestions:Array(7).fill(suggestion)}).run()).body.suggestions.length,5);});
 await test('text length bounds retained',async()=>{const r=await harness({suggestions:[{...suggestion,title:'x'.repeat(201),reason:'r'.repeat(301),description:'d'.repeat(501)}]}).run();assert.equal(r.body.suggestions[0].title.length,200);assert.equal(r.body.suggestions[0].reason.length,300);assert.equal(r.body.suggestions[0].description.length,500);});
 await test('midnight is preserved',async()=>{assert.equal((await harness({suggestions:[{...suggestion,hour:0}]}).run()).body.suggestions[0].hour,0);});
 await test('numeric midnight is preserved',async()=>{assert.equal((await harness({suggestions:[{...suggestion,hour:'0'}]}).run()).body.suggestions[0].hour,0);});
 for(const date of ['2026-02-31','2020-01-01','2026-09-29','not-a-date'])await test('date outside allowed period replaced: '+date,async()=>{assert.equal((await harness({suggestions:[{...suggestion,date}]}).run()).body.suggestions[0].date,'2026-09-15');});
 await test('last allowed day retained',async()=>{assert.equal((await harness({suggestions:[{...suggestion,date:'2026-09-28'}]}).run()).body.suggestions[0].date,'2026-09-28');});
 await test('missing hour defaults to noon',async()=>{assert.equal((await harness({suggestions:[{...suggestion,hour:undefined}]}).run()).body.suggestions[0].hour,12);});
 await test('truncated proposals are not returned as completed',async()=>{assert.equal((await harness({stopReason:'max_tokens'}).run()).status,500);});
 await test('proposal without a title is rejected',async()=>assert.equal((await harness({suggestions:[{}]}).run()).status,500));
 console.log(JSON.stringify({scope:'migrated calendar suggestion route and legacy date/hour sanitizer; synthetic runtime and external data; no calendar writes',results},null,2));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})();
