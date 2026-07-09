/**
 * Plantillas de emails lifecycle (G4): onboarding, reactivación, conversión.
 * Comerciales — SIEMPRE llevan link de baja en el footer (LSSI).
 * Estilo alineado con lib/emails.ts. Bilingüe ES/EN.
 */
import { signUnsubscribe } from './email-token';

const BASE = 'https://ytubviral.com';

function utm(path: string, campaign: string): string {
  const sep = path.includes('?') ? '&' : '?';
  return `${BASE}${path}${sep}utm_source=email&utm_medium=lifecycle&utm_campaign=${campaign}`;
}

function shell(lang: 'es' | 'en', userId: string, campaign: string, inner: string): string {
  const isEn = lang === 'en';
  const unsubUrl = `${BASE}/api/email/unsubscribe?token=${signUnsubscribe(userId)}`;
  return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:48px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <tr><td align="center" style="padding:0 0 32px 0;">
          <a href="${utm('/', campaign)}" style="text-decoration:none;">
            <img src="${BASE}/logo.png?v=3" alt="YTubViral.com" width="450" style="display:block;height:auto;" />
          </a>
        </td></tr>
        <tr><td style="background:#111111;border-radius:12px;border:1px solid rgba(255,255,255,0.08);padding:40px;">
          ${inner}
        </td></tr>
        <tr><td align="center" style="padding:24px 0 0;">
          <p style="margin:0 0 6px;font-size:11px;color:#3f3f46;font-family:monospace;">
            &copy; 2026 YTubViral.com &middot;
            <a href="${BASE}/terms" style="color:#52525b;text-decoration:none;">${isEn ? 'Terms' : 'Términos'}</a> &middot;
            <a href="${BASE}/privacy" style="color:#52525b;text-decoration:none;">${isEn ? 'Privacy' : 'Privacidad'}</a>
          </p>
          <p style="margin:0;font-size:11px;color:#3f3f46;font-family:monospace;">
            <a href="${unsubUrl}" style="color:#52525b;text-decoration:underline;">${isEn ? 'Unsubscribe from these emails' : 'Darme de baja de estos emails'}</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function eyebrow(text: string): string {
  return `<p style="margin:0 0 16px;font-size:11px;font-weight:600;color:#e84d5b;text-transform:uppercase;letter-spacing:0.15em;font-family:monospace;">${text}</p>`;
}
function h(text: string): string {
  return `<p style="margin:0 0 8px;font-size:22px;font-weight:800;color:#ffffff;">${text}</p>`;
}
function p(text: string): string {
  return `<p style="margin:0 0 20px;font-size:15px;color:#a1a1aa;line-height:1.7;">${text}</p>`;
}
function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:#e84d5b;color:#ffffff;font-weight:700;font-size:15px;text-decoration:none;padding:14px 28px;border-radius:10px;">${label}</a>`;
}
function sign(isEn: boolean): string {
  return `<p style="margin:24px 0 0;font-size:14px;color:#71717a;">${isEn ? 'Javier — YTubViral' : 'Javier — YTubViral'}</p>`;
}

type Tpl = { subject: { es: string; en: string }; build: (name: string, lang: 'es' | 'en', userId: string, extra?: Record<string, string | number>) => string };

