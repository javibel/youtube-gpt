'use strict';
// A fresh test process obtains its OWN native credential session. Parent input
// contains negative command/target constraints only, never a permission or an
// original operation to resume. No recovery path exists in this child.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),{bound,close,sql}=require('./admin-review-moderation-native-pg.test.cjs');
const input=JSON.parse(process.argv[2]);
assert(['command','target'].includes(input.same));
assert.match(input.key,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
assert.match(input.reviewId,/^[A-Za-z0-9_-]{1,128}$/);
let b,cap;
const timer=setTimeout(()=>{console.error('Original denial child missing terminal');process.exit(1);},45000);
(async()=>{let report;try{
 b=await bound({denialTarget:input.same==='target'?input.reviewId:undefined});
 const command={id:input.same==='target'?input.reviewId:b.target.id,status:'rejected'},key=input.same==='command'?input.key:crypto.randomUUID();
 cap=await b.native.authorizeNativeAdminReviewModeration(b.make({key,command}),command,key);assert(cap);
 await assert.rejects(b.native.applyNativeAdminReviewModeration(cap));
 const unique=b.calls.filter(x=>x.startsWith('admission-unique-denial:'));
 assert.equal(unique.length,1);assert(unique[0].includes(input.same==='command'?'id':'reviewId'));
 const businessUpdateInvocations=b.calls.filter(x=>x==='business-update-invoked').length;assert.equal(businessUpdateInvocations,0);
 assert.equal(await sql.db.adminReviewModerationAttempt.count({where:{userId:b.id}}),0);
 assert.equal((await sql.db.review.findUnique({where:{id:b.target.id}})).status,'pending');
 report={status:'PASS',processPid:process.pid,newOwner:b.id,newEmail:b.email,newReview:b.target.id,uniqueDenial:true,uniqueConstraint:unique[0],businessUpdateInvocations,nativeCredentialSession:true,scope:'Fresh synthetic account/native installed CSRF-credentials-bcrypt-callback-JWE;actual unique constraint denies new native command before business update. No pending/completed row is adopted or resumed.'};
}catch(e){report={status:'FAIL',error:e.stack,newOwner:b?.id,newEmail:b?.email,processPid:process.pid};process.exitCode=1;}finally{if(cap)b.native.closeNativeAdminReviewModeration(cap);await close();clearTimeout(timer);}console.log(JSON.stringify(report));})().catch(e=>{console.error(e.stack);process.exitCode=1;});
