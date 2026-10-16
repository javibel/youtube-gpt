import { abFixtureFetch } from '@/lib/migration/ab-fixture.cjs';
import { randomUUID } from 'node:crypto';
import { readNativeSessionCookie } from '@/auth';
import { prisma } from '@/lib/prisma';
import { selectionObject as objectValue,selectionId,selectionChannel,abSelectionSource,abSelection,type AbSelection } from '@/lib/ab-selection-contract';

const identifier = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const sessionRef = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const email = (v: unknown): v is string => typeof v === 'string' && v.length <= 254 && v === v.trim().toLowerCase()
  && /^[^\s@,;<>"\x00-\x1f\x7f]+@[^\s@,;<>"\x00-\x1f\x7f]+\.[^\s@,;<>"\x00-\x1f\x7f]+$/.test(v);
const date = (v: unknown): v is Date => v instanceof Date && Number.isFinite(v.getTime()) && v.getTime() >= 0;
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function fail(reason = 'ab_selection_unconfirmed'): never { throw Error(reason); }

// Only the incoming encrypted cookie and unchanged native account/token
// establish this read. A returned selection never authorizes a writer.
export async function readAbSelectionOriginal(request: Request): Promise<Response> {
  const requestedAt = Date.now(), deadline = performance.now() + 25_000, commandRef = randomUUID();
  const configured = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  const cookie = request.headers.get('cookie'), incomingOrigin = request.headers.get('origin');
  const readRef = request.headers.get('X-YTV-Read-Ref');
  const nativeFetch = fetch;
  const bearer = request.headers.has('authorization'), url = new URL(request.url);
  const controller = new AbortController();
  let expiresAt = requestedAt + 25_000, retired = false, rejectStop!: (e: Error) => void;
  const stopped = new Promise<never>((_, reject) => { rejectStop = reject; }); void stopped.catch(() => {});
  const retire = () => { if (!retired) { retired = true; controller.abort(); rejectStop(Error('ab_selection_unconfirmed')); } };
  const check = () => {
    if (retired || request.signal.aborted || Date.now() < requestedAt || Date.now() >= expiresAt || performance.now() >= deadline
      || (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL) !== configured) { retire(); fail(); }
  };
  const step = async <T>(read: () => Promise<T>): Promise<T> => {
    check(); const original = Promise.resolve().then(() => { check(); return read(); }); void original.catch(() => {});
    const value = await Promise.race([original, stopped]); check(); return value;
  };
  let timer = setTimeout(retire, 25_000);
  request.signal.addEventListener('abort', retire, { once: true });
  const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
  try {
    check();
    if (request.method !== 'GET' || url.pathname !== '/api/youtube/ab-test/selection' || url.search || url.hash
      || request.headers.has('x-ytv-recovery') || request.headers.has('x-ytv-resume') || !sessionRef(readRef)) fail('invalid_input');
    if (!configured || !cookie || bearer) fail('unauthorized');
    const origin = new URL(configured);
    if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash
      || origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname))
      || url.origin !== origin.origin || incomingOrigin !== null && incomingOrigin !== origin.origin) fail('unauthorized');
    const decoded = await step(() => readNativeSessionCookie(new Request(new URL('/api/auth/session', origin.origin), {
      headers: { cookie }, signal: controller.signal,
    })));
    if (!object(decoded)) fail('unauthorized');
    const { id, sub, email: address, authSessionRef, iat, exp, requiresVerification, requiresTotp } = decoded;
    if (!identifier(id) || sub !== id || !email(address) || !sessionRef(authSessionRef) || requiresVerification !== false || requiresTotp !== false
      || typeof iat !== 'number' || !Number.isSafeInteger(iat) || iat < 0 || iat > requestedAt / 1000
      || typeof exp !== 'number' || !Number.isSafeInteger(exp) || !Number.isSafeInteger(exp * 1000) || exp <= iat || exp * 1000 <= Date.now()) fail('unauthorized');
    expiresAt = Math.min(expiresAt, exp * 1000); check();
    clearTimeout(timer); timer = setTimeout(retire, Math.max(0, Math.min(expiresAt - Date.now(), deadline - performance.now())));
    const account = () => step(() => prisma.user.findUnique({ where: { id }, select: { id: true, email: true, emailVerified: true } }));
    const owner = await account();
    if (!owner || owner.id !== id || owner.email !== address || !date(owner.emailVerified) || owner.emailVerified.getTime() > Date.now()) fail('unauthorized');
    const verifiedAt = owner.emailVerified.getTime();
    const current = async () => {
      const value = await account();
      if (!value || value.id !== id || value.email !== address || !date(value.emailVerified) || value.emailVerified.getTime() !== verifiedAt) fail('unauthorized');
      check();
    };
    const tokenRead = () => step(() => prisma.youtubeToken.findUnique({where:{userId:id},select:{id:true,userId:true,channelId:true,accessToken:true,expiresAt:true}}));
    const yt = await tokenRead();
    const selected: AbSelection = {connected:yt !== null,channelId:null,videos:[],selectedVideoIds:[],unavailableVideoIds:[],hasMore:false};
    let tokenExpiresAt: number | null = null;
    if (yt !== null) {
      if (!identifier(yt.id) || yt.userId !== id || !selectionChannel(yt.channelId) || !text(yt.accessToken,8192) || !yt.accessToken || /[\r\n]/.test(yt.accessToken)
        || !date(yt.expiresAt) || yt.expiresAt.getTime() <= Date.now()) fail();
      const token = yt.accessToken, channelId = yt.channelId, tokenId = yt.id;
      tokenExpiresAt = yt.expiresAt.getTime(); expiresAt = Math.min(expiresAt,tokenExpiresAt); selected.channelId = channelId;
      clearTimeout(timer); timer = setTimeout(retire,Math.max(0,Math.min(expiresAt-Date.now(),deadline-performance.now()))); check();
      const stillNative = async () => {
        await current(); const t = await tokenRead();
        if (!t || t.id !== tokenId || t.userId !== id || t.channelId !== channelId || t.accessToken !== token || !date(t.expiresAt) || t.expiresAt.getTime() !== tokenExpiresAt) fail();
        check();
      };
      const sourceFetch=abFixtureFetch(id,token,nativeFetch);
      const source = async (path: string, params: Record<string,string>) => {
        await stillNative(); const endpoint = new URL(path,'https://www.googleapis.com'); endpoint.search = new URLSearchParams(params).toString();
        const response = await step(() => sourceFetch(endpoint.href,{headers:{Authorization:'Bearer '+token},cache:'no-store',redirect:'error',signal:controller.signal}));
        if (response.status !== 200 || !response.ok || response.redirected || !/^application\/json(?:;|$)/i.test(response.headers.get('content-type') ?? '') || !response.body) fail();
        const reader=response.body.getReader(), decoder=new TextDecoder('utf-8',{fatal:true}); let bytes=0,body='';
        try { for (;;) { const part=await step(() => reader.read()); if(part.done)break; bytes+=part.value.byteLength; if(bytes>1048576)fail(); body+=decoder.decode(part.value,{stream:true}); } body+=decoder.decode(); }
        finally { void reader.cancel().catch(() => {}); }
        return objectValue(JSON.parse(body));
      };
      // Match the captured token's actor with its own uploads playlist before
      // selecting resources. No refresh, cached fallback or credential writes.
      const mine=await source('/youtube/v3/channels',{part:'contentDetails',mine:'true',maxResults:'50'});
      if(mine.kind!=='youtube#channelListResponse'||!Array.isArray(mine.items)||mine.items.length>50||mine.nextPageToken)fail();
      const matches=mine.items.map(objectValue).filter(c=>c.id===channelId);
      if(matches.length!==1||matches[0].kind!=='youtube#channel')fail();
      const playlistId=objectValue(objectValue(matches[0].contentDetails).relatedPlaylists).uploads;
      if(typeof playlistId!=='string'||!/^[A-Za-z0-9_-]{2,128}$/.test(playlistId))fail();
      const page=await source('/youtube/v3/playlistItems',{part:'snippet,contentDetails',playlistId,maxResults:'20'});
      if(page.kind!=='youtube#playlistItemListResponse'||!Array.isArray(page.items)||page.items.length>20||page.nextPageToken!==undefined&&(typeof page.nextPageToken!=='string'||!page.nextPageToken||page.nextPageToken.length>500))fail();
      selected.hasMore=!!page.nextPageToken;
      const ids=page.items.map(item=>{const v=objectValue(item),s=objectValue(v.snippet),r=objectValue(s.resourceId),d=objectValue(v.contentDetails);
        if(v.kind!=='youtube#playlistItem'||s.channelId!==channelId||s.playlistId!==playlistId||r.kind!=='youtube#video'||!selectionId(d.videoId)||r.videoId!==d.videoId)fail();return d.videoId;});
      if(new Set(ids).size!==ids.length)fail(); selected.selectedVideoIds=ids;
      if(ids.length){const details=await source('/youtube/v3/videos',{part:'snippet,statistics',id:ids.join(',')});
        if(details.kind!=='youtube#videoListResponse'||!Array.isArray(details.items)||details.items.length>ids.length||details.nextPageToken)fail();
        const found=details.items.map(row=>abSelectionSource(row,channelId,requestedAt));
        if(new Set(found.map(v=>v.videoId)).size!==found.length||found.some(v=>!ids.includes(v.videoId)))fail();
        selected.videos=ids.flatMap(id=>found.filter(v=>v.videoId===id)); selected.unavailableVideoIds=ids.filter(id=>!found.some(v=>v.videoId===id));}
      await stillNative();
    } else { await current(); if(await tokenRead() !== null)fail(); }
    // These are display data, never permission for a writer or evidence of
    // operational freshness. Later actions must establish their own purpose.
    const response = json({userId:id,selection:abSelection(selected,requestedAt),selectionRead:{commandRef,readRef,email:address,sessionRef:authSessionRef,
      sessionExpiresAt:exp*1000,tokenExpiresAt,requestedAt,expiresAt,coverage:'first-up-to-20-uploads',sourceOwnership:yt?'matched-native-channel':'no-channel',operationalFreshness:'not-verified'}});
    check(); return response;
  } catch (error) {
    const reason = error instanceof Error ? error.message : '';
    return reason === 'unauthorized' ? json({ error: 'Unauthorized' }, 401)
      : reason === 'invalid_input' ? json({ error: 'invalid_input' }, 400) : json({ error: 'ab_selection_unconfirmed' }, 503);
  } finally { clearTimeout(timer); request.signal.removeEventListener('abort', retire); retire(); }
}
