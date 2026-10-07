'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {load}=require('./route-harness.cjs'),{harness}=require('./video-preview-history.test.cjs');
module.exports=async function(prisma,results){
 const users=await Promise.all([1,2].map(i=>prisma.user.create({data:{email:'preview-history-'+randomUUID()+'@example.invalid',name:'Synthetic history '+i}})));
 let owner=users[0].id;
 const mocks=db=>({'node:crypto':require('node:crypto'),'next/server':{NextResponse:Response},'@/auth':{auth:async()=>owner?{user:{id:owner}}:null},'@/lib/prisma':{prisma:db}});
 const list=load('app/api/video-previews/route.ts',mocks(prisma),{Buffer});
 const item=load('app/api/video-previews/[id]/route.ts',mocks(prisma),{Buffer});
 const invoke=(id,method='GET')=>item[method](new Request('https://example.invalid/api/video-previews/'+id,{method}),{params:Promise.resolve({id})});
 const h=harness();
 try {
  const first=await prisma.videoPreview.create({data:{userId:owner,title:'Synthetic own video',videoData:Buffer.from('x'.repeat(2500)),mimeType:'video/webm',size:2500}});
  const other=await prisma.videoPreview.create({data:{userId:users[1].id,title:'Synthetic other video',videoData:Buffer.from('z'.repeat(2500)),mimeType:'video/webm',size:2500}});
  h.state.user=owner;h.state.send=async(url,init)=>url==='/api/video-previews'?list.GET():invoke(decodeURIComponent(url.split('/').at(-1)),init?.method||'GET');
  await h.ready();const preview=h.view().dbPreviews[0];assert.equal(preview.id,first.id);assert.equal(h.view().dbPreviews.length,1);assert.equal('videoData' in preview,false);results.push('real history hook/list route returns authenticated account metadata only');
  await h.view().handleSelectPreview(preview);assert.equal(await h.urls[0].blob.text(),'x'.repeat(2500));await h.view().handleDownloadPreview(preview);assert.equal(h.downloads.length,1);assert.equal(await h.urls[1].blob.text(),'x'.repeat(2500));results.push('history hook plays/downloads the exact account-owned bytes from original binary route');
  assert.equal((await invoke(other.id)).status,404);assert.equal((await invoke(other.id,'DELETE')).status,404);assert.equal(await prisma.videoPreview.count({where:{id:other.id,userId:users[1].id}}),1);results.push('original GET/DELETE scope prevents reading or deleting another account preview');
  let lost=true;h.state.send=async(url,init)=>{
   if(url==='/api/video-previews')return list.GET();
   const response=await invoke(decodeURIComponent(url.split('/').at(-1)),init?.method||'GET');
   if(init?.method==='DELETE'&&lost){lost=false;assert.equal(response.status,204);throw Error('synthetic lost delete acknowledgement');}
   return response;
  };
  await h.view().handleDeletePreview(first.id);assert.ok(h.view().previewError);assert.equal(h.view().dbPreviews.length,1);assert.equal(await prisma.videoPreview.count({where:{id:first.id}}),0);
  await h.view().handleDeletePreview(first.id);assert.equal(h.view().dbPreviews.length,0);assert.equal(h.view().playingPreview,null);assert.equal(h.requests.filter(r=>r.init?.method==='DELETE').length,2);assert.equal(await prisma.videoPreview.count({where:{id:other.id}}),1);results.push('actual DELETE commit with lost response retains UI row until retry 404 and refresh confirm absence');
  owner=users[1].id;h.state.user=owner;h.state.send=async()=>list.GET();await h.ready();assert.equal(h.view().dbPreviews[0].id,other.id);
  const unavailable=load('app/api/video-previews/route.ts',mocks({videoPreview:{findMany:async()=>{throw Error('synthetic storage unavailable');}}}),{Buffer});h.state.send=async()=>unavailable.GET();await h.view().refreshDbPreviews();assert.equal(h.view().previewListError,true);assert.equal(h.view().dbPreviews[0].id,other.id);results.push('original list route storage failure is visible in history and preserves last confirmed rows');
  owner=null;const denied=new Proxy({}, {get(){throw Error('Anonymous storage access');}});const anonList=load('app/api/video-previews/route.ts',mocks(denied),{Buffer}),anonItem=load('app/api/video-previews/[id]/route.ts',mocks(denied),{Buffer});
  assert.equal((await anonList.GET()).status,401);for(const method of ['GET','DELETE'])assert.equal((await anonItem[method](new Request('https://example.invalid',{method}),{params:Promise.resolve({id:other.id})})).status,401);results.push('history and original binary/delete routes deny anonymous callers before storage');
 } finally {h.unmount();await prisma.user.deleteMany({where:{id:{in:users.map(u=>u.id)}}});}
};
