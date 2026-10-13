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
  const {timeoutMs=FETCH_TIMEOUT_MS,maxResponseBytes=1024*1024,signal:callerSignal,...fetchOpts}=opts;
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
function retireExtensionIdentity() { identityReadOriginal?.retire(); }
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

async function handleMessage(msg) {
  if (msg.type === 'SEO_QUICK') return runSeoQuick(msg);
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

    case 'CHANNEL_STATS': {
      const token = await getToken();
      if (!token) throw new Error('not_logged_in');
      let res, data;
      try {
        ({ res, data } = await apiFetch(`${API_BASE}/api/extension/channel-stats`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: '{}',
        }));
      } catch (err) { throw new Error(connErrorMessage(err, lang, err.message)); }
      if (!res.ok) throw new Error(data.error || (lang === 'en' ? 'Stats error' : 'Error al cargar stats'));
      return data;
    }

    case 'SCORECARD': {
      // v2.7: works without login — the scorecard endpoint now serves public YouTube data to
      // anonymous callers (rate-limited by IP). Send the token only if we have one.
      const token = await getToken();
      let res, data;
      try {
        ({ res, data } = await apiFetch(`${API_BASE}/api/extension/video-scorecard`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ videoId: msg.videoId }),
        }));
      } catch (err) { throw new Error(connErrorMessage(err, lang, err.message)); }
      if (res.status === 429) throw new Error('rate_limited');
      if (!res.ok) throw new Error(data.error || (lang === 'en' ? 'Scorecard error' : 'Error al cargar scorecard'));
      return data;
    }

    case 'SEO_LIVE': {
      const token = await getToken();
      if (!token) throw new Error('not_logged_in');
      let res, data;
      try {
        ({ res, data } = await apiFetch(`${API_BASE}/api/extension/seo-live`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ title: msg.title, description: msg.description, tags: msg.tags || [] }),
        }));
      } catch (err) { throw new Error(connErrorMessage(err, lang, err.message)); }
      if (!res.ok) throw new Error(data.error || 'SEO live error');
      return data;
    }

    case 'COMMENTS': {
      const token = await getToken();
      if (!token) throw new Error('not_logged_in');
      let res, data;
      try {
        ({ res, data } = await apiFetch(`${API_BASE}/api/extension/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ videoId: msg.videoId }),
        }));
      } catch (err) { throw new Error(connErrorMessage(err, lang, err.message)); }
      if (!res.ok) throw new Error(data.error || (lang === 'en' ? 'Comments error' : 'Error al cargar comentarios'));
      return data;
    }

    case 'VIDEO_BATCH': {
      // v2.7: works without login (VPH badges = ambient value at second 1). Token is optional.
      const token = await getToken();
      let res, data;
      try {
        ({ res, data } = await apiFetch(`${API_BASE}/api/extension/video-batch`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ videoIds: msg.videoIds }),
        }));
      } catch (err) { throw new Error(connErrorMessage(err, lang, err.message)); }
      if (res.status === 429) throw new Error('rate_limited');
      if (!res.ok) throw new Error(data.error || 'Batch error');
      return data;
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

    case 'DAILY_IDEAS': {
      const token = await getToken();
      if (!token) return { ideas: null };

      // Cache 1 fetch/día: la homepage se visita muchas veces y las ideas no
      // cambian en el día. Limpia claves de días anteriores al escribir la nueva.
      const today = new Date().toISOString().slice(0, 10);
      const cacheKey = `ytv_ideas_${today}`;
      const cached = await new Promise(resolve => {
        chrome.storage.local.get(cacheKey, data => resolve(data[cacheKey]));
      });
      // Only trust a cache that actually has ideas — a previously cached `{ideas:null}`
      // (e.g. checked before the morning cron ran) must not stick for the rest of the day.
      if (cached && Array.isArray(cached.ideas) && cached.ideas.length) return cached;

      let res, data;
      try {
        ({ res, data } = await apiFetch(`${API_BASE}/api/extension/daily-ideas`, {
          headers: { 'Authorization': `Bearer ${token}` },
        }));
      } catch {
        return { ideas: null }; // panel de homepage: fallar en silencio, no molestar
      }
      if (!res.ok) return { ideas: null };

      // Solo cachear cuando REALMENTE hay ideas — si hoy aún no están generadas
      // (el cron corre ~06:00 UTC), cachear `{ideas:null}` dejaría al usuario sin
      // ideas el resto del día aunque aparezcan más tarde.
      if (!data || !Array.isArray(data.ideas) || !data.ideas.length) return data || { ideas: null };

      // Solo las claves de CACHÉ por fecha (ytv_ideas_YYYY-MM-DD), NO las de
      // preferencias que comparten prefijo: ytv_ideas_dismissed_<fecha>,
      // ytv_ideas_collapsed, ytv_ideas_upsell_last. Un `startsWith('ytv_ideas_')`
      // las borraba todas en el primer fetch de cada día — reseteaba el estado
      // colapsado a diario y rompía el throttle semanal del upsell.
      const allKeys = await new Promise(resolve => chrome.storage.local.get(null, resolve));
      const staleKeys = Object.keys(allKeys).filter(k => /^ytv_ideas_\d{4}-\d{2}-\d{2}$/.test(k) && k !== cacheKey);
      if (staleKeys.length) await chrome.storage.local.remove(staleKeys);
      await chrome.storage.local.set({ [cacheKey]: data });
      return data;
    }

    default:
      throw new Error('Unknown message: ' + msg.type);
  }
}
