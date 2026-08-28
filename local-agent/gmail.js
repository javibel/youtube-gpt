'use strict';

const fs = require('fs');
const path = require('path');
const db = require('./db');
const { generateEmailReply } = require('./claude');
const { sendViaResend } = require('./resend');

const REPORTS_DIR = path.join(__dirname, 'reports');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
const AGENT_EMAIL = process.env.AGENT_EMAIL ?? 'ytbeviral@gmail.com';
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? 'ytbeviral@gmail.com';

async function getAccessToken() {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Gmail OAuth failed: ' + JSON.stringify(data));
  return data.access_token;
}

// ── Classification ──

// Direcciones de la campaña de feedback manual: sus respuestas se reenvían a
// Javier y nunca reciben auto-respuesta (ver regla 0e en classifyEmail).
// Se carga en arranque; si el fichero no existe, el set queda vacío y el
// comportamiento del agente es exactamente el de siempre.
const FEEDBACK_CAMPAIGN_EMAILS = (() => {
  try {
    const p = path.join(__dirname, 'feedback-campaign-guard.json');
    if (!fs.existsSync(p)) return new Set();
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    return new Set((data.emails || []).map(e => String(e).toLowerCase().trim()));
  } catch {
    return new Set();
  }
})();

// Senders/domains that should ALWAYS be forwarded to the owner (never auto-reply)
const IMPORTANT_SENDERS = [
  // Google / Chrome Web Store
  'noreply@google.com', 'chromewebstore-noreply@google.com',
  'chrome-web-store', 'chromeos-developer',
  // Payments & infra
  'stripe.com', 'noreply@stripe.com',
  'vercel.com', 'noreply@vercel.com',
  'github.com', 'noreply@github.com', 'notifications@github.com',
  'neon.tech', 'noreply@neon.tech',
  'cloudflare.com',
  // Directories & marketplaces
  'alternativeto.net',
  'hello@producthunt.com',  // badges, verification (NOT digest.producthunt.com)
  'saashub.com',
  'ytcreator.tools',
  // Security alerts from platforms we use
  'verify@x.com', 'info@x.com',
  'security@mail.instagram.com', '@mail.instagram.com',
];

// Hard blacklist — never reply AND never forward (spam resellers, known bad actors).
// Checked BEFORE important-keyword matching so their "collaboration/sponsorship" wording
// can't route them to the owner. Add senders here to make the agent go fully silent.
const BLACKLIST_SENDERS = [
  'collab.talent.tube@gmail.com', // TalenTube — revendedor de patrocinios YouTube (spam 2026-06-28)
];

// Keywords in subject/body that indicate importance (forward to owner)
const IMPORTANT_KEYWORDS = [
  // Platform actions
  'rejected', 'rechazado', 'suspended', 'suspendido', 'removed', 'eliminado',
  'violation', 'infracción', 'policy', 'política', 'appeal', 'apelación',
  'compliance', 'cumplimiento',
  // Payments & billing
  'payment failed', 'pago fallido', 'invoice', 'factura', 'refund', 'reembolso',
  'chargeback', 'dispute', 'disputa',
  // Security
  'unauthorized', 'breach', 'compromised',
  'password reset', 'suspicious', 'sospechoso',
  'new login', 'nuevo inicio de sesión', 'new sign-in',
  // Legal
  'legal notice', 'aviso legal', 'DMCA', 'copyright', 'trademark',
  // Business opportunities (forward, don't auto-reply)
  'partnership', 'colaboración', 'collaboration', 'collab', 'press', 'media',
  'interview', 'entrevista', 'investment', 'inversión',
  // Sponsorship/reseller offers — el agente NUNCA debe negociar dinero en automático
  'sponsorship', 'sponsored', 'sponsor', 'paid promotion', 'paid placement',
  'flat-fee', 'flat fee', 'rate card', 'media kit', 'promotional video',
  'dedicated video', 'bundle package', 'patrocinio', 'patrocinado',
];

