const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const finiteCount=(v:unknown):number|null=>{
 if(v===undefined)return null;
 if(typeof v!=='string'||!/^\d{1,16}$/.test(v)||!Number.isSafeInteger(Number(v)))throw Error('Batch count unconfirmed');return Number(v);
};
const dateValue=(v:unknown,capturedAt:number)=>{
 if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(v))throw Error('Batch date unconfirmed');
 const date=new Date(v),n=date.getTime();if(!Number.isFinite(n)||n<0||n>capturedAt||date.toISOString().replace('.000Z','Z')!==v.replace('.000Z','Z'))throw Error('Batch date unconfirmed');return n;
};
export type BatchVideo={videoId:string;title:string;channelId:string;channelTitle:string;publishedAt:string;views:number|null;likes:number|null;comments:number|null;vph:number|null;engagement:number|null;ageDays:number;ageHours:number;subscribers:number|null;subscriberState:'available'|'hidden'|'unconfirmed'};
export async function readBatchInputBody(request: Request, check: () => void): Promise<unknown> {
  check();
  if (!request.body || (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase() !== 'application/json') return null;
  const reader = request.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true }); let bytes = 0, text = '';
  try {
    for (;;) { check(); const part = await reader.read(); check(); if (part.done) break; bytes += part.value.byteLength; if (bytes > 4096) return null; text += decoder.decode(part.value, { stream: true }); }
    check(); try { return JSON.parse(text + decoder.decode()); } catch { return null; }
  } finally { try { void reader.cancel().catch(() => {}); } catch {} }
}

async function resource(kind:'videos'|'channels',ids:readonly string[],key:string,check:()=>void,signal:AbortSignal):Promise<unknown[]|null> {
 check();const target=new URL('https://www.googleapis.com/youtube/v3/'+kind);target.searchParams.set('part',kind==='videos'?'snippet,statistics':'statistics');target.searchParams.set('id',ids.join(','));target.searchParams.set('key',key);
 let response:Response|undefined,reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
 try{
  response=await fetch(target.toString(),{redirect:'error',cache:'no-store',credentials:'omit',signal});check();
  if(!response.body||(response.headers.get('content-type')??'').split(';')[0].trim().toLowerCase()!=='application/json')throw Error('Batch transport unconfirmed');
  const length=response.headers.get('content-length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)>2*1024*1024))throw Error('Batch bytes unconfirmed');
  reader=response.body.getReader();const decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,text='';
  for(;;){check();const part=await reader.read();check();if(part.done)break;bytes+=part.value.byteLength;if(bytes>2*1024*1024)throw Error('Batch bytes unconfirmed');text+=decoder.decode(part.value,{stream:true});}
  const value:unknown=JSON.parse(text+decoder.decode());check();if(!object(value))throw Error('Batch JSON unconfirmed');
  // Optional enrichment may be unavailable only after this exact native HTTP
  // and bounded body finish with a recognized provider denial. No failed body,
  // timeout or JSON copy grants completion or turns missing counts into zero.
  if(kind==='channels'&&[403,404].includes(response.status)&&object(value.error)&&value.error.code===response.status)return null;
  if(response.status!==200||!Array.isArray(value.items)||value.items.length>ids.length)throw Error('Batch response unconfirmed');return value.items;
 }finally{try{if(reader)void reader.cancel().catch(()=>{});else void response?.body?.cancel().catch(()=>{});}catch{}}
}
export async function readBatchYoutube(ids:readonly string[],key:string,capturedAt:number,check:()=>void,signal:AbortSignal){
 const raw=await resource('videos',ids,key,check,signal);check();if(raw===null)throw Error('Batch videos unconfirmed');
 const seen=new Set<string>(),videos:BatchVideo[]=raw.map<BatchVideo>(value=>{
  if(!object(value)||typeof value.id!=='string'||!ids.includes(value.id)||seen.has(value.id)||!object(value.snippet)||!object(value.statistics))throw Error('Batch video unconfirmed');seen.add(value.id);
  const snippet=value.snippet,stats=value.statistics;
  if(typeof snippet.title!=='string'||snippet.title.length>200||typeof snippet.channelTitle!=='string'||snippet.channelTitle.length>200||typeof snippet.channelId!=='string'||!/^UC[A-Za-z0-9_-]{22}$/.test(snippet.channelId))throw Error('Batch snippet unconfirmed');
  const published=dateValue(snippet.publishedAt,capturedAt),views=finiteCount(stats.viewCount),likes=finiteCount(stats.likeCount),comments=finiteCount(stats.commentCount),ageHours=Math.max(1,(capturedAt-published)/(1000*60*60));
  if(likes!==null&&comments!==null&&!Number.isSafeInteger(likes+comments))throw Error('Batch engagement unconfirmed');
  const vph=views===null?null:Math.round((views/ageHours)*10)/10,engagement=views===null||likes===null||comments===null?null:views>0?Math.round(((likes+comments)/views)*1000)/10:0;
  if([vph,engagement].some(n=>n!==null&&(!Number.isFinite(n)||n<0||!Number.isSafeInteger(Math.round(n*10)))))throw Error('Batch ratio unconfirmed');
  return{videoId:value.id,title:snippet.title,channelId:snippet.channelId,channelTitle:snippet.channelTitle,publishedAt:snippet.publishedAt as string,views,likes,comments,vph,engagement,ageDays:Math.floor(ageHours/24),ageHours:Math.round(ageHours),subscribers:null,subscriberState:'unconfirmed'};
 });
 const channels=[...new Set(videos.map(v=>v.channelId))],subs=new Map<string,{count:number|null;state:'available'|'hidden'|'unconfirmed'}>();
 if(channels.length){const data=await resource('channels',channels,key,check,signal);check();if(data!==null){const seenChannels=new Set<string>();for(const item of data){if(!object(item)||typeof item.id!=='string'||!channels.includes(item.id)||seenChannels.has(item.id)||!object(item.statistics))throw Error('Batch channel unconfirmed');seenChannels.add(item.id);const stats=item.statistics;if(stats.hiddenSubscriberCount!==undefined&&typeof stats.hiddenSubscriberCount!=='boolean')throw Error('Batch subscriber policy unconfirmed');const count=finiteCount(stats.subscriberCount);subs.set(item.id,{count:stats.hiddenSubscriberCount===true?null:count,state:stats.hiddenSubscriberCount===true?'hidden':count===null?'unconfirmed':'available'});}}}
 check();for(const video of videos){const sub=subs.get(video.channelId);if(sub){video.subscribers=sub.count;video.subscriberState=sub.state;}}
 return{videos,missingVideoIds:ids.filter(id=>!seen.has(id)),subscriberEnrichment:videos.every(v=>v.subscriberState!=='unconfirmed')?'available':'unconfirmed'};
}
