import { readNativeSessionCookie } from '@/auth';
import { prisma } from '@/lib/prisma';
import { ADMIN_EMAIL } from '@/lib/admin-email';
import { decodeSocialState } from '@/lib/admin-social-state-data';
const requests=new WeakMap<Request,Promise<Response>>();
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const denied=()=>Response.json({error:'social_state_unconfirmed'},{status:403,headers:{'Cache-Control':'no-store'}});
const unavailable=()=>Response.json({error:'social_state_unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});
// The WeakMap joins only this live Request. DTOs,hashes and dates cannot adopt it.
export function handleAdminSocialState(request: Request): Promise<Response> {
  const previous = requests.get(request);
  if (previous) return previous;
  const promise = (async () => {
    const at = Date.now(), started = performance.now(), config = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
    const adminConfig = process.env.ADMIN_EMAIL, secret = process.env.AUTH_SECRET;
    const cookie = request.headers.get('cookie'), readRef = request.headers.get('x-ytv-read-ref');
    const headerOrigin = request.headers.get('origin'), url = request.url;
    const integrationNames = ['YOUTUBE_API_KEY','YOUTUBE_CHANNEL_ID','GMAIL_READ_ENABLED','GMAIL_READ_MAILBOX','GMAIL_CLIENT_ID','GMAIL_CLIENT_SECRET','GMAIL_REFRESH_TOKEN','META_PAGE_ID','META_PAGE_ACCESS_TOKEN','INSTAGRAM_ACCOUNT_ID','INSTAGRAM_ACCESS_TOKEN'] as const;
    const integration = Object.fromEntries(integrationNames.map(k=>[k,process.env[k]]));
    let until = at + 25000, retired = false, timer: ReturnType<typeof setTimeout> | undefined, rejectStop!: (error: Error) => void;
    const stopped = new Promise<never>((_, reject) => { rejectStop = reject; });
    void stopped.catch(() => {});
    const retire = () => { if (retired) return; retired = true; clearTimeout(timer); rejectStop(Error('social_state_unconfirmed')); };
    const check = () => {
      if (retired || request.signal.aborted || Date.now() < at || Date.now() >= until || performance.now() < started || performance.now() >= started + 25000
        || (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL) !== config || process.env.ADMIN_EMAIL !== adminConfig || process.env.AUTH_SECRET !== secret
        || request.method !== 'GET' || request.url !== url || request.headers.get('cookie') !== cookie || request.headers.get('origin') !== headerOrigin
        || request.headers.get('x-ytv-read-ref') !== readRef || integrationNames.some(k=>process.env[k]!==integration[k])
        || ['x-ytv-resume','x-ytv-recovery','x-ytv-social-messages-command','x-ytv-social-preview-command','x-ytv-social-publish-command'].some(key => request.headers.has(key))) throw Error('social_state_unconfirmed');
    };
    const arm = () => { clearTimeout(timer); timer = setTimeout(retire, Math.max(0, Math.min(until - Date.now(), started + 25000 - performance.now()))); };
    const wait = async <T,>(run: () => Promise<T>): Promise<T> => {
      check();
      // Retiring the HTTP waiter does not cancel or replace an issued native IO.
      const pending = Promise.resolve().then(() => { check(); return run(); });
      void pending.catch(() => {});
      const value = await Promise.race([pending, stopped]); check(); return value;
    };
    request.signal.addEventListener('abort', retire, { once: true });
    arm();
    try {
      if (request.method !== 'GET' || request.signal.aborted || !config || !cookie || !uuid(readRef) || request.body || !ADMIN_EMAIL) return denied();
      check();
      const origin = new URL(config), target = new URL(url);
      if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash
        || origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(origin.hostname))
        || target.origin !== origin.origin || target.pathname !== '/api/admin/social' || target.search || target.hash
        || headerOrigin !== null && headerOrigin !== origin.origin || request.headers.has('authorization')) return denied();
      const native = await wait(() => readNativeSessionCookie(new Request(new URL('/api/auth/session', origin.origin), { headers: { cookie }, signal: request.signal })));
      if (!native || typeof native !== 'object' || Array.isArray(native)) return denied();
      const { id, sub, email, authSessionRef, iat, exp, isAdmin, requiresVerification, requiresTotp } = native;
      if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id) || sub !== id || email !== ADMIN_EMAIL || !uuid(authSessionRef)
        || isAdmin !== true || requiresVerification !== false || requiresTotp !== false
        || typeof iat !== 'number' || !Number.isSafeInteger(iat) || iat < 0 || iat > Date.now() / 1000
        || typeof exp !== 'number' || !Number.isSafeInteger(exp) || !Number.isSafeInteger(exp * 1000) || iat >= exp || exp * 1000 <= Date.now()) return denied();
      until = Math.min(until, exp * 1000); arm(); check();
      const account = await wait(() => prisma.user.findUnique({ where: { id }, select: { id: true, email: true, emailVerified: true } }));
      if (!account || account.id !== id || account.email !== email || !(account.emailVerified instanceof Date)
        || !Number.isFinite(account.emailVerified.getTime()) || account.emailVerified.getTime() < 0 || account.emailVerified.getTime() > at) return denied();
      const verifiedAt = account.emailVerified.getTime();
      check();
      const [posts,messages] = await wait(()=>Promise.all([
        prisma.socialPost.findMany({orderBy:{createdAt:'desc'},take:20,select:{id:true,platform:true,content:true,status:true,errorMsg:true,createdAt:true}}),
        prisma.socialMessage.findMany({orderBy:{receivedAt:'desc'},take:20,select:{id:true,platform:true,fromUser:true,content:true,externalId:true,receivedAt:true,replied:true}}),
      ]));
      const current = await wait(()=>prisma.user.findUnique({where:{id},select:{id:true,email:true,emailVerified:true}}));
      if(!current||current.id!==id||current.email!==email||!(current.emailVerified instanceof Date)||current.emailVerified.getTime()!==verifiedAt)return denied();
      check();
      const credential=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=8192&&v.trim()===v&&!/[\x00-\x1f\x7f]/.test(v);
      const mailbox=integration.GMAIL_READ_MAILBOX;
      const gmail=integration.GMAIL_READ_ENABLED!=='true'?'disabled':typeof mailbox==='string'&&mailbox.length<=254
        &&/^[a-z0-9.!#$%&'*+\/=?^_\x60{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(mailbox)
        &&credential(integration.GMAIL_CLIENT_ID)&&credential(integration.GMAIL_CLIENT_SECRET)&&credential(integration.GMAIL_REFRESH_TOKEN)?'configured':'not-configured';
      const configured=(...keys:string[])=>keys.every(k=>credential(integration[k]))?'configured':'not-configured';
      const data=JSON.parse(JSON.stringify({posts,messages,status:{youtube:configured('YOUTUBE_API_KEY','YOUTUBE_CHANNEL_ID'),gmail,
        facebook:configured('META_PAGE_ID','META_PAGE_ACCESS_TOKEN'),instagram:configured('INSTAGRAM_ACCOUNT_ID','INSTAGRAM_ACCESS_TOKEN'),tiktok:'manual',twitter:'manual'},
        quality:'stored-history-configuration-only-no-provider-health',socialStateRead:{readRef,userId:id,email,sessionRef:authSessionRef,asOf:at,expiresAt:until}}));
      decodeSocialState(data);check();
      const raw=JSON.stringify(data);if(new TextEncoder().encode(raw).byteLength>1048576)return unavailable();
      const response=new Response(raw,{headers:{'Cache-Control':'no-store','Content-Type':'application/json'}});check();return response;
    }catch{return unavailable();}
    finally{retire();request.signal.removeEventListener('abort',retire);}
  })();requests.set(request,promise);return promise;
}
