/** Native cron or authenticated manual comment read only. The private result owns its original
 * GET/body/window;it is data,never permission to generate or publish a reply.
 * API shape: https://developers.google.com/youtube/v3/docs/commentThreads/list
 * https://developers.google.com/youtube/v3/docs/commentThreads
 */
import {runCronYoutubeComments,runCronYoutubeReplies,type NativeCronYoutubeReplies,type NativeCronYoutubeComments} from '@/lib/cron-dispatch-original';
import type {NativeAdminYoutubeComments} from '@/lib/admin-social-messages';
declare const youtubeCommentRead:unique symbol;
export type YoutubeCommentRead={readonly[youtubeCommentRead]:true};
export type YoutubeCommentSource=Readonly<{threadId:string;commentId:string;channelId:string;videoId:string|null;authorChannelId:string|null;authorName:string;text:string;publishedAt:string;updatedAt:string;canReply:boolean}>;
export type YoutubeCommentWindow=Readonly<{configured:boolean;pages:number;scanned:number;eligible:number;hasMore:boolean;comments:readonly YoutubeCommentSource[];coverage:'at-most-three-pages-within-original-budget';acceptance:'read-only-not-reply-consent-or-operative-freshness'}>;
type Context=Readonly<{at:number;signal:AbortSignal;checkBeforeRead:()=>void;remainingBeforeRead:()=>number}>;
const requests=new WeakMap<object,Promise<YoutubeCommentRead>>(),manualRequests=new WeakMap<object,Promise<YoutubeCommentRead>>(),reads=new WeakMap<object,{original:object;context:Context;window:YoutubeCommentWindow;replyUsed?:boolean;promise?:Promise<unknown>}>();
const KEY=process.env.YOUTUBE_API_KEY,CHANNEL=process.env.YOUTUBE_CHANNEL_ID,key=KEY?.trim(),channel=CHANNEL?.trim(),nativeFetch=globalThis.fetch;
const endpoint='https://www.googleapis.com/youtube/v3/commentThreads';
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const text=(value:unknown,max:number):value is string=>typeof value==='string'&&value.length>0&&value.length<=max&&!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value);
const id=(value:unknown):value is string=>text(value,256)&&!/[\s]/.test(value);
const channelId=(value:unknown):value is string=>typeof value==='string'&&/^UC[A-Za-z0-9_-]{22}$/.test(value);
function timestamp(value:unknown,at:number):value is string{return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value)&&Number.isFinite(Date.parse(value))&&Date.parse(value)<=at;}
function parse(value:unknown,context:Context):{comments:YoutubeCommentSource[];next?:string}{
 if(!object(value)||value.kind!=='youtube#commentThreadListResponse'||'error' in value||!Array.isArray(value.items)||value.items.length>20||value.nextPageToken!==undefined&&!id(value.nextPageToken))throw Error('youtube_comments_unconfirmed');
 const comments:YoutubeCommentSource[]=[],seen=new Set<string>();
 for(const entry of value.items){if(!object(entry)||entry.kind!=='youtube#commentThread'||!id(entry.id)||!object(entry.snippet))throw Error('youtube_comments_unconfirmed');const snippet=entry.snippet,top=snippet.topLevelComment;if(snippet.channelId!==channel||typeof snippet.canReply!=='boolean'||!object(top)||!id(top.id)||top.kind!=='youtube#comment'||!object(top.snippet))throw Error('youtube_comments_unconfirmed');const body=top.snippet;
  if(body.channelId!==undefined&&body.channelId!==channel||!text(body.textDisplay,10000)||!text(body.authorDisplayName,2000)||!timestamp(body.publishedAt,context.at)||!timestamp(body.updatedAt,context.at)||Date.parse(body.updatedAt)<Date.parse(body.publishedAt)||seen.has(top.id)||snippet.videoId!==undefined&&!id(snippet.videoId))throw Error('youtube_comments_unconfirmed');
  const author=body.authorChannelId;if(author!==undefined&&(!object(author)||!channelId(author.value)))throw Error('youtube_comments_unconfirmed');seen.add(top.id);
  comments.push(Object.freeze({threadId:entry.id,commentId:top.id,channelId:channel!,videoId:typeof snippet.videoId==='string'?snippet.videoId:null,authorChannelId:object(author)?author.value as string:null,authorName:body.authorDisplayName,text:body.textDisplay,publishedAt:body.publishedAt,updatedAt:body.updatedAt,canReply:snippet.canReply&&object(author)&&author.value!==channel&&body.textDisplay.trim().length>=3}));
 }
 return{comments,...(typeof value.nextPageToken==='string'?{next:value.nextPageToken}:{})};
}
async function page(url:string,context:Context):Promise<unknown>{
 context.checkBeforeRead();const controller=new AbortController(),abort=()=>controller.abort(Error('youtube_comments_unconfirmed')),timer=setTimeout(abort,Math.max(1,Math.floor(context.remainingBeforeRead())));timer.unref?.();context.signal.addEventListener('abort',abort,{once:true});let reader:ReadableStreamDefaultReader<Uint8Array>|undefined,cancel:Promise<void>|undefined,finished=false;
 const cancelRead=()=>{if(reader)cancel=reader.cancel().catch(()=>{});};controller.signal.addEventListener('abort',cancelRead,{once:true});
 try{context.checkBeforeRead();if(controller.signal.aborted||context.signal.aborted)throw Error('youtube_comments_unconfirmed');const response=await nativeFetch(url,{method:'GET',headers:{Accept:'application/json'},redirect:'error',cache:'no-store',signal:controller.signal});context.checkBeforeRead();
  if(controller.signal.aborted||response.status!==200||response.ok!==true||response.redirected||response.url&&response.url!==url||!response.headers.get('content-type')?.toLowerCase().includes('application/json')||!response.body)throw Error('youtube_comments_unconfirmed');
  reader=response.body.getReader();if(controller.signal.aborted)throw Error('youtube_comments_unconfirmed');const decoder=new TextDecoder('utf-8',{fatal:true});let content='',bytes=0;
  while(true){context.checkBeforeRead();const part=await reader.read();context.checkBeforeRead();if(controller.signal.aborted)throw Error('youtube_comments_unconfirmed');if(part.done){finished=true;break;}bytes+=part.value.byteLength;if(bytes>1048576)throw Error('youtube_comments_unconfirmed');content+=decoder.decode(part.value,{stream:true});}
  content+=decoder.decode();context.checkBeforeRead();return JSON.parse(content);
 }finally{clearTimeout(timer);context.signal.removeEventListener('abort',abort);controller.signal.removeEventListener('abort',cancelRead);if(cancel)await cancel;if(reader&&!finished)await reader.cancel().catch(()=>{});controller.abort();reader?.releaseLock();}
}
export function readYoutubeComments(original?:NativeCronYoutubeComments):Promise<YoutubeCommentRead>{
 return readComments(original,requests,run=>runCronYoutubeComments(original,run));
}
// Distinct native issuer: no fake cron Request, bearer secret or DTO conversion.
export function readAdminYoutubeComments(original?:NativeAdminYoutubeComments):Promise<YoutubeCommentRead>{
 return readComments(original,manualRequests,async run=>{const {runAdminYoutubeComments}=await import('@/lib/admin-social-messages');return runAdminYoutubeComments(original,run);});
}
function readComments(original:object|undefined,owners:WeakMap<object,Promise<YoutubeCommentRead>>,authorize:(run:(context:Context)=>Promise<YoutubeCommentRead>)=>Promise<YoutubeCommentRead>):Promise<YoutubeCommentRead>{
 if(!original||typeof original!=='object')return Promise.reject(Error('youtube_comments_unconfirmed'));const previous=owners.get(original);if(previous)return previous;
 const pending=authorize(async native=>{const check=()=>{native.checkBeforeRead();if(process.env.YOUTUBE_API_KEY!==KEY||process.env.YOUTUBE_CHANNEL_ID!==CHANNEL)throw Error('youtube_comments_unconfirmed');},context=Object.freeze({...native,checkBeforeRead:check});check();
 const configured=!!key&&key.length<=4096&&!/[\r\n]/.test(key)&&channelId(channel),comments:YoutubeCommentSource[]=[],tokens=new Set<string>(),ids=new Set<string>();let pages=0,next:string|undefined;
 if(configured)do{check();const url=new URL(endpoint);url.searchParams.set('part','snippet');url.searchParams.set('allThreadsRelatedToChannelId',channel!);url.searchParams.set('order','time');url.searchParams.set('maxResults','20');url.searchParams.set('textFormat','plainText');url.searchParams.set('key',key!);if(next)url.searchParams.set('pageToken',next);
  const value=parse(await page(url.toString(),context),context);check();pages++;for(const row of value.comments){if(ids.has(row.commentId))throw Error('youtube_comments_unconfirmed');ids.add(row.commentId);comments.push(row);}next=value.next;if(next){if(tokens.has(next))throw Error('youtube_comments_unconfirmed');tokens.add(next);}
 }while(next&&pages<3);
 check();const window:YoutubeCommentWindow=Object.freeze({configured,pages,scanned:comments.length,eligible:comments.filter(c=>c.canReply).length,hasMore:!!next,comments:Object.freeze(comments),coverage:'at-most-three-pages-within-original-budget',acceptance:'read-only-not-reply-consent-or-operative-freshness'}),receipt=Object.freeze({})as YoutubeCommentRead;reads.set(receipt,{original,context,window});return receipt;
 }).then(value=>{if(!value||typeof value!=='object'||reads.get(value)?.original!==original)throw Error('youtube_comments_unconfirmed');return value;}).catch(()=>{throw Error('youtube_comments_unconfirmed');});owners.set(original,pending);return pending;
}
export function consumeYoutubeComments<T>(receipt:YoutubeCommentRead|undefined,run:(window:YoutubeCommentWindow)=>Promise<T>):Promise<T>{
 const own=receipt&&reads.get(receipt);if(!own||own.replyUsed)return Promise.reject(Error('youtube_comments_unconfirmed'));
 return(own.promise??=Promise.resolve().then(async()=>{own.context.checkBeforeRead();const result=await run(own.window);own.context.checkBeforeRead();return result;}))as Promise<T>;
}