// Emails to completely ignore (no reply, no forward) — automated/marketing/newsletters
const IGNORE_PATTERNS = [
  // No-reply senders (generic)
  /no[_-]?reply@/i,
  /do[_-]?not[_-]?reply@/i,
  /noreply@/i,
  // Automated system emails
  /notifications?@/i,
  /automated?@/i,
  /bounce@/i,
  /mailer[_-]?daemon/i,
  /postmaster@/i,
  // Marketing & newsletters
  /newsletter/i,
  /digest@/i,
  /promotions?@/i,
  /marketing@/i,
  /onboarding@/i,
  /updates?@.*\.(com|io|net)/i,
  /alerts?@.*\.(com|io|net)/i,
  // Bulk email services
  /\.(sendgrid|mailchimp|mailgun|sparkpost|hubspot|constantcontact)\./i,
  // Known spam/marketing senders
  /buffermail\.com/i,
  /aimusic\.so/i,
  /theresanaiforthat\.com/i,
  /heygen\.com/i,
  /fiverr.*@gmail\.com/i,
  // Product Hunt daily digests (NOT hello@producthunt.com which is badges/verification)
  /digest\.producthunt\.com/i,
  // Known spam / unsolicited marketing
  /pbai\.club/i,
  /fiverr/i,
  // Facebook/LinkedIn abandoned — all notifications are noise
  /facebookmail\.com/i,
  /linkedin\.com/i,
  // Generic team/support/info addresses (automated, not personal)
  /^team@/i,
  /^support@/i,
  /^info@/i,
  /^hello@/i,
  /^hi@/i,
  /^contact@/i,
  /^sales@/i,
  /^help@/i,
  /^feedback@/i,
  // BetaList newsletters
  /betalist\.com/i,
  // Catch-all: any email from a company domain with generic prefix
  /^(team|support|info|hello|hi|contact|sales|help|billing|accounts?)@.+\.(com|io|net|org|co|so|app)/i,
];

// Subjects that indicate automated/marketing emails (ignore)
const IGNORE_SUBJECT_PATTERNS = [
  /unsubscribe/i,
  /newsletter/i,
  /weekly digest/i,
  /daily digest/i,
  /your.*tracks?.*expir/i,
  /schedule a post/i,
  /get started/i,
  /welcome to/i,
  /activate your/i,
  /hours? left/i,
  /expir(es?|ing)/i,
  /don'?t miss/i,
  /limited time/i,
  /last chance/i,
  /upgrade (your|now)/i,
  /new (feature|update|release)/i,
  /what'?s new/i,
  /hunted "/i,        // Product Hunt "X hunted Y"
  /started a thread/i, // Product Hunt thread notifications
  /and more$/i,        // BetaList "X, Y, Z, and more"
];

// Remitentes que SÍ están en IMPORTANT_SENDERS (por badges / alertas de seguridad)
// pero que además cuelan newsletters y digests sociales sin valor. Si el asunto
// coincide con uno de estos patrones se ignora ANTES de reenviarlo al owner.
// (2026-08-28 — Javier: adelgazar correo. Se seguían reenviando ~10/día de esto.)
const NOISE_FROM_IMPORTANT_SENDERS = [
  {
    from: /instagram\.com/i,
    subjects: [
      /^explora a /i,
      /descubre lo que han compartido/i,
      /personas? más que sigues/i,
      /y \d+ personas más/i,
      /en tu feed$/i,
      /nuevas cuentas para seguir/i,
    ],
  },
  {
    from: /producthunt\.com/i,
    subjects: [
      /hunted ["“]/i,
      /hunted \d+ launch/i,
      /started a thread/i,
      /is trending/i,
      /top \d+ products/i,
    ],
  },
];

// Coincidencia de palabra clave por palabra completa (no subcadena). Antes
// `"collaborative workspace"` disparaba la keyword `collab` y reenviaba newsletters
// de BetaList al owner. Ancla los extremos a un carácter no alfanumérico.
function keywordMatches(kw, text) {
  const escaped = kw.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, 'i').test(text);
}

// Check List-Unsubscribe header (strong signal it's a newsletter/marketing)
function hasListUnsubscribe(headers) {
  return headers.some(h => h.name.toLowerCase() === 'list-unsubscribe');
}

// SaaSHub newsletters NOT about our vertical → ignore (Property Management, Rental, etc.)
function isSaashubIrrelevantNewsletter(from, subject) {
  if (!from.toLowerCase().includes('saashub.com')) return false;
  const subLower = subject.toLowerCase();
  // Only keep: approval/verification emails, or newsletters mentioning youtube/video/creator/ai tools
  if (subLower.includes('approved') || subLower.includes('verified') || subLower.includes('ytubviral')) return false;
  if (subLower.includes('youtube') || subLower.includes('video') || subLower.includes('creator') || subLower.includes('ai tool')) return false;
  // Generic SaaSHub "Top 15 X" newsletters about unrelated categories
  if (subLower.includes('top 15') || subLower.includes('top 10') || subLower.includes('experts')) return true;
  return false;
}

