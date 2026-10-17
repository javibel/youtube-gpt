/** Evening comments are native read data only. Reply admission,OAuth/model and
 * publication/completion are still pending;no legacy fallback may send a reply.
 */
import {type NativeCronYoutubeComments} from '@/lib/cron-dispatch-original';
import {readYoutubeComments,consumeYoutubeComments,type YoutubeCommentWindow} from '@/lib/agent/youtube-comment-original';
export type YoutubeAgentResult=Readonly<{processed:number;replied:number;errors:readonly string[];coverage:Omit<YoutubeCommentWindow,'comments'>;replyProducerAvailable:false}>;
const originals=new WeakMap<object,Promise<YoutubeAgentResult>>(),results=new WeakMap<object,object>();
export function runYoutubeAgent(original?:NativeCronYoutubeComments):Promise<YoutubeAgentResult>{
 if(!original||typeof original!=='object')return Promise.reject(Error('youtube_comments_unconfirmed'));const previous=originals.get(original);if(previous)return previous;
 const pending=readYoutubeComments(original).then(receipt=>consumeYoutubeComments(receipt,async({comments:_comments,...coverage})=>{const result=Object.freeze({processed:0,replied:0,errors:Object.freeze(!coverage.configured?['youtube_comments_not_configured']:coverage.eligible?['youtube_reply_producer_unavailable']:[]),coverage:Object.freeze(coverage),replyProducerAvailable:false as const});results.set(result,original);return result;})).then(result=>{if(!result||typeof result!=='object'||results.get(result)!==original)throw Error('youtube_comments_unconfirmed');return result;}).catch(()=>{throw Error('youtube_comments_unconfirmed');});originals.set(original,pending);return pending;
}
