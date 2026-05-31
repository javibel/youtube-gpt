import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendTransactionalEmail } from '@/lib/send-email';

export async function POST(request: NextRequest) {
  const { email, code } = await request.json();

  if (!email || !code) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }

  const record = await prisma.emailVerificationToken.findFirst({
    where: { email, token: code },
  });

  if (!record) {
    return NextResponse.json({ error: 'invalid_code' }, { status: 400 });
  }

  if (record.expires < new Date()) {
    await prisma.emailVerificationToken.delete({ where: { token: code } });
    return NextResponse.json({ error: 'expired_code' }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { email },
    data: { emailVerified: new Date() },
    select: { name: true },
  });

  await prisma.emailVerificationToken.deleteMany({ where: { email } });

  // Send welcome email (non-blocking)
  const firstName = user.name?.split(' ')[0] || '';
  sendTransactionalEmail({
    to: email,
    subject: firstName ? `${firstName}, your AI toolkit is ready 🚀` : 'Your AI toolkit is ready 🚀',
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;padding:32px 0;">
        <img src="https://ytubviral.com/logo.png" alt="YTubViral" width="120" style="margin-bottom:24px;" />
        <h1 style="font-size:22px;color:#fff;margin:0 0 12px;">Welcome to YTubViral${firstName ? `, ${firstName}` : ''}!</h1>
        <p style="font-size:15px;color:#a1a1aa;line-height:1.6;margin:0 0 24px;">
          Your account is verified. You have <strong style="color:#fff;">10 free AI generations</strong> this month — titles, descriptions, scripts, and more.
        </p>
        <a href="https://ytubviral.com/generate" style="display:inline-block;background:#e84d5b;color:#fff;font-weight:600;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none;">
          Generate your first title →
        </a>
        <p style="font-size:13px;color:#71717a;margin-top:32px;line-height:1.5;">
          Quick wins to try:<br/>
          · <a href="https://ytubviral.com/generate?template=title" style="color:#e84d5b;text-decoration:none;">AI Title Generator</a> — optimized for CTR<br/>
          · <a href="https://ytubviral.com/research" style="color:#e84d5b;text-decoration:none;">Keyword Research</a> — find what people search<br/>
          · <a href="https://ytubviral.com/seo-score" style="color:#e84d5b;text-decoration:none;">SEO Score</a> — audit any video in seconds
        </p>
        <hr style="border:none;border-top:1px solid #27272a;margin:32px 0 16px;" />
        <p style="font-size:12px;color:#52525b;">YTubViral · AI-powered YouTube growth toolkit</p>
      </div>
    `,
  }).catch(err => console.error('[verify-email] Welcome email failed:', err));

  return NextResponse.json({ verified: true });
}
