import { decodePhotoFile, encodePhotoFile } from '@/lib/thumbnail-photo-draft';
// priorAiKey orders local offers only, never image ancestry or server authority.
// Retained original upload input, never a stored result URL, attestation or execution authority.
const slot=(userId:string,email:string,lang:string)=>'ytv:background-upload:original:v1:'+JSON.stringify([userId,email,lang]);
type RecordInput={key:string;file:File;topic:string;style:string;lang:string;priorAiKey:string|null};
const valid=(v:RecordInput)=>/^bg-[-A-Za-z0-9._:]{1,125}$/.test(v.key)&&typeof v.topic==='string'&&v.topic.trim()===v.topic&&v.topic.length<=500&&['viral','cinematic','minimal','bold'].includes(v.style)&&['es','en'].includes(v.lang)&&(v.priorAiKey===null||typeof v.priorAiKey==='string'&&/^bg-ai-[-A-Za-z0-9._:]{1,122}$/.test(v.priorAiKey));
export function readUploadRecovery(userId:string|undefined,email:string|null|undefined,status:string,lang:string) {
 if(status!=='authenticated'||!userId||!email||!['es','en'].includes(lang))return null;
 try{const raw=sessionStorage.getItem(slot(userId,email,lang));if(!raw||raw.length>21_010_000)return null;const v=JSON.parse(raw);
 if(v?.version!==1||Object.keys(v).sort().join(',')!=='file,key,lang,priorAiKey,style,topic,version'||!valid(v)||v.lang!==lang)return null;
 const file=decodePhotoFile(v.file,15*1024*1024);return file?{raw,key:v.key as string,file,topic:v.topic as string,style:v.style as string,lang,priorAiKey:v.priorAiKey as string|null}:null;
 }catch{return null;}
}
export function clearUploadRecovery(userId:string,email:string,lang:string,raw:string) {
 try{const name=slot(userId,email,lang);if(sessionStorage.getItem(name)!==raw)return false;sessionStorage.removeItem(name);return sessionStorage.getItem(name)===null;}catch{return false;}
}
export async function storeUploadRecovery(userId:string,email:string,record:RecordInput,signal:AbortSignal):Promise<string|null> {
 if(!userId||!email||!valid(record)||!['image/png','image/jpeg','image/webp'].includes(record.file.type)||!record.file.size||record.file.size>15*1024*1024||signal.aborted)return null;
 let timeout:ReturnType<typeof setTimeout>|undefined,abort:()=>void=()=>{};
 try{const name=slot(userId,email,record.lang),expected=sessionStorage.getItem(name);
 const interrupted=new Promise<never>((_,reject)=>{abort=()=>reject(Error('Local wait ended'));signal.addEventListener('abort',abort,{once:true});timeout=setTimeout(abort,15_000);});
 const file=await Promise.race([encodePhotoFile(record.file),interrupted]),raw=JSON.stringify({version:1,key:record.key,file,topic:record.topic,style:record.style,lang:record.lang,priorAiKey:record.priorAiKey});
 if(signal.aborted||raw.length>21_010_000||sessionStorage.getItem(name)!==expected)return null;sessionStorage.setItem(name,raw);return sessionStorage.getItem(name)===raw?raw:null;
 }catch{return null;}finally{if(timeout)clearTimeout(timeout);signal.removeEventListener('abort',abort);}
}
