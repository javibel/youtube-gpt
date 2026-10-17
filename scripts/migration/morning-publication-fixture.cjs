'use strict';
const {publicationFixture}=require('./cron-facebook-publication-fixture.cjs');
function fixture(o={}){
 const b=publicationFixture(o);b.mocks['./ideogram-image']=b.cronImageHelper;
 b.beginMorning=run=>{
  const p=b.native.runCronDispatch(b.native.authorizeCronDispatch(b.make(),'morning'),async(_step,_tip,_ideas,_email,_social,_read,issue)=>{
   b.morningOriginal=issue();const receipt=await b.mod.publishCronMorningSocial(b.morningOriginal);b.morningReceipt=receipt;
   return run?run(receipt,b):b.mod.consumeCronMorningPublication(receipt,async details=>{await details.validateBeforeResponse();return details;});
  });b.pending.push(p);void p.catch(()=>{});return p;
 };return b;
}
module.exports={fixture};