// Classify an email: 'important' | 'actionable' | 'ignore'
function classifyEmail(from, subject, snippet, headers = []) {
  const fromLower = from.toLowerCase();
  const subjectLower = subject.toLowerCase();
  const snippetLower = (snippet || '').toLowerCase();
  const combined = `${subjectLower} ${snippetLower}`;

  // 0a. Ignore our own emails (Resend sends from @ytubviral.com — prevents forwarding loops)
  if (fromLower.includes('@ytubviral.com')) {
    return 'ignore';
  }

  // 0b. DMARC reports — handled by dmarc-monitor.js, skip here
  if (fromLower.includes('dmarc') && subjectLower.includes('report domain')) {
    return 'ignore';
  }

  // 0c. Filter irrelevant SaaSHub newsletters before anything else
  if (isSaashubIrrelevantNewsletter(from, subject)) {
    return 'ignore';
  }

  // 0d. Hard blacklist — never reply, never forward (spam resellers). Checked before
  //     important-keyword matching so their commercial wording can't route to the owner.
  if (BLACKLIST_SENDERS.some(s => fromLower.includes(s))) {
    return 'ignore';
  }

  // 0e. Campaña de feedback manual (24/08/2026): Javier escribió a mano a los
  //     usuarios registrados pidiéndoles que le contaran por qué no vuelven.
  //     Sus respuestas NUNCA deben recibir auto-respuesta de IA: el email decía
  //     explícitamente "escribo a mano, no es automático", y contestarles con un
  //     bot destruiría justo lo que se les pedía. Se clasifican como 'important'
  //     → se reenvían a Javier y él las lee.
  //     Borrar feedback-campaign-guard.json cuando la campaña termine.
  if (FEEDBACK_CAMPAIGN_EMAILS.size > 0) {
    const senderAddr = (fromLower.match(/<([^>]+)>/) || [, fromLower])[1].trim();
    if (FEEDBACK_CAMPAIGN_EMAILS.has(senderAddr)) {
      return 'important';
    }
  }

  // 0f. Digests / newsletters de remitentes que por lo demás sí importan
  //     (Instagram, Product Hunt). Se filtran antes del check de sender importante.
  for (const rule of NOISE_FROM_IMPORTANT_SENDERS) {
    if (rule.from.test(fromLower) && rule.subjects.some(p => p.test(subjectLower))) {
      return 'ignore';
    }
  }

  // 1. Check important senders FIRST (even if they match no-reply patterns)
  if (IMPORTANT_SENDERS.some(s => fromLower.includes(s))) {
    return 'important';
  }

  // 2. Check important keywords (palabra completa, no subcadena)
  if (IMPORTANT_KEYWORDS.some(kw => keywordMatches(kw, combined))) {
    return 'important';
  }

  // 3. List-Unsubscribe header = newsletter/marketing → ignore
  if (hasListUnsubscribe(headers)) {
    return 'ignore';
  }

  // 4. Check ignore patterns on sender
  if (IGNORE_PATTERNS.some(p => p.test(fromLower))) {
    return 'ignore';
  }

  // 5. Check ignore patterns on subject
  if (IGNORE_SUBJECT_PATTERNS.some(p => p.test(subjectLower))) {
    return 'ignore';
  }

  // 6. Only auto-reply to personal email addresses (gmail, outlook, yahoo, proton, etc.)
  //    Company/domain emails → forward to owner for human review (never auto-reply)
  const senderEmail = (fromLower.match(/<([^>]+)>/) || [, fromLower])[1];
  const PERSONAL_DOMAINS = [
    'gmail.com', 'googlemail.com',
    'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
    'yahoo.com', 'yahoo.es', 'yahoo.co.uk',
    'proton.me', 'protonmail.com', 'proton.com', 'pm.me',
    'icloud.com', 'me.com', 'mac.com',
    'aol.com', 'zoho.com', 'mail.com', 'gmx.com', 'gmx.net',
    'yandex.com', 'yandex.ru',
    'tutanota.com', 'tutamail.com', 'tuta.io',
  ];
  const senderDomain = senderEmail.split('@')[1];
  if (senderDomain && PERSONAL_DOMAINS.includes(senderDomain)) {
    return 'actionable';
  }

  // All other senders (company domains, services, etc.) → forward to owner
  return 'important';
}

// ── Gmail API helpers ──

