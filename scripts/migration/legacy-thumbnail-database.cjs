'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{load}=require('./route-harness.cjs'),sharp=require('sharp');
module.exports=async function(prisma,results){
 const user=await prisma.user.create({data:{email:'legacy-image-'+randomUUID()+'@example.invalid',name:'Synthetic legacy image'}});
 const plans=load('lib/plans.ts',{'@/lib/prisma':{prisma}}),rate=load('lib/rate-limit-db.ts',{'@/lib/prisma':{prisma}});
 let lost=true,posts=0,prompts=0,uploads=0;
 const jpeg=await sharp({create:{width:100,height:56,channels:3,background:{r:20,g:40,b:60}}}).jpeg().toBuffer();
 const globals={Buffer,FormData,TextDecoder,AbortController,setTimeout,clearTimeout,process:{env:{IDEOGRAM_API_KEY:'synthetic-not-real',IDEOGRAM_DOWNLOAD_HOSTS:'example.invalid'}},fetch:async(url,init)=>{assert.equal(init.redirect,'error');if(url==='https://api.ideogram.ai/v1/ideogram-v3/generate'){posts++;return Response.json({data:[{url:'https://example.invalid/f.jpg'}]});}assert.equal(url,'https://example.invalid/f.jpg');assert.equal(init.headers,undefined);return new Response(jpeg,{headers:{'content-type':'image/jpeg'}});}};
 const provider=load('lib/image/background-image-provider.ts',{},globals);
 const route=load('app/api/generate-thumbnail/route.ts',{'@/auth':{auth:async()=>({user:{id:user.id,email:user.email}})},'@/lib/prisma':{prisma},'@/lib/plans':plans,'@/lib/rate-limit-db':rate,'@/lib/image/background-image-provider':provider,'sharp':sharp,'@/lib/ai/task-runtime':{getMessagesTask:async()=>({create:async()=>{prompts++;return{content:[{text:'Synthetic scene'}],usage:{output_tokens:8},incomplete:false};}})},'@vercel/blob':{put:async(name,bytes,settings)=>{uploads++;assert.ok(name.startsWith('thumbnails/'+user.id+'/'));assert.equal(settings.contentType,'image/png');const meta=await sharp(bytes).metadata();assert.equal(meta.format,'png');assert.equal(meta.width,1312);assert.equal(meta.height,736);if(lost)throw Error('Synthetic lost storage acknowledgment');return{url:'https://example.invalid/stored.png'};}}},globals);
 const invoke=()=>{const body=new FormData();body.append('tema','Synthetic legacy topic');body.append('thumbnailText','LOCAL TEST');return route.POST(new Request('https://example.invalid/api/generate-thumbnail',{method:'POST',body}));};
 try{
  await prisma.subscription.create({data:{userId:user.id,plan:'pro',status:'active',stripeCustomerId:'manual_admin',currentPeriodEnd:new Date(Date.now()+86400000)}});
  assert.equal((await invoke()).status,503);assert.equal(await prisma.generation.count({where:{userId:user.id}}),0);assert.equal(uploads,1);
  lost=false;const response=await invoke();assert.equal(response.status,200);assert.equal((await response.json()).imageUrl,'https://example.invalid/stored.png');assert.equal(await prisma.generation.count({where:{userId:user.id,template:'thumbnail'}}),1);assert.equal(posts,2);assert.equal(prompts,2);assert.equal(uploads,2);
  const hits=(await prisma.$queryRawUnsafe('SELECT hits FROM rate_limits WHERE key=$1','gen-thumb:'+user.id))[0];assert.equal(Number(hits.hits),2);
  await prisma.subscription.update({where:{userId:user.id},data:{currentPeriodEnd:new Date(Date.now()-1000)}});assert.equal((await invoke()).status,403);assert.equal(posts,2);
  results.push('original legacy thumbnail route/native image adapter/real sharp normalize synthetic JPEG and overlay to PNG 1312x736 with strict real PostgreSQL admission; lost Blob ack rejects success/history, explicit retry repeats synthetic prompt/provider/upload and stores one owned row, Pro expiry blocks third effect; no idempotency/rollback claimed');
 }finally{await prisma.$executeRawUnsafe('DELETE FROM rate_limits WHERE key=$1','gen-thumb:'+user.id);await prisma.user.delete({where:{id:user.id}});}
};
