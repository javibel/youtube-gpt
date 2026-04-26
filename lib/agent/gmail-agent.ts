import { prisma } from '@/lib/prisma';
import { generateGmailReply } from './content-generator';

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const AGENT_EMAIL = process.env.AGENT_EMAIL ?? 'ytbeviral@gmail.com';

// ── OAuth helpers ─────────────────────────────────────────────────────────────

async function getAccessToken(): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GMAIL_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN ?? process.env.GOOGLE_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Gmail OAuth failed: ${JSON.stringify(data)}`);
  return data.access_token as string;
}

// ── Gmail API helpers ─────────────────────────────────────────────────────────

async function gmailGet(path: string, token: string) {
  const res = await fetch(`${GMAIL_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Gmail GET ${path} failed: ${res.status}`);
  return res.json();
}

async function gmailPost(path: string, token: string, body: unknown) {
  const res = await fetch(`${GMAIL_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail POST ${path} failed: ${res.status} ${err}`);
  }
  return res.json();
}

// ── Email parsing ─────────────────────────────────────────────────────────────

function decodeBase64(str: string): string {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  try {
    return Buffer.from(base64, 'base64').toString('utf-8');
  } catch {
    return '';
  }
}

function extractEmailBody(payload: {
  mimeType: string;
  body?: { data?: string };
  parts?: { mimeType: string; body?: { data?: string } }[];
}): string {
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBase64(payload.body.data);
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64(part.body.data);
      }
    }
  }
  return '';
}

function getHeader(headers: { name: string; value: string }[], name: string): string {
  return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

// ── MIME email builder ────────────────────────────────────────────────────────

const OWNER_EMAIL = 'javijimenoplata@gmail.com';

const IMPORTANT_KEYWORDS = [
  'cancelar', 'cancel', 'baja', 'unsubscribe', 'reembolso', 'refund',
  'pago', 'payment', 'cobro', 'charge', 'factura', 'invoice',
  'queja', 'complaint', 'problema grave', 'urgent', 'urgente',
  'legal', 'abogado', 'lawyer', 'demanda', 'lawsuit',
  'partnership', 'colaboración', 'prensa', 'press', 'media', 'inversión', 'investment',
];

function isImportant(subject: string, body: string): boolean {
  const text = `${subject} ${body}`.toLowerCase();
  return IMPORTANT_KEYWORDS.some(kw => text.includes(kw));
}

function buildMimeEmail({
  to,
  from,
  subject,
  body,
  inReplyTo,
  references,
  bcc,
}: {
  to: string;
  from: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string;
  bcc?: string;
}): string {
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset=utf-8`,
    `MIME-Version: 1.0`,
  ];
  if (bcc) lines.push(`Bcc: ${bcc}`);
  if (inReplyTo) lines.push(`In-Reply-To: ${inReplyTo}`);
  if (references) lines.push(`References: ${references}`);
  lines.push('', body);
  const raw = lines.join('\r\n');
  return Buffer.from(raw).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ── Main agent function ───────────────────────────────────────────────────────

export interface GmailAgentResult {
  processed: number;
  replied: number;
  errors: string[];
}

export async function runGmailAgent(): Promise<GmailAgentResult> {
  const result: GmailAgentResult = { processed: 0, replied: 0, errors: [] };

  const token = await getAccessToken();

  // List unread messages in inbox (exclude sent by us)
  const listData = await gmailGet(
    `/messages?q=is:unread in:inbox -from:${AGENT_EMAIL}&maxResults=10`,
    token
  );

  const messages: { id: string; threadId: string }[] = listData.messages ?? [];
  if (messages.length === 0) return result;

  for (const msg of messages) {
    try {
      result.processed++;

      // Get full message
      const fullMsg = await gmailGet(`/messages/${msg.id}?format=full`, token);
      const headers: { name: string; value: string }[] = fullMsg.payload?.headers ?? [];
      const subject = getHeader(headers, 'subject') || '(sin asunto)';
      const from = getHeader(headers, 'from');
      const messageId = getHeader(headers, 'message-id');
      const references = getHeader(headers, 'references');
      const body = extractEmailBody(fullMsg.payload);

      // Extract sender name and email
      const fromMatch = from.match(/^(.*?)\s*<(.+?)>$/) ?? ['', from, from];
      const senderName = fromMatch[1].trim() || fromMatch[2];
      const senderEmail = fromMatch[2];

      // Skip if no meaningful body
      if (!body.trim()) {
        await gmailPost(`/messages/${msg.id}/modify`, token, {
          removeLabelIds: ['UNREAD'],
        });
        continue;
      }

      // Generate reply with Claude
      const replyBody = await generateGmailReply(subject, body, senderName);

      // Check if important — BCC owner
      const important = isImportant(subject, body);

      // Send reply
      const rawEmail = buildMimeEmail({
        to: senderEmail,
        from: `Equipo YTubViral <${AGENT_EMAIL}>`,
        subject: subject.startsWith('Re:') ? subject : `Re: ${subject}`,
        body: replyBody,
        inReplyTo: messageId,
        references: references ? `${references} ${messageId}` : messageId,
        bcc: important ? OWNER_EMAIL : undefined,
      });

      await gmailPost('/messages/send', token, {
        raw: rawEmail,
        threadId: msg.threadId,
      });

      // Mark original as read
      await gmailPost(`/messages/${msg.id}/modify`, token, {
        removeLabelIds: ['UNREAD'],
      });

      // Save to DB
      await prisma.socialMessage.create({
        data: {
          platform: 'gmail',
          fromUser: from,
          content: body.slice(0, 1000),
          replied: true,
          replyContent: replyBody,
          repliedAt: new Date(),
        },
      });

      result.replied++;
    } catch (err) {
      const msg_err = err instanceof Error ? err.message : String(err);
      result.errors.push(`Gmail message ${msg.id}: ${msg_err}`);
      console.error('[gmail-agent]', msg_err);
    }
  }

  return result;
}

// ── Send a plain notification email ──────────────────────────────────────────

export async function sendNotificationEmail(
  subject: string,
  body: string
): Promise<void> {
  const token = await getAccessToken();
  const rawEmail = buildMimeEmail({
    to: AGENT_EMAIL,
    from: `YTubViral Agent <${AGENT_EMAIL}>`,
    subject,
    body,
  });
  await gmailPost('/messages/send', token, { raw: rawEmail });
}

export async function sendOwnerEmail(
  subject: string,
  body: string
): Promise<void> {
  const token = await getAccessToken();
  const rawEmail = buildMimeEmail({
    to: OWNER_EMAIL,
    from: `YTubViral Agent <${AGENT_EMAIL}>`,
    subject,
    body,
  });
  await gmailPost('/messages/send', token, { raw: rawEmail });
}
