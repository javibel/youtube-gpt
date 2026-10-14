'use strict';

const API_BASE = 'https://ytubviral.com';
const FETCH_TIMEOUT_MS = 15000;
// Context binds retry keys to the current token; no token is exposed to content scripts.
let generationContext=null;
function syncGenerationContext(token){
  if(!generationContext||generationContext.token!==token)generationContext={id:crypto.randomUUID(),token,attempts:new Map()};
  return generationContext;
}
chrome.storage.onChanged.addListener((changes,area)=>{
  if(area==='local'&&Object.hasOwn(changes,'ytv_token')) { generationContext=null; identityRevision++; retireExtensionIdentity(); }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleMessage(msg)
    .then(sendResponse)
    .catch(err => sendResponse({ error: err.message || 'Unknown error', limit: err.limit }));
  return true; // keep channel open for async response
});

// Bound the entire local wait and decoded response bytes, including ignored transport aborts.
// A local abort never proves server cancellation, rollback or zero usage.
async function apiFetch(url, opts = {}) {
  const {timeoutMs=FETCH_TIMEOUT_MS,maxResponseBytes=1024*1024,signal:callerSignal,observeOriginal,...fetchOpts}=opts;
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000||!Number.isSafeInteger(maxResponseBytes)||maxResponseBytes<1||maxResponseBytes>1024*1024)throw Error('response_invalid');
  const target=new URL(url);if(target.origin!==API_BASE||!target.pathname.startsWith('/api/'))throw Error('response_invalid');
  if(callerSignal?.aborted)throw Error('timeout');
  const controller=new AbortController();let stopped=false,reader=null,responseBody=null,rejectWait;
  const interrupted=new Promise((_,reject)=>{rejectWait=reject;});
  const stop=()=>{stopped=true;controller.abort();rejectWait(Error('timeout'));};
  callerSignal?.addEventListener('abort',stop,{once:true});
  const timer=setTimeout(stop,timeoutMs);
  const cancel=()=>{try{if(reader)void reader.cancel().catch(()=>{});else void responseBody?.cancel().catch(()=>{});}catch{}};
  try{
    const work=(async()=>{
      let res;
      try{res=await fetch(url,{...fetchOpts,redirect:'error',signal:controller.signal});}
      catch{throw Error(stopped?'timeout':'network_error');}
      if(stopped){try{void res.body?.cancel().catch(()=>{});}catch{}throw Error('timeout');}
      responseBody=res.body;
      const length=res.headers.get('content-length');
      if(length!==null&&(!/^\d+$/.test(length)||Number(length)>maxResponseBytes))throw Error('response_invalid');
      const mime=(res.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
      if(!/^application\/(?:[a-z0-9.+-]*\+)?json$/.test(mime)||!res.body){
        try{void res.body?.cancel().catch(()=>{});}catch{}
        return {res,data:{}};
      }
      reader=res.body.getReader();const decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,text='';
      for(;;){
        const part=await reader.read();if(stopped)throw Error('timeout');if(part.done)break;
        bytes+=part.value.byteLength;if(bytes>maxResponseBytes)throw Error('response_invalid');
        try{text+=decoder.decode(part.value,{stream:true});}catch{throw Error('response_invalid');}
      }
      let data={};
      try{data=JSON.parse(text+decoder.decode());}catch{/* Preserve the existing non-JSON error response behavior. */}
      return {res,data};
    })();
    observeOriginal?.(work);
    return await Promise.race([work,interrupted]);
  }finally{stopped=true;clearTimeout(timer);callerSignal?.removeEventListener('abort',stop);controller.abort();cancel();}
}

async function getToken() {
  return new Promise(resolve => {
    chrome.storage.local.get('ytv_token', data => resolve(data.ytv_token || null));
  });
}

async function getLang() {
  return new Promise(resolve => {
    chrome.storage.local.get('ytv_lang', data => resolve(data.ytv_lang || 'es'));
  });
}

// Translates the two connection-level errors apiFetch can throw into the same bilingual
// copy every handler already used for its own domain errors, so renderError() in
// content.js doesn't need to know about them specially.
function connErrorMessage(err, lang, fallback) {
  if(err.message==='response_invalid')return lang==='en'?'Server response could not be confirmed.':'No se pudo confirmar la respuesta del servidor.';
  if (err.message === 'timeout') return lang === 'en' ? 'Request timed out. Try again.' : 'La petición tardó demasiado. Inténtalo de nuevo.';
  if (err.message === 'network_error') return lang === 'en' ? 'Connection error. Check your internet.' : 'Error de conexión. Comprueba tu internet.';
  return fallback;
}

// A marker is negative evidence only. Only this live service-worker producer may
// submit credentials, store its result, and close its own acknowledged attempt.
const PASSWORD_LOGIN_PENDING = 'ytv_password_login_pending';
let passwordLoginOriginal = null;
let tokenMutationOriginal = null;
async function passwordLogin(msg) {
  if (passwordLoginOriginal || tokenMutationOriginal) throw Error('Hay un acceso pendiente de confirmar.');
  retireExtensionIdentity();
  const original = {};
  passwordLoginOriginal = original;
  const deadline = performance.now() + 60_000;
  let retired = false, rejectWait, markerAttempted = false, closed = false;
  const stopped = new Promise((_, reject) => { rejectWait = reject; });
  const retire = () => { if (!retired) { retired = true; rejectWait(Error('No se pudo confirmar el acceso. No se repetirá automáticamente.')); } };
  const timer = setTimeout(retire, 60_000);
  const check = () => { if (performance.now() >= deadline) retire(); if (retired || passwordLoginOriginal !== original) throw Error('No se pudo confirmar el acceso. No se repetirá automáticamente.'); };
  const readPending = () => chrome.storage.local.get(PASSWORD_LOGIN_PENDING);
  const close = async key => {
    const row = await readPending();
    if (passwordLoginOriginal !== original || row[PASSWORD_LOGIN_PENDING]?.key !== key) throw Error('Hay un acceso pendiente de confirmar.');
    await chrome.storage.local.remove(PASSWORD_LOGIN_PENDING);
    closed = true;
  };
  const producer = (async () => {
    const lang = await getLang(); check();
    if (Object.hasOwn(await chrome.storage.local.get(IDENTITY_WRITE_PENDING), IDENTITY_WRITE_PENDING)) throw Error('No se pudo confirmar la cuenta.');
    check();
    const uncertain = lang === 'en' ? 'Sign-in could not be confirmed. It will not be repeated automatically.' : 'No se pudo confirmar el acceso. No se repetirá automáticamente.';
    const pending = await readPending(); check();
    if (Object.hasOwn(pending, PASSWORD_LOGIN_PENDING)) throw Error(lang === 'en' ? 'A previous sign-in still needs confirmation.' : 'Hay un acceso anterior pendiente de confirmar.');
    if (typeof msg.email !== 'string' || typeof msg.password !== 'string' || !msg.password || msg.password.length > 1024) throw Error(lang === 'en' ? 'Email and password required' : 'Email y contraseña requeridos');
    const email = msg.email.trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Error(lang === 'en' ? 'Incorrect credentials' : 'Credenciales incorrectas');
    const key = crypto.randomUUID();
    markerAttempted = true;
    await chrome.storage.local.set({ [PASSWORD_LOGIN_PENDING]: { key } }); check();
    let res, data;
    try { ({ res, data } = await apiFetch(API_BASE + '/api/extension/login', {
      method: 'POST', timeoutMs: 55_000, maxResponseBytes: 16*1024, credentials: 'omit', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify({ email, password: msg.password, ...(typeof msg.totp === 'string' ? { totp: msg.totp.trim() } : {}) }),
    })); } catch { throw Error(uncertain); }
    check();
    const known = { invalid_operation_key: [400, 'Email y contraseña requeridos', 'Email and password required'],
      invalid_credentials: [401, 'Credenciales incorrectas', 'Incorrect credentials'],
      email_unverified: [403, 'Verifica tu email antes de usar la extensión', 'Verify your email before using the extension'],
      login_rate_limited: [429, 'Demasiados intentos. Espera unos minutos.', 'Too many attempts. Wait a few minutes.'] };
    const rejection = known[data?.code];
    if (rejection && res.status === rejection[0]) {
      await close(key); check(); throw Error(rejection[lang === 'en' ? 2 : 1]);
    }
    if (res.status !== 200 || data?.key !== key || typeof data.userId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(data.userId)
      || data.email !== email || typeof data.token !== 'string' || !/^[a-f0-9]{64}$/.test(data.token)
      || typeof data.isPro !== 'boolean' || !(data.name === null || typeof data.name === 'string')) throw Error(uncertain);
    check();
    const user = { name: data.name, email, isPro: data.isPro };
    // The already-dispatched native storage producer keeps its own ACK even if
    // the popup wait retires; it never starts a second store or HTTP attempt.
    await chrome.storage.local.set({ ytv_token: data.token, ytv_user: user });
    await close(key); check(); return user;
  })();
  void producer.finally(() => { if (passwordLoginOriginal === original && (!markerAttempted || closed)) passwordLoginOriginal = null; }).catch(() => {});
  try { return await Promise.race([producer, stopped]); }
  finally { retired = true; clearTimeout(timer); }
}

