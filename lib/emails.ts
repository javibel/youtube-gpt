/**
 * Shared email HTML templates used across multiple API routes.
 * Centralised here to avoid duplication and keep templates in sync.
 */

export function passwordChangedEmail(name: string, lang: 'es' | 'en'): string {
  const isEn = lang === 'en';
  return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:48px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <tr><td align="center" style="padding:0 0 32px 0;">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="background:#e84d5b;width:28px;height:28px;border-radius:5px;text-align:center;vertical-align:middle;">
              <span style="color:#fff;font-size:14px;font-weight:900;line-height:28px;">&#9654;</span>
            </td>
            <td style="padding-left:10px;font-size:18px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">
              YTubViral<span style="color:#e84d5b;">.</span>com
            </td>
          </tr></table>
        </td></tr>
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
              : 'Tu contrase\u00f1a de YTubViral se ha cambiado correctamente. Si fuiste t\u00fa, no necesitas hacer nada.'}
          </p>
          <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:16px;">
            <p style="margin:0;font-size:13px;color:#a1a1aa;line-height:1.6;">
              ${isEn
                ? '&#9888;&#65039; If you did <strong style="color:#fff;">not</strong> make this change, please <a href="https://ytubviral.com/forgot-password" style="color:#e84d5b;text-decoration:none;">reset your password immediately</a>.'
                : '&#9888;&#65039; Si <strong style="color:#fff;">no</strong> realizaste este cambio, <a href="https://ytubviral.com/forgot-password" style="color:#e84d5b;text-decoration:none;">restablece tu contrase\u00f1a inmediatamente</a>.'}
            </p>
          </div>
        </td></tr>
        <tr><td align="center" style="padding:24px 0 0;">
          <p style="margin:0;font-size:11px;color:#3f3f46;font-family:monospace;">
            &copy; 2026 YTubViral.com &middot;
            <a href="https://ytubviral.com/terms" style="color:#52525b;text-decoration:none;">${isEn ? 'Terms' : 'T\u00e9rminos'}</a> &middot;
            <a href="https://ytubviral.com/privacy" style="color:#52525b;text-decoration:none;">${isEn ? 'Privacy' : 'Privacidad'}</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
