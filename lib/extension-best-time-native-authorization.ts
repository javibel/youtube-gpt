import { prisma } from '@/lib/prisma';
import { bestTimeCache } from '@/lib/best-time-cache';

declare const bestTimeReadBrand: unique symbol;
export type ExtensionBestTimeRead = { readonly [bestTimeReadBrand]: true };
type Original = { token:string; tokenId:string; ownerId:string; email:string; tokenExpires:number; capturedAt:number; expires:number; used:boolean };
const originals = new WeakMap<object,Original>();
const lookup = (token:string) => prisma.extensionToken.findUnique({where:{token},include:{user:{select:{id:true,email:true,emailVerified:true}}}});
function eligible(row:Awaited<ReturnType<typeof lookup>>,token:string) {
 const now=Date.now();
 return !!row&&row.token===token&&typeof row.id==='string'&&row.id.length>0&&row.id.length<=128&&!!row.user
  &&typeof row.user.id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(row.user.id)&&row.userId===row.user.id
  &&typeof row.user.email==='string'&&row.user.email.length<=254&&row.user.email===row.user.email.trim().toLowerCase()
  &&/^[^\s@,;<>"\x00-\x1f\x7f]+@[^\s@,;<>"\x00-\x1f\x7f]+\.[^\s@,;<>"\x00-\x1f\x7f]+$/.test(row.user.email)
  &&row.expiresAt instanceof Date&&Number.isFinite(row.expiresAt.getTime())&&row.expiresAt.getTime()>now
  &&row.user.emailVerified instanceof Date&&Number.isFinite(row.user.emailVerified.getTime())&&row.user.emailVerified.getTime()<=now;
}
export const validBestTimeReadRef = (v:unknown):v is string => typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
export async function authorizeExtensionBestTimeRead(request:Request):Promise<ExtensionBestTimeRead|null> {
 const capturedAt=Date.now(),header=request.headers.get('Authorization');
 if(!Number.isSafeInteger(capturedAt)||capturedAt<0||!header||!/^Bearer [a-f0-9]{64}$/.test(header))return null;
 const token=header.slice(7),row=await lookup(token);
 if(!eligible(row,token)||!row||!row.user.email)return null;
 const tokenExpires=row.expiresAt.getTime(),expires=Math.min(tokenExpires,capturedAt+25000);
 if(expires<=Date.now())return null;
 const original=Object.freeze({}) as ExtensionBestTimeRead;
 originals.set(original,{token,tokenId:row.id,ownerId:row.user.id,email:row.user.email,tokenExpires,capturedAt,expires,used:false});return original;
}
function retained(original:ExtensionBestTimeRead) {
 const own=original&&typeof original==='object'?originals.get(original):undefined;
 if(!own||own.expires<=Date.now())throw Error('Best time read unconfirmed');return own;
}
export function checkExtensionBestTimeRead(original:ExtensionBestTimeRead) {retained(original);}
export async function readExtensionBestTime(original:ExtensionBestTimeRead,readRef:string,beforeStep:()=>void) {
 const own=retained(original);if(own.used||!validBestTimeReadRef(readRef))throw Error('Best time read unconfirmed');own.used=true;
 const check=()=>{retained(original);beforeStep();};check();
 // This SQL read receipt never establishes source freshness or permission to analyze.
 const row=await prisma.bestTimeAnalysis.findUnique({where:{userId:own.ownerId},select:{userId:true,heatmap:true,topSlots:true,videoCount:true,aiTip:true,analyzedAt:true}});check();
 const stored=row===null?null:bestTimeCache(row,own.ownerId);
 const analyzedAt=stored===null?null:Date.parse(stored.analyzedAt);
 if(analyzedAt!==null&&(!Number.isSafeInteger(analyzedAt)||analyzedAt<0||analyzedAt>own.capturedAt))throw Error('Best time stored date unconfirmed');
 const analysisExpiresAt=analyzedAt===null?null:analyzedAt+30*86400000;
 const current=await lookup(own.token);check();
 if(!eligible(current,own.token)||!current||current.id!==own.tokenId||current.userId!==own.ownerId||current.user.email!==own.email||current.expiresAt.getTime()!==own.tokenExpires)throw Error('Best time credential changed');
 const result=Object.freeze({readRef,observedAt:new Date(own.capturedAt).toISOString(),expiresAt:own.expires,
  data:stored===null?null:Object.freeze({topSlots:stored.topSlots,aiTip:stored.aiTip,videoCount:stored.videoCount,analyzedAt:stored.analyzedAt}),
  dataQuality:Object.freeze({source:'stored-best-time-analysis' as const,freshness:'unconfirmed' as const,provenance:'unconfirmed' as const,recommendation:'unconfirmed' as const,analysisState:stored===null?'absent' as const:analysisExpiresAt!<=Date.now()?'expired' as const:'historical' as const,analysisExpiresAt})});
 check();return result;
}