async function mutateExtensionToken(msg) {
  if (passwordLoginOriginal || tokenMutationOriginal) return msg.type === 'STORE_TOKEN' ? { ok: false } : Promise.reject(Error('Hay un acceso pendiente de confirmar.'));
  retireExtensionIdentity();
  const original = {}; tokenMutationOriginal = original;
  try {
    if (Object.hasOwn(await chrome.storage.local.get(IDENTITY_WRITE_PENDING), IDENTITY_WRITE_PENDING)) return msg.type === 'STORE_TOKEN' ? { ok: false } : Promise.reject(Error('No se pudo confirmar la cuenta.'));
    if (msg.type === 'LOGOUT') {
      await chrome.storage.local.remove(['ytv_token', 'ytv_user']);
      return { ok: true };
    }
    // Automatic web connection cannot override a retained password attempt.
    if (Object.hasOwn(await chrome.storage.local.get(PASSWORD_LOGIN_PENDING), PASSWORD_LOGIN_PENDING) || !msg.token) return { ok: false };
    await chrome.storage.local.set({ ytv_token: msg.token, ...(msg.user ? { ytv_user: msg.user } : {}) });
    return { ok: true };
  } finally { if (tokenMutationOriginal === original) tokenMutationOriginal = null; }
}

// A stored cache is display data, never authority to accept an account. A read
// shares only its live original promise. Token changes retire even an ABA value.
const IDENTITY_WRITE_PENDING = 'ytv_identity_write_pending';
let identityReadOriginal = null;
let identityRevision = 0;
function retireExtensionIdentity() { identityReadOriginal?.retire(); channelStatsOriginal?.retire(); seoLiveOriginal?.retire(); dailyIdeasOriginal?.retire(); }
async function getExtensionIdentity() {
  if (identityReadOriginal) return identityReadOriginal.wait;
  if (passwordLoginOriginal || tokenMutationOriginal) throw Error('No se pudo confirmar la cuenta.');
  const original = { revision: identityRevision, retire: null, wait: null };
  identityReadOriginal = original;
  const deadline = performance.now() + 30_000;
  let retired = false, rejectWait, writer = null;
  const stopped = new Promise((_, reject) => { rejectWait = reject; });
  const retire = () => { if (!retired) { retired = true; rejectWait(Error('No se pudo confirmar la cuenta.')); } };
  original.retire = retire;
  const timer = setTimeout(retire, 30_000);
  const check = () => {
    if (performance.now() >= deadline || original.revision !== identityRevision
      || identityReadOriginal !== original || passwordLoginOriginal
      || (tokenMutationOriginal && tokenMutationOriginal !== writer)) retire();
    if (retired) throw Error('No se pudo confirmar la cuenta.');
  };
  const producer = (async () => {
    const prior = await chrome.storage.local.get(IDENTITY_WRITE_PENDING); check();
    if (Object.hasOwn(prior, IDENTITY_WRITE_PENDING)) throw Error('No se pudo confirmar la cuenta.');
    const token = await getToken(); check();
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
    const readRef = crypto.randomUUID();
    const { res, data } = await apiFetch(API_BASE + '/api/extension/me', {
      timeoutMs: 25_000, maxResponseBytes: 16*1024, credentials: 'omit', cache: 'no-store',
      headers: { Authorization: 'Bearer ' + token, 'X-YTV-Read-Ref': readRef },
    });
    check();
    const denied = res.status === 401 && data?.code === 'extension_unauthorized' && data.readRef === readRef;
    if (!denied && (res.status !== 200 || data?.readRef !== readRef || typeof data.userId !== 'string'
      || !/^[A-Za-z0-9_-]{1,128}$/.test(data.userId) || typeof data.email !== 'string' || data.email.length > 254
      || data.email !== data.email.trim().toLowerCase() || !/^[^\s@,;<>"\x00-\x1f\x7f]+@[^\s@,;<>"\x00-\x1f\x7f]+\.[^\s@,;<>"\x00-\x1f\x7f]+$/.test(data.email)
      || typeof data.isPro !== 'boolean' || !(data.name === null || typeof data.name === 'string')
      || !Number.isSafeInteger(data.expiresAt) || data.expiresAt <= Date.now())) throw Error('No se pudo confirmar la cuenta.');
    // Native re-read and event revision can only deny this captured credential.
    // They cannot adopt an old cache, token value, receipt or replacement reader.
    const current = await getToken(); check();
    if (current !== token) throw Error('No se pudo confirmar la cuenta.');
    writer = {}; tokenMutationOriginal = writer;
    const key = crypto.randomUUID(); let closed = false;
    const close = async () => {
      const row = await chrome.storage.local.get(IDENTITY_WRITE_PENDING);
      if (tokenMutationOriginal !== writer || row[IDENTITY_WRITE_PENDING]?.key !== key) throw Error('No se pudo confirmar la cuenta.');
      await chrome.storage.local.remove(IDENTITY_WRITE_PENDING); closed = true;
    };
    try {
      await chrome.storage.local.set({ [IDENTITY_WRITE_PENDING]: { key } });
      check();
      if (denied) { await chrome.storage.local.remove(['ytv_token', 'ytv_user']); await close(); return null; }
      const user = { id: data.userId, name: data.name, email: data.email, isPro: data.isPro };
      await chrome.storage.local.set({ ytv_user: user });
      await close(); check();
      if (data.expiresAt <= Date.now()) throw Error('No se pudo confirmar la cuenta.');
      return user;
    } finally { if (closed && tokenMutationOriginal === writer) tokenMutationOriginal = null; }
  })();
  // A cache mutation already dispatched keeps its own storage ACK and exclusion
  // after timeout. No replacement writer runs until that original settles.
  void producer.finally(() => { if (identityReadOriginal === original) identityReadOriginal = null; }).catch(() => {});
  original.wait = Promise.race([producer, stopped]).finally(() => { retired = true; clearTimeout(timer); });
  return original.wait;
}

const SEO_QUICK_PENDING = 'ytv_seo_quick_pending';
let seoQuickOriginal = null;
async function runSeoQuick(msg) {
  if (seoQuickOriginal) throw Error('No se pudo confirmar el análisis SEO anterior.');
  const original = {}; seoQuickOriginal = original;
  const revision = identityRevision, deadline = performance.now() + 60_000;
  const input = Object.freeze({ videoId: msg.videoId, lang: msg.lang });
  let retired = false, rejectWait, attempted = false, closed = false;
  const stopped = new Promise((_, reject) => { rejectWait = reject; });
  const retire = () => { if (!retired) { retired = true; rejectWait(Error('No se pudo confirmar el análisis SEO.')); } };
  const timer = setTimeout(retire, 60_000);
  const check = () => { if (performance.now() >= deadline || revision !== identityRevision || passwordLoginOriginal || tokenMutationOriginal) retire(); if (retired || seoQuickOriginal !== original) throw Error('No se pudo confirmar el análisis SEO.'); };
  const close = async key => {
    const row = await chrome.storage.local.get(SEO_QUICK_PENDING);
    if (seoQuickOriginal !== original || row[SEO_QUICK_PENDING]?.key !== key) throw Error('No se pudo confirmar el análisis SEO.');
    await chrome.storage.local.remove(SEO_QUICK_PENDING); closed = true;
  };
  const producer = (async () => {
    const stored = await chrome.storage.local.get(SEO_QUICK_PENDING); check();
    if (Object.hasOwn(stored, SEO_QUICK_PENDING)) throw Error('Hay un análisis SEO pendiente de confirmar.');
    const token = await getToken(); check();
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw Error('not_logged_in');
    const lang = input.lang === undefined ? await getLang() : input.lang; check();
    if (typeof input.videoId !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(input.videoId) || !['es','en'].includes(lang)) throw Error('Datos de vídeo incorrectos.');
    const key = crypto.randomUUID(); attempted = true;
    await chrome.storage.local.set({ [SEO_QUICK_PENDING]: { key } }); check();
    const { res, data } = await apiFetch(API_BASE + '/api/extension/seo-quick', {
      method: 'POST', timeoutMs: 55_000, maxResponseBytes: 64*1024, cache: 'no-store', credentials: 'omit',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, 'Idempotency-Key': key },
      body: JSON.stringify({ videoId: input.videoId, lang }),
    }); check();
    if (data?.operationKey !== key) throw Error('No se pudo confirmar el análisis SEO.');
    const known = { invalid_video_input: 400, not_logged_in: 401, seo_configuration_unavailable: 503, video_not_found: 404 };
    if (Object.hasOwn(known, data.code) && res.status === known[data.code]) {
      await close(key); check(); throw Error(data.code === 'not_logged_in' ? 'not_logged_in' : data.code === 'video_not_found' ? 'Vídeo no encontrado.' : 'No se pudo analizar este vídeo.');
    }
    if (res.status !== 200 || data.videoId !== input.videoId || typeof data.title !== 'string'
      || !Number.isSafeInteger(data.score) || data.score < 0 || data.score > 100 || !Array.isArray(data.checklist)
      || !data.checklist.length || data.checklist.length > 50 || data.checklist.some(x => !x || typeof x.key !== 'string' || typeof x.label !== 'string'
        || typeof x.detail !== 'string' || typeof x.passed !== 'boolean' || !Number.isSafeInteger(x.weight) || x.weight < 1 || x.weight > 100)) throw Error('No se pudo confirmar el análisis SEO.');
    const weight = data.checklist.reduce((n,x)=>n+x.weight,0), passed = data.checklist.filter(x=>x.passed).reduce((n,x)=>n+x.weight,0);
    if (Math.round(passed/weight*100) !== data.score) throw Error('No se pudo confirmar el análisis SEO.');
    const current = await getToken(); check(); if (current !== token) throw Error('No se pudo confirmar el análisis SEO.');
    await close(key); check(); return data;
  })();
  void producer.finally(() => { if (seoQuickOriginal === original && (!attempted || closed)) seoQuickOriginal = null; }).catch(() => {});
  try { return await Promise.race([producer, stopped]); } finally { retired = true; clearTimeout(timer); }
}