// ── A · Onboarding ───────────────────────────────────────────────────────────
export const A1_seoScore: Tpl = {
  subject: { es: 'Tu SEO Score te espera (30 segundos, en serio)', en: 'Your SEO Score is waiting (30 seconds, really)' },
  build: (name, lang, uid) => { const en = lang === 'en'; return shell(lang, uid, 'onboarding-a1',
    eyebrow(en ? 'GET STARTED' : 'EMPIEZA AQUÍ') +
    h(en ? `Welcome, ${name}.` : `Bienvenido, ${name}.`) +
    p(en ? 'The fastest way to see what YTubViral does: paste any YouTube video URL and get its SEO Score from 0 to 100 — with the exact fixes to rank higher. No setup, 30 seconds.' : 'La forma más rápida de ver qué hace YTubViral: pega la URL de cualquier vídeo de YouTube y obtén su SEO Score de 0 a 100 — con los arreglos exactos para posicionar mejor. Sin configurar nada, 30 segundos.') +
    button(utm('/seo-score', 'onboarding-a1'), en ? 'Check a video now →' : 'Analizar un vídeo ahora →') +
    sign(en)); },
};
export const A2_generate: Tpl = {
  subject: { es: 'Pega un tema, te damos 5 títulos', en: 'Paste a topic, get 5 titles' },
  build: (name, lang, uid) => { const en = lang === 'en'; return shell(lang, uid, 'onboarding-a2',
    eyebrow(en ? 'YOUR FIRST GENERATION' : 'TU PRIMERA GENERACIÓN') +
    h(en ? 'Try this with your next video' : 'Prueba esto con tu próximo vídeo') +
    p(en ? 'Write the topic of a video you want to make — for example "budget home studio setup" — and YTubViral writes 5 click-optimized titles in seconds. Then descriptions, scripts and tags from the same idea.' : 'Escribe el tema de un vídeo que quieras hacer — por ejemplo "montar un estudio en casa barato" — y YTubViral escribe 5 títulos optimizados para clics en segundos. Luego descripciones, scripts y tags de la misma idea.') +
    button(utm('/generate', 'onboarding-a2'), en ? 'Generate my titles →' : 'Generar mis títulos →') +
    sign(en)); },
};
export const A3_connect: Tpl = {
  subject: { es: 'Conecta tu canal y todo se personaliza', en: 'Connect your channel and everything gets personal' },
  build: (name, lang, uid) => { const en = lang === 'en'; return shell(lang, uid, 'onboarding-a3',
    eyebrow(en ? 'PERSONALIZE IT' : 'PERSONALÍZALO') +
    h(en ? 'Stop getting generic AI' : 'Deja de recibir IA genérica') +
    p(en ? 'When you connect your YouTube channel, every tool adapts to your niche, your audience and your real performance — the SEO Score uses your actual CTR, the AI writes in your lane. Read-only: we never publish or change anything on your channel.' : 'Cuando conectas tu canal de YouTube, cada herramienta se adapta a tu nicho, tu audiencia y tu rendimiento real — el SEO Score usa tu CTR de verdad, la IA escribe en tu línea. Solo lectura: nunca publicamos ni cambiamos nada en tu canal.') +
    button(utm('/dashboard', 'onboarding-a3'), en ? 'Connect my channel →' : 'Conectar mi canal →') +
    sign(en)); },
};
export const A4_discover: Tpl = {
  subject: { es: 'La herramienta que casi nadie conoce (y es gratis)', en: 'The tool almost nobody knows (and it\'s free)' },
  build: (name, lang, uid) => { const en = lang === 'en'; return shell(lang, uid, 'onboarding-a4',
    eyebrow(en ? 'DISCOVER' : 'DESCUBRE') +
    h(en ? 'See what\'s viral right now' : 'Mira qué es viral ahora mismo') +
    p(en ? 'Trending shows the 20 most explosive YouTube videos across 12 countries, updated every 30 minutes — perfect for catching a wave before it peaks. Free, no limits.' : 'Trending muestra los 20 vídeos más explosivos de YouTube en 12 países, actualizado cada 30 minutos — perfecto para coger una ola antes de que reviente. Gratis, sin límites.') +
    button(utm('/trends', 'onboarding-a4'), en ? 'Explore trending →' : 'Explorar tendencias →') +
    sign(en)); },
};
export const A5_feedback: Tpl = {
  subject: { es: '¿Cómo va el canal? Respuesta honesta en 1 clic', en: 'How\'s the channel going? Honest answer in 1 click' },
  build: (name, lang, uid) => { const en = lang === 'en'; return shell(lang, uid, 'onboarding-a5',
    eyebrow(en ? 'YOUR TURN' : 'TU TURNO') +
    h(en ? 'Two weeks in — how are we doing?' : 'Dos semanas — ¿qué tal vamos?') +
    p(en ? 'I read every reply personally. If YTubViral is helping, a short honest review helps other creators find it. If something\'s missing or broken, tell me — that\'s how it gets better.' : 'Leo cada respuesta personalmente. Si YTubViral te está ayudando, una reseña honesta y corta ayuda a otros creadores a encontrarlo. Si algo falta o falla, cuéntamelo — así mejora.') +
    button(`${BASE}/dashboard#review?utm_source=email&utm_medium=lifecycle&utm_campaign=onboarding-a5`, en ? 'Leave an honest review →' : 'Dejar una reseña honesta →') +
    sign(en)); },
};

