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
}

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
    if (user) showUserView(user);
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
    if (user) showUserView(user);
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
