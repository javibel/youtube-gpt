/**
 * Instagram (cuenta de YTubViral) — regenerar INSTAGRAM_ACCESS_TOKEN, caducado
 * desde el 05/09/2026 (ver memoria project_instagram_token_expired).
 *
 * Esta integracion usa "Instagram API with Instagram Login" directamente
 * (lib/agent/meta-agent.ts llama a graph.instagram.com, NO graph.facebook.com)
 * — es un token de usuario de Instagram, no un Page Access Token de Facebook.
 * Por eso NO se genera desde Graph API Explorer como sugeria la nota anterior;
 * el flujo correcto es este: www.instagram.com/oauth/authorize -> intercambio
 * por token corto -> intercambio por token largo (60 dias).
 *
 * Este script NO toca tus credenciales: abre el navegador, TU inicias sesion
 * con la cuenta de Instagram que administra @ytubviral y das consentimiento;
 * el script solo recoge el codigo y hace los dos intercambios por ti.
 *
 * REQUISITOS (una sola vez):
 * 1. En Meta for Developers (developers.facebook.com/apps) -> la app que usa
 *    YTubViral -> producto "Instagram" -> Instagram Business Login ->
 *    Configuracion: anadir http://localhost:3460/callback a las Valid OAuth
 *    Redirect URIs. Si ya esta, no hace falta tocar nada.
 * 2. INSTAGRAM_APP_ID (el Instagram app ID, NO secreto, esta en esa misma
 *    pantalla) tiene que estar en local-agent/.env o en
 *    C:/Users/jimen/youtube-gpt/youtube-gpt/.env.local. META_APP_SECRET ya
 *    existe en .env.local del webapp y este script lo reutiliza.
 *
 * Uso: node get-instagram-token.js
 * Al terminar, copia el valor impreso a INSTAGRAM_ACCESS_TOKEN en Vercel
 * (Project Settings -> Environment Variables -> Production) y redeploy
 * (o espera al siguiente cron, 05:57/14:40 UTC).
 *
 * El token dura ~60 dias. Antes de que caduque se puede refrescar sin volver
 * a hacer login: GET graph.instagram.com/refresh_access_token con
 * grant_type=ig_refresh_token — pendiente de automatizar en un cron aparte.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', 'youtube-gpt', '.env.local') });
const http = require('http');
const { URL } = require('url');
const { exec } = require('child_process');

const APP_ID = process.env.INSTAGRAM_APP_ID;
const APP_SECRET = process.env.META_APP_SECRET;
const PORT = 3460; // distinto de 3456 (dashboard-server.js), 3458 (YouTube), 3459 (libre)
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const SCOPE = [
  'instagram_business_basic',
  'instagram_business_content_publish',
].join(',');

if (!APP_ID) {
  console.error('Falta INSTAGRAM_APP_ID.');
  console.error('Consiguelo en developers.facebook.com/apps -> tu app -> producto Instagram');
  console.error('-> Instagram Business Login -> Configuracion (es publico, no secreto).');
  console.error('Anadelo a local-agent/.env o a youtube-gpt/.env.local como INSTAGRAM_APP_ID=... y reejecuta.');
  process.exit(1);
}
if (!APP_SECRET) {
  console.error('Falta META_APP_SECRET en youtube-gpt/.env.local o local-agent/.env');
  process.exit(1);
}

const authUrl = `https://www.instagram.com/oauth/authorize?` +
  `client_id=${APP_ID}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent(SCOPE)}`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname !== '/callback') return;

  const errorParam = url.searchParams.get('error') || url.searchParams.get('error_reason');
  if (errorParam) {
    res.end(`Instagram devolvió un error: ${errorParam}. Revisa la terminal.`);
    console.error('\nInstagram devolvió error:', errorParam, url.searchParams.get('error_description') || '');
    setTimeout(() => { server.close(); process.exit(1); }, 500);
    return;
  }

  const code = url.searchParams.get('code');
  if (!code) { res.end('No se recibió código'); return; }

  try {
    // Paso 1: código -> token corto (~1h)
    const shortRes = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: APP_ID,
        client_secret: APP_SECRET,
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI,
        code,
      }),
    });
    const shortData = await shortRes.json();

    if (!shortData.access_token) {
      console.error('No llegó access_token corto en la respuesta:', JSON.stringify(shortData));
      res.end('Error — revisa la terminal');
      setTimeout(() => { server.close(); process.exit(1); }, 500);
      return;
    }

    // Paso 2: token corto -> token largo (60 días)
    const longUrl = `https://graph.instagram.com/access_token?` +
      `grant_type=ig_exchange_token&client_secret=${APP_SECRET}&access_token=${shortData.access_token}`;
    const longRes = await fetch(longUrl);
    const longData = await longRes.json();

    if (longData.access_token) {
      const days = Math.round((longData.expires_in || 0) / 86400);
      console.log(`\n✅ Listo. Token largo (${days} días). Actualiza INSTAGRAM_ACCESS_TOKEN:\n`);
      console.log(`INSTAGRAM_ACCESS_TOKEN=${longData.access_token}`);
      console.log(`\nCuenta de Instagram (user_id): ${shortData.user_id}`);
      console.log('Verifica que coincide con INSTAGRAM_ACCOUNT_ID en Vercel antes de pegar el token.');
      console.log('\nPégalo en Vercel → youtube-gpt → Settings → Environment Variables → INSTAGRAM_ACCESS_TOKEN (Production) → Redeploy');
      res.end('Éxito. Puedes cerrar esta pestaña — copia el token de la terminal.');
    } else {
      console.error('No llegó access_token largo en la respuesta:', JSON.stringify(longData));
      res.end('Error en el intercambio a token largo — revisa la terminal');
    }
  } catch (err) {
    console.error('Fallo al canjear el código:', err);
    res.end('Error — revisa la terminal');
  }

  setTimeout(() => { server.close(); process.exit(0); }, 1000);
});

server.listen(PORT, () => {
  console.log('Abriendo el navegador para autorizar la cuenta de Instagram de YTubViral...');
  console.log('Inicia sesión con la cuenta que administra @ytubviral.');
  console.log('Si no se abre solo, visita:\n', authUrl, '\n');
  exec(`start "" "${authUrl}"`);
});
