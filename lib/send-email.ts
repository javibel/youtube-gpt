/**
 * Shared email sending with Resend + Gmail fallback.
 * Tries Resend first (noreply@ytubviral.com). If Resend is not configured
 * or fails, falls back to sending via the Gmail agent (ytbeviral@gmail.com).
 */
import { Resend } from 'resend';

const apiKey = process.env.RESEND_API_KEY?.trim();
const resend = apiKey ? new Resend(apiKey) : null;

export async function sendTransactionalEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  // Plain-text version for multipart emails (improves deliverability)
  const text = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, ' ')
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&middot;/g, '·')
    .replace(/&copy;/g, '(c)')
    .replace(/&#\d+;/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Try Resend first
  if (resend) {
    try {
      const result = await resend.emails.send({
        from: 'YTubViral <hello@ytubviral.com>',
        replyTo: 'support@ytubviral.com',
        to,
        subject,
        html,
        text,
        headers: {
          'List-Unsubscribe': '<mailto:support@ytubviral.com?subject=unsubscribe>',
        },
      });
      if (result.error) {
        console.error('[send-email] Resend error:', result.error);
        throw new Error(result.error.message);
      }
      console.log(`[send-email] Sent via Resend to ${to}: "${subject}"`);
      return;
    } catch (err) {
      console.error('[send-email] Resend failed, trying Gmail fallback:', err);
    }
  } else {
    console.warn('[send-email] RESEND_API_KEY not set, using Gmail fallback');
  }

  // Fallback: send via Gmail agent
  const { sendEmailTo } = await import('@/lib/agent/gmail-agent');
  await sendEmailTo(to, subject, text);
  console.log(`[send-email] Sent via Gmail fallback to ${to}: "${subject}"`);
}
