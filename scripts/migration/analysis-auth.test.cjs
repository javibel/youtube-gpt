'use strict';
const assert=require('node:assert/strict');
const {load}=require('./route-harness.cjs');
const {randomUUID}=require('node:crypto');
// Explicit route list: this checks entry authorization, not full AI behavior.
const entries=[
 ['app/api/generate-thumbnail/route.ts','POST'],['app/api/thumbnail-background/route.ts','POST'],
 ...['ab-test/suggest','thumbnail-preview','optimize','seo-score','retention','revenue','subscribers','competitor-intel','audit','analytics'].map(name=>['app/api/youtube/'+name+'/route.ts','POST']),
 ...['best-time'].map(name=>['app/api/youtube/'+name+'/route.ts','GET']),
 ['app/api/youtube/best-time/route.ts','POST'],['app/api/youtube/optimize/route.ts','GET'],['app/api/youtube/optimize/route.ts','PUT'],['app/api/youtube/seo-score/route.ts','GET'],
];
const results=[];
(async()=>{
 for(const [file,method] of entries)for(const session of [null,{user:{}}]){
  const effects=[];
  const forbidden=new Proxy(function(){effects.push('unexpected dependency call');throw Error('Unexpected effect before authentication');},{get:()=>forbidden});
  try{
   if(file==='app/api/youtube/optimize/route.ts'){
    const globals={Error,Date,Headers,TextEncoder,AbortController,process:{env:{AUTH_URL:'http://127.0.0.1:4300'}},fetch:forbidden},pure=load('lib/retention-contract.ts',{},globals),score=load('lib/optimize-score.ts',{},globals),contract=load('lib/optimize-native-contract.ts',{'@/lib/retention-contract':pure,'@/lib/optimize-score':score},globals),mocks={'@/auth':{readNativeSessionCookie:async()=>session},'@/lib/prisma':{prisma:forbidden},'@/lib/ai/task-runtime':{getMessagesTask:forbidden},'@/lib/optimize-update':{beginOptimizeUpdate:forbidden},'@/lib/optimize-native-contract':contract,'@/lib/optimize-score':score};
    const native=load('lib/optimize-native-original.ts',mocks,globals),route=load(file,{'next/server':{NextResponse:Response},'@/lib/optimize-native-original':native},globals),draft={videoId:'abcdefghijk',title:'Synthetic',description:'',tags:[]},response=await route[method](new Request('http://127.0.0.1:4300/api/youtube/optimize'+(method==='GET'?'?lang=en':''),{method,...(method==='GET'?{}:{body:JSON.stringify(method==='POST'?{lang:'en',draft}:{lang:'en',draft,original:draft,categoryId:'22',advice:false})}),headers:{cookie:'negative-not-a-session',origin:'http://127.0.0.1:4300','content-type':'application/json','idempotency-key':randomUUID()}}));assert.equal(response.status,401);assert.equal(effects.length,0);results.push({file,method,session:session?'missing identity':'anonymous',status:'PASS'});continue;
   }
   if(file==='app/api/youtube/seo-score/route.ts'){
    const globals={Error,Date,Headers,TextEncoder,AbortController,process:{env:{AUTH_URL:'http://127.0.0.1:4300'}},fetch:forbidden},pure=load('lib/retention-contract.ts',{},globals),audit=load('lib/audit-contract.ts',{'@/lib/retention-contract':pure},globals),contract=load('lib/video-review-contract.ts',{'@/lib/retention-contract':pure,'@/lib/audit-contract':audit},globals),mocks={'@/auth':{readNativeSessionCookie:async()=>session},'@/lib/prisma':{prisma:forbidden},'@/lib/ai/task-runtime':{getMessagesTask:forbidden},'@/lib/video-review-contract':contract};
    const route=load(file,{'next/server':{NextResponse:Response},'@/lib/video-review-original':load('lib/video-review-original.ts',mocks,globals),'@/lib/video-review-history-original':load('lib/video-review-history-original.ts',mocks,globals)},globals),response=await route[method](new Request('http://127.0.0.1:4300/api/youtube/seo-score'+(method==='GET'?'?lang=es':''),{method,...(method==='POST'?{body:'{"lang":"es","videoId":null,"thumbnails":false}'}:{}),headers:{cookie:'negative-not-a-session',origin:'http://127.0.0.1:4300','content-type':'application/json','idempotency-key':randomUUID()}}));assert.equal(response.status,401);assert.equal(effects.length,0);results.push({file,method,session:session?'missing identity':'anonymous',status:'PASS'});continue;
   }
   const nativeAnalysis=['app/api/youtube/retention/route.ts','app/api/youtube/revenue/route.ts','app/api/youtube/subscribers/route.ts','app/api/youtube/competitor-intel/route.ts','app/api/youtube/audit/route.ts','app/api/youtube/analytics/route.ts'].includes(file),nativeName=file.includes('/analytics/')?'analytics':file.includes('/audit/')?'audit':file.includes('/competitor-intel/')?'tracked-intel':file.includes('/subscribers/')?'subscribers':file.includes('/revenue/')?'revenue':'retention';
   const globals={Error,Date,Headers,TextEncoder,AbortController,process:{env:{AUTH_URL:'http://127.0.0.1:4300'}},fetch:forbidden};
   const contract=nativeName!=='retention'?load('lib/'+nativeName+'-contract.ts',{'@/lib/retention-contract':load('lib/retention-contract.ts',{},globals)},globals):load('lib/retention-contract.ts',{},globals);
   const analysisOriginal=nativeAnalysis?load('lib/'+nativeName+'-original.ts',{'@/auth':{readNativeSessionCookie:async()=>session},'@/lib/prisma':{prisma:forbidden},'@/lib/ai/task-runtime':{getMessagesTask:forbidden},['@/lib/'+nativeName+'-contract']:contract},globals):null;
   const route=load(file,{
    ...(analysisOriginal?{['@/lib/'+nativeName+'-original']:analysisOriginal}:{}),
    'next/server':{NextRequest:Request,NextResponse:Response},'@/lib/image/background-upload':{uploadBackgroundReceipt:()=>{throw Error('Unexpected keyed upload');}},'@/lib/image/background-image-attempt':{keyedBackgroundImage:()=>{throw Error('Unexpected keyed image');}},'@/auth':{auth:async()=>session},
    '@/lib/prisma':{prisma:forbidden},'@/lib/plans':{getUserPlan:forbidden,getLimits:forbidden,isPaid:forbidden},
    '@/lib/youtube-auth':{getAccessToken:forbidden},'@/lib/parse-fenced-json':{parseFencedJson:forbidden},
    '@/lib/ai/task-runtime':{getMessagesTask:forbidden},
    '@/lib/image/legacy-thumbnail-attempt':{keyedLegacyThumbnail:forbidden,unkeyedLegacyThumbnail:forbidden},
    '@/lib/rate-limit-db':{rateLimitDb:forbidden},
    '@/lib/image/background-image-provider':{backgroundImageAvailable:forbidden,generateBackgroundImage:forbidden},
    'sharp':forbidden,'@vercel/blob':{put:forbidden},'@anthropic-ai/sdk':class {constructor(){this.messages=forbidden;}},
   },globals);
   assert.equal(typeof route[method],'function');
   // Negative decoder fixtures never authorize these analyses. The real native
   // original must reject them before any SQL/YouTube/model dependency.
   const request=file==='app/api/youtube/ab-test/suggest/route.ts'?new Request('https://example.invalid/api/youtube/ab-test/suggest',{method,body:JSON.stringify({title:'Synthetic original',lang:'es'}),headers:{'content-type':'application/json','idempotency-key':randomUUID()}}):nativeAnalysis?new Request('http://127.0.0.1:4300/api/youtube/'+(nativeName==='tracked-intel'?'competitor-intel':nativeName),{method,body:nativeName==='revenue'?'{"lang":"es","currency":"USD"}':nativeName==='tracked-intel'?JSON.stringify({lang:'es',channelIds:['UC'+'b'.repeat(22)]}):'{"lang":"es"}',headers:{origin:'http://127.0.0.1:4300',cookie:'negative-not-a-session','content-type':'application/json','idempotency-key':randomUUID()}}):new Request('https://example.invalid/api/test',{method,...(method==='POST'?{body:'{}',headers:{'content-type':'application/json'}}:{})});
   const response=await route[method](request);
   assert.equal(response.status,401);assert.equal(effects.length,0);
   results.push({file,method,session:session?'missing identity':'anonymous',status:'PASS'});
  }catch(error){results.push({file,method,session:session?'missing identity':'anonymous',status:'FAIL',error:error.message,effects:effects.length});}
 }
 console.log(JSON.stringify({scope:'explicit AI-route authentication boundary; every provider, storage and plan lookup is forbidden; no full-flow coverage implied',results},null,2));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})();