const COMMENTS_PENDING = 'ytv_comments_pending';
let commentsOriginal = null;
function validCommentsResult(data, key, videoId, startedAt) {
  if (!data || data.operationKey !== key || data.videoId !== videoId || typeof data.commentsDisabled !== 'boolean'
    || !Number.isSafeInteger(data.totalComments) || data.totalComments < 0 || data.totalComments > 100
    || !Number.isSafeInteger(data.expiresAt) || data.expiresAt <= Date.now() || data.expiresAt > Date.parse(data.observedAt) + 55_000
    || typeof data.observedAt !== 'string' || !Number.isFinite(Date.parse(data.observedAt)) || Date.parse(data.observedAt) < startedAt || Date.parse(data.observedAt) > Date.now()
    || !data.dataQuality || data.dataQuality.source !== 'youtube-comment-sample' || data.dataQuality.sampleLimit !== 100 || data.dataQuality.order !== 'relevance'
    || data.dataQuality.sentiment !== 'keyword-heuristic' || data.dataQuality.freshness !== 'unconfirmed') return false;
  const valid = (list, limit, questions) => Array.isArray(list) && list.length <= Math.min(limit, data.totalComments) && list.every((c, i) =>
    c && typeof c.author === 'string' && c.author.length <= 200 && typeof c.text === 'string' && c.text.length <= 10_000
    && Number.isSafeInteger(c.likes) && c.likes >= 0 && Number.isSafeInteger(c.replies) && c.replies >= 0
    && typeof c.publishedAt === 'string' && Number.isFinite(Date.parse(c.publishedAt)) && Date.parse(c.publishedAt) >= 0 && Date.parse(c.publishedAt) <= Date.parse(data.observedAt)
    && (!questions || c.text.includes('?')) && (i === 0 || list[i-1].likes >= c.likes));
  if (data.topByLikes?.length !== Math.min(5,data.totalComments) || !valid(data.topByLikes, 5, false) || !valid(data.questions, 10, true) || !data.sentiment) return false;
  const values = ['positive','negative','neutral'].map(k=>data.sentiment[k]);
  if (values.some(v=>typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1 || Math.abs(Math.round(v*100)-v*100)>1e-8)) return false;
  if (data.commentsDisabled) return data.totalComments === 0 && values[0] === 0 && values[1] === 0 && values[2] === 1;
  return data.totalComments === 0 ? values.every(v=>v===0) : Math.abs(values.reduce((n,v)=>n+v,0)-1) <= 0.015;
}
async function runComments(msg) {
  if (commentsOriginal) throw Error('No se pudo confirmar el análisis de comentarios anterior.');
  const original = {}; commentsOriginal = original;
  const revision = identityRevision, deadline = performance.now() + 60_000, startedAt = Date.now();
  const videoId = msg.videoId;
  let retired = false, rejectWait, attempted = false, closed = false;
  const stopped = new Promise((_,reject)=>{rejectWait=reject;});
  const retire = () => { if (!retired) { retired=true; rejectWait(Error('No se pudo confirmar el análisis de comentarios.')); } };
  const timer = setTimeout(retire,60_000);
  const check = () => { if (performance.now() >= deadline || identityRevision !== revision || passwordLoginOriginal || tokenMutationOriginal) retire(); if (retired || commentsOriginal !== original) throw Error('No se pudo confirmar el análisis de comentarios.'); };
  const close = async key => {
    const row = await chrome.storage.local.get(COMMENTS_PENDING);
    if (commentsOriginal !== original || row[COMMENTS_PENDING]?.key !== key) throw Error('No se pudo confirmar el análisis de comentarios.');
    await chrome.storage.local.remove(COMMENTS_PENDING); closed=true;
  };
  const producer = (async()=>{
    for (const marker of [COMMENTS_PENDING, IDENTITY_WRITE_PENDING, PASSWORD_LOGIN_PENDING]) {
      const row = await chrome.storage.local.get(marker); check();
      if (Object.hasOwn(row,marker)) throw Error('Hay una operación pendiente de confirmar.');
    }
    const token = await getToken(); check();
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw Error('not_logged_in');
    if (typeof videoId !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) throw Error('Datos de vídeo incorrectos.');
    const key = crypto.randomUUID(); attempted=true;
    await chrome.storage.local.set({[COMMENTS_PENDING]:{key}}); check();
    const {res,data} = await apiFetch(API_BASE+'/api/extension/comments',{
      method:'POST',timeoutMs:55_000,maxResponseBytes:512*1024,cache:'no-store',credentials:'omit',observeOriginal:promise=>{original.http=promise;},
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,'Idempotency-Key':key},body:JSON.stringify({videoId}),
    }); check();
    if (data?.operationKey !== key) throw Error('No se pudo confirmar el análisis de comentarios.');
    const known = {invalid_video_input:400,not_logged_in:401,comments_configuration_unavailable:503};
    if (Object.hasOwn(known,data.code) && res.status === known[data.code]) {
      await close(key); check(); throw Error(data.code==='not_logged_in'?'not_logged_in':'No se pudieron consultar los comentarios.');
    }
    if (res.status !== 200 || !validCommentsResult(data,key,videoId,startedAt)) throw Error('No se pudo confirmar el análisis de comentarios.');
    const current = await getToken(); check();
    if (current !== token || data.expiresAt <= Date.now()) throw Error('No se pudo confirmar el análisis de comentarios.');
    await close(key); check();
    if (data.expiresAt <= Date.now()) throw Error('No se pudo confirmar el análisis de comentarios.');
    return data;
  })();
  void producer.finally(async()=>{ await Promise.allSettled(original.http?[original.http]:[]); if (commentsOriginal===original && (!attempted || closed)) commentsOriginal=null; }).catch(()=>{});
  try { return await Promise.race([producer,stopped]); } finally { retired=true; clearTimeout(timer); }
}

