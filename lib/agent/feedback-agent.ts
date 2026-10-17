import { prisma } from '@/lib/prisma';
import { prepareFeedbackOriginal, dispatchFeedbackOriginal } from '@/lib/feedback-email-original';
import {runCronFeedback,type NativeCronFeedback} from '@/lib/cron-dispatch-original';
export type FeedbackAgentResult=Readonly<{sent:number;errors:readonly string[];scanned:number;hasMore:boolean;excluded:number;unconfirmed:number;disabled:boolean;coverage:'at-most-ten-candidates-from-native-scan';acceptance:'provider-only-not-delivery'}>;
const FLAG=process.env.LIFECYCLE_EMAILS_LIVE,LIVE=FLAG==='true',requests=new WeakMap<object,Promise<FeedbackAgentResult>>(),results=new WeakMap<object,object>();
const validEmail=(v:unknown):v is string=>typeof v==='string'&&v.length<=254&&/^[^\s@,;<>"\x00-\x1f\x7f]+@[^\s@,;<>"\x00-\x1f\x7f]+\.[^\s@,;<>"\x00-\x1f\x7f]+$/.test(v);
// Selection is data from this original read,not admission,consent or recovery.
// The real helper still owns its account lock/admission/domain HTTP/body/SQL ACK.
export function runFeedbackAgent(original?:NativeCronFeedback):Promise<FeedbackAgentResult>{
 if(!original||typeof original!=='object')return Promise.reject(Error('feedback_batch_unconfirmed'));const prior=requests.get(original);if(prior)return prior;
 const pending=runCronFeedback(original,async({at,checkBeforeDispatch:nativeCheck})=>{
  const check=()=>{nativeCheck();if(process.env.LIFECYCLE_EMAILS_LIVE!==FLAG)throw Error('feedback_batch_unconfirmed');},result={sent:0,errors:[]as string[],scanned:0,hasMore:false,excluded:0,unconfirmed:0,disabled:!LIVE,coverage:'at-most-ten-candidates-from-native-scan'as const,acceptance:'provider-only-not-delivery'as const};check();
  if(LIVE)try{
   check();const selected=await prisma.user.findMany({where:{createdAt:{lte:new Date(at-3*86400000)},feedbackEmailSentAt:null,emailVerified:{not:null},marketingOptOut:false,feedback:{is:null},lifecycleEmailAdmission:{is:null},emailLogs:{none:{sequence:{in:['conv','onboarding','react','feedback','reengagement']},sentAt:{gt:new Date(at-86400000)}}}},select:{id:true,email:true},take:11,orderBy:{id:'asc'}});check();
   if(!Array.isArray(selected)||selected.length>11)throw Error('feedback_batch_unconfirmed');let last='';
   const rows=selected.map(row=>{if(!row||typeof row!=='object'||Object.keys(row).length!==2||typeof row.id!=='string'||!/^\w[\w-]{0,127}$/.test(row.id)||row.id<=last||!validEmail(row.email))throw Error('feedback_batch_unconfirmed');last=row.id;return Object.freeze({id:row.id,email:row.email});});result.hasMore=rows.length>10;
   for(const row of rows.slice(0,10)){check();result.scanned++;const cap=prepareFeedbackOriginal(row.id,row.email,check);const outcome=cap?await dispatchFeedbackOriginal(cap):'not-issued';check();if(outcome==='provider-accepted')result.sent++;else if(outcome==='not-required'||outcome==='dry-run')result.excluded++;else{result.unconfirmed++;result.errors.push('Solicitud de feedback sin confirmación');}}
  }catch{result.unconfirmed++;result.errors.push('Solicitudes de feedback sin confirmación');check();}
  check();const receipt=Object.freeze({...result,errors:Object.freeze(result.errors)});results.set(receipt,original);return receipt;
 }).then(value=>{if(!value||typeof value!=='object'||results.get(value)!==original)throw Error('feedback_batch_unconfirmed');return value;}).catch(()=>{throw Error('feedback_batch_unconfirmed');});requests.set(original,pending);return pending;
}