export type YoutubeReplySourceContext=Readonly<{at:number;signal:AbortSignal;checkBeforeEffect:()=>void;remainingBeforeEffect:()=>number;validateSource:(row:YoutubeCommentSource)=>Promise<void>}>;
export function runYoutubeReplySource<T>(receipt:YoutubeCommentRead|undefined,purpose:NativeCronYoutubeReplies|undefined,run:(window:YoutubeCommentWindow,context:YoutubeReplySourceContext)=>Promise<T>):Promise<T>{
 const own=receipt&&reads.get(receipt);if(!own||own.promise||own.replyUsed)return Promise.reject(Error('youtube_reply_unconfirmed'));own.replyUsed=true;
 return runCronYoutubeReplies(purpose,async native=>{if(native.readPurpose!==own.original)throw Error('youtube_reply_unconfirmed');const check=()=>{native.checkBeforeEffect();own.context.checkBeforeRead();};check();
 const validateSource=async(row:YoutubeCommentSource)=>{check();if(!own.window.comments.includes(row)||!row.canReply)throw Error('youtube_reply_unconfirmed');const url=new URL(endpoint);url.searchParams.set('part','snippet');url.searchParams.set('id',row.threadId);url.searchParams.set('textFormat','plainText');url.searchParams.set('key',key!);const value=parse(await page(url.toString(),own.context),own.context);check();if(value.next||value.comments.length!==1||JSON.stringify(value.comments[0])!==JSON.stringify(row))throw Error('youtube_reply_unconfirmed');};
 const result=await run(own.window,Object.freeze({at:own.context.at,signal:own.context.signal,checkBeforeEffect:check,remainingBeforeEffect:own.context.remainingBeforeRead,validateSource}));check();return result;});
}
