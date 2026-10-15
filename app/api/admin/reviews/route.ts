import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth-guards';
import { authorizeNativeAdminReviews, checkNativeAdminReviews, closeNativeAdminReviews, readNativeAdminReviews, type NativeAdminReviews } from '@/lib/admin-reviews-native-authorization';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// GET — lista completa de reseñas de todos los estados, más recientes primero.
export async function GET(request: Request) {
  const startedAt = Date.now(), deadline = performance.now() + 25_000, signal = request.signal, controller = new AbortController();
  const cookie = request.headers.get('cookie'), captured = { signal: controller.signal, headers: new Headers(cookie ? { cookie } : {}) } as Request;
  // Correlation only; headers cannot choose the native admin or originate a grant.
  const readRef = request.headers.get('X-YTV-Read-Ref');
  let retired = false, rejectWait!: (error: Error) => void, original: NativeAdminReviews | null = null;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; }); void stopped.catch(() => {});
  const retire = () => { if (!retired) { retired = true; controller.abort(); rejectWait(Error('Admin reviews unconfirmed')); } };
  const timer = setTimeout(retire, 25_000); signal.addEventListener('abort', retire, { once: true });
  const check = () => { if (signal.aborted || Date.now() < startedAt || Date.now() >= startedAt + 25_000 || performance.now() >= deadline) retire(); if (retired) throw Error('Admin reviews unconfirmed'); if (original) checkNativeAdminReviews(original); };
  const run = async <T,>(operation: () => Promise<T>) => { check(); const pending = Promise.resolve().then(() => { check(); return operation(); }); void pending.catch(() => {}); const value = await Promise.race([pending, stopped]); check(); return value; };
  const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
  try {
    if (readRef !== null && !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(readRef)) throw Error('Admin reviews unconfirmed');
    const gate = await run(() => requireAdmin()); if (!gate.ok) return gate.response;
    original = await run(() => authorizeNativeAdminReviews(captured)); if (!original) return json({ error: 'No autorizado' }, 403);
    const result = await run(() => readNativeAdminReviews(original!));
    check();
    const value = readRef === null ? { reviews: result.reviews } : { ...result, adminReviewsRead: { ...result.adminReviewsRead, readRef } };
    const response = json(value); check(); return response;
  } catch { return json({ error: 'admin_reviews_unconfirmed' }, 503); }
  finally { clearTimeout(timer); signal.removeEventListener('abort', retire); if (original) closeNativeAdminReviews(original); controller.abort(); }
}

// PATCH — aprobar o rechazar mediante su propio original nativo.
export async function PATCH(request:Request){
  const startedAt=Date.now(),deadline=performance.now()+25000,signal=request.signal,controller=new AbortController();
  let native:typeof import('@/lib/admin-review-moderation-native')|null=null,original:import('@/lib/admin-review-moderation-native').NativeAdminReviewModeration|null=null;
  let reader:ReadableStreamDefaultReader<Uint8Array>|undefined,retired=false,rejectWait!:(error:Error)=>void;
  const stopped=new Promise<never>((_,reject)=>{rejectWait=reject;});void stopped.catch(()=>{});
  const retire=()=>{if(retired)return;retired=true;controller.abort();rejectWait(Error('Admin review moderation unconfirmed'));if(reader)void reader.cancel().catch(()=>{});};
  const timer=setTimeout(retire,25000);signal.addEventListener('abort',retire,{once:true});
  const check=()=>{if(signal.aborted||Date.now()<startedAt||Date.now()>=startedAt+25000||performance.now()>=deadline)retire();if(retired)throw Error('Admin review moderation unconfirmed');if(original&&native)native.checkNativeAdminReviewModeration(original);};
  const run=async<T,>(fn:()=>Promise<T>)=>{check();const pending=Promise.resolve().then(()=>{check();return fn();});void pending.catch(()=>{});const value=await Promise.race([pending,stopped]);check();return value;};
  const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
  const invalid=()=>json({error:'invalid_admin_review_moderation'},400);
  try{
    // Capture the original stream and all ingress values before the first yield.
    const cookie=request.headers.get('cookie'),origin=request.headers.get('origin'),commandRef=request.headers.get('X-YTV-Review-Command'),type=request.headers.get('content-type'),length=request.headers.get('content-length'),url=request.url;
    reader=request.body?.getReader();
    if(!reader||type?.split(';')[0].trim().toLowerCase()!=='application/json'||!commandRef||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(commandRef)||length!==null&&(!/^\d+$/.test(length)||Number(length)>4096))return invalid();
    const headers=new Headers(cookie?{cookie}:{});if(origin)headers.set('origin',origin);
    const captured=new Request(url,{method:'PATCH',headers,signal:controller.signal});
    const gate=await run(()=>requireAdmin());if(!gate.ok)return gate.response;
    native=await run(()=>import('@/lib/admin-review-moderation-native'));
    let text='',size=0;const decoder=new TextDecoder('utf-8',{fatal:true});
    while(true){const chunk=await run(()=>reader!.read());if(chunk.done)break;size+=chunk.value.byteLength;if(size>4096)return invalid();try{text+=decoder.decode(chunk.value,{stream:true});}catch{return invalid();}}
    let input:unknown;try{text+=decoder.decode();input=JSON.parse(text);}catch{return invalid();}check();
    const command=native.adminReviewModerationInput(input);if(!command)return invalid();
    original=await run(()=>native!.authorizeNativeAdminReviewModeration(captured,command,commandRef));if(!original)return json({error:'No autorizado'},403);
    const result=await run(()=>native!.applyNativeAdminReviewModeration(original!));
    const response=json(result);check();native.confirmNativeAdminReviewModeration(original);check();return response;
  }catch{return json({error:'admin_review_moderation_unconfirmed'},503);}
  finally{clearTimeout(timer);signal.removeEventListener('abort',retire);if(original&&native)native.closeNativeAdminReviewModeration(original);controller.abort();if(reader)void reader.cancel().catch(()=>{});}
}