const VIDEO_BATCH_PENDING = 'ytv_video_batch_pending';
let videoBatchOriginal = null;
function validVideoBatchResult(data,key,ids,startedAt,token) {
 if(!data||data.operationKey!==key||JSON.stringify(data.requestedVideoIds)!==JSON.stringify(ids)||data.mode!==(token?'authenticated':'public')
  ||!Number.isSafeInteger(data.expiresAt)||data.expiresAt<=Date.now()||typeof data.observedAt!=='string'||!Number.isFinite(Date.parse(data.observedAt))||Date.parse(data.observedAt)<startedAt||Date.parse(data.observedAt)>Date.now()||data.expiresAt>Date.parse(data.observedAt)+55_000
  ||!data.dataQuality||data.dataQuality.source!=='youtube-batch-response'||data.dataQuality.freshness!=='unconfirmed'||data.dataQuality.velocity!=='lifetime-average'||!['available','unconfirmed'].includes(data.dataQuality.subscriberEnrichment)
  ||!Array.isArray(data.videos)||!Array.isArray(data.missingVideoIds)||data.videos.length+data.missingVideoIds.length!==ids.length)return false;
 const seen=new Set(),count=n=>n===null||Number.isSafeInteger(n)&&n>=0;
 for(const v of data.videos){
  if(!v||!ids.includes(v.videoId)||seen.has(v.videoId)||typeof v.title!=='string'||v.title.length>200||typeof v.channelTitle!=='string'||v.channelTitle.length>200||typeof v.channelId!=='string'||!/^UC[A-Za-z0-9_-]{22}$/.test(v.channelId)||!count(v.views)||!count(v.likes)||!count(v.comments)||!count(v.subscribers)
   ||typeof v.publishedAt!=='string'||!Number.isFinite(Date.parse(v.publishedAt))||Date.parse(v.publishedAt)<0||Date.parse(v.publishedAt)>Date.parse(data.observedAt)||!['available','hidden','unconfirmed'].includes(v.subscriberState)||v.subscriberState==='available'&&v.subscribers===null||v.subscriberState!=='available'&&v.subscribers!==null)return false;
  const age=Math.max(1,(Date.parse(data.observedAt)-Date.parse(v.publishedAt))/3600000),vph=v.views===null?null:Math.round(v.views/age*10)/10,engagement=v.views===null||v.likes===null||v.comments===null?null:v.views>0?Math.round((v.likes+v.comments)/v.views*1000)/10:0;
  if(v.likes!==null&&v.comments!==null&&!Number.isSafeInteger(v.likes+v.comments)||v.ageDays!==Math.floor(age/24)||v.ageHours!==Math.round(age)||v.vph!==vph||v.engagement!==engagement||[v.vph,v.engagement].some(n=>n!==null&&(!Number.isFinite(n)||!Number.isSafeInteger(Math.round(n*10))||n<0)))return false;
  seen.add(v.videoId);
 }
 for(const id of data.missingVideoIds){if(!ids.includes(id)||seen.has(id))return false;seen.add(id);}
 return seen.size===ids.length && (data.dataQuality.subscriberEnrichment==='available'?data.videos.every(v=>v.subscriberState!=='unconfirmed'):true);
}
async function runVideoBatch(msg) {
  if (videoBatchOriginal) throw Error('No se pudo confirmar el análisis de vídeos anterior.');
  const original = {}; videoBatchOriginal = original;
  const revision = identityRevision, deadline = performance.now() + 60_000, startedAt = Date.now();
  const videoIds = Array.isArray(msg.videoIds) ? Object.freeze([...msg.videoIds]) : null;
  let retired = false, rejectWait, attempted = false, closed = false;
  const stopped = new Promise((_,reject)=>{rejectWait=reject;});
  const retire = () => { if (!retired) { retired=true; rejectWait(Error('No se pudo confirmar el análisis de vídeos.')); } };
  const timer = setTimeout(retire,60_000);
  const check = () => { if (performance.now() >= deadline || identityRevision !== revision || passwordLoginOriginal || tokenMutationOriginal) retire(); if (retired || videoBatchOriginal !== original) throw Error('No se pudo confirmar el análisis de vídeos.'); };
  const close = async key => {
    const row = await chrome.storage.local.get(VIDEO_BATCH_PENDING);
    if (videoBatchOriginal !== original || row[VIDEO_BATCH_PENDING]?.key !== key) throw Error('No se pudo confirmar el análisis de vídeos.');
    await chrome.storage.local.remove(VIDEO_BATCH_PENDING); closed=true;
  };
  const producer = (async()=>{
    for (const marker of [VIDEO_BATCH_PENDING, IDENTITY_WRITE_PENDING, PASSWORD_LOGIN_PENDING]) {
      const row = await chrome.storage.local.get(marker); check();
      if (Object.hasOwn(row,marker)) throw Error('Hay una operación pendiente de confirmar.');
    }
    const token = await getToken(); check();
    if (token!==null && (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token))) throw Error('not_logged_in');
    if (!videoIds || videoIds.length<1 || videoIds.length>50 || videoIds.some(id=>typeof id!=='string'||!/^[A-Za-z0-9_-]{11}$/.test(id)) || new Set(videoIds).size!==videoIds.length) throw Error('Datos de vídeo incorrectos.');
    const key = crypto.randomUUID(); attempted=true;
    await chrome.storage.local.set({[VIDEO_BATCH_PENDING]:{key}}); check();
    const {res,data} = await apiFetch(API_BASE+'/api/extension/video-batch',{
      method:'POST',timeoutMs:55_000,maxResponseBytes:512*1024,cache:'no-store',credentials:'omit',observeOriginal:promise=>{original.http=promise;},
      headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),'Idempotency-Key':key},body:JSON.stringify({videoIds}),
    }); check();
    if (data?.operationKey !== key) throw Error('No se pudo confirmar el análisis de vídeos.');
    const known = {invalid_video_input:400,not_logged_in:401,batch_configuration_unavailable:503,rate_limited:429};
    if (Object.hasOwn(known,data.code) && res.status === known[data.code]) {
      await close(key); check(); throw Error(data.code==='not_logged_in'?'not_logged_in':'No se pudieron consultar los vídeos.');
    }
    if (res.status !== 200 || !validVideoBatchResult(data,key,videoIds,startedAt,token)) throw Error('No se pudo confirmar el análisis de vídeos.');
    const current = await getToken(); check();
    if (current !== token || data.expiresAt <= Date.now()) throw Error('No se pudo confirmar el análisis de vídeos.');
    await close(key); check();
    if (data.expiresAt <= Date.now()) throw Error('No se pudo confirmar el análisis de vídeos.');
    return data;
  })();
  void producer.finally(async()=>{ await Promise.allSettled(original.http?[original.http]:[]); if (videoBatchOriginal===original && (!attempted || closed)) videoBatchOriginal=null; }).catch(()=>{});
  try { return await Promise.race([producer,stopped]); } finally { retired=true; clearTimeout(timer); }
}

