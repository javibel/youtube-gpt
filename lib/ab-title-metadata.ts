import { abFixtureFetch } from '@/lib/migration/ab-fixture.cjs';
// Source projection is data, never an admission, recovery grant or permission
// to publish. The caller must retain its own original authorization/admission.
export type AbTitlePayload = Readonly<{ id:string;channelId:string;snippet:Readonly<{title:string;description:string;tags:readonly string[];categoryId:string;defaultLanguage?:string}> }>;
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const id=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
export function captureAbTitleMetadata(video:unknown,videoId:string,title:string):AbTitlePayload {
 if(!object(video)||video.kind!=='youtube#video'||video.id!==videoId||!id(videoId)||!object(video.snippet))throw Error('ab_metadata_unconfirmed');
 const s=video.snippet;
 if(!id(s.channelId)||typeof s.title!=='string'||!s.title.trim()||s.title.length>100||typeof title!=='string'||!title.trim()||title.length>100||/[<>]/.test(title)
 ||typeof s.description!=='string'||s.description.length>5000||!Array.isArray(s.tags)||s.tags.length>100||!s.tags.every(t=>typeof t==='string'&&t.length<=500)
 ||typeof s.categoryId!=='string'||!/^\d{1,3}$/.test(s.categoryId)||s.defaultLanguage!==undefined&&(typeof s.defaultLanguage!=='string'||!/^[A-Za-z0-9-]{1,64}$/.test(s.defaultLanguage)))throw Error('ab_metadata_unconfirmed');
 const snippet=Object.freeze({title,description:s.description,tags:Object.freeze([...s.tags as string[]]),categoryId:s.categoryId,...(s.defaultLanguage!==undefined?{defaultLanguage:s.defaultLanguage}:{})});
 return Object.freeze({id:videoId,channelId:s.channelId,snippet});
}
async function bodyText(response:Response):Promise<string>{
 if(!response.body)throw Error('ab_metadata_unconfirmed');
 const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,body='';
 try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>1048576)throw Error('ab_metadata_unconfirmed');body+=decoder.decode(part.value,{stream:true});}return body+decoder.decode();}finally{void reader.cancel().catch(()=>{});}
}
async function json(response:Response):Promise<unknown>{if(response.status!==200||!response.ok||response.redirected||!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')??''))throw Error('ab_metadata_unconfirmed');return JSON.parse(await bodyText(response));}
export async function readAbVideoOriginal(token:string,videoId:string):Promise<Record<string,unknown>|null>{
 const originalFetch=fetch;if(!id(videoId)||!token||token.length>8192||/[\r\n]/.test(token))throw Error('ab_metadata_unconfirmed');
 const url=new URL('https://www.googleapis.com/youtube/v3/videos');url.search=new URLSearchParams({part:'snippet,statistics',id:videoId}).toString();
 const data=await json(await originalFetch(url.href,{cache:'no-store',redirect:'error',headers:{Authorization:'Bearer '+token}}));
 if(!object(data)||data.kind!=='youtube#videoListResponse'||!Array.isArray(data.items)||data.items.length>1||data.nextPageToken)throw Error('ab_metadata_unconfirmed');
 if(!data.items.length)return null;const video=data.items[0];if(!object(video)||video.kind!=='youtube#video'||video.id!==videoId)throw Error('ab_metadata_unconfirmed');return video;
}
export async function publishAbTitleOriginal(token:string,payload:AbTitlePayload,userId?:string):Promise<{ok:boolean;status:number}>{
 // Called only after the fresh admission ACK. Once entered,the same fetch/body
 // remains with its caller's mandatory SQL producer after HTTP retirement.
 const originalFetch=abFixtureFetch(userId,token,fetch);if(!token||token.length>8192||/[\r\n]/.test(token))throw Error('ab_metadata_unconfirmed');
 const response=await originalFetch('https://www.googleapis.com/youtube/v3/videos?part=snippet',{method:'PUT',cache:'no-store',redirect:'error',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({id:payload.id,snippet:payload.snippet})});
 if(response.status!==200||!response.ok){if(response.body)await bodyText(response);return{ok:false,status:response.status};}
 const value=await json(response);if(!object(value)||value.kind!=='youtube#video'||value.id!==payload.id||!object(value.snippet))return{ok:false,status:503};const s=value.snippet,p=payload.snippet;
 const matches=s.channelId===payload.channelId&&s.title===p.title&&s.description===p.description&&s.categoryId===p.categoryId&&Array.isArray(s.tags)&&s.tags.length===p.tags.length&&s.tags.every((v,i)=>v===p.tags[i])&&s.defaultLanguage===p.defaultLanguage;
 return{ok:matches,status:matches?200:503};
}
export function reportedAbViews(video:Record<string,unknown>):number|null{if(!object(video.statistics)||typeof video.statistics.viewCount!=='string'||!/^\d+$/.test(video.statistics.viewCount))return null;const v=Number(video.statistics.viewCount);return Number.isSafeInteger(v)&&v>=0&&v<=2147483647?v:null;}
