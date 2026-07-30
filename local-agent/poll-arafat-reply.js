require('dotenv').config();
const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const TARGET = 'arafatbhai301yt@gmail.com';

async function token() {
  const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET, refresh_token: process.env.GMAIL_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN, grant_type: 'refresh_token' }) });
  return (await r.json()).access_token;
}

(async () => {
  const tk = await token();
  if (!tk) { console.error('no token'); process.exit(1); }
  // look for any message FROM arafat in inbox (a reply). He has not emailed us before, so any hit = reply.
  const list = await fetch(`${GMAIL_BASE}/messages?q=${encodeURIComponent('in:inbox from:' + TARGET)}&maxResults=5`, { headers: { Authorization: `Bearer ${tk}` } }).then(r => r.json());
  const msgs = list.messages || [];
  if (!msgs.length) { console.log('NO_REPLY_YET'); process.exit(0); }
  const msg = await fetch(`${GMAIL_BASE}/messages/${msgs[0].id}?format=full`, { headers: { Authorization: `Bearer ${tk}` } }).then(r => r.json());
  const h = msg.payload?.headers || [];
  const date = (h.find(x => x.name.toLowerCase() === 'date') || {}).value || '';
  const subj = (h.find(x => x.name.toLowerCase() === 'subject') || {}).value || '';
  console.log('ARAFAT_REPLIED', date, '|', subj);
  console.log('SNIPPET:', (msg.snippet || '').slice(0, 300));
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
