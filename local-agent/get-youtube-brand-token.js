/**
 * YouTube (canal de marca) — regenerar el refresh token muerto desde el 31/07.
 *
 * El cron vespertino (app/api/cron/evening, 16:30 UTC) usa GOOGLE_REFRESH_TOKEN
 * fijo para responder comentarios en el canal de YTubViral como la marca. Ese
 * token lleva devolviendo invalid_grant/Bad Request cada noche desde el
 * 31/07/2026 (23 correos "[YTubViral Agent] Errores en cron vespertino") — el
 * mismo comentario atascado se reintenta sin fin porque nunca llega a marcarse
 * como respondido.
 *
 * Este script NO toca tus credenciales: abre el navegador, TU inicias sesion
 * con la cuenta de Google que administra el canal de YTubViral (normalmente
 * ytbeviral@gmail.com) y das consentimiento; el script solo recoge el codigo
 * y lo cambia por un refresh_token nuevo.
 *
 * REQUISITO UNICO (una sola vez): en Google Cloud Console → APIs & Services →
 * Credentials → el OAuth Client de GOOGLE_CLIENT_ID → Authorized redirect URIs
 * → añadir http://localhost:3458/callback. Si ya esta, no hace falta tocar nada.
 *
 * Uso: node get-youtube-brand-token.js
 * Al terminar, copia el valor impreso a GOOGLE_REFRESH_TOKEN en Vercel
 * (Project Settings → Environment Variables) y en local-agent/.env si tambien
 * se usa ahi. Redeploy para que la web lo recoja.
 */

require('dotenv').config();
const http = require('http');
const { URL } = require('url');
const { exec } = require('child_process');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const PORT = 3458; // distinto del 3456 (dashboard-server.js / get-gmail-token.js)
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
// Mismo scope que usa /api/youtube/auth para el flujo de usuario — force-ssl
// es el que permite escribir (postear respuestas a comentarios).
const SCOPE = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube.force-ssl',
].join(' ');

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Falta GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET en .env');
  process.exit(1);
}

const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
  `client_id=${CLIENT_ID}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent(SCOPE)}` +
  `&access_type=offline` +
  `&prompt=consent`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname !== '/callback') return;

  const errorParam = url.searchParams.get('error');
  if (errorParam) {
    res.end(`Google devolvió un error: ${errorParam}. Revisa la terminal.`);
    console.error('\nGoogle devolvió error:', errorParam);
    if (errorParam === 'redirect_uri_mismatch') {
      console.error(`Añade ${REDIRECT_URI} como Authorized redirect URI del OAuth Client en Google Cloud Console.`);
    }
    setTimeout(() => { server.close(); process.exit(1); }, 500);
    return;
  }

  const code = url.searchParams.get('code');
  if (!code) { res.end('No se recibió código'); return; }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    const data = await tokenRes.json();

    if (data.refresh_token) {
      console.log('\n✅ Listo. Actualiza GOOGLE_REFRESH_TOKEN:\n');
      console.log(`GOOGLE_REFRESH_TOKEN=${data.refresh_token}`);
      console.log('\nScopes concedidos:', data.scope);
      console.log('\nPégalo en:');
      console.log('  1. Vercel → youtube-gpt → Settings → Environment Variables → GOOGLE_REFRESH_TOKEN (Production) → Redeploy');
      console.log('  2. local-agent/.env → GOOGLE_REFRESH_TOKEN (si algún script local también lo usa)');
      res.end('Éxito. Puedes cerrar esta pestaña — copia el token de la terminal.');
    } else {
      console.error('No llegó refresh_token en la respuesta:', JSON.stringify(data));
      res.end('Error — revisa la terminal');
    }
  } catch (err) {
    console.error('Fallo al canjear el código:', err);
    res.end('Error — revisa la terminal');
  }

  setTimeout(() => { server.close(); process.exit(0); }, 1000);
});

server.listen(PORT, () => {
  console.log('Abriendo el navegador para autorizar el canal de YouTube de YTubViral...');
  console.log('Inicia sesión con la cuenta que administra el canal (normalmente ytbeviral@gmail.com).');
  console.log('Si no se abre solo, visita:\n', authUrl, '\n');
  exec(`start "" "${authUrl}"`);
});