const SCORECARD_PENDING = 'ytv_scorecard_pending';
let scorecardOriginal = null, scorecardQueue = Promise.resolve();
const scorecardLive = new Map();
async function readScorecardToken() {const row=await chrome.storage.local.get('ytv_token');return Object.hasOwn(row,'ytv_token')?row.ytv_token:null;}
function validScorecardResult(d,key,id,startedAt,token) {
 const date=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().replace('.000Z','Z')===s.replace('.000Z','Z');
 const count=n=>n===null||Number.isSafeInteger(n)&&n>=0,ratio=n=>n===null||typeof n==='number'&&Number.isFinite(n)&&n>=0&&Number.isSafeInteger(Math.round(n*10))&&n===Math.round(n*10)/10;
 if(!d||d.operationKey!==key||d.videoId!==id||d.mode!==(token?'authenticated':'public')||typeof d.isPro!=='boolean'||!token&&d.isPro
  ||!date(d.observedAt)||Date.parse(d.observedAt)<startedAt||Date.parse(d.observedAt)>Date.now()||!Number.isSafeInteger(d.expiresAt)||d.expiresAt<=Date.now()||d.expiresAt>Date.parse(d.observedAt)+55000
  ||!date(d.publishedAt)||Date.parse(d.publishedAt)<0||Date.parse(d.publishedAt)>Date.parse(d.observedAt)||typeof d.title!=='string'||d.title.length>200||typeof d.channelTitle!=='string'||d.channelTitle.length>200||typeof d.channelId!=='string'||!/^UC[A-Za-z0-9_-]{22}$/.test(d.channelId)
  ||!Array.isArray(d.tags)||d.tags.length>100||d.tags.some(x=>typeof x!=='string'||x.length>500)||![d.views,d.likes,d.comments,d.durationSec,d.channelAvgViews].every(count)||![d.vph,d.vphLifetime,d.engagement,d.likesRatio,d.outlierMultiplier].every(ratio)||typeof d.vphRecent!=='boolean')return false;
 const q=d.dataQuality;if(!q||q.source!=='youtube-scorecard-response'||q.freshness!=='unconfirmed'||!['available','unconfirmed'].includes(q.tags)||!['available','unconfirmed'].includes(q.outlier)||!['original-acknowledged','not-recorded','unconfirmed'].includes(q.snapshot))return false;
 const age=Math.max(1,(Date.parse(d.observedAt)-Date.parse(d.publishedAt))/3600000);
 if(d.ageDays!==Math.floor(age/24)||d.ageHours!==Math.round(age)||d.likes!==null&&d.comments!==null&&!Number.isSafeInteger(d.likes+d.comments))return false;
 const average=d.views===null?null:Math.round(d.views/age*10)/10,eng=d.views===null||d.likes===null||d.comments===null?null:d.views>0?Math.round((d.likes+d.comments)/d.views*1000)/10:0,likes=d.views===null||d.likes===null?null:d.views>0?Math.round(d.likes/d.views*1000)/10:0;
 if(d.vphLifetime!==average||d.engagement!==eng||d.likesRatio!==likes||q.outlier!==(d.channelAvgViews===null?'unconfirmed':'available')||d.outlierMultiplier!==(d.views===null||!d.channelAvgViews?null:Math.round(d.views/d.channelAvgViews*10)/10))return false;
 if(d.vphRecent){const i=d.velocityInterval;if(!i||!date(i.from)||!date(i.to)||i.to!==d.observedAt||Date.parse(i.from)<0||!count(i.fromViews)||i.fromViews===null||i.toViews!==d.views||d.views===null||i.fromViews>d.views||q.velocity!=='interval-average'||q.snapshot!=='original-acknowledged')return false;const hours=(Date.parse(i.to)-Date.parse(i.from))/3600000;if(hours<.5||hours>720||d.vph!==Math.round((i.toViews-i.fromViews)/hours*10)/10)return false;}
 else if(d.velocityInterval!==null||d.vph!==average||q.velocity!=='lifetime-average')return false;
 const weights=[['title_length',8],['title_number',5],['title_caps',4],['title_emoji',3],['title_power',4],['desc_length',10],['desc_links',5],['desc_timestamps',7],['desc_hashtags',4],['desc_cta',3],['tags_count',8],['tags_long',4],['thumbnail',8],['captions',6],['engagement',7],['duration',5]];
 if(!Array.isArray(d.checks)||d.checks.length!==16||d.checks.some((c,n)=>!c||c.key!==weights[n][0]||c.w!==weights[n][1]||typeof c.available!=='boolean'||(c.available?typeof c.ok!=='boolean':c.ok!==null)))return false;
 if(q.tags==='unconfirmed'&&d.tags.length)return false;
 for(const c of d.checks){const available=c.key.startsWith('tags_')?q.tags==='available':c.key==='duration'?d.durationSec!==null:c.key==='engagement'?eng!==null:['thumbnail','captions'].includes(c.key)?c.available:true;if(c.available!==available)return false;if(c.available&&c.key==='duration'&&c.ok!==(d.durationSec>=480&&d.durationSec<=1200))return false;if(c.available&&c.key==='engagement'&&c.ok!==(d.views>0&&(d.likes+d.comments)/d.views>.03))return false;}
 const score=d.checks.every(c=>c.available)?Math.round(d.checks.filter(c=>c.ok).reduce((n,c)=>n+c.w,0)/d.checks.reduce((n,c)=>n+c.w,0)*100):null;
 return d.score===score&&q.score===(score===null?'unconfirmed':'heuristic')&&(d.views!==null||q.snapshot==='not-recorded');
}
function projectScorecardResult(d) {
 const out={};for(const k of ['videoId','title','channelId','channelTitle','publishedAt','views','likes','comments','vph','vphLifetime','vphRecent','engagement','likesRatio','ageDays','ageHours','durationSec','score','channelAvgViews','outlierMultiplier','isPro','mode','operationKey','observedAt','expiresAt'])out[k]=d[k];
 out.tags=Object.freeze([...d.tags]);out.checks=Object.freeze(d.checks.map(({key,ok,w,available})=>Object.freeze({key,ok,w,available})));out.dataQuality=Object.freeze({...d.dataQuality});out.velocityInterval=d.velocityInterval?Object.freeze({...d.velocityInterval}):null;return Object.freeze(out);
}
function runScorecard(msg) {
 const videoId=msg.videoId;if(typeof videoId!=='string'||!/^[A-Za-z0-9_-]{11}$/.test(videoId))return Promise.reject(Error('Datos de vídeo incorrectos.'));
 const existing=scorecardLive.get(videoId);if(existing&&existing.revision===identityRevision&&!existing.retired&&performance.now()<existing.deadline)return existing.wait;
 if(scorecardLive.size>=20)return Promise.reject(Error('No se pudo confirmar el análisis del vídeo.'));
 const original={videoId,revision:identityRevision,deadline:performance.now()+60000,startedAt:Date.now(),retired:false};let rejectWait,attempted=false,closed=false;
 const stopped=new Promise((_,reject)=>{rejectWait=reject;});void stopped.catch(()=>{});
 const retire=()=>{if(!original.retired){original.retired=true;rejectWait(Error('No se pudo confirmar el análisis del vídeo.'));}};
 const timer=setTimeout(retire,60000),check=()=>{if(original.retired||performance.now()>=original.deadline||identityRevision!==original.revision||passwordLoginOriginal||tokenMutationOriginal)retire();if(original.retired)throw Error('No se pudo confirmar el análisis del vídeo.');};
 const producer=scorecardQueue.catch(()=>{}).then(async()=>{
  check();if(scorecardOriginal)throw Error('Hay un análisis de vídeo pendiente de confirmar.');scorecardOriginal=original;
  const close=async key=>{check();const row=await chrome.storage.local.get(SCORECARD_PENDING);check();if(row[SCORECARD_PENDING]?.key!==key)throw Error('No se pudo confirmar el análisis del vídeo.');await chrome.storage.local.remove(SCORECARD_PENDING);closed=true;check();};
  for(const marker of [SCORECARD_PENDING,IDENTITY_WRITE_PENDING,PASSWORD_LOGIN_PENDING]){const row=await chrome.storage.local.get(marker);check();if(Object.hasOwn(row,marker))throw Error('Hay una operación pendiente de confirmar.');}
  const token=await readScorecardToken();check();if(token!==null&&(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token)))throw Error('not_logged_in');
  const key=crypto.randomUUID();attempted=true;await chrome.storage.local.set({[SCORECARD_PENDING]:{key}});check();
  const {res,data}=await apiFetch(API_BASE+'/api/extension/video-scorecard',{method:'POST',timeoutMs:Math.min(55000,Math.max(1,Math.floor(original.deadline-performance.now()))),maxResponseBytes:256*1024,cache:'no-store',credentials:'omit',observeOriginal:p=>{original.http=p;},headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),'Idempotency-Key':key},body:JSON.stringify({videoId})});check();
  if(data?.operationKey!==key)throw Error('No se pudo confirmar el análisis del vídeo.');
  const known={invalid_video_input:400,not_logged_in:401,scorecard_configuration_unavailable:503,rate_limited:429,video_not_found:404};
  if(Object.hasOwn(known,data.code)&&res.status===known[data.code]){const current=await readScorecardToken();check();if(current!==token)throw Error('No se pudo confirmar el análisis del vídeo.');await close(key);throw Error(data.code==='not_logged_in'?'not_logged_in':data.code==='rate_limited'?'rate_limited':'No se pudo consultar este vídeo.');}
  if(res.status!==200||!validScorecardResult(data,key,videoId,original.startedAt,token))throw Error('No se pudo confirmar el análisis del vídeo.');
  const projected=projectScorecardResult(data),current=await readScorecardToken();check();if(current!==token||projected.expiresAt<=Date.now())throw Error('No se pudo confirmar el análisis del vídeo.');await close(key);const finalToken=await readScorecardToken();check();if(finalToken!==token||projected.expiresAt<=Date.now())throw Error('No se pudo confirmar el análisis del vídeo.');return projected;
 });
 scorecardQueue=producer.finally(async()=>{if(original.http)await Promise.allSettled([original.http]);if(scorecardOriginal===original&&(!attempted||closed))scorecardOriginal=null;});void scorecardQueue.catch(()=>{});
 original.wait=Promise.race([producer,stopped]).finally(()=>{original.retired=true;clearTimeout(timer);if(scorecardLive.get(videoId)===original)scorecardLive.delete(videoId);});scorecardLive.set(videoId,original);return original.wait;
}

