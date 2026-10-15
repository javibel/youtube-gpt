import { NextResponse } from 'next/server';
import { authorizeExtensionDailyIdeas, checkExtensionDailyIdeas, readExtensionDailyIdeas, validExtensionReadRef } from '@/lib/extension-daily-ideas-native-authorization';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
export async function GET(request: Request) {
  const startedAt=Date.now(),deadline=performance.now()+25_000,signal=request.signal;
  const names=['authorization','x-ytv-read-ref','x-ytv-view-ref','x-ytv-language','x-ytv-requested-date'],headers=new Map(names.map(name=>[name,request.headers.get(name)]));
  const captured={signal,headers:{get:(name:string)=>headers.get(name.toLowerCase())??null}} as Request;
  let retired = false, rejectWait!: (error: Error) => void;
  let nativeCheck: (() => void) | undefined;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; });
  void stopped.catch(() => {});
  const retire = () => { if (!retired) { retired = true; rejectWait(Error('Extension identity unconfirmed')); } };
  const timer = setTimeout(retire, 25_000);
  signal.addEventListener('abort', retire, { once: true });
  const check = () => { if (signal.aborted || Date.now()<startedAt || performance.now() >= deadline) retire(); if (retired) throw Error('Extension identity unconfirmed'); nativeCheck?.(); };
  const run = async <T,>(operation: () => Promise<T>) => {
    check(); const original = Promise.resolve().then(() => { check(); return operation(); });
    const value = await Promise.race([original, stopped]); check(); return value;
  };
  const readRef=captured.headers.get('x-ytv-read-ref'),viewRef=captured.headers.get('x-ytv-view-ref'),language=captured.headers.get('x-ytv-language'),requestedDate=captured.headers.get('x-ytv-requested-date');
  const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  try {
    if (!validExtensionReadRef(readRef)) return json({ code: 'invalid_read_ref' }, 400);
    if((viewRef!==null||language!==null||requestedDate!==null)&&(!validExtensionReadRef(viewRef)||!['es','en'].includes(language??'')||!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate??'')))return json({code:'invalid_view',readRef},400);
    const original = await run(() => authorizeExtensionDailyIdeas(captured));
    if (!original) return json({ error:'not_logged_in',code:'not_logged_in', readRef }, 401);
    nativeCheck = () => checkExtensionDailyIdeas(original);
    check();
    const result = await run(() => readExtensionDailyIdeas(original,readRef,check,viewRef?{viewRef,language:language as 'es'|'en',requestedDate:requestedDate!}:undefined));
    check(); const response = json(result); check(); return response;
  } catch { return json({ error:'daily_ideas_unconfirmed',code:'daily_ideas_unconfirmed', readRef }, 503); }
  finally { clearTimeout(timer); signal.removeEventListener('abort', retire); }
}
