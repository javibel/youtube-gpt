'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),{load}=require('./route-harness.cjs'),{imageFixture}=require('./cron-brand-image-fixture.cjs');
function publicationFixture(o={}){
 const b=imageFixture(o);
 b.beginPublication=(run,options={})=>{
  const platform=options.platform??'instagram',slot=options.slot??'morning';const p=b.native.runCronDispatch(b.native.authorizeCronDispatch(b.make(slot),slot),async(_step,_tip,_ideas,_email,issue,issueRead)=>{
   const cap=issue(platform);b.cap=cap;const read=options.cached?issueRead():undefined;b.readCap=read;await b.mod.generateSocialPost(platform,slot,cap);if(options.beforePublish)await options.beforePublish(cap,b);
   const publication=b.mod.publishCronInstagramPhoto(cap,read);b.publicationPromise=publication;b.publicationCap=await publication;return run?run(b.publicationCap,b):b.mod.consumeCronInstagramPublication(b.publicationCap,async details=>{await details.validateBeforeResponse();return{platform:details.platform,date:details.date,recordId:details.recordId,containerId:details.containerId,postId:details.postId};});
  });b.pending.push(p);void p.catch(()=>{});return p;
 };return b;
}
module.exports={publicationFixture};
