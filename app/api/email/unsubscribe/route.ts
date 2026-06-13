import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyUnsubscribe } from '@/lib/email-token';

// Baja de emails comerciales en un clic (LSSI), sin login. El token es un HMAC
// del userId. Idempotente. Responde HTML simple bilingüe.
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') || '';
  const userId = verifyUnsubscribe(token);

  let ok = false;
  if (userId) {
    try {
      await prisma.user.update({ where: { id: userId }, data: { marketingOptOut: true } });
      ok = true;
    } catch {
      ok = false;
    }
  }

  const title = ok ? 'Te has dado de baja · Unsubscribed' : 'Enlace no válido · Invalid link';
  const msg = ok
    ? 'No volverás a recibir emails de marketing de YTubViral. Seguirás recibiendo emails imprescindibles de tu cuenta (verificación, contraseña).<br><br>You won\'t receive marketing emails from YTubViral anymore. You\'ll still get essential account emails (verification, password).'
    : 'No hemos podido procesar la baja. Escríbenos a hello@ytubviral.com y lo hacemos manualmente.<br><br>We couldn\'t process the request. Email hello@ytubviral.com and we\'ll do it manually.';

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head>
<body style="margin:0;background:#0a0a0a;color:#e4e4e7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;">
  <div style="max-width:440px;padding:40px;text-align:center;">
    <div style="width:48px;height:48px;border-radius:12px;background:${ok ? 'rgba(124,255,0,0.12)' : 'rgba(232,77,91,0.12)'};margin:0 auto 24px;display:flex;align-items:center;justify-content:center;font-size:24px;">${ok ? '✓' : '✕'}</div>
    <h1 style="font-size:20px;font-weight:800;margin:0 0 16px;color:#fff;">${ok ? 'Listo · Done' : 'Ups · Oops'}</h1>
    <p style="font-size:14px;color:#a1a1aa;line-height:1.7;margin:0 0 28px;">${msg}</p>
    <a href="https://ytubviral.com" style="display:inline-block;background:#e84d5b;color:#fff;font-weight:700;font-size:14px;text-decoration:none;padding:12px 24px;border-radius:10px;">YTubViral.com</a>
  </div>
</body></html>`;

  return new NextResponse(html, { status: ok ? 200 : 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
