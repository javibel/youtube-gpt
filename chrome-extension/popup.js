'use strict';
let popupIdeasRevision=0;
const popupIdeasSessionObserved=typeof chrome.storage?.onChanged?.addListener==='function';
if(popupIdeasSessionObserved)chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&(Object.hasOwn(changes,'ytv_token')||Object.hasOwn(changes,'ytv_lang'))){popupIdeasRevision++;popupIdeasOwn?.retire();if(typeof popupStatsOwn!=='undefined')popupStatsOwn?.retire();}});

const viewLogin = document.getElementById('view-login');
const viewUser  = document.getElementById('view-user');
const loginForm = document.getElementById('login-form');
const inpEmail  = document.getElementById('inp-email');
const inpPass   = document.getElementById('inp-password');
const inpTotp   = document.getElementById('inp-totp');
const loginErr  = document.getElementById('login-error');
const btnLogin  = document.getElementById('btn-login');
const btnLogout = document.getElementById('btn-logout');
const userName  = document.getElementById('user-name');
const userPlan  = document.getElementById('user-plan');
const userInit  = document.getElementById('user-initials');
const btnLang   = document.getElementById('btn-lang');
const popMomentum = document.getElementById('pop-momentum');
const popIdeas    = document.getElementById('pop-ideas');
const videoBanner      = document.getElementById('video-banner');
const videoBannerText  = document.getElementById('video-banner-text');
const btnVideoBannerClose = document.getElementById('btn-video-banner-close');
const VIDEO1_DISMISS_KEY = 'ytv_video1_hint_dismissed';

let lang = 'es';

function t(es, en) { return lang === 'en' ? en : es; }

function fmtNum(n) {
  n = Number(n) || 0;
  const s = n < 0 ? '-' : '+';
  const a = Math.abs(n);
  if (a >= 1_000_000) return s + (a / 1_000_000).toFixed(1) + 'M';
  if (a >= 1_000) return s + Math.round(a / 1_000) + 'K';
  return s + a;
}

function applyLang() {
  btnLang.textContent = lang.toUpperCase();
  document.getElementById('tagline').textContent = t('IA para YouTubers', 'AI for YouTubers');
  document.getElementById('intro-text').innerHTML = t(
    'Puntuación SEO instantánea en cualquier vídeo de YouTube — más generador con IA, keywords y análisis de canales. Inicia sesión con tu cuenta de <strong>ytubviral.com</strong>.',
    'Instant SEO score on any YouTube video — plus AI generator, keywords and channel analysis. Sign in with your <strong>ytubviral.com</strong> account.'
  );
  const connectHint = document.getElementById('connect-hint');
  if (connectHint) connectHint.innerHTML = t(
    '¿Cuenta con Google? <a href="https://ytubviral.com/dashboard?utm_source=extension&utm_medium=popup" target="_blank">Abre ytubviral.com</a> y te conectamos solo (sin contraseña).',
    'Signed up with Google? <a href="https://ytubviral.com/dashboard?utm_source=extension&utm_medium=popup" target="_blank">Open ytubviral.com</a> and we connect you automatically (no password).'
  );
  inpPass.placeholder = t('Contraseña', 'Password');
  inpTotp.placeholder = t('Código de 6 dígitos (si tu cuenta lo requiere)', '6-digit code (if required by your account)');
  inpTotp.setAttribute('aria-label', t('Código de autenticación', 'Authentication code'));
  btnLogin.textContent = t('Iniciar sesión', 'Sign in');
  document.getElementById('signup-link').textContent = t(
    '¿No tienes cuenta? Regístrate gratis →',
    "Don't have an account? Sign up free →"
  );
  document.getElementById('dashboard-link').textContent = t('Ir al dashboard →', 'Go to dashboard →');
  btnLogout.textContent = t('Cerrar sesión', 'Sign out');
  videoBannerText.textContent = t(
    'Nuevo: los 5 factores del SEO de YouTube, en vídeo',
    'New: the 5 factors of YouTube SEO, on video'
  );
}

function sendMsg(msg) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, response => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (response?.error) return reject(new Error(response.error));
      resolve(response);
    });
  });
}