let channelStatsOriginal = null;
async function getChannelStats() {
  if (channelStatsOriginal) return channelStatsOriginal.wait;
  const original = { revision:identityRevision, retire:null, wait:null };
  channelStatsOriginal = original;
  const deadline = performance.now() + 30_000;
  let retired = false, rejectWait, httpOriginal = null;
  const stopped = new Promise((_,reject)=>{rejectWait=reject;});
  const retire = () => { if (!retired) { retired=true; rejectWait(Error('No se pudieron confirmar las estadísticas del canal.')); } };
  original.retire=retire;
  const timer=setTimeout(retire,30_000);
  const check=()=>{if(performance.now()>=deadline || original.revision!==identityRevision || passwordLoginOriginal || tokenMutationOriginal || channelStatsOriginal!==original)retire();if(retired)throw Error('No se pudieron confirmar las estadísticas del canal.');};
  const producer=(async()=>{
    const pending=await chrome.storage.local.get([IDENTITY_WRITE_PENDING,PASSWORD_LOGIN_PENDING]);check();
    if(Object.hasOwn(pending,IDENTITY_WRITE_PENDING)||Object.hasOwn(pending,PASSWORD_LOGIN_PENDING))throw Error('No se pudo confirmar la cuenta.');
    const token=await getToken();check();if(typeof token!=='string'||! /^[a-f0-9]{64}$/.test(token))throw Error('not_logged_in');
    const readRef=crypto.randomUUID();
    const {res,data}=await apiFetch(API_BASE+'/api/extension/channel-stats',{
      method:'POST',timeoutMs:25_000,maxResponseBytes:32*1024,credentials:'omit',cache:'no-store',observeOriginal:promise=>{httpOriginal=promise;},
      headers:{Authorization:'Bearer '+token,'X-YTV-Read-Ref':readRef,'Content-Type':'application/json'},body:'{}',
    });check();
    if(data?.readRef!==readRef)throw Error('No se pudieron confirmar las estadísticas del canal.');
    if(res.status===401&&data.code==='not_logged_in')throw Error('not_logged_in');
    if(res.status===400&&data.code==='youtube_not_connected')throw Error('youtube_not_connected');
    const c=data.channel,g=data.growth,m=data.monetization,q=data.dataQuality,points=data.sparkline;
    const count=n=>Number.isSafeInteger(n)&&n>=0,percent=n=>count(n)&&n<=100;
    const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v&&Date.parse(v)<=Date.now();
    if(res.status!==200||!c||typeof c.name!=='string'||c.name.length>512||typeof c.thumb!=='string'||c.thumb.length>2048
      || !['subs','totalViews','videoCount'].every(k=>count(c[k])) || !g || !['subs7d','subs30d','views7d','views30d'].every(k=>Number.isSafeInteger(g[k]))
      || !m||!percent(m.subsPct)||!percent(m.watchPct)||!count(m.estWatchHours)||!(m.subsEtaDays===null||count(m.subsEtaDays))
      || !q||q.source!=='cached-channel-history'||q.freshness!=='unconfirmed'||!date(q.cachedAt)||!date(q.metricsAsOf)
      || typeof q.growth7dAvailable!=='boolean'||typeof q.growth30dAvailable!=='boolean'||q.watchHours!=='view-based-estimate'||q.eligibility!=='not-assessed'
      || !(q.rateIntervalDays===null||Number.isFinite(q.rateIntervalDays)&&q.rateIntervalDays>=27&&q.rateIntervalDays<=33)
      || !Array.isArray(points)||points.length>30||points.some(x=>!x||!count(x.subs)||!count(x.views)||typeof x.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(x.date)||!date(x.date+'T00:00:00.000Z'))
      || typeof data.isPro!=='boolean'||!Number.isSafeInteger(data.expiresAt)||data.expiresAt<=Date.now())throw Error('No se pudieron confirmar las estadísticas del canal.');
    if(points.some((x,i)=>i>0&&x.date<points[i-1].date)||m.subsPct!==Math.min(100,Math.round(c.subs/1000*100))
      ||m.estWatchHours!==Math.round(c.totalViews*.067)||m.watchPct!==Math.min(100,Math.round(m.estWatchHours/4000*100))
      ||q.growth30dAvailable!==(q.rateIntervalDays!==null)||(!q.growth7dAvailable&&(g.subs7d!==0||g.views7d!==0))
      ||(!q.growth30dAvailable&&(g.subs30d!==0||g.views30d!==0)))throw Error('No se pudieron confirmar las estadísticas del canal.');
    const eta=c.subs<1000&&g.subs30d>0&&q.rateIntervalDays!==null?Math.ceil((1000-c.subs)*q.rateIntervalDays/g.subs30d):null;
    if(m.subsEtaDays!==eta)throw Error('No se pudieron confirmar las estadísticas del canal.');
    if(c.thumb){let url;try{url=new URL(c.thumb);}catch{throw Error('No se pudieron confirmar las estadísticas del canal.');}if(url.protocol!=='https:'||url.username||url.password||url.port||!['yt3.ggpht.com','yt3.googleusercontent.com','lh3.googleusercontent.com','i.ytimg.com'].includes(url.hostname))throw Error('No se pudieron confirmar las estadísticas del canal.');}
    const current=await getToken();check();if(current!==token||data.expiresAt<=Date.now())throw Error('No se pudieron confirmar las estadísticas del canal.');
    return data;
  })();
  // A retired local wait cannot replace its still-running original. Reads have
  // no token/cache/event writes, no automatic retry and no stored authority.
  void producer.finally(async()=>{if(httpOriginal)await Promise.allSettled([httpOriginal]);if(channelStatsOriginal===original)channelStatsOriginal=null;}).catch(()=>{});
  original.wait=Promise.race([producer,stopped]).finally(()=>{retired=true;clearTimeout(timer);});
  return original.wait;
}

