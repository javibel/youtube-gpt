'use strict';

/**
 * Shared Resend email sender for local-agent.
 * Uses the Resend HTTP API directly (no SDK needed).
 *
 * Domain addresses:
 *   hello@ytubviral.com    — general / daily reports
 *   support@ytubviral.com  — auto-replies to users, session alerts
 *   legal@ytubviral.com    — legal notices
 *   privacy@ytubviral.com  — privacy-related
 */

const RESEND_API = 'https://api.resend.com/emails';

const FROM_ADDRESSES = {
  hello:   'YTubViral <hello@ytubviral.com>',
  support: 'YTubViral Support <support@ytubviral.com>',
  legal:   'YTubViral Legal <legal@ytubviral.com>',
  privacy: 'YTubViral Privacy <privacy@ytubviral.com>',
  agent:   'YTubViral Agent <hello@ytubviral.com>',
};

/**
 * Send an email via Resend.
 * @param {object} opts
 * @param {string} opts.to — recipient
 * @param {string} opts.subject
 * @param {string} opts.body — plain text body
 * @param {string} [opts.html] — optional HTML body
 * @param {string} [opts.from='agent'] — key from FROM_ADDRESSES or a full "Name <email>" string
 * @param {string} [opts.replyTo] — reply-to address
 * @param {string} [opts.bcc] — BCC recipient
 * @returns {Promise<{id: string}>}
 */
async function sendViaResend({ to, subject, body, html, from = 'agent', replyTo, bcc }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('[resend] RESEND_API_KEY not set in environment');
  }

  const fromAddress = FROM_ADDRESSES[from] || from;

  const payload = {
    from: fromAddress,
    to: Array.isArray(to) ? to : [to],
    subject,
    text: body,
  };

  if (html) payload.html = html;
  if (replyTo) payload.reply_to = replyTo;
  if (bcc) payload.bcc = Array.isArray(bcc) ? bcc : [bcc];

  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`[resend] API error ${res.status}: ${errBody}`);
  }

  const data = await res.json();
  return data;
}

module.exports = { sendViaResend, FROM_ADDRESSES };