// ── B · Reactivación ─────────────────────────────────────────────────────────
export const B1_valueLeft: Tpl = {
  subject: { es: 'Tus generaciones de este mes siguen ahí', en: 'Your generations this month are still there' },
  build: (name, lang, uid) => { const en = lang === 'en'; return shell(lang, uid, 'react-b1',
    eyebrow(en ? 'WE MISS YOU' : 'TE ECHAMOS DE MENOS') +
    h(en ? `Still got free generations, ${name}` : `Aún te quedan generaciones, ${name}`) +
    p(en ? 'Your monthly generations reset every month and you haven\'t used this month\'s yet. Got a video coming up? Spin up the titles, description and tags in under a minute.' : 'Tus generaciones se renuevan cada mes y aún no has usado las de este mes. ¿Tienes un vídeo en camino? Saca los títulos, la descripción y los tags en menos de un minuto.') +
    button(utm('/generate', 'react-b1'), en ? 'Use them now →' : 'Usarlas ahora →') +
    sign(en)); },
};
export const B2_goodbye: Tpl = {
  subject: { es: '¿Lo dejamos aquí? (sin rencor)', en: 'Should we leave it here? (no hard feelings)' },
  build: (name, lang, uid) => { const en = lang === 'en'; return shell(lang, uid, 'react-b2',
    eyebrow(en ? 'ONE LAST THING' : 'UNA ÚLTIMA COSA') +
    h(en ? 'Be honest with me' : 'Sé honesto conmigo') +
    p(en ? 'You signed up but YTubViral didn\'t stick — and that\'s useful to know. If you have 10 seconds, just reply and tell me what was missing. No sales pitch. If I don\'t hear back, I won\'t email you again.' : 'Te registraste pero YTubViral no terminó de encajar — y saber por qué me sirve. Si tienes 10 segundos, responde y cuéntame qué faltó. Sin venderte nada. Si no me dices nada, no te vuelvo a escribir.') +
    button(utm('/dashboard', 'react-b2'), en ? 'Actually, let me give it another go →' : 'Mejor le doy otra oportunidad →') +
    sign(en)); },
};

// ── C · Conversión free→Pro ──────────────────────────────────────────────────
export const C1_limitHit: Tpl = {
  subject: { es: 'Te quedaste sin generaciones a mitad de idea', en: 'You ran out of generations mid-idea' },
  build: (name, lang, uid, extra) => { const en = lang === 'en'; const resetDay = extra?.resetDay ?? ''; return shell(lang, uid, 'conv-c1',
    eyebrow(en ? 'YOU HIT YOUR LIMIT' : 'LLEGASTE AL LÍMITE') +
    h(en ? 'Annoying timing, right?' : 'Mal momento, ¿verdad?') +
    p(en ? `You used all your free generations this month. Two honest options: wait until they reset${resetDay ? ` on the ${resetDay}` : ''} — that\'s totally fine — or move to Pro for 200/month at €9.99, with a 30-day money-back guarantee if it\'s not for you.` : `Has usado todas tus generaciones gratis de este mes. Dos opciones honestas: esperar a que se renueven${resetDay ? ` el día ${resetDay}` : ''} — perfectamente válido — o pasar a Pro por 200/mes a 9,99 €, con garantía de devolución de 30 días si no es para ti.`) +
    button(utm('/pricing', 'conv-c1'), en ? 'See Pro →' : 'Ver Pro →') +
    sign(en)); },
};
export const C2_powerUser: Tpl = {
  subject: { es: 'Usas YTubViral como un Pro (literalmente)', en: 'You use YTubViral like a Pro (literally)' },
  build: (name, lang, uid, extra) => { const en = lang === 'en'; const used = extra?.used ?? ''; return shell(lang, uid, 'conv-c2',
    eyebrow(en ? 'HEADS UP' : 'AVISO') +
    h(en ? 'You\'re maxing out the free plan' : 'Estás apurando el plan gratis') +
    p(en ? `You've been using ${used ? `${used} of 10` : 'almost all your'} free generations two months running. Pro gives you 200/month plus the AI Coach, A/B testing and the full toolset — €9.99, cancel anytime, 30-day guarantee.` : `Llevas dos meses usando ${used ? `${used} de 10` : 'casi todas tus'} generaciones gratis. Pro te da 200/mes más el AI Coach, A/B testing y todas las herramientas — 9,99 €, cancela cuando quieras, garantía de 30 días.`) +
    button(utm('/pricing', 'conv-c2'), en ? 'Upgrade to Pro →' : 'Pasar a Pro →') +
    sign(en)); },
};
export const C3_paywall: Tpl = {
  subject: { es: 'El Coach que intentaste abrir, explicado', en: 'That Coach you tried to open, explained' },
  build: (name, lang, uid) => { const en = lang === 'en'; return shell(lang, uid, 'conv-c3',
    eyebrow(en ? 'ABOUT THAT FEATURE' : 'SOBRE ESA FUNCIÓN') +
    h(en ? 'The AI Coach, in plain terms' : 'El AI Coach, en cristiano') +
    p(en ? 'You tried opening a Pro tool. The AI Coach is a chat that knows your channel — ask it what to make next, why a video underperformed, or how to fix your CTR, and it answers with your real data. It\'s in Pro (€9.99) with a 30-day guarantee.' : 'Intentaste abrir una herramienta Pro. El AI Coach es un chat que conoce tu canal — pregúntale qué hacer después, por qué un vídeo rindió mal o cómo arreglar tu CTR, y responde con tus datos reales. Está en Pro (9,99 €) con garantía de 30 días.') +
    button(utm('/pricing', 'conv-c3'), en ? 'See what Pro unlocks →' : 'Ver qué desbloquea Pro →') +
    sign(en)); },
};