let seoLiveOriginal = null;
async function runSeoLive(msg) {
  const input={title:msg.title===undefined?'':msg.title,description:msg.description===undefined?'':msg.description,tags:msg.tags===undefined?[]:msg.tags};
  if(typeof input.title!=='string'||input.title.length>200||typeof input.description!=='string'||input.description.length>10000
    ||!Array.isArray(input.tags)||input.tags.length>100||input.tags.some(t=>typeof t!=='string'||t.length>500))throw Error('Datos SEO incorrectos.');
  input.tags=Object.freeze([...input.tags]);Object.freeze(input);
  const body=JSON.stringify(input);if(new TextEncoder().encode(body).byteLength>65536)throw Error('Datos SEO incorrectos.');
  if(seoLiveOriginal){if(seoLiveOriginal.inputBody===body)return seoLiveOriginal.wait;throw Error('Hay un análisis SEO anterior pendiente de confirmar.');}
  const original={revision:identityRevision,inputBody:body,retire:null,wait:null};seoLiveOriginal=original;
  const deadline=performance.now()+30000;let retired=false,rejectWait,httpOriginal=null;
  const stopped=new Promise((_,reject)=>{rejectWait=reject;});
  const retire=()=>{if(!retired){retired=true;rejectWait(Error('No se pudo confirmar el análisis SEO Live.'));}};original.retire=retire;
  const timer=setTimeout(retire,30000);
  const check=()=>{if(performance.now()>=deadline||original.revision!==identityRevision||passwordLoginOriginal||tokenMutationOriginal||seoLiveOriginal!==original)retire();if(retired)throw Error('No se pudo confirmar el análisis SEO Live.');};
  const producer=(async()=>{
    const pending=await chrome.storage.local.get([IDENTITY_WRITE_PENDING,PASSWORD_LOGIN_PENDING]);check();
    if(Object.hasOwn(pending,IDENTITY_WRITE_PENDING)||Object.hasOwn(pending,PASSWORD_LOGIN_PENDING))throw Error('No se pudo confirmar la cuenta.');
    const token=await getToken();check();if(typeof token!=='string'||! /^[a-f0-9]{64}$/.test(token))throw Error('not_logged_in');
    const readRef=crypto.randomUUID();
    const {res,data}=await apiFetch(API_BASE+'/api/extension/seo-live',{
      method:'POST',timeoutMs:25000,maxResponseBytes:16*1024,credentials:'omit',cache:'no-store',observeOriginal:promise=>{httpOriginal=promise;},
      headers:{Authorization:'Bearer '+token,'X-YTV-Read-Ref':readRef,'Content-Type':'application/json'},body,
    });check();
    if(data?.readRef!==readRef)throw Error('No se pudo confirmar el análisis SEO Live.');
    if(res.status===401&&data.code==='not_logged_in')throw Error('not_logged_in');
    if(res.status===400&&data.code==='invalid_seo_live_input')throw Error('Datos SEO incorrectos.');
    const schema=[['title_length',8],['title_number',5],['title_caps',4],['title_emoji',3],['title_power',4],['desc_length',10],['desc_links',5],['desc_timestamps',7],['desc_hashtags',4],['desc_cta',3],['tags_count',8],['tags_long',4]];
    if(res.status!==200||!Number.isSafeInteger(data.score)||data.score<0||data.score>100||data.titleLength!==input.title.length
      ||!Array.isArray(data.checks)||data.checks.length!==schema.length||data.checks.some((x,i)=>!x||x.key!==schema[i][0]||x.w!==schema[i][1]||typeof x.ok!=='boolean')
      ||!Number.isSafeInteger(data.expiresAt)||data.expiresAt<=Date.now())throw Error('No se pudo confirmar el análisis SEO Live.');
    const max=data.checks.reduce((n,x)=>n+x.w,0),raw=data.checks.filter(x=>x.ok).reduce((n,x)=>n+x.w,0);
    if(Math.round(raw/max*100)!==data.score)throw Error('No se pudo confirmar el análisis SEO Live.');
    const current=await getToken();check();if(current!==token||data.expiresAt<=Date.now())throw Error('No se pudo confirmar el análisis SEO Live.');
    return data;
  })();
  void producer.finally(async()=>{if(httpOriginal)await Promise.allSettled([httpOriginal]);if(seoLiveOriginal===original)seoLiveOriginal=null;}).catch(()=>{});
  original.wait=Promise.race([producer,stopped]).finally(()=>{retired=true;clearTimeout(timer);});return original.wait;
}

let dailyIdeasOriginal = null;
async function readDailyIdeas() {
  if(dailyIdeasOriginal)return dailyIdeasOriginal.wait;
  const day=new Date(Date.now()).toISOString().slice(0,10),original={revision:identityRevision,retire:null,wait:null};dailyIdeasOriginal=original;
  const deadline=performance.now()+30000;let retired=false,rejectWait,httpOriginal=null;
  const stopped=new Promise((_,reject)=>{rejectWait=reject;});
  const retire=()=>{if(!retired){retired=true;rejectWait(Error('No se pudieron confirmar las ideas diarias.'));}};original.retire=retire;
  const timer=setTimeout(retire,30000);
  const check=()=>{if(performance.now()>=deadline||new Date(Date.now()).toISOString().slice(0,10)!==day||original.revision!==identityRevision||passwordLoginOriginal||tokenMutationOriginal||dailyIdeasOriginal!==original)retire();if(retired)throw Error('No se pudieron confirmar las ideas diarias.');};
  const producer=(async()=>{
    const pending=await chrome.storage.local.get([IDENTITY_WRITE_PENDING,PASSWORD_LOGIN_PENDING]);check();
    if(Object.hasOwn(pending,IDENTITY_WRITE_PENDING)||Object.hasOwn(pending,PASSWORD_LOGIN_PENDING))throw Error('No se pudo confirmar la cuenta.');
    const token=await getToken();check();if(typeof token!=='string'||! /^[a-f0-9]{64}$/.test(token))throw Error('not_logged_in');
    const readRef=crypto.randomUUID();
    const {res,data}=await apiFetch(API_BASE+'/api/extension/daily-ideas',{
      timeoutMs:25000,maxResponseBytes:64*1024,credentials:'omit',cache:'no-store',observeOriginal:promise=>{httpOriginal=promise;},
      headers:{Authorization:'Bearer '+token,'X-YTV-Read-Ref':readRef},
    });check();
    if(data?.readRef!==readRef)throw Error('No se pudieron confirmar las ideas diarias.');
    if(res.status===401&&data.code==='not_logged_in')throw Error('not_logged_in');
    const q=data.dataQuality;
    if(res.status!==200||data.requestedDate!==day||typeof data.channelConnected!=='boolean'||!Number.isSafeInteger(data.expiresAt)||data.expiresAt<=Date.now()
      ||!q||q.source!=='stored-daily-ideas'||q.freshness!=='unconfirmed'||q.connection!=='stored-channel-reference')throw Error('No se pudieron confirmar las ideas diarias.');
    if(data.ideas===null){if(data.date!==null||q.savedAt!==null||data.batchState!==(data.channelConnected?'pending':'not-connected'))throw Error('No se pudieron confirmar las ideas diarias.');}
    else {
      const date=typeof q.savedAt==='string'?new Date(q.savedAt):null;
      if(!data.channelConnected||data.batchState!=='available'||data.date!==day||!date||!Number.isFinite(date.getTime())||date.getTime()>Date.now()||date.toISOString()!==q.savedAt||q.savedAt.slice(0,10)!==day
        ||!Array.isArray(data.ideas)||data.ideas.length<1||data.ideas.length>5||data.ideas.some(x=>!x||typeof x!=='object'||Array.isArray(x)
          ||!['title_es','title_en','idea_es','idea_en'].every(k=>typeof x[k]==='string'&&x[k].trim()&&x[k].length<=(k.startsWith('title')?200:4000)))
        ||new TextEncoder().encode(JSON.stringify(data.ideas)).byteLength>48*1024)throw Error('No se pudieron confirmar las ideas diarias.');
    }
    const current=await getToken();check();if(current!==token||data.expiresAt<=Date.now())throw Error('No se pudieron confirmar las ideas diarias.');return data;
  })();
  // A public per-day cache is not authority for this account. No reads, writes,
  // deletions or reset of historical cache keys/preferences take place here.
  void producer.finally(async()=>{if(httpOriginal)await Promise.allSettled([httpOriginal]);if(dailyIdeasOriginal===original)dailyIdeasOriginal=null;}).catch(()=>{});
  original.wait=Promise.race([producer,stopped]).finally(()=>{retired=true;clearTimeout(timer);});return original.wait;
}

