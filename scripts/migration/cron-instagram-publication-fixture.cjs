'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),{load}=require('./route-harness.cjs'),{imageFixture}=require('./cron-brand-image-fixture.cjs');
function publicationFixture(o={}){
 const b=imageFixture(o);Object.assign(b.env,{INSTAGRAM_ACCOUNT_ID:'123456',INSTAGRAM_ACCESS_TOKEN:'closed-token',META_APP_SECRET:'closed-secret',INSTAGRAM_GRAPH_API_VERSION:'v24.0'});b.graphCalls=[];b.globals.ReadableStream=ReadableStream;let statusReads=0;
 const blobFetch=b.globals.fetch;
 b.globals.setTimeout=(fn,ms)=>{if(ms!==5000)return setTimeout(fn,ms);const h={virtual:true,cancelled:false};b.stage('instagram-wait',async()=>{b.clock.elapsed+=5000;if(!h.cancelled)fn();}).catch(()=>b.controller.abort());return h;};b.globals.clearTimeout=h=>h?.virtual?h.cancelled=true:clearTimeout(h);
 b.globals.fetch=(url,settings)=>{
  if(!String(url).startsWith('https://graph.instagram.com/'))return blobFetch(url,settings);
  const parsed=new URL(url),operation=parsed.pathname.endsWith('/media_publish')?'publish':parsed.pathname.endsWith('/media')?'container':'status',name='instagram-'+operation;
  return b.stage(name,async()=>{
   b.graphCalls.push({url,settings,operation});assert.equal(parsed.origin,'https://graph.instagram.com');assert.equal(settings.redirect,'error');assert.equal(settings.cache,'no-store');assert(settings.signal instanceof AbortSignal);
   const credentials={access_token:'closed-token',appsecret_proof:crypto.createHmac('sha256','closed-secret').update('closed-token').digest('hex')};let ack;
   if(operation==='status'){assert.equal(settings.method,'GET');assert.equal(parsed.pathname,'/v24.0/777');assert.deepEqual(Object.fromEntries(parsed.searchParams),{fields:'status_code',...credentials});ack={id:'777',status_code:o.statuses?.[statusReads++]??'FINISHED'};}
   else{assert.equal(settings.method,'POST');const body=JSON.parse(settings.body);assert.equal(parsed.pathname,'/v24.0/123456/'+(operation==='container'?'media':'media_publish'));for(const[k,v]of Object.entries(credentials))assert.equal(body[k],v);if(operation==='container'){assert.equal(body.caption,Array.from(o.text??'Closed social draft').slice(0,2200).join(''));assert.match(body.image_url,/^https:\/\/closedstore\.public\.blob\.vercel-storage\.com\/social-cron\//);ack={id:'777'};}else{assert.equal(body.creation_id,'777');ack={id:'888'};}}
   ack=o.graphBodies?.[operation]??ack;let first=true;return new Response(new ReadableStream({async pull(controller){if(!first)return;first=false;try{const bytes=await b.stage(name+'-body',async()=>Buffer.from(JSON.stringify(ack)));controller.enqueue(bytes);controller.close();}catch(error){controller.error(error);}}}),{status:o.graphStatus??200,headers:{'content-type':'application/json'}});
  });
 };
 b.transport=load('lib/agent/cron-instagram-photo-transport.ts',{'node:crypto':crypto},b.globals);b.mocks['./ideogram-image']=b.helper;b.mocks['./cron-instagram-photo-transport']=b.transport;
 b.beginPublication=(run,options={})=>{
  const platform=options.platform??'instagram',slot=options.slot??'morning';const p=b.native.runCronDispatch(b.native.authorizeCronDispatch(b.make(slot),slot),async(_step,_tip,_ideas,_email,issue,issueRead)=>{
   const cap=issue(platform);b.cap=cap;const read=options.cached?issueRead():undefined;b.readCap=read;await b.mod.generateSocialPost(platform,slot,cap);if(options.beforePublish)await options.beforePublish(cap,b);
   const publication=b.mod.publishCronInstagramPhoto(cap,read);b.publicationPromise=publication;b.publicationCap=await publication;return run?run(b.publicationCap,b):b.mod.consumeCronInstagramPublication(b.publicationCap,async details=>{await details.validateBeforeResponse();return{platform:details.platform,date:details.date,recordId:details.recordId,containerId:details.containerId,postId:details.postId};});
  });b.pending.push(p);void p.catch(()=>{});return p;
 };return b;
}
module.exports={publicationFixture};
