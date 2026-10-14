import { checkVideo } from '@/lib/extension-scorecard-heuristics';
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const finiteCount=(v:unknown):number|null=>{
 if(v===undefined)return null;
 if(typeof v!=='string'||!/^\d{1,16}$/.test(v)||!Number.isSafeInteger(Number(v)))throw Error('Batch count unconfirmed');return Number(v);
};
const dateValue=(v:unknown,capturedAt:number)=>{
 if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(v))throw Error('Batch date unconfirmed');
 const date=new Date(v),n=date.getTime();if(!Number.isFinite(n)||n<0||n>capturedAt||date.toISOString().replace('.000Z','Z')!==v.replace('.000Z','Z'))throw Error('Batch date unconfirmed');return n;
};

export async function readScorecardInputBody(request: Request, check: () => void): Promise<unknown> {
  check();
  if (!request.body || (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase() !== 'application/json') return null;
  const reader = request.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true }); let bytes = 0, text = '';
  try {
    for (;;) { check(); const part = await reader.read(); check(); if (part.done) break; bytes += part.value.byteLength; if (bytes > 2048) return null; text += decoder.decode(part.value, { stream: true }); }
    check(); try { return JSON.parse(text + decoder.decode()); } catch { return null; }
  } finally { try { void reader.cancel().catch(() => {}); } catch {} }
}

async function resource(kind:'videos'|'channels',ids:readonly string[],key:string,check:()=>void,signal:AbortSignal):Promise<unknown[]|null> {
 check();const target=new URL('https://www.googleapis.com/youtube/v3/'+kind);target.searchParams.set('part',kind==='videos'?'snippet,statistics,contentDetails':'statistics');target.searchParams.set('id',ids.join(','));target.searchParams.set('key',key);
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

function duration(value:unknown):number|null {
 if(value===undefined)return null;
 if(typeof value!=='string'||value.length>128)throw Error('Scorecard duration unconfirmed');
 const m=value.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
 if(!m||!m.slice(1).some(v=>v!==undefined))throw Error('Scorecard duration unconfirmed');
 const seconds=Number(m[1]??0)*86400+Number(m[2]??0)*3600+Number(m[3]??0)*60+Number(m[4]??0);if(!Number.isSafeInteger(seconds))throw Error('Scorecard duration unconfirmed');return seconds;
}
export async function readScorecardYoutube(videoId:string,key:string,capturedAt:number,check:()=>void,signal:AbortSignal) {
 const rows=await resource('videos',[videoId],key,check,signal);check();if(rows===null)throw Error('Scorecard video unconfirmed');if(!rows.length)return null;
 const value=rows[0];if(!object(value)||value.id!==videoId||!object(value.snippet)||!object(value.statistics)||!object(value.contentDetails))throw Error('Scorecard video unconfirmed');
 const snippet=value.snippet,stats=value.statistics,details=value.contentDetails;
 if(typeof snippet.title!=='string'||snippet.title.length>200||typeof snippet.description!=='string'||snippet.description.length>10000||typeof snippet.channelTitle!=='string'||snippet.channelTitle.length>200||typeof snippet.channelId!=='string'||!/^UC[A-Za-z0-9_-]{22}$/.test(snippet.channelId)
  ||snippet.tags!==undefined&&(!Array.isArray(snippet.tags)||snippet.tags.length>100||snippet.tags.some(t=>typeof t!=='string'||t.length>500))
  ||snippet.thumbnails!==undefined&&(!object(snippet.thumbnails)||Object.keys(snippet.thumbnails).length>10)
  ||details.caption!==undefined&&!['true','false'].includes(String(details.caption))||details.caption!==undefined&&typeof details.caption!=='string')throw Error('Scorecard snippet unconfirmed');
 const published=dateValue(snippet.publishedAt,capturedAt),views=finiteCount(stats.viewCount),likes=finiteCount(stats.likeCount),comments=finiteCount(stats.commentCount),durationSec=duration(details.duration),ageHours=Math.max(1,(capturedAt-published)/3600000);
 if(likes!==null&&comments!==null&&!Number.isSafeInteger(likes+comments))throw Error('Scorecard engagement unconfirmed');
 const vphLifetime=views===null?null:Math.round(views/ageHours*10)/10,engagement=views===null||likes===null||comments===null?null:views>0?Math.round((likes+comments)/views*1000)/10:0,likesRatio=views===null||likes===null?null:views>0?Math.round(likes/views*1000)/10:0;
 if([vphLifetime,engagement,likesRatio].some(v=>v!==null&&(!Number.isFinite(v)||v<0||!Number.isSafeInteger(Math.round(v*10)))))throw Error('Scorecard ratio unconfirmed');
 const raw=checkVideo(snippet as {title:string;description:string;tags?:string[];thumbnails?:Record<string,unknown>},stats as {viewCount?:string;likeCount?:string;commentCount?:string},details as {duration?:string;caption?:string});
 const checks=raw.checks.map(c=>{const available=c.key==='engagement'?views!==null&&likes!==null&&comments!==null:c.key==='duration'?durationSec!==null:c.key==='captions'?details.caption!==undefined:c.key==='thumbnail'?snippet.thumbnails!==undefined:c.key.startsWith('tags_')?snippet.tags!==undefined:true;return{...c,ok:available?(c.key==='duration'?durationSec!>=480&&durationSec!<=1200:c.ok):null,available};});
 const score=checks.every(c=>c.available)?Math.round(checks.filter(c=>c.ok).reduce((n,c)=>n+c.w,0)/checks.reduce((n,c)=>n+c.w,0)*100):null;
 let channelAvgViews:number|null=null,outlierMultiplier:number|null=null;
 const channelData=await resource('channels',[snippet.channelId],key,check,signal);check();
 if(channelData!==null&&channelData.length){const channel=channelData[0];if(!object(channel)||channel.id!==snippet.channelId||!object(channel.statistics))throw Error('Scorecard channel unconfirmed');const total=finiteCount(channel.statistics.viewCount),count=finiteCount(channel.statistics.videoCount);if(total!==null&&count!==null&&count>0){channelAvgViews=Math.round(total/count);outlierMultiplier=views===null||channelAvgViews===0?null:Math.round(views/channelAvgViews*10)/10;if(outlierMultiplier!==null&&!Number.isSafeInteger(Math.round(outlierMultiplier*10)))throw Error('Scorecard outlier unconfirmed');}}
 return{videoId,title:snippet.title,channelId:snippet.channelId,channelTitle:snippet.channelTitle,publishedAt:snippet.publishedAt as string,tags:(snippet.tags??[]) as string[],views,likes,comments,vph:vphLifetime,vphLifetime,vphRecent:false,engagement,likesRatio,ageDays:Math.floor(ageHours/24),ageHours:Math.round(ageHours),durationSec,score,checks,channelAvgViews,outlierMultiplier,dataQuality:{source:'youtube-scorecard-response',freshness:'unconfirmed',velocity:'lifetime-average',score:score===null?'unconfirmed':'heuristic',tags:snippet.tags===undefined?'unconfirmed':'available',outlier:channelAvgViews===null?'unconfirmed':'available',snapshot:'not-recorded'}};
}