async function handleMessage(msg) {
  if (msg.type === 'DAILY_IDEAS') return readDailyIdeas();
  if (msg.type === 'SEO_LIVE') return runSeoLive(msg);
  if (msg.type === 'CHANNEL_STATS') return getChannelStats();
  if (msg.type === 'SEO_QUICK') return runSeoQuick(msg);
  if (msg.type === 'COMMENTS') return runComments(msg);
  if (msg.type === 'VIDEO_BATCH') return runVideoBatch(msg);
  if (msg.type === 'SCORECARD') return runScorecard(msg);
  if (msg.type === 'GET_USER') return getExtensionIdentity();
  if (msg.type === 'STORE_TOKEN' || msg.type === 'LOGOUT') return mutateExtensionToken(msg);
  if (msg.type === 'LOGIN') return passwordLogin(msg);
  const lang = await getLang();

  switch (msg.type) {

    case 'HAS_TOKEN': {
      const token = await getToken();
      return { hasToken: !!token };
    }

    case 'SET_LANG': {
      await chrome.storage.local.set({ ytv_lang: msg.lang });
      return { ok: true };
    }

    case 'GET_LANG': {
      return { lang };
    }

    case 'COMPETITOR': {
      const token = await getToken();
      if (!token) throw new Error('not_logged_in');
      let res, data;
      try {
        ({ res, data } = await apiFetch(`${API_BASE}/api/youtube/competitor`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ url: msg.url, lang: msg.lang || lang }),
        }));
      } catch (err) { throw new Error(connErrorMessage(err, lang, err.message)); }
      if (res.status === 403 && data.error === 'pro_required') throw new Error(lang === 'en' ? 'Pro plan required. Upgrade at ytubviral.com' : 'Plan Pro requerido. Actualiza en ytubviral.com');
      if (!res.ok) throw new Error(data.error || (lang === 'en' ? 'Channel analysis error' : 'Error al analizar canal'));
      return data;
    }

    case 'KEYWORDS': {
      const token = await getToken();
      if (!token) throw new Error('not_logged_in');
      let res, data;
      try {
        ({ res, data } = await apiFetch(`${API_BASE}/api/research/keywords`, {
          method: 'POST',
          // P8 añadió una segunda ronda de llamadas a la API de YouTube (trending ahora) —
          // el caché de 24h absorbe la mayoría de las peticiones, pero la primera para una
          // keyword nueva puede pasar de los 15s por defecto.
          timeoutMs: 30000,
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ keyword: msg.keyword }),
        }));
      } catch (err) { throw new Error(connErrorMessage(err, lang, err.message)); }
      if (res.status === 403 && data.error === 'pro_required') throw new Error(lang === 'en' ? 'Pro plan required. Upgrade at ytubviral.com' : 'Plan Pro requerido. Actualiza en ytubviral.com');
      if (!res.ok) throw new Error(data.error || (lang === 'en' ? 'Keyword search error' : 'Error al buscar keywords'));
      return data;
    }

    case 'GENERATION_CONTEXT': {
      const token=await getToken();if(!token)throw Error('not_logged_in');
      const context=syncGenerationContext(token);return {context:context.id};
    }
    case 'GENERATE': {
      const token=await getToken();if(!token)throw Error('not_logged_in');
      const context=syncGenerationContext(token);
      if(msg.generationContext!==context.id)throw Error('generation_context_changed');
      if(typeof msg.operationKey!=='string'||!/^ext-[a-f0-9-]{36}$/.test(msg.operationKey))throw Error('generation_input_changed');
      if(typeof msg.template!=='string'||!msg.inputs||typeof msg.inputs!=='object'||Array.isArray(msg.inputs)||Object.values(msg.inputs).some(v=>typeof v!=='string')||!['en','es'].includes(msg.lang))throw Error('generation_input_changed');
      const body=JSON.stringify({template:msg.template,inputs:msg.inputs,lang:msg.lang});
      const identity=JSON.stringify([msg.template,Object.keys(msg.inputs).sort().map(k=>[k,msg.inputs[k]]),msg.lang]);
      const known=context.attempts.get(msg.operationKey);
      if(known&&known.identity!==identity)throw Error('generation_input_changed');
      if(known?.flight)return known.flight;
      if(!known&&context.attempts.size>=64){
        const delivered=[...context.attempts].find(([,value])=>value.complete&&!value.flight);
        if(delivered)context.attempts.delete(delivered[0]);else throw Error('generation_pending_limit');
      }
      const attempt=known||{identity,flight:null};context.attempts.set(msg.operationKey,attempt);
      const waitController=new AbortController();let timer;const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('generation_unconfirmed')),55000);});
      const work=(async()=>{
        let res,data;
        try{({res,data}=await apiFetch(API_BASE+'/api/generate',{method:'POST',timeoutMs:55000,maxResponseBytes:256*1024,signal:waitController.signal,headers:{'Content-Type':'application/json','Authorization':'Bearer '+token,'Idempotency-Key':msg.operationKey},body}));}
        catch{throw Error('generation_unconfirmed');}
        const currentToken=await getToken();
        if(generationContext!==context||currentToken!==token)throw Error('generation_context_changed');
        if(!res.ok){
          if(data.code){const error=Error(data.code);error.limit=data.limit;throw error;}
          throw Error('generation_unconfirmed');
        }
        if(!data||typeof data.content!=='string'||!data.content.trim()||data.content.length>64000||typeof data.truncated!=='boolean')throw Error('generation_unconfirmed');
        attempt.complete=true;return data;
      })();
      attempt.flight=Promise.race([work,deadline]).finally(()=>{clearTimeout(timer);waitController.abort();attempt.flight=null;});
      return attempt.flight;
    }

    case 'BEST_TIME': {
      const token = await getToken();
      if (!token) throw new Error('not_logged_in');
      let res, data;
      try {
        ({ res, data } = await apiFetch(`${API_BASE}/api/extension/best-time`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }));
      } catch (err) { throw new Error(connErrorMessage(err, lang, err.message)); }
      if (!res.ok) throw new Error(data.error || (lang === 'en' ? 'Best time error' : 'Error al cargar best time'));
      return data;
    }

    case 'AB_CREATE': {
      // A diferencia del resto de handlers, aquí NO se traduce el error a un
      // mensaje bonito — content.js necesita el código crudo (pro_required,
      // active_test_exists, max_active_tests, youtube_not_connected,
      // youtube_reconnect_required) para pintar una tarjeta distinta por caso
      // (la de pro_required es el momento de conversión de la release).
      const token = await getToken();
      if (!token) throw new Error('not_logged_in');
      let res, data;
      try {
        ({ res, data } = await apiFetch(`${API_BASE}/api/extension/ab-test`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            videoId: msg.videoId,
            variantA: msg.variantA,
            variantB: msg.variantB,
          }),
        }));
      } catch (err) { throw new Error(connErrorMessage(err, lang, err.message)); }
      if (!res.ok) {
        const e = new Error(data.error || 'ab_test_error');
        e.limit = data.limit; // solo presente en max_active_tests
        throw e;
      }
      return data;
    }

    case 'IDEAS_BADGE': {
      // P6 — daily loop. A dot on the toolbar icon when there are fresh ideas today the
      // user hasn't opened yet. No "alarms" permission: content.js pokes this when it sees
      // ideas while the user browses YouTube (which extension users do daily).
      const today = new Date().toISOString().slice(0, 10);
      const seen = await new Promise(r => chrome.storage.local.get(`ytv_ideas_seen_${today}`, d => r(d[`ytv_ideas_seen_${today}`])));
      if (!seen) {
        chrome.action.setBadgeText({ text: '•' });
        chrome.action.setBadgeBackgroundColor({ color: '#ff0000' });
      }
      return { ok: true };
    }

    case 'CLEAR_IDEAS_BADGE': {
      const today = new Date().toISOString().slice(0, 10);
      chrome.action.setBadgeText({ text: '' });
      await chrome.storage.local.set({ [`ytv_ideas_seen_${today}`]: true });
      return { ok: true };
    }

    case 'COACH': {
      // P5 — AI Coach chat. Raw error codes (pro_required / throttled) so content.js
      // paints the right card. `pageContext` = what the user is looking at on YouTube.
      const token = await getToken();
      if (!token) throw new Error('not_logged_in');
      let res, data;
      try {
        ({ res, data } = await apiFetch(`${API_BASE}/api/coach`, {
          method: 'POST',
          // The Coach calls Claude for a full (non-streamed) reply — routinely 15-40s.
          // The default 15s abort was firing before the answer came back ("tardó demasiado").
          // Server route caps at maxDuration=60, so wait just under that.
          timeoutMs: 55000,
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            message: msg.message,
            context: msg.context || [],
            pageContext: msg.pageContext || '',
            mode: msg.mode || 'analyze',
            lang: msg.lang || lang,
          }),
        }));
      } catch (err) { throw new Error(connErrorMessage(err, lang, err.message)); }
      if (res.status === 403 && data.error === 'pro_required') throw new Error('pro_required');
      if (res.status === 429) throw new Error('throttled');
      if (!res.ok) throw new Error(data.error || (lang === 'en' ? 'Coach error' : 'Error del Coach'));
      return data;
    }

    default:
      throw new Error('Unknown message: ' + msg.type);
  }
}
