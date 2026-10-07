'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {load}=require('./route-harness.cjs'),{harness}=require('./storyboard-client-retry.test.cjs');
module.exports=async function(prisma,results){
 const users=await Promise.all([1,2].map(i=>prisma.user.create({data:{email:'preview-'+randomUUID()+'@example.invalid',name:'Synthetic upload '+i}})));
 let owner=users[0].id;
 const routeFor=db=>load('app/api/video-previews/route.ts',{'node:crypto':require('node:crypto'),'next/server':{NextResponse:Response},'@/auth':{auth:async()=>({user:{id:owner}})},'@/lib/prisma':{prisma:db}},{Buffer});
 const route=routeFor(prisma);
 const request=(key='fixture-save',title='Synthetic preview',data='x'.repeat(2500),mime='video/webm')=>{const form=new FormData();form.append('title',title);form.append('video',new Blob([data],{type:mime}),'preview.webm');return new Request('https://example.invalid/api/video-previews',{method:'POST',headers:key===null?{}:{'Idempotency-Key':key},body:form});};
 try {
  const h=harness();h.state.user=owner;let lost=true;
  h.state.upload=async init=>{const response=await route.POST(new Request('https://example.invalid/api/video-previews',init));if(lost){lost=false;assert.equal(response.status,200);throw Error('synthetic lost acknowledgement');}return response;};
  await h.click();await h.finish();assert.ok(h.alert());assert.deepEqual(h.callbacks,['generated']);await h.retrySave();assert.deepEqual(h.callbacks,['generated','saved']);assert.equal(h.daily(),1);assert.equal(h.recorders.length,1);assert.equal(h.requests.length,1);assert.equal(await prisma.videoPreview.count({where:{userId:owner}}),1);h.unmount();results.push('actual component/API/PostgreSQL lost upload response reuses one stored preview without another render or AI request');
  const replies=await Promise.all([route.POST(request('race')),route.POST(request('race'))]);assert.deepEqual(replies.map(r=>r.status),[200,200]);assert.equal((await replies[0].json()).id,(await replies[1].json()).id);assert.equal(await prisma.videoPreview.count({where:{userId:owner,title:'Synthetic preview'}}),1);results.push('simultaneous upload retries serialize on real account row and save one preview');
  for(const req of [request('race','Changed'),request('race','Synthetic preview','y'.repeat(2500)),request('race','Synthetic preview','x'.repeat(2500),'video/mp4')])assert.equal((await route.POST(req)).status,409);
  results.push('title, exact binary content and MIME changes conflict without overwriting');
  owner=users[1].id;const second=await (await route.POST(request('race'))).json();owner=users[0].id;const first=await (await route.POST(request('race'))).json();assert.notEqual(first.id,second.id);results.push('authenticated accounts have independent retry identities');
  for(const key of ['third','fourth','fifth','sixth'])assert.equal((await route.POST(request(key))).status,200);
  const count=()=>prisma.videoPreview.count({where:{userId:owner}});assert.equal(await count(),3);assert.equal(await prisma.videoPreview.count({where:{userId:users[1].id}}),1);
  const before=await prisma.videoPreview.findMany({where:{userId:owner},orderBy:{id:'asc'}});
  const failing=routeFor({videoPreview:prisma.videoPreview,$transaction:fn=>prisma.$transaction(tx=>fn({$queryRaw:tx.$queryRaw.bind(tx),videoPreview:{findUnique:tx.videoPreview.findUnique.bind(tx.videoPreview),create:tx.videoPreview.create.bind(tx.videoPreview),findMany:tx.videoPreview.findMany.bind(tx.videoPreview),deleteMany:async()=>{throw Error('synthetic prune failure');}}}))});
  assert.equal((await failing.POST(request('rollback'))).status,503);assert.deepEqual(await prisma.videoPreview.findMany({where:{userId:owner},orderBy:{id:'asc'}}),before);results.push('create and pruning roll back together on real PostgreSQL; failure cannot report saved');
  const uncertain=routeFor({videoPreview:prisma.videoPreview,$transaction:async fn=>{await prisma.$transaction(fn);throw Error('synthetic commit acknowledgement lost');}});assert.equal((await uncertain.POST(request('commit-lost'))).status,200);assert.equal(await count(),3);results.push('lost transaction acknowledgement recovers only a committed exact binary match');
  const distinct=await Promise.all(Array.from({length:5},(_,i)=>route.POST(request('distinct-'+i))));assert.deepEqual(distinct.map(r=>r.status),[200,200,200,200,200]);assert.equal(await count(),3);assert.equal(await prisma.videoPreview.count({where:{userId:users[1].id}}),1);results.push('concurrent distinct saves retain three previews without deleting another account');
  for(const [req,status] of [[request('bad key'),400],[request('', 'Synthetic'),400],[request('small','Synthetic','x'),422],[request('large','Synthetic','x'.repeat(8*1024*1024+1)),413]])assert.equal((await route.POST(req)).status,status);
  const bad=new FormData();bad.append('title','Synthetic');bad.append('video','not a file');assert.equal((await route.POST(new Request('https://example.invalid',{method:'POST',body:bad}))).status,400);
  assert.equal((await route.POST(request(null))).status,200);assert.equal(await count(),3);results.push('binary limits, malformed multipart/key rejection and keyless legacy save remain explicit');
  const listing=await (await route.GET()).json();assert.equal(listing.previews.length,3);assert.equal(listing.previews.some(p=>'videoData' in p),false);results.push('listing is account-scoped and excludes binary data');
  const anonymous=load('app/api/video-previews/route.ts',{'node:crypto':require('node:crypto'),'next/server':{NextResponse:Response},'@/auth':{auth:async()=>null},'@/lib/prisma':{prisma:new Proxy({}, {get(){throw Error('Anonymous must not touch storage');}})}},{Buffer});assert.equal((await anonymous.POST(request())).status,401);assert.equal((await anonymous.GET()).status,401);results.push('anonymous save/list blocked before any storage access');
 } finally {await prisma.user.deleteMany({where:{id:{in:users.map(u=>u.id)}}});}
};
