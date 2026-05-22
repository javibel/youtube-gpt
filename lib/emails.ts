/**
 * Shared email HTML templates used across multiple API routes.
 * Centralised here to avoid duplication and keep templates in sync.
 */

// ── Shared layout pieces ─────────────────────────────────────────────────────

function header(lang: string): string {
  return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:48px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <tr><td align="center" style="padding:0 0 32px 0;">
          <a href="https://ytubviral.com" style="text-decoration:none;">
            <img src="https://ytubviral.com/logo.png?v=3" alt="YTubViral.com" width="450" style="display:block;height:auto;" />
          </a>
        </td></tr>`;
}

function footer(isEn: boolean): string {
  return `        <tr><td align="center" style="padding:24px 0 0;">
          <p style="margin:0;font-size:11px;color:#3f3f46;font-family:monospace;">
            &copy; 2026 YTubViral.com &middot;
            <a href="https://ytubviral.com/terms" style="color:#52525b;text-decoration:none;">${isEn ? 'Terms' : 'Términos'}</a> &middot;
            <a href="https://ytubviral.com/privacy" style="color:#52525b;text-decoration:none;">${isEn ? 'Privacy' : 'Privacidad'}</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// ── Verification email ───────────────────────────────────────────────────────

export function verificationEmail(name: string, code: string, lang: 'es' | 'en'): string {
  const isEn = lang === 'en';
  return `${header(lang)}
        <tr><td style="background:#111111;border-radius:12px;border:1px solid rgba(255,255,255,0.08);padding:40px;">
          <p style="margin:0 0 16px;font-size:11px;font-weight:600;color:#e84d5b;text-transform:uppercase;letter-spacing:0.15em;font-family:monospace;">
            ${isEn ? 'CONFIRM YOUR EMAIL' : 'CONFIRMA TU EMAIL'}
          </p>
          <p style="margin:0 0 8px;font-size:22px;font-weight:800;color:#ffffff;">
            ${isEn ? `Hi, ${name}.` : `Hola, ${name}.`}
          </p>
          <p style="margin:0 0 24px;font-size:15px;color:#71717a;line-height:1.7;">
            ${isEn
              ? 'Enter this code in YTubViral to verify your email and activate your account. The code expires in 15 minutes.'
              : 'Introduce este código en YTubViral para verificar tu email y activar tu cuenta. El código expira en 15 minutos.'}
          </p>
          <div style="background:#0a0a0a;border:2px solid rgba(232,77,91,0.3);border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
            <p style="margin:0;font-size:36px;font-weight:900;color:#ffffff;letter-spacing:0.3em;font-family:monospace;">
              ${code}
            </p>
          </div>
          <p style="margin:0;font-size:12px;color:#52525b;">
            ${isEn ? "If you didn't create an account, you can safely ignore this email." : 'Si no creaste esta cuenta, puedes ignorar este email.'}
          </p>
        </td></tr>
${footer(isEn)}`;
}

// ── Password changed email ───────────────────────────────────────────────────

export function passwordChangedEmail(name: string, lang: 'es' | 'en'): string {
  const isEn = lang === 'en';
  return `${header(lang)}
        <tr><td style="background:#111111;border-radius:12px;border:1px solid rgba(255,255,255,0.08);padding:40px;">
          <p style="margin:0 0 16px;font-size:11px;font-weight:600;color:#e84d5b;text-transform:uppercase;letter-spacing:0.15em;font-family:monospace;">
            ${isEn ? 'SECURITY NOTICE' : 'AVISO DE SEGURIDAD'}
          </p>
          <p style="margin:0 0 8px;font-size:22px;font-weight:800;color:#ffffff;">
            ${isEn ? `Hi, ${name}.` : `Hola, ${name}.`}
          </p>
          <p style="margin:0 0 28px;font-size:15px;color:#71717a;line-height:1.7;">
            ${isEn
              ? 'Your YTubViral password was changed successfully. If this was you, no action is needed.'
              : 'Tu contraseña de YTubViral se ha cambiado correctamente. Si fuiste tú, no necesitas hacer nada.'}
          </p>
          <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:16px;">
            <p style="margin:0;font-size:13px;color:#a1a1aa;line-height:1.6;">
              ${isEn
                ? '&#9888;&#65039; If you did <strong style="color:#fff;">not</strong> make this change, please <a href="https://ytubviral.com/forgot-password" style="color:#e84d5b;text-decoration:none;">reset your password immediately</a>.'
                : '&#9888;&#65039; Si <strong style="color:#fff;">no</strong> realizaste este cambio, <a href="https://ytubviral.com/forgot-password" style="color:#e84d5b;text-decoration:none;">restablece tu contraseña inmediatamente</a>.'}
            </p>
          </div>
        </td></tr>
${footer(isEn)}`;
}

// ── Waitlist welcome email ───────────────────────────────────────────────────

export function waitlistWelcomeEmail(lang: 'es' | 'en'): string {
  const isEn = lang === 'en';
  return `${header(lang)}
        <tr><td style="background:#111111;border-radius:12px;border:1px solid rgba(255,255,255,0.08);padding:40px;">
          <p style="margin:0 0 16px;font-size:11px;font-weight:600;color:#e84d5b;text-transform:uppercase;letter-spacing:0.15em;font-family:monospace;">
            ${isEn ? 'YOU\'RE ON THE LIST' : 'ESTÁS EN LA LISTA'}
          </p>
          <p style="margin:0 0 8px;font-size:22px;font-weight:800;color:#ffffff;">
            ${isEn ? 'Welcome to the launch!' : '¡Bienvenido al lanzamiento!'}
          </p>
          <p style="margin:0 0 24px;font-size:15px;color:#71717a;line-height:1.7;">
            ${isEn
              ? 'Hey! I\'m Javier, the founder of YTubViral. I wanted to personally thank you for joining the waitlist — it means a lot, especially at this early stage.'
              : '¡Hola! Soy Javier, el fundador de YTubViral. Quería agradecerte personalmente por unirte a la waitlist — significa mucho, especialmente en esta etapa inicial.'}
          </p>
          <p style="margin:0 0 24px;font-size:15px;color:#71717a;line-height:1.7;">
            ${isEn
              ? 'We\'re preparing something special for launch day — including an exclusive discount only for early supporters like you.'
              : 'Estamos preparando algo especial para el día del lanzamiento — incluyendo un descuento exclusivo solo para early supporters como tú.'}
          </p>
          <div style="background:rgba(232,77,91,0.08);border:1px solid rgba(232,77,91,0.25);border-radius:8px;padding:20px;">
            <p style="margin:0 0 8px;font-size:11px;font-weight:600;color:#e84d5b;text-transform:uppercase;letter-spacing:0.15em;font-family:monospace;">
              ${isEn ? 'WHAT TO EXPECT' : 'QUÉ ESPERAR'}
            </p>
            <p style="margin:0;font-size:14px;color:#a1a1aa;line-height:1.7;">
              ${isEn
                ? '&#10003; 50% off Pro &amp; Business plans for 1 year<br>&#10003; Exclusive coupon code on launch day<br>&#10003; Early access before anyone else'
                : '&#10003; 50% de descuento en planes Pro y Business durante 1 año<br>&#10003; Cupón exclusivo el día del lanzamiento<br>&#10003; Acceso anticipado antes que nadie'}
            </p>
          </div>
          <p style="margin:24px 0 0;font-size:15px;color:#71717a;line-height:1.7;">
            ${isEn
              ? 'In the meantime, you can already <a href="https://ytubviral.com/features/seo-score" style="color:#e84d5b;text-decoration:none;font-weight:600;">check your YouTube SEO Score for free</a> — paste any video URL and get a detailed analysis in seconds.'
              : 'Mientras tanto, ya puedes <a href="https://ytubviral.com/features/seo-score" style="color:#e84d5b;text-decoration:none;font-weight:600;">analizar tu SEO Score de YouTube gratis</a> — pega cualquier URL de vídeo y obtén un análisis detallado en segundos.'}
          </p>
          <p style="margin:24px 0 0;font-size:15px;color:#71717a;line-height:1.7;">
            ${isEn
              ? 'Thanks again for your trust. I\'ll keep you posted!'
              : '¡Gracias de nuevo por tu confianza! Te mantendré informado.'}
          </p>
          <p style="margin:20px 0 0;font-size:15px;color:#ffffff;line-height:1.7;">
            Javier Jimeno<br>
            <span style="color:#71717a;font-size:13px;">${isEn ? 'Founder' : 'Fundador'}, <a href="https://ytubviral.com" style="color:#e84d5b;text-decoration:none;">YTubViral.com</a></span>
          </p>
        </td></tr>
${footer(isEn)}`;
}

// ── Launch day email ─────────────────────────────────────────────────────────

export function launchDayEmail(lang: 'es' | 'en', phUrl: string, couponCode: string): string {
  const isEn = lang === 'en';
  return `${header(lang)}
        <tr><td style="background:#111111;border-radius:12px;border:1px solid rgba(255,255,255,0.08);padding:40px;">
          <p style="margin:0 0 16px;font-size:11px;font-weight:600;color:#e84d5b;text-transform:uppercase;letter-spacing:0.15em;font-family:monospace;">
            ${isEn ? 'WE\'RE LIVE ON PRODUCT HUNT' : 'ESTAMOS EN VIVO EN PRODUCT HUNT'}
          </p>
          <p style="margin:0 0 8px;font-size:24px;font-weight:800;color:#ffffff;">
            ${isEn ? 'Launch day is here!' : '¡El día del lanzamiento ha llegado!'}
          </p>
          <p style="margin:0 0 16px;font-size:15px;color:#71717a;line-height:1.7;">
            ${isEn
              ? 'Hey! It\'s Javier. The day has finally come — YTubViral is now live on Product Hunt.'
              : '¡Hola! Soy Javier. El día ha llegado — YTubViral ya está en vivo en Product Hunt.'}
          </p>
          <p style="margin:0 0 28px;font-size:15px;color:#71717a;line-height:1.7;">
            ${isEn
              ? 'As an early supporter, you get an exclusive deal that I\'m not offering anywhere else — but it expires in 48 hours.'
              : 'Como early supporter, tienes una oferta exclusiva que no estoy ofreciendo en ningún otro sitio — pero expira en 48 horas.'}
          </p>

          <div style="background:rgba(232,77,91,0.08);border:1px solid rgba(232,77,91,0.25);border-radius:8px;padding:24px;text-align:center;margin-bottom:28px;">
            <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#e84d5b;text-transform:uppercase;letter-spacing:0.15em;font-family:monospace;">
              ${isEn ? 'YOUR EXCLUSIVE CODE' : 'TU CÓDIGO EXCLUSIVO'}
            </p>
            <p style="margin:0 0 8px;font-size:36px;font-weight:900;color:#ffffff;letter-spacing:0.05em;">
              ${couponCode}
            </p>
            <p style="margin:0;font-size:14px;color:#a1a1aa;">
              ${isEn
                ? '50% off Pro &amp; Business plans for 1 year'
                : '50% de descuento en planes Pro y Business durante 1 año'}
            </p>
            <p style="margin:8px 0 0;font-size:13px;color:#e84d5b;font-weight:600;">
              ${isEn ? '⏰ Expires in 48 hours' : '⏰ Expira en 48 horas'}
            </p>
          </div>

          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr>
              <td style="padding-right:8px;" width="50%">
                <a href="${phUrl}" style="display:block;background:#e84d5b;color:#ffffff;font-weight:700;font-size:14px;padding:14px 0;border-radius:6px;text-decoration:none;text-align:center;box-shadow:3px 3px 0 #000;">
                  ${isEn ? 'Vote on Product Hunt ↑' : 'Votar en Product Hunt ↑'}
                </a>
              </td>
              <td style="padding-left:8px;" width="50%">
                <a href="https://ytubviral.com/pricing" style="display:block;background:#27272a;color:#ffffff;font-weight:700;font-size:14px;padding:14px 0;border-radius:6px;text-decoration:none;text-align:center;border:1px solid rgba(255,255,255,0.1);">
                  ${isEn ? 'Use coupon →' : 'Usar cupón →'}
                </a>
              </td>
            </tr>
          </table>

          <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:16px;">
            <p style="margin:0;font-size:13px;color:#a1a1aa;line-height:1.6;">
              ${isEn
                ? 'Your vote on Product Hunt helps us reach more creators. It takes 10 seconds and means a lot.'
                : 'Tu voto en Product Hunt nos ayuda a llegar a más creadores. Son 10 segundos y significa mucho.'}
            </p>
          </div>
          <p style="margin:24px 0 0;font-size:15px;color:#71717a;line-height:1.7;">
            ${isEn
              ? 'Thank you for being part of this from the beginning. I truly appreciate your support.'
              : 'Gracias por estar desde el principio. De verdad que aprecio tu apoyo.'}
          </p>
          <p style="margin:20px 0 0;font-size:15px;color:#ffffff;line-height:1.7;">
            Javier Jimeno<br>
            <span style="color:#71717a;font-size:13px;">${isEn ? 'Founder' : 'Fundador'}, <a href="https://ytubviral.com" style="color:#e84d5b;text-decoration:none;">YTubViral.com</a></span>
          </p>
        </td></tr>
${footer(isEn)}`;
}
