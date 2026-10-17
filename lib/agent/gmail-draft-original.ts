/** Native draft-source preparation only. No model,admission,send or recovery.
 * Read receipts and the public JSON projection are not drafting consent. */
import type {NativeAdminGmailDraftSource} from '@/lib/admin-social-messages';
import type {GmailTextSource} from '@/lib/agent/gmail-metadata-original';
declare const gmailDraftInput:unique symbol;
export type GmailDraftInput={readonly[gmailDraftInput]:true};
export type GmailDraftInputData=Readonly<{platform:'gmail';message:GmailTextSource;acceptance:'source-only-no-model-draft-send-or-operative-acceptance'}>;
type Context=Readonly<{checkBeforeRead:()=>void;validateBeforePrepare:()=>Promise<void>}>;
const requests=new WeakMap<object,Promise<GmailDraftInput>>(),inputs=new WeakMap<object,{original:object;context:Context;data:GmailDraftInputData;promise?:Promise<unknown>}>();
export function prepareGmailDraftInput(original?:NativeAdminGmailDraftSource):Promise<GmailDraftInput>{
 if(!original||typeof original!=='object')return Promise.reject(Error('gmail_draft_source_unconfirmed'));
 const previous=requests.get(original);if(previous)return previous;
 const pending=(async()=>{const{runAdminGmailDraftSource}=await import('@/lib/admin-social-messages');return runAdminGmailDraftSource(original,async context=>{
  context.checkBeforeRead();const data:GmailDraftInputData=Object.freeze({platform:'gmail',message:context.source,acceptance:'source-only-no-model-draft-send-or-operative-acceptance'});
  const receipt=Object.freeze({})as GmailDraftInput;inputs.set(receipt,{original,context,data});return receipt;
 });})().then(receipt=>{if(!receipt||typeof receipt!=='object'||inputs.get(receipt)?.original!==original)throw Error('gmail_draft_source_unconfirmed');return receipt;}).catch(()=>{throw Error('gmail_draft_source_unconfirmed');});
 requests.set(original,pending);return pending;
}
export function consumeGmailDraftInput<T>(receipt:GmailDraftInput|undefined,run:(data:GmailDraftInputData)=>Promise<T>):Promise<T>{
 const own=receipt&&inputs.get(receipt);if(!own)return Promise.reject(Error('gmail_draft_source_unconfirmed'));
 return(own.promise??=Promise.resolve().then(async()=>{await own.context.validateBeforePrepare();const value=await run(own.data);await own.context.validateBeforePrepare();return value;}))as Promise<T>;
}
