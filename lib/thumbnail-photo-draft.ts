import type { PhotoItem } from '@/lib/thumbnail-types';
// Local editable bytes/layout, never a removal receipt, source attestation or credit entitlement.
type Geometry = Omit<PhotoItem,'src'>;
export type StoredPhotoDraft = { raw:string;originalFile:File;displayFile:File;geometry:Geometry };
const maximumFile=10*1024*1024,maximumRecord=28_000_000;
const slot=(userId:string,email:string,lang:string)=>'ytv:thumbnail-photo-draft:v1:'+JSON.stringify([userId,email,lang]);
const allowed=(userId:string|undefined,email:string|null|undefined,status:string,lang:string)=>status==='authenticated'&&!!userId&&!!email&&['es','en'].includes(lang);
function geometry(v:unknown):v is Geometry {
  if(!v||typeof v!=='object'||Object.keys(v).sort().join(',')!=='height,opacity,width,x,y')return false;
  const p=v as Geometry;
  return Object.values(p).every(n=>typeof n==='number'&&Number.isFinite(n))&&Math.abs(p.x)<=32768&&Math.abs(p.y)<=32768
    &&p.width>0&&p.width<=32768&&p.height>0&&p.height<=32768&&p.opacity>=0&&p.opacity<=1;
}
function file(raw:unknown):File|null {
  if(typeof raw!=='string'||raw.length>14_000_000)return null;
  const match=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(raw);
  if(!match||match[2].length%4!==0)return null;
  try{const bytes=atob(match[2]);if(!bytes.length||bytes.length>maximumFile||btoa(bytes)!==match[2])return null;
    return new File([Uint8Array.from(bytes,c=>c.charCodeAt(0))],'local-photo',{type:match[1]});}catch{return null;}
}
export function parsePhotoDraft(raw:string|null):StoredPhotoDraft|null {
  if(!raw||raw.length>maximumRecord)return null;
  try{const v=JSON.parse(raw);if(v?.version!==1||Object.keys(v).sort().join(',')!=='displayed,geometry,original,version'||!geometry(v.geometry))return null;
    const originalFile=file(v.original),displayFile=v.original===v.displayed?originalFile:file(v.displayed);
    return originalFile&&displayFile?{raw,originalFile,displayFile,geometry:v.geometry}:null;
  }catch{return null;}
}
export function readPhotoDraft(userId:string|undefined,email:string|null|undefined,status:string,lang:string) {
  if(!allowed(userId,email,status,lang))return null;
  try{return parsePhotoDraft(sessionStorage.getItem(slot(userId!,email!,lang)));}catch{return null;}
}
export function matchesPhotoDraft(userId:string,email:string,lang:string,raw:string) {
  try{return sessionStorage.getItem(slot(userId,email,lang))===raw;}catch{return false;}
}
export function discardPhotoDraft(userId:string,email:string,lang:string,raw:string) {
  try{const name=slot(userId,email,lang);if(sessionStorage.getItem(name)!==raw)return false;sessionStorage.removeItem(name);return sessionStorage.getItem(name)===null;}catch{return false;}
}
const validFile=(f:File)=>['image/png','image/jpeg','image/webp'].includes(f.type)&&f.size>0&&f.size<=maximumFile;
// Immutable File bytes are encoded once; dragging changes only the small layout record.
const encodedFiles=new WeakMap<File,Promise<string>>();
function encode(f:File):Promise<string> {
  const retained=encodedFiles.get(f);if(retained)return retained;
  const pending=(async()=>{const bytes=new Uint8Array(await f.arrayBuffer());if(bytes.length!==f.size)throw Error('Local file unavailable');
    let binary='';for(let n=0;n<bytes.length;n+=32768)binary+=String.fromCharCode(...bytes.subarray(n,n+32768));return 'data:'+f.type+';base64,'+btoa(binary);})();
  encodedFiles.set(f,pending);void pending.catch(()=>{if(encodedFiles.get(f)===pending)encodedFiles.delete(f);});return pending;
}
export async function storePhotoDraft(userId:string,email:string,lang:string,original:File,displayed:File,layout:Geometry,signal:AbortSignal,expected:string|null):Promise<string|null> {
  if(!allowed(userId,email,'authenticated',lang)||!validFile(original)||!validFile(displayed)||!geometry(layout)||signal.aborted)return null;
  let timeout:ReturnType<typeof setTimeout>|undefined,abort:()=>void=()=>{};
  try{
    const interrupted=new Promise<never>((_,reject)=>{abort=()=>reject(Error('Local wait ended'));signal.addEventListener('abort',abort,{once:true});timeout=setTimeout(abort,15_000);});
    const serialized=await Promise.race([(async()=>{const a=await encode(original),b=displayed===original?a:await encode(displayed);return JSON.stringify({version:1,original:a,displayed:b,geometry:layout});})(),interrupted]);
    if(signal.aborted||serialized.length>maximumRecord)return null;
    const name=slot(userId,email,lang);if(sessionStorage.getItem(name)!==expected)return null;sessionStorage.setItem(name,serialized);return sessionStorage.getItem(name)===serialized?serialized:null;
  }catch{return null;}finally{if(timeout)clearTimeout(timeout);signal.removeEventListener('abort',abort);}
}
