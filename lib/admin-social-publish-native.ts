import { readNativeSessionCookie } from '@/auth';
import { prisma } from '@/lib/prisma';
import { ADMIN_EMAIL } from '@/lib/admin-email';

declare const nativeAdminSocialPublish: unique symbol;
declare const nativeAdminSocialDraft: unique symbol;
export type NativeAdminSocialPublish={readonly[nativeAdminSocialPublish]:true};
export type NativeAdminSocialDraft={readonly[nativeAdminSocialDraft]:true};
type Platform='facebook'|'instagram';
type Slot='morning'|'evening';
type Own={request:Request;url:string;cookie:string;commandRef:string;origin:string;contentType:string;config:string;adminConfig:string|undefined;secret:string|undefined;
  actorId:string;email:string;sessionRef:string;verifiedAt:number;type:Slot;at:number;until:number;started:number;deadline:number;closed:boolean;promise?:Promise<unknown>};
type Context={actorId:string;email:string;sessionRef:string;verifiedAt:Date;commandRef:string;type:Slot;platform:Platform;at:number;checkBeforeDispatch:()=>void;validateBeforeDispatch:()=>Promise<void>};
type Draft={own:Own;platform:Platform;check:()=>void;promise?:Promise<unknown>};
const originals=new WeakMap<object,Own>(),requests=new WeakMap<Request,Promise<NativeAdminSocialPublish|null>>(),drafts=new WeakMap<object,Draft>();
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
function check(own:Own){
  if(own.closed||own.request.signal.aborted||Date.now()<own.at||Date.now()>=own.until||performance.now()<own.started||performance.now()>=own.deadline
    ||(process.env.AUTH_URL??process.env.NEXTAUTH_URL)!==own.config||process.env.ADMIN_EMAIL!==own.adminConfig||process.env.AUTH_SECRET!==own.secret
    ||own.request.method!=='POST'||own.request.url!==own.url||own.request.headers.get('cookie')!==own.cookie||own.request.headers.get('origin')!==own.origin
    ||own.request.headers.get('content-type')!==own.contentType||own.request.headers.get('x-ytv-social-publish-command')!==own.commandRef
    ||own.request.headers.has('x-ytv-social-preview-command')||own.request.headers.has('x-ytv-resume')||own.request.headers.has('x-ytv-recovery'))throw Error('social_publish_unconfirmed');
}
async function checkAccount(own:Own){
  check(own);const row=await prisma.user.findUnique({where:{id:own.actorId},select:{id:true,email:true,emailVerified:true}});check(own);
  if(!row||row.id!==own.actorId||row.email!==own.email||!(row.emailVerified instanceof Date)||row.emailVerified.getTime()!==own.verifiedAt)throw Error('social_publish_unconfirmed');
}

