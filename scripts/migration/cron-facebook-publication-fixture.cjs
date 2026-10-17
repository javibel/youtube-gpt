'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),{load}=require('./route-harness.cjs'),{imageFixture}=require('./cron-brand-image-fixture.cjs');
function publicationFixture(o={}){
 const b=imageFixture(o);Object.assign(b.env,{META_PAGE_ID:'123456',META_PAGE_ACCESS_TOKEN:'closed-token',META_APP_SECRET:'closed-secret',FACEBOOK_GRAPH_API_VERSION:'v24.0'});
 b.graphCalls=[];b.globals.ReadableStream=ReadableStream;
 const blobFetch=b.globals.fetch;
 b.globals.fetch=(url,settings)=>String(url).startsWith('https://graph.facebook.com/')?b.stage('facebook-photo',async()=>{
  b.graphCalls.push({url,settings});assert.equal(url,'https://graph.facebook.com/v24.0/'+b.env.META_PAGE_ID+'/photos');assert.equal(settings.method,'POST');assert.equal(settings.redirect,'error');assert.equal(settings.cache,'no-store');assert(settings.signal instanceof AbortSignal);
  const body=JSON.parse(settings.body);assert.equal(body.access_token,'closed-token');assert.equal(body.appsecret_proof,crypto.createHmac('sha256','closed-secret').update('closed-token').digest('hex'));assert.equal(body.caption,o.text??'Closed social draft');assert.match(body.url,/^https:\/\/closedstore\.public\.blob\.vercel-storage\.com\/social-cron\//);
  let first=true;return new Response(new ReadableStream({async pull(controller){if(!first)return;first=false;try{const bytes=await b.stage('facebook-photo-body',async()=>Buffer.from(JSON.stringify(o.graphBody??{id:'777',post_id:'123456_888'})));controller.enqueue(bytes);controller.close();}catch(error){controller.error(error);}}}),{status:o.graphStatus??200,headers:{'content-type':'application/json'}});
 }):blobFetch(url,settings);
 b.transport=load('lib/agent/cron-facebook-photo-transport.ts',{'node:crypto':crypto},b.globals);b.mocks['./ideogram-image']=b.helper;b.mocks['./cron-facebook-photo-transport']=b.transport;
 b.beginPublication=(run,options={})=>{
  const platform=options.platform??'facebook',slot=options.slot??'morning';
  const p=b.native.runCronDispatch(b.native.authorizeCronDispatch(b.make(slot),slot),async(_step,_tip,_ideas,_email,issue,issueRead)=>{
   const cap=issue(platform);b.cap=cap;const read=options.cached?issueRead():undefined;b.readCap=read;
   await b.mod.generateSocialPost(platform,slot,cap);
   if(options.beforePublish)await options.beforePublish(cap,b);
   const publication=b.mod.publishCronFacebookPhoto(cap,read);b.publicationPromise=publication;b.publicationCap=await publication;
   return run?run(b.publicationCap,b):b.mod.consumeCronFacebookPublication(b.publicationCap,async details=>{await details.validateBeforeResponse();return{platform:details.platform,date:details.date,recordId:details.recordId,photoId:details.photoId,postId:details.postId};});
  });b.pending.push(p);void p.catch(()=>{});return p;
 };
 return b;
}
module.exports={publicationFixture};