const LOGIN_ERROR_MAP = {
  'Demasiados intentos. Espera unos minutos.': () => t('Demasiados intentos. Espera unos minutos.', 'Too many attempts. Wait a few minutes.'),
  'Email y contraseña requeridos': () => t('Email y contraseña requeridos', 'Email and password required'),
  'Credenciales incorrectas': () => t('Credenciales incorrectas', 'Incorrect credentials'),
  'Verifica tu email antes de usar la extensión': () => t('Verifica tu email antes de usar la extensión', 'Verify your email before using the extension'),
  'Error interno': () => t('Error interno. Inténtalo de nuevo.', 'Internal error. Please try again.'),
};

function loginErrorMessage(raw) {
  if (!raw) return t('Error al iniciar sesión', 'Login failed');
  const known = LOGIN_ERROR_MAP[raw];
  return known ? known() : raw;
}

function showError(msg) { loginErr.textContent = msg; loginErr.classList.remove('hidden'); }
function hideError() { loginErr.classList.add('hidden'); }

function showUserView(user) {
  viewLogin.classList.add('hidden');
  viewUser.classList.remove('hidden');

  const name = user.name || user.email || t('Usuario', 'User');
  userName.textContent = name;
  userInit.textContent = name.charAt(0).toUpperCase();

  if (user.isPro) {
    userPlan.textContent = '⭐ Plan Pro';
    userPlan.classList.add('pro');
  } else {
    userPlan.textContent = t('Plan Gratuito', 'Free Plan');
    userPlan.classList.remove('pro');
  }

  loadDashboard();
}

function showLoginView() {
  popupStatsOwn?.retire();popupIdeasOwn?.retire();
  viewUser.classList.add('hidden');
  viewLogin.classList.remove('hidden');
  hideError();
}

// A native stats document ACK precedes momentum or connection controls.
let popupStatsOwn=null;const popupStatsReceipts=new WeakMap();
function popupChannelStatsCurrent(data){const own=data&&popupStatsReceipts.get(data);if(!own||!own.closed)return false;try{own.check();return true;}catch{return false;}}
async function loadPopupChannelStats(){
 popupStatsOwn?.retire();if(!popupIdeasSessionObserved)return;
 const language=lang,own={viewRef:crypto.randomUUID(),language,revision:popupIdeasRevision,href:location.href,startedAt:Date.now(),deadline:performance.now()+30000,expiresAt:Date.now()+30000,retired:false,closed:false,nodes:[]};popupStatsOwn=own;
 let rejectWait;const stopped=new Promise((_,reject)=>{rejectWait=reject;});void stopped.catch(()=>{});
 own.retire=()=>{if(!own.retired){own.retired=true;void sendMsg({type:'CHANNEL_STATS_RETIRE',viewRef:own.viewRef}).catch(()=>{});clearTimeout(own.timer);own.observer?.disconnect();for(const n of own.nodes)n.remove();popMomentum.classList.add('hidden');rejectWait(Error('channel_stats_unconfirmed'));}};
 own.check=()=>{if(own.retired||popupStatsOwn!==own||own.revision!==popupIdeasRevision||!popMomentum.isConnected||typeof viewUser!=='undefined'&&viewUser.classList.contains('hidden')||own.painted&&own.nodes.some(n=>!popMomentum.contains(n))||location.href!==own.href||lang!==language||performance.now()>=own.deadline||Date.now()<own.startedAt||Date.now()>=own.expiresAt){own.retire();throw Error('channel_stats_unconfirmed');}};
 own.timer=setTimeout(own.retire,30000);own.observer=new MutationObserver(()=>{try{own.check();}catch{}});own.observer.observe(document.body,{childList:true,subtree:true,attributes:true});
 try{own.check();const data=await Promise.race([sendMsg({type:'CHANNEL_STATS',viewRef:own.viewRef,surface:'popup',lang:language}),stopped]);own.check();if(!data||data.error||!['available','not-connected'].includes(data.outcome)||data.viewRef!==own.viewRef||!data.readRef||data.surface!=='popup'||data.language!==language||!Number.isSafeInteger(data.expiresAt)||data.expiresAt<=Date.now()||data.expiresAt>own.startedAt+30000)throw Error('channel_stats_unconfirmed');own.expiresAt=Math.min(own.expiresAt,data.expiresAt);Object.freeze(data);const ack=await Promise.race([sendMsg({type:'CHANNEL_STATS_ACK',readRef:data.readRef,viewRef:own.viewRef,surface:'popup'}),stopped]);own.check();if(!ack||ack.closed!==true||ack.readRef!==data.readRef||ack.viewRef!==own.viewRef||ack.surface!=='popup')throw Error('channel_stats_unconfirmed');own.closed=true;popupStatsReceipts.set(data,own);clearTimeout(own.timer);own.timer=setTimeout(own.retire,Math.max(1,Math.min(own.deadline-performance.now(),own.expiresAt-Date.now())));if(!popupChannelStatsCurrent(data))throw Error('channel_stats_unconfirmed');popMomentum.innerHTML=renderPopupChannelStats(data);own.nodes=[...popMomentum.children];own.painted=true;popMomentum.classList.remove('hidden');return data;
 }catch{own.retire();return undefined;}
}
window.addEventListener('pagehide',()=>popupStatsOwn?.retire());