// ── D · Facturación (transaccional — sin gate de opt-out, ver lifecycle-trigger) ──
function formatAmount(cents: number, currency: string, lang: 'es' | 'en'): string {
  const value = (cents / 100).toFixed(2);
  if (currency.toUpperCase() !== 'EUR') return `${value} ${currency.toUpperCase()}`;
  return lang === 'en' ? `€${value}` : `${value.replace('.', ',')} €`;
}

export const D1_trialEnding: Tpl = {
  subject: { es: 'Tu prueba Pro termina en 3 días', en: 'Your Pro trial ends in 3 days' },
  build: (name, lang, uid, extra) => {
    const en = lang === 'en';
    const trialEndTs = Number(extra?.trialEndTs ?? 0);
    const date = trialEndTs
      ? new Date(trialEndTs * 1000).toLocaleDateString(en ? 'en-US' : 'es-ES', { day: 'numeric', month: 'long' })
      : '';
    const amount = formatAmount(Number(extra?.amountCents ?? 0), String(extra?.currency ?? 'EUR'), lang);
    const manageUrl = String(extra?.manageUrl ?? `${BASE}/profile`);
    return shell(lang, uid, 'trial-ending',
      eyebrow(en ? 'HEADS UP' : 'AVISO') +
      h(en ? `Your trial ends ${date}` : `Tu prueba termina el ${date}`) +
      p(en
        ? `You started a 7-day free trial of Pro. In 3 days, on ${date}, we'll charge ${amount} to keep it going — no action needed if you want to continue. Changed your mind? Cancel before then and you won't be charged anything.`
        : `Empezaste una prueba gratis de 7 días de Pro. En 3 días, el ${date}, cobraremos ${amount} para seguir — no hace falta que hagas nada si quieres continuar. ¿Te lo has pensado mejor? Cancela antes de esa fecha y no se te cobrará nada.`) +
      button(manageUrl, en ? 'Manage my subscription →' : 'Gestionar mi suscripción →') +
      sign(en));
  },
};

export const D2_paymentFailed: Tpl = {
  subject: { es: 'No pudimos procesar tu pago', en: "We couldn't process your payment" },
  build: (name, lang, uid, extra) => {
    const en = lang === 'en';
    const amountCents = Number(extra?.amountCents ?? 0);
    const amount = amountCents ? formatAmount(amountCents, String(extra?.currency ?? 'EUR'), lang) : '';
    const manageUrl = String(extra?.manageUrl ?? `${BASE}/profile`);
    return shell(lang, uid, 'payment-failed',
      eyebrow(en ? 'PAYMENT ISSUE' : 'PROBLEMA DE PAGO') +
      h(en ? 'Your card was declined' : 'Tu tarjeta ha sido rechazada') +
      p(en
        ? `We tried to charge${amount ? ` ${amount} for` : ''} your YTubViral Pro subscription and it didn't go through. Update your payment method to keep your access — we'll retry automatically over the next few days.`
        : `Intentamos cobrar${amount ? ` ${amount} de` : ''} tu suscripción Pro de YTubViral y no se ha podido. Actualiza tu método de pago para conservar el acceso — lo reintentaremos automáticamente en los próximos días.`) +
      button(manageUrl, en ? 'Update payment method →' : 'Actualizar método de pago →') +
      sign(en));
  },
};

export const SEQUENCES = {
  onboarding: { a1: A1_seoScore, a2: A2_generate, a3: A3_connect, a4: A4_discover, a5: A5_feedback },
  reactivation: { b1: B1_valueLeft, b2: B2_goodbye },
  conversion: { c1: C1_limitHit, c2: C2_powerUser, c3: C3_paywall },
  billing: { trialEnding: D1_trialEnding, paymentFailed: D2_paymentFailed },
} as const;
