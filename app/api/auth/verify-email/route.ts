import { NextRequest, NextResponse, after } from 'next/server';
import { consumeEmailVerification } from '@/lib/email-verification-server';
import { sendDomainEmailOriginal } from '@/lib/send-email';
import { rateLimitRequest } from '@/lib/rate-limit-db';

export async function POST(request: NextRequest) {
  let allowed = false;
  try { allowed = (await rateLimitRequest(request, 'verify-email', 10, 15, true)) === true; } catch {}
  if (!allowed) return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'invalid_request' }, { status: 400 }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).length !== 2 || !('email' in body) || !('code' in body)
    || typeof body.email !== 'string' || typeof body.code !== 'string'
    || !/^\d{6}$/.test(body.code)) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  const email = body.email.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });

  const result = await consumeEmailVerification(email, body.code);
  if (result.status === 'invalid') return NextResponse.json({ error: 'invalid_code' }, { status: 400 });
  if (result.status === 'expired') return NextResponse.json({ error: 'expired_code' }, { status: 400 });
  if (result.status !== 'verified') return NextResponse.json({ error: 'verification_unconfirmed' }, { status: 503 });

  // Only the acknowledged original schedules its welcome notice. Repeated
  // callback execution joins this same promise; no durable retry or delivery claim.
  let noticeOriginal: Promise<void> | undefined;
  try {
    after(() => noticeOriginal ??= (async () => {
      const firstName = (result.name?.split(' ')[0] || '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
      const notice = await sendDomainEmailOriginal({
        to: result.email,
        subject: firstName ? `${firstName}, check your video's SEO score` : 'Check your video\'s SEO score',
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;padding:32px 0;">
            <img src="https://ytubviral.com/logo.png" alt="YTubViral" width="120" style="margin-bottom:24px;" />
            <h1 style="font-size:22px;color:#fff;margin:0 0 12px;">Welcome${firstName ? `, ${firstName}` : ''}!</h1>
            <p style="font-size:15px;color:#a1a1aa;line-height:1.6;margin:0 0 24px;">
              Your account is ready. Start by checking how well your latest video is optimized — paste any YouTube URL and get a score from 0 to 100 with specific fixes.
            </p>
            <a href="https://ytubviral.com/seo-score" style="display:inline-block;background:#e84d5b;color:#fff;font-weight:600;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none;">
              Check your SEO Score →
            </a>
            <p style="font-size:13px;color:#71717a;margin-top:32px;line-height:1.5;">
              You also get <strong style="color:#fff;">10 free AI generations</strong> per month:<br/>
              · <a href="https://ytubviral.com/generate?template=title" style="color:#e84d5b;text-decoration:none;">AI Title Generator</a> — titles optimized for clicks<br/>
              · <a href="https://ytubviral.com/research" style="color:#e84d5b;text-decoration:none;">Keyword Research</a> — find what people search<br/>
              · <a href="https://ytubviral.com/generate?template=description" style="color:#e84d5b;text-decoration:none;">Description Generator</a> — SEO-optimized descriptions
            </p>
            <hr style="border:none;border-top:1px solid #27272a;margin:32px 0 16px;" />
            <p style="font-size:12px;color:#52525b;">YTubViral · AI-powered YouTube growth toolkit</p>
          </div>
        `,
      });
          console.info('[verify-email] Welcome notice:', notice);

    })());
  } catch { console.info('[verify-email] Welcome notice: not-scheduled'); }
  // Verification acknowledgment is independent of the post-response notice.
  return NextResponse.json({ verified: true });
}