function renderPopupChannelStats(data){
 if(!popupChannelStatsCurrent(data))return '';
 if(data.outcome==='not-connected')return '<div class="pop-block-title">'+t('Tu canal','Your channel')+'</div><a href="https://ytubviral.com/dashboard?utm_source=extension&utm_medium=popupdash" target="_blank" class="pop-link">'+t('Conéctalo para ver tus estadísticas guardadas →','Connect it to see your stored statistics →')+'</a>';
 const g=data.growth,q=data.dataQuality;
 return '<div class="pop-block-title">'+t('Semana histórica','Historical week')+'</div><div class="pop-momentum-row"><span>'+(q.growth7dAvailable?fmtNum(g.subs7d):'—')+' subs</span><span>'+(q.growth7dAvailable?fmtNum(g.views7d):'—')+' '+t('vistas','views')+'</span><span class="pop-dim">'+q.metricsAsOf.slice(0,10)+' · '+t('actualidad sin confirmar','freshness unconfirmed')+'</span></div>';
}

// No public batch/date/actor can close or paint a popup view.
let popupIdeasOwn=null;const popupIdeasReceipts=new WeakMap();
function popupDailyIdeasCurrent(data){const own=data&&popupIdeasReceipts.get(data);if(!own||!own.closed)return false;try{own.check();return true;}catch{return false;}}
async function loadPopupDailyIdeas(){
 popupIdeasOwn?.retire();if(!popupIdeasSessionObserved)return;
 const day=new Date(Date.now()).toISOString().slice(0,10),language=lang,own={viewRef:crypto.randomUUID(),day,language,revision:popupIdeasRevision,href:location.href,startedAt:Date.now(),deadline:performance.now()+30000,expiresAt:Math.min(Date.now()+30000,Date.parse(day+'T00:00:00Z')+86400000),retired:false,closed:false,nodes:[]};popupIdeasOwn=own;
 let rejectWait;const stopped=new Promise((_,reject)=>{rejectWait=reject;});void stopped.catch(()=>{});
 own.retire=()=>{if(!own.retired){own.retired=true;void sendMsg({type:'DAILY_IDEAS_RETIRE',viewRef:own.viewRef}).catch(()=>{});clearTimeout(own.timer);for(const n of own.nodes)n.remove();rejectWait(Error('daily_ideas_unconfirmed'));}};
 own.check=()=>{if(own.retired||popupIdeasOwn!==own||own.revision!==popupIdeasRevision||!popIdeas.isConnected||location.href!==own.href||lang!==language||performance.now()>=own.deadline||Date.now()<own.startedAt||Date.now()>=own.expiresAt||new Date(Date.now()).toISOString().slice(0,10)!==day){own.retire();throw Error('daily_ideas_unconfirmed');}};
 own.timer=setTimeout(own.retire,Math.max(1,Math.min(30000,own.expiresAt-Date.now())));
 try{own.check();const data=await Promise.race([sendMsg({type:'DAILY_IDEAS',viewRef:own.viewRef,surface:'popup',lang:language,day}),stopped]);own.check();if(!data||data.error||data.viewRef!==own.viewRef||!data.readRef||data.surface!=='popup'||data.language!==language||data.requestedDate!==day||!Number.isSafeInteger(data.expiresAt)||data.expiresAt<=Date.now()||data.expiresAt>own.startedAt+30000)throw Error('daily_ideas_unconfirmed');own.expiresAt=Math.min(own.expiresAt,data.expiresAt);Object.freeze(data);const ack=await Promise.race([sendMsg({type:'DAILY_IDEAS_ACK',readRef:data.readRef,viewRef:own.viewRef,surface:'popup'}),stopped]);own.check();if(!ack||ack.closed!==true||ack.readRef!==data.readRef||ack.viewRef!==own.viewRef||ack.surface!=='popup')throw Error('daily_ideas_unconfirmed');own.closed=true;popupIdeasReceipts.set(data,own);clearTimeout(own.timer);own.timer=setTimeout(own.retire,Math.max(1,Math.min(own.deadline-performance.now(),own.expiresAt-Date.now())));if(!popupDailyIdeasCurrent(data))throw Error('daily_ideas_unconfirmed');const n=data.ideas?.length??0;if(!n)return data;
 popIdeas.innerHTML='<div class="pop-block-title">💡 '+t(n+' ideas guardadas',n+' stored ideas')+'</div><div class="pop-dim">'+data.date+' UTC · '+t('actualidad sin confirmar','freshness unconfirmed')+'</div><button class="btn btn-outline btn-sm" id="pop-ideas-open">'+t('Verlas en YouTube','Open them on YouTube')+'</button>';own.nodes.push(...popIdeas.children);popIdeas.classList.remove('hidden');
 document.getElementById('pop-ideas-open').addEventListener('click',()=>{if(!popupDailyIdeasCurrent(data))return;chrome.tabs.query({active:true,currentWindow:true},tabs=>{if(!popupDailyIdeasCurrent(data))return;const id=tabs?.[0]?.id;if(id!=null)chrome.tabs.sendMessage(id,{type:'YTV_RECHECK_IDEAS'},()=>{void chrome.runtime.lastError;});window.close();});});return data;
 }catch{own.retire();return undefined;}
}
window.addEventListener('pagehide',()=>popupIdeasOwn?.retire());

