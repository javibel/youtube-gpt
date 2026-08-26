'use strict';

/**
 * SMOKE BROWSER — comprueba la web en un navegador de verdad.
 *
 * Por que existe (26/08/2026): la CSP de produccion no declaraba `media-src`, asi que
 * Chrome bloqueaba las blob: URLs y el reproductor de previews salia en negro. Estuvo
 * roto casi dos meses sin que saltara ninguna alarma, porque TODA la monitorizacion
 * (Sentinel, Feature Monitor) es HTTP con fetch() y el servidor devolvia 200 durante
 * todo ese tiempo. El fallo solo existia dentro del navegador.
 *
 * Esto cubre esa categoria entera: errores de JavaScript, recursos bloqueados por CSP,
 * peticiones fallidas y paginas que revientan al cargar. Nada de esto es visible desde
 * el servidor.
 *
 * Tres bloques:
 *   1. Contrato de CSP  — sin navegador. Comprueba que la cabecera declara todas las
 *      directivas que el producto necesita. Determinista y es lo que habria cazado el
 *      bug el mismo dia que se desplego.
 *   2. Paginas publicas — Puppeteer. Falla ante cualquier error de consola o de pagina.
 *   3. Dashboard logueado — solo si existen SMOKE_EMAIL y SMOKE_PASSWORD en .env.
 *      Sin esas variables se salta, avisando. NO se crea ninguna cuenta automaticamente:
 *      las metricas de usuarios ya estan contaminadas por cuentas propias y meter otra
 *      sintetica las empeora. La cuenta la crea Javier por el registro normal.
 *
 * Uso:  node smoke-browser.js          (informa por consola, email solo si falla)
 *       node smoke-browser.js --email  (fuerza el email aunque pase todo)
 *       node smoke-browser.js --no-email (nunca envia: para probar el propio script)
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { sendEmail } = require('./reports');

const BASE = 'https://ytubviral.com';
const REPORTS_DIR = path.join(__dirname, 'reports');
const NAV_TIMEOUT = 30000;

// Directivas que el producto necesita de verdad, con el valor que necesita.
// Si alguien endurece la CSP y se deja una fuera, esto falla en la siguiente pasada
// en vez de esperar a que un usuario se encuentre una pantalla en negro.
const CSP_REQUIRED = [
  { directive: 'media-src',   needs: 'blob:', why: 'reproductor de video previews (URL.createObjectURL)' },
  { directive: 'img-src',     needs: 'blob:', why: 'editor de miniaturas' },
  { directive: 'img-src',     needs: 'data:', why: 'imagenes embebidas en canvas' },
  { directive: 'worker-src',  needs: 'blob:', why: 'quitado de fondo de imagenes (imgly/onnxruntime)' },
  { directive: 'connect-src', needs: 'blob:', why: 'lectura de blobs generados en cliente' },
  { directive: 'script-src',  needs: 'https://js.stripe.com', why: 'checkout de Stripe' },
  { directive: 'frame-src',   needs: 'https://www.youtube.com', why: 'videos incrustados de YouTube' },
  { directive: 'font-src',    needs: 'https://fonts.gstatic.com', why: 'Google Fonts' },
];

// Paginas publicas que ve practicamente todo el trafico.
const PUBLIC_PAGES = ['/', '/pricing', '/seo-score', '/tools', '/competitors', '/blog'];

// Ruido que no depende de nosotros y no debe hacer fallar la pasada.
const IGNORED = [
  /apple-mobile-web-app-capable/i,   // aviso de deprecacion de Chrome, cosmetico
  /Download the React DevTools/i,
  /chrome-extension:/i,
  /favicon\.ico/i,
];
const isNoise = (msg) => IGNORED.some(re => re.test(msg));

function ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }

// ── 1. Contrato de CSP ───────────────────────────────────────────────────────
async function checkCspContract() {
  const issues = [];
  let res;
  try {
    res = await fetch(BASE, { signal: AbortSignal.timeout(NAV_TIMEOUT) });
  } catch (err) {
    return [{ severity: 'high', what: 'csp-header', detail: 'No se pudo leer la cabecera: ' + err.message }];
  }

  const csp = res.headers.get('content-security-policy');
  if (!csp) {
    return [{ severity: 'critical', what: 'csp-header', detail: 'No hay cabecera Content-Security-Policy en produccion' }];
  }

  // "media-src 'self' blob:" -> { 'media-src': "'self' blob:" }
  const parsed = {};
  for (const part of csp.split(';')) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name) parsed[name.toLowerCase()] = values.join(' ');
  }

  for (const { directive, needs, why } of CSP_REQUIRED) {
    const value = parsed[directive];
    if (value === undefined) {
      issues.push({
        severity: 'high', what: `csp:${directive}`,
        detail: `Directiva ausente — cae en default-src y rompe: ${why}`,
      });
    } else if (!value.includes(needs)) {
      issues.push({
        severity: 'high', what: `csp:${directive}`,
        detail: `No incluye ${needs} — rompe: ${why} (valor actual: ${value})`,
      });
    }
  }

  if (!parsed['report-uri'] && !parsed['report-to']) {
    issues.push({
      severity: 'medium', what: 'csp:report-uri',
      detail: 'La politica enforced no reporta a ningun sitio: un bloqueo real seria invisible',
    });
  }

  return issues;
}

// ── 2 y 3. Navegador ─────────────────────────────────────────────────────────
// Engancha una pagina y devuelve el array donde se van acumulando los problemas.
function watchPage(page, label, problems) {
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (isNoise(text)) return;
    problems.push({ severity: 'high', what: `console:${label}`, detail: text.slice(0, 300) });
  });
  page.on('pageerror', (err) => {
    if (isNoise(err.message)) return;
    problems.push({ severity: 'critical', what: `pageerror:${label}`, detail: err.message.slice(0, 300) });
  });
  page.on('requestfailed', (req) => {
    const reason = req.failure()?.errorText || 'desconocido';
    const url = req.url();
    if (isNoise(url)) return;
    problems.push({ severity: 'high', what: `request:${label}`, detail: `${reason} — ${url.slice(0, 200)}` });
  });
}

async function checkPublicPages(browser) {
  const problems = [];
  for (const route of PUBLIC_PAGES) {
    const page = await browser.newPage();
    watchPage(page, route, problems);
    try {
      const res = await page.goto(BASE + route, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT });
      if (res && res.status() >= 400) {
        problems.push({ severity: 'critical', what: `status:${route}`, detail: `HTTP ${res.status()}` });
      }
      // Da margen a que se ejecute el JS diferido y aparezcan sus errores.
      await new Promise(r => setTimeout(r, 1500));
    } catch (err) {
      problems.push({ severity: 'critical', what: `nav:${route}`, detail: err.message.slice(0, 200) });
    } finally {
      await page.close().catch(() => {});
    }
  }
  return problems;
}

async function checkDashboard(browser) {
  const email = process.env.SMOKE_EMAIL?.trim();
  const password = process.env.SMOKE_PASSWORD?.trim();
  if (!email || !password) {
    return [{
      severity: 'info', what: 'dashboard',
      detail: 'Saltado: faltan SMOKE_EMAIL / SMOKE_PASSWORD en .env. Sin eso no se puede '
            + 'comprobar la zona logueada, que es justo donde vivia el bug del reproductor.',
    }];
  }

  const problems = [];
  const page = await browser.newPage();
  watchPage(page, 'dashboard', problems);

  try {
    await page.goto(BASE + '/login', { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT });
    await page.type('input[type="email"]', email);
    await page.type('input[type="password"]', password);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: NAV_TIMEOUT }).catch(() => {}),
      page.click('button[type="submit"]'),
    ]);

    if (!page.url().includes('/dashboard')) {
      await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT });
    }
    if (page.url().includes('/login')) {
      problems.push({ severity: 'critical', what: 'login', detail: 'No se pudo iniciar sesion con SMOKE_EMAIL' });
      return problems;
    }

    await new Promise(r => setTimeout(r, 2000));

    // Abrir un preview: es el camino exacto que estuvo roto dos meses.
    const opened = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('button'));
      const target = items.find(b => b.closest('[class*="rounded-xl"]') && b.className.includes('truncate'));
      if (!target) return false;
      target.click();
      return true;
    });

    if (opened) {
      await new Promise(r => setTimeout(r, 4000));
      // No basta con que no haya errores: el video tiene que haber decodificado.
      const video = await page.evaluate(() => {
        const v = document.querySelector('video');
        if (!v) return null;
        return { readyState: v.readyState, videoWidth: v.videoWidth, error: v.error && v.error.code };
      });
      if (video === null) {
        problems.push({ severity: 'high', what: 'preview', detail: 'Se abrio el reproductor pero no hay elemento <video>' });
      } else if (video.error) {
        problems.push({ severity: 'critical', what: 'preview', detail: `El video fallo al cargar (code ${video.error})` });
      } else if (video.videoWidth === 0) {
        problems.push({ severity: 'critical', what: 'preview', detail: 'El video no decodifica: videoWidth=0 (pantalla en negro)' });
      }
    }
  } catch (err) {
    problems.push({ severity: 'high', what: 'dashboard', detail: err.message.slice(0, 200) });
  } finally {
    await page.close().catch(() => {});
  }

  return problems;
}

// ── Orquestacion ─────────────────────────────────────────────────────────────
async function runSmokeBrowser({ forceEmail = false, noEmail = false } = {}) {
  console.log('[smoke-browser] Comprobando la web en un navegador real...');
  const started = Date.now();
  let problems = [];

  problems = problems.concat(await checkCspContract());

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    problems = problems.concat(await checkPublicPages(browser));
    problems = problems.concat(await checkDashboard(browser));
  } catch (err) {
    problems.push({ severity: 'high', what: 'puppeteer', detail: 'No se pudo lanzar el navegador: ' + err.message });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  const blocking = problems.filter(p => p.severity === 'critical' || p.severity === 'high');
  const result = {
    timestamp: new Date().toISOString(),
    agent: 'smoke-browser',
    durationMs: Date.now() - started,
    ok: blocking.length === 0,
    problems,
  };

  ensureDir(REPORTS_DIR);
  const file = path.join(REPORTS_DIR, `smoke-browser-${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(file, JSON.stringify(result, null, 2));

  for (const p of problems) console.log(`  [${p.severity}] ${p.what}: ${p.detail}`);
  console.log(`[smoke-browser] ${result.ok ? 'OK' : blocking.length + ' problema(s)'} en ${Math.round(result.durationMs / 1000)}s`);

  if (!noEmail && (blocking.length > 0 || forceEmail)) {
    const lines = problems.map(p => `[${p.severity}] ${p.what}\n  ${p.detail}`).join('\n\n');
    await sendEmail(
      result.ok ? 'Smoke browser: todo OK' : `Smoke browser: ${blocking.length} problema(s) en produccion`,
      `Comprobacion de ytubviral.com en un navegador real.\n\n${lines || 'Sin incidencias.'}\n\nInforme: ${file}`,
    ).catch(err => console.error('[smoke-browser] email:', err.message));
  }

  return result;
}

module.exports = { runSmokeBrowser, checkCspContract };

if (require.main === module) {
  runSmokeBrowser({ forceEmail: process.argv.includes('--email'), noEmail: process.argv.includes('--no-email') })
    .then(r => process.exit(r.ok ? 0 : 1))
    .catch(err => { console.error('[smoke-browser] fallo:', err); process.exit(1); });
}
