import { decodePhotoFile, encodePhotoFile } from '@/lib/thumbnail-photo-draft';
// Input for an explicit server receipt lookup. Never output, consent or execution authority.
const slot=(userId:string,email:string,lang:string)=>'ytv:removal:pending:v1:'+JSON.stringify([userId,email,lang]);
const keyValid=(key:unknown):key is string=>typeof key==='string'&&/^remove-[-A-Za-z0-9._:]{1,121}$/.test(key);
export function readRemovalRecovery(userId:string|undefined,email:string|null|undefined,status:string,lang:string) {
 if(status!=='authenticated'||!userId||!email||!['es','en'].includes(lang))return null;
 try{const raw=sessionStorage.getItem(slot(userId,email,lang));if(!raw||raw.length>14_010_000)return null;
 const v=JSON.parse(raw);if(v?.version!==1||Object.keys(v).sort().join(',')!=='file,key,version'||!keyValid(v.key))return null;
 const file=decodePhotoFile(v.file);return file?{raw,key:v.key,file}:null;}catch{return null;}
}
export function discardRemovalRecovery(userId:string,email:string,lang:string,raw:string) {
 try{const name=slot(userId,email,lang);if(sessionStorage.getItem(name)!==raw)return false;sessionStorage.removeItem(name);return sessionStorage.getItem(name)===null;}catch{return false;}
}
export async function storeRemovalRecovery(userId:string,email:string,lang:string,key:string,file:File,signal:AbortSignal):Promise<string|null> {
 if(!userId||!email||!['es','en'].includes(lang)||!keyValid(key)||!['image/png','image/jpeg','image/webp'].includes(file.type)||!file.size||file.size>10*1024*1024||signal.aborted)return null;
 let timeout:ReturnType<typeof setTimeout>|undefined,abort:()=>void=()=>{};
 try{const name=slot(userId,email,lang),expected=sessionStorage.getItem(name);
 const interrupted=new Promise<never>((_,reject)=>{abort=()=>reject(Error('Local wait ended'));signal.addEventListener('abort',abort,{once:true});timeout=setTimeout(abort,15_000);});
 const bytes=await Promise.race([encodePhotoFile(file),interrupted]),raw=JSON.stringify({version:1,key,file:bytes});
 if(signal.aborted||raw.length>14_010_000||sessionStorage.getItem(name)!==expected)return null;
 sessionStorage.setItem(name,raw);return sessionStorage.getItem(name)===raw?raw:null;
 }catch{return null;}finally{if(timeout)clearTimeout(timeout);signal.removeEventListener('abort',abort);}
}