// P6 — the popup as a command center, not just a login screen. Two live blocks for a
// logged-in user: this week's channel momentum and today's ideas.
async function loadDashboard() {
  popMomentum.classList.add('hidden');
  popIdeas.classList.add('hidden');

  void loadPopupChannelStats();

  void loadPopupDailyIdeas();
}

async function checkVideoBanner() {
  const store = await new Promise(resolve => chrome.storage.local.get(VIDEO1_DISMISS_KEY, resolve));
  if (!store[VIDEO1_DISMISS_KEY]) videoBanner.classList.remove('hidden');
}

btnVideoBannerClose.addEventListener('click', async () => {
  videoBanner.classList.add('hidden');
  await new Promise(resolve => chrome.storage.local.set({ [VIDEO1_DISMISS_KEY]: true }, resolve));
});

// Init
(async () => {
  try {
    const res = await sendMsg({ type: 'GET_LANG' });
    lang = res?.lang || 'es';
  } catch {
    lang = navigator.language.startsWith('en') ? 'en' : 'es';
  }
  applyLang();
  checkVideoBanner();

  try {
    const user = await sendMsg({ type: 'GET_USER' });
    if (user) showUserView(user);
    else showLoginView();
  } catch {
    showLoginView();
  }
})();

btnLang.addEventListener('click', async () => {
  lang = lang === 'es' ? 'en' : 'es';
  applyLang();
  await sendMsg({ type: 'SET_LANG', lang }).catch(() => {});
  try {
    const user = await sendMsg({ type: 'GET_USER' });
    if (user) showUserView(user);
  } catch {}
});

loginForm.addEventListener('submit', async e => {
  e.preventDefault();
  hideError();
  const email = inpEmail.value.trim();
  const password = inpPass.value;
  if (!email || !password) return;

  btnLogin.disabled = true;
  btnLogin.textContent = t('Iniciando sesión...', 'Signing in...');
  try {
    const user = await sendMsg({ type: 'LOGIN', email, password, totp: inpTotp.value.trim() });
    inpPass.value = '';
    inpTotp.value = '';
    showUserView(user);
  } catch (err) {
    showError(loginErrorMessage(err.message));
  } finally {
    btnLogin.disabled = false;
    btnLogin.textContent = t('Iniciar sesión', 'Sign in');
  }
});

btnLogout.addEventListener('click', async () => {
  await sendMsg({ type: 'LOGOUT' }).catch(() => {});
  showLoginView();
});