async function listUnreadMessages(token, maxResults = 10) {
  const res = await fetch(
    `${GMAIL_BASE}/messages?q=is:unread+in:inbox&maxResults=${maxResults}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json();
  return data.messages || [];
}

async function getMessage(token, messageId) {
  const res = await fetch(
    `${GMAIL_BASE}/messages/${messageId}?format=full`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.json();
}

function extractHeader(headers, name) {
  const h = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
  return h?.value || '';
}

function extractBody(payload) {
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8');
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const result = extractBody(part);
      if (result) return result;
    }
  }
  return '';
}

async function markAsRead(token, messageId) {
  await fetch(`${GMAIL_BASE}/messages/${messageId}/modify`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
  });
}

function sanitizeSubject(s) {
  return (s || '')
    .replace(/\\[rnt]/g, ' ')   // literal escape sequences e.g. \n \r \t in header value
    .replace(/[\r\n\t]+/g, ' ') // actual control characters
    .trim()
    .slice(0, 200);
}

async function sendReply(_token, { to, subject, body, bcc }) {
  const clean = sanitizeSubject(subject);
  await sendViaResend({
    to,
    subject: clean.startsWith('Re:') ? clean : `Re: ${clean}`,
    body,
    from: 'support',
    replyTo: 'support@ytubviral.com',
    bcc,
  });
}

async function forwardToOwner(_token, { from, subject, body, snippet }) {
  await sendViaResend({
    to: OWNER_EMAIL,
    subject: `[FWD] ${sanitizeSubject(subject)}`,
    body: `── Reenvío automático del agente ──\nDe: ${from}\nAsunto: ${subject}\n${'─'.repeat(40)}\n\n${body || snippet}\n\n${'─'.repeat(40)}\nReenviado por el agente YTubViral`,
    from: 'agent',
  });
}

// ── DB helpers (match YCMR Prisma schema: fromUser, content, replyContent, etc.) ──

async function saveMessage({ from, content, replied, replyContent, externalId }) {
  // Use cuid-like ID since the table expects text PK
  const id = 'ycml_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  await db.query(`
    INSERT INTO social_messages (id, platform, "fromUser", content, replied, "replyContent", "repliedAt", "externalId", "receivedAt")
    VALUES ($1, 'gmail', $2, $3, $4, $5, $6, $7, NOW())
    ON CONFLICT DO NOTHING
  `, [id, from, (content || '').slice(0, 1000), replied, replyContent ? replyContent.slice(0, 1000) : null, replied ? new Date() : null, externalId || null]).catch(err => {
    console.error('[gmail] DB save error:', err.message);
  });
}

// ── Outreach reply attribution ──
const OUTREACH_TRACKER_PATH = path.join(__dirname, 'outreach-tracker.json');

// If an inbound email is from someone we cold-emailed, attribute the reply back to the
// outreach tracker. This was a measurement void — meta.stats.totalReplied was a hardcoded 0
// that no code ever incremented, so we were flying blind. Idempotent: marks each contact once.
function markOutreachReply(senderEmail) {
  try {
    const email = (senderEmail || '').toLowerCase().trim();
    if (!email) return;
    const tracker = JSON.parse(fs.readFileSync(OUTREACH_TRACKER_PATH, 'utf8'));
    const contact = (tracker.contacts || []).find(c => (c.email || '').toLowerCase().trim() === email);
    if (!contact || contact.dateReplied) return; // not an outreach contact, or already counted
    contact.dateReplied = new Date().toISOString().split('T')[0];
    if (contact.status === 'sent' || contact.status === 'followed-up') contact.status = 'replied';
    tracker.meta = tracker.meta || {};
    tracker.meta.stats = tracker.meta.stats || {};
    tracker.meta.stats.totalReplied = (tracker.contacts || []).filter(c => c.dateReplied).length;
    fs.writeFileSync(OUTREACH_TRACKER_PATH, JSON.stringify(tracker, null, 2));
    console.log(`[gmail] 📨 Outreach REPLY from ${email} (${contact.name}) — marked in tracker`);
  } catch (err) {
    console.error(`[gmail] markOutreachReply failed (non-fatal): ${err.message}`);
  }
}

// ── Main processing ──

async function processInbox() {
  let token;
  try {
    token = await getAccessToken();
  } catch (err) {
    console.error('[gmail] Auth failed:', err.message);
    return;
  }

  const messages = await listUnreadMessages(token);
  if (messages.length === 0) {
    console.log('[gmail] No unread messages');
    return;
  }

  console.log(`[gmail] Processing ${messages.length} unread messages`);
  const processedEmails = []; // Track for daily report

  for (const { id: messageId } of messages) {
    try {
      const msg = await getMessage(token, messageId);
      const headers = msg.payload?.headers || [];
      const from = extractHeader(headers, 'From');
      const subject = extractHeader(headers, 'Subject');
      const messageIdHeader = extractHeader(headers, 'Message-ID');
      const references = extractHeader(headers, 'References');
      const snippet = msg.snippet || '';
      const threadId = msg.threadId;
      const body = extractBody(msg.payload) || snippet;

      // Extract sender email from "Name <email>" format
      const senderEmail = from.match(/<([^>]+)>/)?.[1] || from;

      // Skip emails from ourselves
      if (senderEmail.toLowerCase() === AGENT_EMAIL.toLowerCase()) {
        await markAsRead(token, messageId);
        continue;
      }
      // Skip emails from the owner (already seen by them)
      if (senderEmail.toLowerCase() === OWNER_EMAIL.toLowerCase()) {
        await markAsRead(token, messageId);
        continue;
      }

      // Attribute outreach replies BEFORE classification — a reply from a cold-emailed
      // creator may be classified 'important' (forwarded) or 'actionable' (auto-replied);
      // either way we want to count it in the tracker.
      markOutreachReply(senderEmail);

      const classification = classifyEmail(from, subject, snippet, headers);
      console.log(`[gmail] ${classification.toUpperCase()}: "${subject}" from ${senderEmail}`);

      if (classification === 'ignore') {
        await markAsRead(token, messageId);
        continue;
      }

      // IMPORTANT emails: always forward to owner, never auto-reply
      if (classification === 'important') {
        await forwardToOwner(token, { from, subject, body, snippet });
        console.log(`[gmail] Forwarded to owner: "${subject}"`);
        await saveMessage({ from, content: (body || snippet), replied: false, externalId: threadId });
        processedEmails.push({ classification: 'important', from: senderEmail, subject, snippet: (snippet || '').slice(0, 200) });
        await markAsRead(token, messageId);
        continue;
      }

      // ACTIONABLE emails: generate reply with AI, send with BCC to owner
      const reply = await generateEmailReply(senderEmail, subject, body || snippet);
      if (reply) {
        await sendReply(token, {
          to: senderEmail,
          subject,
          body: reply,
          bcc: OWNER_EMAIL,
          inReplyTo: messageIdHeader,
          references: references ? `${references} ${messageIdHeader}` : messageIdHeader,
          threadId,
        });
        console.log(`[gmail] Replied to ${senderEmail} (BCC owner): "${reply.slice(0, 60)}..."`);
        await saveMessage({ from, content: (body || snippet), replied: true, replyContent: reply, externalId: threadId });
        processedEmails.push({ classification: 'actionable', from: senderEmail, subject, replied: true, snippet: (snippet || '').slice(0, 200), replySnippet: reply.slice(0, 200) });
      } else {
        // AI couldn't generate a reply — forward to owner instead
        await forwardToOwner(token, { from, subject, body, snippet });
        console.log(`[gmail] No auto-reply possible, forwarded to owner: "${subject}"`);
        await saveMessage({ from, content: (body || snippet), replied: false, externalId: threadId });
        processedEmails.push({ classification: 'actionable', from: senderEmail, subject, replied: false, snippet: (snippet || '').slice(0, 200) });
      }

      await markAsRead(token, messageId);
      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      console.error(`[gmail] Error processing message ${messageId}:`, err.message);
      // Mark as read so we don't retry the same broken message on every cron run
      try { await markAsRead(token, messageId); } catch {}
    }
  }

  // Save daily report for Manager to pick up
  if (processedEmails.length > 0) {
    const today = new Date().toISOString().slice(0, 10);
    const reportFile = path.join(REPORTS_DIR, `gmail-${today}.json`);
    let existing = [];
    try { existing = JSON.parse(fs.readFileSync(reportFile, 'utf-8')); } catch {}
    const merged = [...existing, ...processedEmails];
    if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
    fs.writeFileSync(reportFile, JSON.stringify(merged, null, 2));
  }

  console.log('[gmail] Inbox processing complete');
}

/**
 * Read-only fetch of recent emails for the morning-fix audit.
 * Does NOT mark as read or take any action.
 * Returns an array of { from, subject, snippet, classification, date }.
 */
async function getRecentEmails(maxResults = 20) {
  let token;
  try { token = await getAccessToken(); }
  catch (err) { return { error: 'auth_failed', message: err.message }; }

  const messages = await listUnreadMessages(token, maxResults);
  const results = [];

  for (const { id: messageId } of messages) {
    try {
      const msg = await getMessage(token, messageId);
      const { payload, snippet } = msg;
      const headers = payload?.headers || [];
      const from    = extractHeader(headers, 'From') || '';
      const subject = extractHeader(headers, 'Subject') || '';
      const date    = extractHeader(headers, 'Date') || '';
      const cls     = classifyEmail(from, subject, snippet, headers);
      results.push({ from, subject, snippet: (snippet || '').slice(0, 300), classification: cls, date });
    } catch {}
  }
  return results;
}

module.exports = { processInbox, getRecentEmails, classifyEmail };
