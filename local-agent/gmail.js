'use strict';

const fs = require('fs');
const path = require('path');
const db = require('./db');
const { generateEmailReply } = require('./claude');

const REPORTS_DIR = path.join(__dirname, 'reports');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
const AGENT_EMAIL = process.env.AGENT_EMAIL ?? 'ytbeviral@gmail.com';
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? 'javijimenoplata@gmail.com';

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

// ── Email building ──

function buildRawEmail({ to, from, subject, body, bcc, inReplyTo, references, threadId }) {
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
  ];
  if (bcc) lines.push(`Bcc: ${bcc}`);
  lines.push(`Subject: ${subject}`);
  if (inReplyTo) lines.push(`In-Reply-To: ${inReplyTo}`);
  if (references) lines.push(`References: ${references}`);
  lines.push(
    'Content-Type: text/plain; charset=utf-8',
    'MIME-Version: 1.0',
    '',
    body,
  );
  const raw = lines.join('\r\n');
  return Buffer.from(raw).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ── Classification ──

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
  'partnership', 'colaboración', 'press', 'media', 'interview', 'entrevista',
  'investment', 'inversión',
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
];

// Subjects that indicate automated/marketing emails (ignore)
const IGNORE_SUBJECT_PATTERNS = [
  /unsubscribe/i,
  /newsletter/i,
  /weekly digest/i,
  /your.*tracks?.*expir/i,
  /schedule a post/i,
  /get started/i,
  /welcome to/i,
  /activate your/i,
];

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

  // 0. Filter irrelevant SaaSHub newsletters before anything else
  if (isSaashubIrrelevantNewsletter(from, subject)) {
    return 'ignore';
  }

  // 1. Check important senders FIRST (even if they match no-reply patterns)
  if (IMPORTANT_SENDERS.some(s => fromLower.includes(s))) {
    return 'important';
  }

  // 2. Check important keywords
  if (IMPORTANT_KEYWORDS.some(kw => combined.includes(kw.toLowerCase()))) {
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

  // Everything else is potentially actionable (a real person wrote to ytbeviral@gmail.com)
  return 'actionable';
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

async function sendReply(token, { to, subject, body, bcc, inReplyTo, references, threadId }) {
  const raw = buildRawEmail({
    to,
    from: `YTubViral <${AGENT_EMAIL}>`,
    subject: subject.startsWith('Re:') ? subject : `Re: ${subject}`,
    body,
    bcc,
    inReplyTo,
    references,
  });
  const payload = { raw };
  if (threadId) payload.threadId = threadId;

  const res = await fetch(`${GMAIL_BASE}/messages/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return res.json();
}

async function forwardToOwner(token, { from, subject, body, snippet }) {
  const raw = buildRawEmail({
    to: OWNER_EMAIL,
    from: `YTubViral Agent <${AGENT_EMAIL}>`,
    subject: `[FWD] ${subject}`,
    body: `── Reenvío automático del agente ──\nDe: ${from}\nAsunto: ${subject}\n${'─'.repeat(40)}\n\n${body || snippet}\n\n${'─'.repeat(40)}\nReenviado por el agente YTubViral`,
  });

  await fetch(`${GMAIL_BASE}/messages/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
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
        processedEmails.push({ classification: 'actionable', from: senderEmail, subject, replied: true, snippet: (snippet || '').slice(0, 200) });
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

module.exports = { processInbox };
