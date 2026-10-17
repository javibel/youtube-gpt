import {type NativeCronYoutubeComments,type NativeCronYoutubeReplies} from '@/lib/cron-dispatch-original';
import {readYoutubeComments,consumeYoutubeComments,type YoutubeCommentWindow} from '@/lib/agent/youtube-comment-original';
import {replyYoutubeComments,type YoutubeReplyBatch} from '@/lib/agent/youtube-reply-original';
export type YoutubeAgentResult=Readonly<{processed:number;replied:number;errors:readonly string[];coverage:Omit<YoutubeCommentWindow,'comments'>;replyProducerAvailable:boolean;replyCoverage?:YoutubeReplyBatch}>;
const originals=new WeakMap<object,{reply?:NativeCronYoutubeReplies;promise:Promise<YoutubeAgentResult>}>(),results=new WeakMap<object,object>();
export function runYoutubeAgent(original?:NativeCronYoutubeComments,replyPurpose?:NativeCronYoutubeReplies):Promise<YoutubeAgentResult>{
 if(!original||typeof original!=='object')return Promise.reject(Error('youtube_comments_unconfirmed'));const previous=originals.get(original);if(previous)return previous.reply===replyPurpose?previous.promise:Promise.reject(Error('youtube_reply_unconfirmed'));
 const pending=readYoutubeComments(original).then(async receipt=>{
  if(replyPurpose){const reply=await replyYoutubeComments(receipt,replyPurpose),result=Object.freeze({processed:reply.processed,replied:reply.replied,errors:reply.errors,coverage:reply.sourceCoverage,replyProducerAvailable:true,replyCoverage:reply});results.set(result,original);return result;}
  return consumeYoutubeComments(receipt,async({comments:_comments,...coverage})=>{const result=Object.freeze({processed:0,replied:0,errors:Object.freeze(!coverage.configured?['youtube_comments_not_configured']:coverage.eligible?['youtube_reply_producer_unavailable']:[]),coverage:Object.freeze(coverage),replyProducerAvailable:false});results.set(result,original);return result;});
 }).then(result=>{if(!result||typeof result!=='object'||results.get(result)!==original)throw Error('youtube_comments_unconfirmed');return result;}).catch(()=>{throw Error('youtube_comments_unconfirmed');});originals.set(original,{reply:replyPurpose,promise:pending});return pending;
}
