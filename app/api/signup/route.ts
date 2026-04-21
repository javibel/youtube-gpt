import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { isDisposableEmail } from "@/lib/disposable-domains";
import { Resend } from "resend";
import { checkRateLimit } from "@/lib/rate-limit";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

function welcomeEmail(name: string, lang: 'es' | 'en'): string {
  const isEn = lang === 'en';
  const eyebrow = isEn ? 'WELCOME TO YTUBVIRAL' : 'BIENVENIDO A YTUBVIRAL';
  const greeting = isEn ? `Hi, ${name}.` : `Hola, ${name}.`;
  const intro = isEn
    ? 'You now have access to the AI tools that top creators use to generate viral YouTube content.'
    : 'Ya tienes acceso a las herramientas de IA que usan los mejores creadores para generar contenido viral en YouTube.';
  const steps: [string, string][] = isEn
    ? [
        ['01', 'Open the generator — no setup needed'],
        ['02', 'Choose your content type: title, description, script, caption, or thumbnail'],
        ['03', 'Enter your video topic and generate your first viral content'],
      ]
    : [
        ['01', 'Entra al generador — no necesitas configurar nada'],
        ['02', 'Elige el tipo de contenido: título, descripción, script, caption o miniatura'],
        ['03', 'Escribe el tema de tu vídeo y genera tu primer contenido viral'],
      ];
  const cta = isEn ? 'Start generating →' : 'Empezar a generar →';
  const planLabel = isEn
    ? `FREE PLAN · 10 generations/month · <a href="https://ytubviral.com/dashboard" style="color:#e84d5b;text-decoration:none;">Upgrade to Pro for €9.99/mo</a>`
    : `PLAN FREE · 10 generaciones/mes · <a href="https://ytubviral.com/dashboard" style="color:#e84d5b;text-decoration:none;">Upgrade a Pro por 9,99€/mes</a>`;
  const footer = isEn
    ? `© 2026 YTubViral.com · <a href="https://ytubviral.com/terms" style="color:#52525b;text-decoration:none;">Terms</a> · <a href="https://ytubviral.com/privacy" style="color:#52525b;text-decoration:none;">Privacy</a>`
    : `© 2026 YTubViral.com · <a href="https://ytubviral.com/terms" style="color:#52525b;text-decoration:none;">Términos</a> · <a href="https://ytubviral.com/privacy" style="color:#52525b;text-decoration:none;">Privacidad</a>`;

  return `<!DOCTYPE html>
<html lang="${lang}">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:48px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

        <!-- Logo -->
        <tr>
          <td align="center" style="padding:0 0 36px 0;">
            <table cellpadding="0" cellspacing="0"><tr>
              <td style="background:#e84d5b;width:28px;height:28px;border-radius:5px;text-align:center;vertical-align:middle;">
                <span style="color:#fff;font-size:14px;font-weight:900;line-height:28px;">▶</span>
              </td>
              <td style="padding-left:10px;font-size:18px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">
                YTubViral<span style="color:#e84d5b;">.</span>com
              </td>
            </tr></table>
          </td>
        </tr>

        <!-- Card -->
        <tr>
          <td style="background:#111111;border-radius:12px;border:1px solid rgba(255,255,255,0.08);padding:40px;">

            <!-- Eyebrow -->
            <p style="margin:0 0 16px;font-size:11px;font-weight:600;color:#e84d5b;text-transform:uppercase;letter-spacing:0.15em;font-family:monospace;">${eyebrow}</p>

            <p style="margin:0 0 8px;font-size:24px;font-weight:800;color:#ffffff;line-height:1.2;">${greeting}</p>
            <p style="margin:0 0 32px;font-size:15px;color:#71717a;line-height:1.7;">${intro}</p>

            <!-- Steps -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
              ${steps.map(([num, text], i, arr) => `
              <tr>
                <td style="padding:14px 0;${i < arr.length - 1 ? 'border-bottom:1px solid rgba(255,255,255,0.06);' : ''}">
                  <table cellpadding="0" cellspacing="0"><tr>
                    <td style="width:36px;font-size:11px;font-weight:700;color:#e84d5b;font-family:monospace;vertical-align:top;padding-top:1px;">${num}</td>
                    <td style="font-size:14px;color:#a1a1aa;line-height:1.5;">${text}</td>
                  </tr></table>
                </td>
              </tr>`).join('')}
            </table>

            <!-- CTA -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <a href="https://ytubviral.com/generate"
                    style="display:inline-block;background:#e84d5b;color:#ffffff;font-weight:700;font-size:14px;padding:14px 32px;border-radius:6px;text-decoration:none;letter-spacing:-0.01em;box-shadow:3px 3px 0 #000;">
                    ${cta}
                  </a>
                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- Plan info -->
        <tr>
          <td style="padding:16px 40px;background:#0d0d0d;border-radius:0 0 12px 12px;border:1px solid rgba(255,255,255,0.06);border-top:none;">
            <p style="margin:0;font-size:12px;color:#52525b;text-align:center;font-family:monospace;">
              ${planLabel}
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td align="center" style="padding:28px 0 0;">
            <p style="margin:0;font-size:11px;color:#3f3f46;font-family:monospace;">${footer}</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function POST(req: NextRequest) {
  try {
    // Rate limit: máx 5 signups por IP cada 15 minutos (previene spam y abuso de Resend)
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim()
      ?? req.headers.get('x-real-ip')
      ?? 'unknown';
    const rl = checkRateLimit(`signup:${ip}`, 5, 15 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Demasiados intentos. Espera unos minutos antes de volver a intentarlo.' },
        { status: 429 }
      );
    }

    const { email, password, name, lang = 'es' } = await req.json();
    const emailLang: 'es' | 'en' = lang === 'en' ? 'en' : 'es';

    if (!email || !password || !name) {
      return NextResponse.json(
        { error: "Nombre, email y contraseña son requeridos" },
        { status: 400 }
      );
    }

    if (isDisposableEmail(email)) {
      return NextResponse.json(
        { error: "No se permiten direcciones de email temporales o desechables" },
        { status: 400 }
      );
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json(
        { error: "Ya existe una cuenta con ese email" },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await prisma.user.create({
      data: { email, password: hashedPassword, name },
    });

    // Enviar email de bienvenida (sin bloquear la respuesta)
    const subject = emailLang === 'en'
      ? `Welcome to YTubViral.com, ${name}!`
      : `¡Bienvenido a YTubViral.com, ${name}! 🚀`;
    resend?.emails.send({
      from: 'noreply@ytubviral.com',
      to: email,
      subject,
      html: welcomeEmail(name, emailLang),
    }).catch((err) => console.error('Welcome email error:', err));

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Error al crear la cuenta" },
      { status: 500 }
    );
  }
}
