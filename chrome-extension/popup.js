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
const ideasRestore     = document.getElementById('ideas-restore');
const btnRestoreIdeas  = document.getElementById('btn-restore-ideas');
const ideasRestoreDone = document.getElementById('ideas-restore-done');

let lang = 'es';

function t(es, en) { return lang === 'en' ? en : es; }

function applyLang() {
  btnLang.textContent = lang.toUpperCase();
  document.getElementById('tagline').textContent = t('IA para YouTubers', 'AI for YouTubers');
  document.getElementById('intro-text').innerHTML = t(
    'Puntuación SEO instantánea en cualquier vídeo de YouTube — más generador con IA, keywords y análisis de canales. Inicia sesión con tu cuenta de <strong>ytubviral.com</strong>.',
    'Instant SEO score on any YouTube video — plus AI generator, keywords and channel analysis. Sign in with your <strong>ytubviral.com</strong> account.'
  );
  const connectHint = document.getElementById('connect-hint');
  if (connectHint) connectHint.innerHTML = t(
    '¿Cuenta con Google? <a href="https://ytubviral.com/dashboard" target="_blank">Abre ytubviral.com</a> y te conectamos solo (sin contraseña).',
    'Signed up with Google? <a href="https://ytubviral.com/dashboard" target="_blank">Open ytubviral.com</a> and we connect you automatically (no password).'
  );
  inpPass.placeholder = t('Contraseña', 'Password');
  btnLogin.textContent = t('Iniciar sesión', 'Sign in');
  document.getElementById('signup-link').textContent = t(
    '¿No tienes cuenta? Regístrate gratis →',
    "Don't have an account? Sign up free →"
  );
  document.getElementById('feature-list').innerHTML = `
    <div class="feature-item">✅ ${t('SEO Score en vídeos', 'SEO Score on videos')}</div>
    <div class="feature-item">✅ ${t('Análisis de canales en YouTube', 'Channel analysis on YouTube')}</div>
    <div class="feature-item">✅ ${t('Keywords en resultados de búsqueda', 'Keywords in search results')}</div>
    <div class="feature-item">✅ ${t('Generación de títulos con IA', 'AI title generation')}</div>
  `;
  document.getElementById('dashboard-link').textContent = t('Ir al dashboard →', 'Go to dashboard →');
  btnLogout.textContent = t('Cerrar sesión', 'Sign out');
  btnRestoreIdeas.textContent = t('💡 Mostrar ideas de hoy', "💡 Show today's ideas");
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

// C4 (code review 2026-07-03): app/api/extension/login/route.ts devuelve sus
// mensajes de error solo en español (server-side) — rompía el contrato
// bilingüe que respeta el resto de la extensión si el usuario tenía lang=en.
// No se toca el backend (esos strings son deliberados y compartidos con
// otros flujos de auth); se traducen aquí los códigos conocidos.
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
  return known ? known() : raw; // código ya bilingüe (viene de background.js) — usar tal cual
}

function showError(msg) {
  loginErr.textContent = msg;
  loginErr.classList.remove('hidden');
}

function hideError() {
  loginErr.classList.add('hidden');
}

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
}

function showLoginView() {
  viewUser.classList.add('hidden');
  viewLogin.classList.remove('hidden');
  hideError();
  ideasRestore.classList.add('hidden');
  ideasRestoreDone.classList.add('hidden');
  btnRestoreIdeas.classList.remove('hidden');
}

// Un usuario que cierra el panel "Qué grabar hoy" por accidente en la
// homepage de YouTube no debería tener que abrir las DevTools de la
// extensión para recuperarlo — este botón hace lo mismo (borrar la marca
// de "descartado" de hoy) desde una superficie que cualquiera conoce: el
// propio icono de la extensión.
async function checkIdeasRestore() {
  ideasRestore.classList.add('hidden');
  ideasRestoreDone.classList.add('hidden');
  try {
    const data = await sendMsg({ type: 'DAILY_IDEAS' });
    if (!data?.ideas) return; // sin ideas hoy — nada que restaurar

    const today = new Date().toISOString().slice(0, 10);
    const dismissKey = `ytv_ideas_dismissed_${today}`;
    const store = await new Promise(resolve => chrome.storage.local.get(dismissKey, resolve));
    if (store[dismissKey]) ideasRestore.classList.remove('hidden');
  } catch {
    // sin conexión o sin ideas — no mostrar el botón, no es un error visible
  }
}

btnRestoreIdeas.addEventListener('click', async () => {
  const today = new Date().toISOString().slice(0, 10);
  await new Promise(resolve => chrome.storage.local.remove(`ytv_ideas_dismissed_${today}`, resolve));

  // Empujar la pestaña activa a refrescar el panel YA, si es una pestaña de
  // YouTube — sin esto, borrar la marca en storage no hacía nada visible en
  // una pestaña ya abierta hasta la siguiente navegación real (recarga o
  // clic en un enlace). No requiere el permiso "tabs": tabs.query() no
  // necesita permisos especiales para leer solo el id, y tabs.sendMessage()
  // a un content script tampoco. Si la pestaña activa no es YouTube, el
  // mensaje simplemente no tiene quien lo escuche — se ignora en silencio.
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs?.[0]?.id;
    if (tabId == null) return;
    chrome.tabs.sendMessage(tabId, { type: 'YTV_RECHECK_IDEAS' }, () => {
      void chrome.runtime.lastError; // sin listener en esa pestaña = esperado, no es un error
    });
  });

  btnRestoreIdeas.classList.add('hidden');
  ideasRestoreDone.textContent = t(
    '✓ Listo. Si tenías YouTube abierto ya debería verse — si no, aparecerá al abrirlo.',
    "✓ Done. If YouTube was already open it should show up now — otherwise, next time you open it."
  );
  ideasRestoreDone.classList.remove('hidden');
});

// Init: load lang then check user
(async () => {
  try {
    const res = await sendMsg({ type: 'GET_LANG' });
    lang = res?.lang || 'es';
  } catch {
    lang = navigator.language.startsWith('en') ? 'en' : 'es';
  }
  applyLang();

  try {
    const user = await sendMsg({ type: 'GET_USER' });
    if (user) { showUserView(user); checkIdeasRestore(); }
    else showLoginView();
  } catch {
    showLoginView();
  }
})();

// Language toggle
btnLang.addEventListener('click', async () => {
  lang = lang === 'es' ? 'en' : 'es';
  applyLang();
  await sendMsg({ type: 'SET_LANG', lang }).catch(() => {});
  // Re-apply user view if logged in
  try {
    const user = await sendMsg({ type: 'GET_USER' });
    if (user) { showUserView(user); checkIdeasRestore(); }
  } catch {}
});

// Login form submit
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
    checkIdeasRestore();
  } catch (err) {
    showError(loginErrorMessage(err.message));
  } finally {
    btnLogin.disabled = false;
    btnLogin.textContent = t('Iniciar sesión', 'Sign in');
  }
});

// Logout
btnLogout.addEventListener('click', async () => {
  await sendMsg({ type: 'LOGOUT' }).catch(() => {});
  showLoginView();
});
