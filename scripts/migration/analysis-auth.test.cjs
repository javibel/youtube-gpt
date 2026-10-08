'use strict';
const assert=require('node:assert/strict');
const {load}=require('./route-harness.cjs');
// Explicit route list: this checks entry authorization, not full AI behavior.
const entries=[
 ['app/api/generate-thumbnail/route.ts','POST'],['app/api/thumbnail-background/route.ts','POST'],
 ...['ab-test/suggest','thumbnail-preview','optimize','seo-score','retention'].map(name=>['app/api/youtube/'+name+'/route.ts','POST']),
 ...['analytics','audit','best-time','competitor-intel','revenue','subscribers'].map(name=>['app/api/youtube/'+name+'/route.ts','GET']),
 ['app/api/youtube/best-time/route.ts','POST'],['app/api/youtube/optimize/route.ts','GET'],['app/api/youtube/optimize/route.ts','PUT'],['app/api/youtube/seo-score/route.ts','GET'],
];
const results=[];
(async()=>{
 for(const [file,method] of entries)for(const session of [null,{user:{}}]){
  const effects=[];
  const forbidden=new Proxy(function(){effects.push('unexpected dependency call');throw Error('Unexpected effect before authentication');},{get:()=>forbidden});
  try{
   const route=load(file,{
    'next/server':{NextRequest:Request,NextResponse:Response},'@/lib/image/background-upload':{uploadBackgroundReceipt:()=>{throw Error('Unexpected keyed upload');}},'@/lib/image/background-image-attempt':{keyedBackgroundImage:()=>{throw Error('Unexpected keyed image');}},'@/auth':{auth:async()=>session},
    '@/lib/prisma':{prisma:forbidden},'@/lib/plans':{getUserPlan:forbidden,getLimits:forbidden,isPaid:forbidden},
    '@/lib/youtube-auth':{getAccessToken:forbidden},'@/lib/parse-fenced-json':{parseFencedJson:forbidden},
    '@/lib/ai/task-runtime':{getMessagesTask:forbidden},
    '@/lib/image/legacy-thumbnail-attempt':{keyedLegacyThumbnail:forbidden},
    '@/lib/rate-limit-db':{rateLimitDb:forbidden},
    '@/lib/image/background-image-provider':{backgroundImageAvailable:forbidden,generateBackgroundImage:forbidden},
    'sharp':forbidden,'@vercel/blob':{put:forbidden},'@anthropic-ai/sdk':class {constructor(){this.messages=forbidden;}},
   },{process:{env:{ANTHROPIC_API_KEY:'synthetic-not-a-key'}},fetch:forbidden});
   assert.equal(typeof route[method],'function');
   const request=new Request('https://example.invalid/api/test',{method,...(method==='POST'?{body:'{}',headers:{'content-type':'application/json'}}:{})});
   const response=await route[method](request);
   assert.equal(response.status,401);assert.equal(effects.length,0);
   results.push({file,method,session:session?'missing identity':'anonymous',status:'PASS'});
  }catch(error){results.push({file,method,session:session?'missing identity':'anonymous',status:'FAIL',error:error.message,effects:effects.length});}
 }
 console.log(JSON.stringify({scope:'explicit AI-route authentication boundary; every provider, storage and plan lookup is forbidden; no full-flow coverage implied',results},null,2));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})();
