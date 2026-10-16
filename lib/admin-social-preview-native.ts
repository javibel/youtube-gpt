import { readNativeSessionCookie } from '@/auth';
import { prisma } from '@/lib/prisma';
import { ADMIN_EMAIL } from '@/lib/admin-email';

declare const nativeAdminSocialPreview: unique symbol;
export type NativeAdminSocialPreview={readonly[nativeAdminSocialPreview]:true};
type Preview={facebook:string;instagram:string;tiktok:null;twitter:null};
type Own={request:Request;url:string;cookie:string;commandRef:string;origin:string;headerOrigin:string;contentType:string;config:string;adminConfig:string|undefined;secret:string|undefined;
  actorId:string;email:string;sessionRef:string;verifiedAt:number;type:'morning'|'evening';at:number;until:number;started:number;deadline:number;closed:boolean;promise?:Promise<Preview>};
const originals=new WeakMap<object,Own>(),requests=new WeakMap<Request,Promise<NativeAdminSocialPreview|null>>();
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
function check(own:Own){
  if(own.closed||own.request.signal.aborted||Date.now()<own.at||Date.now()>=own.until||performance.now()<own.started||performance.now()>=own.deadline
    ||(process.env.AUTH_URL??process.env.NEXTAUTH_URL)!==own.config||process.env.ADMIN_EMAIL!==own.adminConfig||process.env.AUTH_SECRET!==own.secret
    ||own.request.method!=='POST'||own.request.url!==own.url||own.request.headers.get('cookie')!==own.cookie||own.request.headers.get('origin')!==own.headerOrigin
    ||own.request.headers.get('content-type')!==own.contentType||own.request.headers.get('x-ytv-social-preview-command')!==own.commandRef
    ||own.request.headers.has('x-ytv-resume')||own.request.headers.has('x-ytv-recovery'))throw Error('social_preview_unconfirmed');
}
const account=(id:string)=>prisma.user.findUnique({where:{id},select:{id:true,email:true,emailVerified:true}});
async function checkAccount(own:Own){check(own);const row=await account(own.actorId);check(own);if(!row||row.id!==own.actorId||row.email!==own.email||!(row.emailVerified instanceof Date)||row.emailVerified.getTime()!==own.verifiedAt)throw Error('social_preview_unconfirmed');}
export function authorizeNativeAdminSocialPreview(request:Request):Promise<NativeAdminSocialPreview|null>{
  const prior=requests.get(request);if(prior)return prior;
  const promise=(async()=>{try{
    const at=Date.now(),started=performance.now(),config=process.env.AUTH_URL??process.env.NEXTAUTH_URL,cookie=request.headers.get('cookie'),commandRef=request.headers.get('x-ytv-social-preview-command'),contentType=request.headers.get('content-type'),headerOrigin=request.headers.get('origin');
    if(!config||!cookie||!uuid(commandRef)||!contentType||!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType)||request.signal.aborted||request.bodyUsed||request.method!=='POST'||!ADMIN_EMAIL||ADMIN_EMAIL.length>254||!/^[^\s@,;<>"\x00-\x1f\x7f]+@[^\s@,;<>"\x00-\x1f\x7f]+\.[^\s@,;<>"\x00-\x1f\x7f]+$/.test(ADMIN_EMAIL))return null;
    const origin=new URL(config),url=new URL(request.url);
    if(origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash||origin.protocol!=='https:'&&!(origin.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(origin.hostname))
      ||url.origin!==origin.origin||url.pathname!=='/api/agent/run'||url.search||url.hash||headerOrigin!==origin.origin||request.headers.has('x-ytv-resume')||request.headers.has('x-ytv-recovery'))return null;
    const length=request.headers.get('content-length');if(length&&(!/^\d+$/.test(length)||Number(length)>1024))return null;
    const body=await request.text();if(new TextEncoder().encode(body).length>1024)return null;const input=JSON.parse(body);
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).sort().join(',')!=='action,type'||input.action!=='test'||!['morning','evening'].includes(input.type))return null;
    if(request.signal.aborted||Date.now()<at||Date.now()>=at+55000||performance.now()<started||performance.now()>=started+55000||(process.env.AUTH_URL??process.env.NEXTAUTH_URL)!==config||request.headers.get('cookie')!==cookie||request.headers.get('x-ytv-social-preview-command')!==commandRef)return null;
    const decoded=await readNativeSessionCookie(new Request(new URL('/api/auth/session',origin.origin),{headers:{cookie},signal:request.signal}));
    if(!decoded||typeof decoded!=='object'||Array.isArray(decoded))return null;const{id,sub,email,authSessionRef,iat,exp,isAdmin,requiresVerification,requiresTotp}=decoded;
    if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(id)||sub!==id||email!==ADMIN_EMAIL||!uuid(authSessionRef)||isAdmin!==true||requiresVerification!==false||requiresTotp!==false
      ||typeof iat!=='number'||!Number.isSafeInteger(iat)||iat<0||iat>Date.now()/1000||typeof exp!=='number'||!Number.isSafeInteger(exp)||!Number.isSafeInteger(exp*1000)||iat>=exp||exp*1000<=Date.now())return null;
    const own:Own={request,url:request.url,cookie,commandRef,origin:origin.origin,headerOrigin,contentType,config,adminConfig:process.env.ADMIN_EMAIL,secret:process.env.AUTH_SECRET,actorId:id,email,sessionRef:authSessionRef,verifiedAt:0,type:input.type,at,until:Math.min(at+55000,exp*1000),started,deadline:started+55000,closed:false};
    check(own);const row=await account(id);check(own);if(!row||row.id!==id||row.email!==email||!(row.emailVerified instanceof Date)||!Number.isFinite(row.emailVerified.getTime())||row.emailVerified.getTime()<0||row.emailVerified.getTime()>at)return null;
    own.verifiedAt=row.emailVerified.getTime();const cap=Object.freeze({})as NativeAdminSocialPreview;originals.set(cap,own);return cap;
  }catch{return null;}})();requests.set(request,promise);return promise;
}
export function runNativeAdminSocialPreview(original:NativeAdminSocialPreview|undefined,
  run:(context:{actorId:string;email:string;sessionRef:string;verifiedAt:Date;commandRef:string;type:'morning'|'evening';at:number;check:()=>void})=>Promise<Preview>):Promise<Preview>{
  const own=original&&originals.get(original);if(!own)return Promise.reject(Error('social_preview_unconfirmed'));
  return own.promise??=Promise.resolve().then(async()=>{await checkAccount(own);const result=await run({actorId:own.actorId,email:own.email,sessionRef:own.sessionRef,verifiedAt:new Date(own.verifiedAt),commandRef:own.commandRef,type:own.type,at:own.at,check:()=>check(own)});await checkAccount(own);return result;});
}
export function checkNativeAdminSocialPreview(original:NativeAdminSocialPreview){const own=original&&originals.get(original);if(!own)throw Error('social_preview_unconfirmed');check(own);}
export function closeNativeAdminSocialPreview(original:NativeAdminSocialPreview){const own=originals.get(original);if(own)own.closed=true;}
