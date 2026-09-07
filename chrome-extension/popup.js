'use strict';

const viewLogin = document.getElementById('view-login');
const viewUser  = document.getElementById('view-user');
const loginForm = document.getElementById('login-form');
const inpEmail  = document.getElementById('inp-email');
const inpPass   = document.getElementById('inp-password');
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
  viewUser.classList.add('hidden');
  viewLogin.classList.remove('hidden');
  hideError();
}

// P6 — the popup as a command center, not just a login screen. Two live blocks for a
// logged-in user: this week's channel momentum and today's ideas.
async function loadDashboard() {
  popMomentum.classList.add('hidden');
  popIdeas.classList.add('hidden');

  sendMsg({ type: 'CHANNEL_STATS' }).then((d) => {
    const g = d?.growth;
    if (!g) return;
    popMomentum.innerHTML = `
      <div class="pop-block-title">${t('Tu semana', 'Your week')}</div>
      <div class="pop-momentum-row">
        <span>${fmtNum(g.subs7d)} subs</span>
        <span>${fmtNum(g.views7d)} ${t('vistas', 'views')}</span>
        <span class="pop-dim">7${t('d', 'd')}</span>
      </div>`;
    popMomentum.classList.remove('hidden');
  }).catch((e) => {
    if (e.message === 'youtube_not_connected') {
      popMomentum.innerHTML = `<div class="pop-block-title">${t('Tu canal', 'Your channel')}</div>
        <a href="https://ytubviral.com/dashboard?utm_source=extension&utm_medium=popupdash" target="_blank" class="pop-link">${t('Conéctalo para ver tu progreso →', 'Connect it to see your progress →')}</a>`;
      popMomentum.classList.remove('hidden');
    }
  });

  sendMsg({ type: 'DAILY_IDEAS' }).then((d) => {
    const n = Array.isArray(d?.ideas) ? d.ideas.length : 0;
    if (!n) return;
    popIdeas.innerHTML = `
      <div class="pop-block-title">💡 ${t(`${n} ideas para hoy`, `${n} ideas for today`)}</div>
      <button class="btn btn-outline btn-sm" id="pop-ideas-open">${t('Verlas en YouTube', 'Open them on YouTube')}</button>`;
    popIdeas.classList.remove('hidden');
    document.getElementById('pop-ideas-open').addEventListener('click', () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tabId = tabs?.[0]?.id;
        if (tabId != null) {
          chrome.tabs.sendMessage(tabId, { type: 'YTV_RECHECK_IDEAS' }, () => { void chrome.runtime.lastError; });
        }
        window.close();
      });
    });
    sendMsg({ type: 'CLEAR_IDEAS_BADGE' }).catch(() => {});
  }).catch(() => {});
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
    const user = await sendMsg({ type: 'LOGIN', email, password });
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
