'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {load}=require('./route-harness.cjs');
class DeclaredDate extends Date { static now(){throw Error('Wall clock cannot renew captured facts');} }
const {captureBestTimeVideos,analyzeBestTimeVideos}=load('lib/best-time-analysis.ts',{}, {Date:DeclaredDate});
const channel='UC_synthetic_best_time',referenceAt='2026-10-12T12:00:00Z';
const noWait=()=>{};
const clone=v=>JSON.parse(JSON.stringify(v));
function sample(dates=['2026-10-08T12:00:00Z','2026-10-03T12:00:00Z','2026-10-11T12:00:00Z'],views=['200','300','300']){
 const videos=dates.map((publishedAt,i)=>({id:String(i).padStart(11,'0'),snippet:{channelId:channel,publishedAt},statistics:{viewCount:views[i]??'100'}})).sort((a,b)=>Date.parse(b.snippet.publishedAt)-Date.parse(a.snippet.publishedAt));
 return {channelId:channel,referenceAt,search:{available:true,complete:true,items:videos.map(v=>({id:{kind:'youtube#video',videoId:v.id},snippet:{...v.snippet}}))},details:{available:true,complete:true,items:clone(videos).reverse()}};
}
const results=[];
function test(name,fn){try{fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.stack});}}
function reject(name,change){test(name,()=>{const source=sample();change(source);assert.throws(()=>analyzeBestTimeVideos(source,noWait),/Best time declared data unavailable/);});}
test('complete declared collections yield a deterministic UTC heatmap with manually calculated velocities',()=>{
 const result=analyzeBestTimeVideos(sample(),noWait);assert.equal(result.status,'ready');
 assert.equal(result.heatmap[3][12],33);assert.equal(result.heatmap[5][12],33);assert.equal(result.heatmap[6][12],100);
 assert.equal(result.topSlots[0].day,6);assert.equal(result.topSlots[0].hour,12);assert.equal(result.videoCount,3);
 assert.equal(result.referenceAt,referenceAt);assert.equal(result.heatmap.length,7);assert.ok(result.heatmap.every(row=>row.length===24));
});
test('detail reordering cannot change search identity or result',()=>{const source=sample(),a=analyzeBestTimeVideos(source,noWait);source.details.items.reverse();assert.equal(JSON.stringify(analyzeBestTimeVideos(source,noWait)),JSON.stringify(a));});
test('projection snapshots are deeply frozen and detached from caller changes',()=>{
 const source=sample(),result=analyzeBestTimeVideos(source,noWait),before=JSON.stringify(result);source.referenceAt='2030-01-01T00:00:00Z';source.details.items[0].statistics.viewCount='999';source.search.items.length=0;
 assert.equal(JSON.stringify(result),before);assert.ok(Object.isFrozen(result)&&Object.isFrozen(result.videos)&&Object.isFrozen(result.videos[0])&&Object.isFrozen(result.heatmap[0])&&Object.isFrozen(result.topSlots[0]));
});
test('seconds/milliseconds represent the same original publication without rewriting captured dates',()=>{const source=sample();source.details.items[0].snippet.publishedAt=source.details.items[0].snippet.publishedAt.replace('Z','.000Z');const result=captureBestTimeVideos(source,noWait);assert.ok(result.videos.some(v=>v.publishedAt.endsWith('.000Z')));assert.equal(result.referenceAt,referenceAt);});
test('known empty collections differ from incomplete or unavailable sources',()=>{assert.equal(analyzeBestTimeVideos(sample([]),noWait).status,'no_videos');});
for(const collection of ['search','details'])for(const flag of ['available','complete'])reject(collection+' '+flag+' must be explicitly true',s=>s[collection][flag]=false);
for(const [name,change] of [
 ['missing source',s=>delete s.search],['missing items',s=>delete s.search.items],['non-array items',s=>s.details.items={}],
 ['missing reference',s=>delete s.referenceAt],['reference offset',s=>s.referenceAt='2026-10-12T13:00:00+01:00'],['impossible reference',s=>s.referenceAt='2026-02-30T12:00:00Z'],['year zero',s=>s.referenceAt='0000-01-01T00:00:00Z'],
 ['unknown channel',s=>s.channelId=''],['foreign searched channel',s=>s.search.items[0].snippet.channelId='other'],['foreign details channel',s=>s.details.items[0].snippet.channelId='other'],
 ['missing search id',s=>delete s.search.items[0].id.videoId],['non-video identity',s=>s.search.items[0].id.kind='youtube#channel'],['malformed id',s=>s.search.items[0].id.videoId='short'],
 ['duplicate search',s=>s.search.items[1]=clone(s.search.items[0])],['duplicate details',s=>s.details.items[1]=clone(s.details.items[0])],['foreign details id',s=>s.details.items[0].id='foreign0000'],
 ['missing detail',s=>s.details.items.pop()],['extra detail',s=>s.details.items.push(clone(s.details.items[0]))],['unsorted search',s=>s.search.items.reverse()],
 ['publication discrepancy',s=>s.details.items[0].snippet.publishedAt='2026-10-01T12:00:00Z'],['impossible publication',s=>s.search.items[0].snippet.publishedAt='2026-02-30T12:00:00Z'],
 ['future publication',s=>{s.search.items[0].snippet.publishedAt='2026-10-13T12:00:00Z';s.details.items[2].snippet.publishedAt='2026-10-13T12:00:00Z';}],
 ['inherited field',s=>s.search=Object.create(s.search)],['accessor field',s=>Object.defineProperty(s,'referenceAt',{get(){throw Error('Untrusted getter invoked');}})],
 ['sparse search',s=>delete s.search.items[1]],['sparse details',s=>delete s.details.items[1]],
])reject(name,change);
for(const views of [undefined,null,0,'','01','1.2','-1','1e3','3tail',' 3','9007199254740992','1'.repeat(17)])reject('invalid view count '+String(views),s=>s.details.items[0].statistics.viewCount=views);
test('zero views are known zero, with no invented positive slots',()=>{const s=sample();for(const v of s.details.items)v.statistics.viewCount='0';const r=analyzeBestTimeVideos(s,noWait);assert.equal(r.status,'ready');assert.equal(r.topSlots.length,0);assert.ok(r.heatmap.every(row=>row.every(v=>v===0)));});
test('maximum safe views remain finite and bounded',()=>{const s=sample();s.details.items[0].statistics.viewCount='9007199254740991';const r=analyzeBestTimeVideos(s,noWait);assert.ok(r.heatmap.every(row=>row.every(v=>Number.isInteger(v)&&v>=0&&v<=100)));});
test('exactly fifty distinct uploads fit; fifty-one are rejected before analysis',()=>{
 const source=sample(Array(50).fill('2026-10-11T12:00:00Z'));assert.equal(analyzeBestTimeVideos(source,noWait).videoCount,50);
 source.search.items.push(clone(source.search.items[0]));assert.throws(()=>analyzeBestTimeVideos(source,noWait),/unavailable/);
});
test('sparse channel uses twelve months and exposes the actual insufficient count',()=>{const s=sample(['2026-10-11T12:00:00Z','2026-04-01T12:00:00Z']);const r=analyzeBestTimeVideos(s,noWait);assert.equal(r.status,'not_enough_videos');assert.equal(r.windowDays,365);assert.equal(r.videoCount,2);assert.equal(r.heatmap,undefined);});
test('ten recent videos select six months, preserving original timestamps',()=>{const s=sample([...Array(10).fill('2026-10-11T12:00:00Z'),'2026-04-01T12:00:00Z']);const r=analyzeBestTimeVideos(s,noWait);assert.equal(r.windowDays,180);assert.equal(r.videoCount,10);assert.ok(r.videos.every(v=>v.publishedAt==='2026-10-11T12:00:00Z'));});
test('publication boundaries use the captured reference, inclusive at180/365 days',()=>{
 const dates=[0,179,180,181,364,365,366].map(days=>new Date(Date.parse(referenceAt)-days*86400000).toISOString());const r=analyzeBestTimeVideos(sample(dates),noWait);assert.equal(r.windowDays,365);assert.equal(r.videoCount,6);
 const s=sample([...Array(10).fill(dates[2]),dates[3]]);assert.equal(analyzeBestTimeVideos(s,noWait).videoCount,10);
});
test('epoch-zero reference is preserved rather than renewed',()=>{const s=sample(['1970-01-01T00:00:00Z','1969-12-31T00:00:00Z','1969-12-30T00:00:00Z']);s.referenceAt='1970-01-01T00:00:00Z';const r=analyzeBestTimeVideos(s,noWait);assert.equal(r.referenceAt,s.referenceAt);assert.equal(r.videoCount,3);});
test('same-day slots keep four-hour separation; ties use stable UTC order',()=>{const s=sample(['2026-10-05T00:00:00Z','2026-10-05T01:00:00Z','2026-10-05T04:00:00Z','2026-10-05T08:00:00Z']);const r=analyzeBestTimeVideos(s,noWait);for(const a of r.topSlots)for(const b of r.topSlots)if(a!==b&&a.day===b.day)assert.ok(Math.abs(a.hour-b.hour)>=4);assert.equal(r.topSlots.length,3);});
test('averaging within a cell avoids rewarding multiple uploads by summing their views',()=>{const s=sample(['2026-10-05T12:00:00Z','2026-09-28T12:00:00Z','2026-10-11T12:00:00Z'],['100','100','100']);const r=analyzeBestTimeVideos(s,noWait);assert.equal(r.heatmap[0][12],32);assert.equal(r.heatmap[6][12],100);assert.equal(r.topSlots.find(v=>v.day===0).videoCount,2);});
test('original retirement at any check returns no analysis or replacement',()=>{let checks=0;analyzeBestTimeVideos(sample(),()=>checks++);for(let stop=1;stop<=checks;stop++){let n=0;assert.throws(()=>analyzeBestTimeVideos(sample(),()=>{if(++n===stop)throw Error('Original retired');}),/Original retired/);assert.equal(n,stop);}});
test('current HTTP admission and historical producer remain independent of this declared-data projection',()=>{
 const root=path.resolve(__dirname,'../..');for(const name of ['app/api/youtube/best-time/route.ts','lib/best-time-producer-legacy.ts'])assert.ok(!fs.readFileSync(path.join(root,name),'utf8').includes('best-time-analysis'));
});
test('bounded analysis fits the existing cache and consumer shape without inventing an analysis timestamp',()=>{
 const {bestTimeCache}=load('lib/best-time-cache.ts'),{decodeBestTimeRead}=load('lib/best-time-client.ts',{'@/lib/best-time-cache':{bestTimeCache}});
 const owner={id:'synthetic-analysis-owner',email:'analysis@example.invalid'},r=analyzeBestTimeVideos(sample(),noWait);
 const cache=bestTimeCache({userId:owner.id,heatmap:r.heatmap,topSlots:r.topSlots,videoCount:r.videoCount,aiTip:null,analyzedAt:new Date(0)},owner.id);
 const read=decodeBestTimeRead({owner,data:cache},owner);assert.equal(read.analyzedAt,'1970-01-01T00:00:00.000Z');assert.equal(read.heatmap[6][12],100);assert.equal(read.aiTip,null);
});
const report={status:results.every(r=>r.status==='PASS')?'PASS':'FAIL',scope:'Pure captured collection to bounded UTC analysis. No HTTP producer admission, model/token/storage/quota calls, provenance/consent/freshness or operational acceptance.',results};
if(require.main===module){console.log(JSON.stringify(report,null,2));if(report.status!=='PASS')process.exitCode=1;}
module.exports={report,sample};