// This issuer admits only the live native admin POST and its draft children.
// It grants no publication, image, upload or response ACK. A later producer must
// own its source/INSERT/model/completion ACKs; no row or command can replace them.
export function authorizeNativeAdminSocialPublish(request:Request):Promise<NativeAdminSocialPublish|null>{
  const prior=requests.get(request);if(prior)return prior;
  const promise=(async()=>{try{
    const at=Date.now(),started=performance.now(),config=process.env.AUTH_URL??process.env.NEXTAUTH_URL,adminConfig=process.env.ADMIN_EMAIL,secret=process.env.AUTH_SECRET;
    const cookie=request.headers.get('cookie'),commandRef=request.headers.get('x-ytv-social-publish-command'),contentType=request.headers.get('content-type'),headerOrigin=request.headers.get('origin');
    if(!config||!cookie||!uuid(commandRef)||!contentType||!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType)||request.signal.aborted||request.bodyUsed||request.method!=='POST'
      ||!ADMIN_EMAIL||ADMIN_EMAIL.length>254||!/^[^\s@,;<>"\x00-\x1f\x7f]+@[^\s@,;<>"\x00-\x1f\x7f]+\.[^\s@,;<>"\x00-\x1f\x7f]+$/.test(ADMIN_EMAIL))return null;
    const origin=new URL(config),url=new URL(request.url);
    if(origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash||origin.protocol!=='https:'&&!(origin.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(origin.hostname))
      ||url.origin!==origin.origin||url.pathname!=='/api/agent/run'||url.search||url.hash||headerOrigin!==origin.origin||request.headers.has('x-ytv-social-preview-command')||request.headers.has('x-ytv-resume')||request.headers.has('x-ytv-recovery'))return null;
    const length=request.headers.get('content-length');if(length&&(!/^\d+$/.test(length)||Number(length)>1024))return null;
    const body=await request.text();if(new TextEncoder().encode(body).length>1024)return null;const input=JSON.parse(body);
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).sort().join(',')!=='action,type'||input.action!=='publish'||!['morning','evening'].includes(input.type))return null;
    const unchanged=()=>!request.signal.aborted&&Date.now()>=at&&Date.now()<at+55000&&performance.now()>=started&&performance.now()<started+55000
      &&(process.env.AUTH_URL??process.env.NEXTAUTH_URL)===config&&process.env.ADMIN_EMAIL===adminConfig&&process.env.AUTH_SECRET===secret
      &&request.headers.get('cookie')===cookie&&request.headers.get('x-ytv-social-publish-command')===commandRef;
    if(!unchanged())return null;
    const decoded=await readNativeSessionCookie(new Request(new URL('/api/auth/session',origin.origin),{headers:{cookie},signal:request.signal}));
    if(!decoded||typeof decoded!=='object'||Array.isArray(decoded)||!unchanged())return null;const{id,sub,email,authSessionRef,iat,exp,isAdmin,requiresVerification,requiresTotp}=decoded;
    if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(id)||sub!==id||email!==ADMIN_EMAIL||!uuid(authSessionRef)||isAdmin!==true||requiresVerification!==false||requiresTotp!==false
      ||typeof iat!=='number'||!Number.isSafeInteger(iat)||iat<0||iat>Date.now()/1000||typeof exp!=='number'||!Number.isSafeInteger(exp)||!Number.isSafeInteger(exp*1000)||iat>=exp||exp*1000<=Date.now())return null;
    const own:Own={request,url:request.url,cookie,commandRef,origin:origin.origin,contentType,config,adminConfig,secret,actorId:id,email,sessionRef:authSessionRef,verifiedAt:0,type:input.type,at,until:Math.min(at+55000,exp*1000),started,deadline:started+55000,closed:false};
    check(own);const row=await prisma.user.findUnique({where:{id},select:{id:true,email:true,emailVerified:true}});check(own);
    if(!row||row.id!==id||row.email!==email||!(row.emailVerified instanceof Date)||!Number.isFinite(row.emailVerified.getTime())||row.emailVerified.getTime()<0||row.emailVerified.getTime()>at)return null;
    own.verifiedAt=row.emailVerified.getTime();const cap=Object.freeze({})as NativeAdminSocialPublish;originals.set(cap,own);return cap;
  }catch{return null;}})();requests.set(request,promise);return promise;
}

export function runNativeAdminSocialPublish<T>(original:NativeAdminSocialPublish|undefined,run:(issueDraft:(platform:Platform)=>NativeAdminSocialDraft)=>Promise<T>):Promise<T>{
  const own=original&&originals.get(original);if(!own)return Promise.reject(Error('social_publish_unconfirmed'));
  return (own.promise??=Promise.resolve().then(async()=>{
    let retired=false;const issued=new Set<Platform>(),live=()=>{check(own);if(retired)throw Error('social_publish_unconfirmed');};
    const issueDraft=(platform:Platform)=>{live();if(!['facebook','instagram'].includes(platform)||issued.has(platform))throw Error('social_publish_unconfirmed');issued.add(platform);
      const child=Object.freeze({})as NativeAdminSocialDraft;drafts.set(child,{own,platform,check:live});return child;};
    try{await checkAccount(own);const result=await run(issueDraft);await checkAccount(own);return result;}
    finally{retired=true;}
  }))as Promise<T>;
}
export function runNativeAdminSocialDraft<T>(original:NativeAdminSocialDraft|undefined,platform:Platform,type:Slot,run:(context:Context)=>Promise<T>):Promise<T>{
  const child=original&&drafts.get(original);if(!child||child.platform!==platform||child.own.type!==type)return Promise.reject(Error('social_publish_unconfirmed'));
  return (child.promise??=Promise.resolve().then(async()=>{
    const own=child.own,validateBeforeDispatch=async()=>{child.check();await checkAccount(own);child.check();};
    await validateBeforeDispatch();const result=await run({actorId:own.actorId,email:own.email,sessionRef:own.sessionRef,verifiedAt:new Date(own.verifiedAt),commandRef:own.commandRef,type:own.type,platform:child.platform,at:own.at,checkBeforeDispatch:child.check,validateBeforeDispatch});
    await validateBeforeDispatch();return result;
  }))as Promise<T>;
}
export function closeNativeAdminSocialPublish(original:NativeAdminSocialPublish){const own=originals.get(original);if(own)own.closed=true;}
