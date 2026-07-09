'use client';

import { useState } from 'react';
import { useLang } from '@/components/LangProvider';
import PublicNav from '@/components/PublicNav';

export default function AffiliatesClient() {
  const lang = useLang();
  const t = (es: string, en: string) => (lang === 'en' ? en : es);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [channelInfo, setChannelInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch('/api/affiliates/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, channelInfo, lang }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ ok: false, text: data.error || t('Error al enviar la solicitud', 'Error submitting the application') });
      } else {
        setResult({ ok: true, text: t('Solicitud enviada. Te escribimos en 1-2 días con la decisión.', 'Application sent. We\'ll get back to you in 1-2 days.') });
        setName(''); setEmail(''); setChannelInfo('');
      }
    } catch {
      setResult({ ok: false, text: t('Error al enviar la solicitud', 'Error submitting the application') });
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen grain" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
      <PublicNav />

      <article className="max-w-3xl mx-auto px-6 py-12">
        <header className="mb-10">
          <p className="font-mono-jb text-[13px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--yv-brand)' }}>
            {t('PROGRAMA DE AFILIADOS', 'AFFILIATE PROGRAM')}
          </p>
          <h1 className="font-display font-bold text-4xl text-white mb-4 leading-tight">
            {t('30% recurrente durante 12 meses, por cada suscriptor que traigas', '30% recurring for 12 months, for every subscriber you bring')}
          </h1>
          <p className="font-mono-jb text-sm leading-relaxed" style={{ color: 'var(--yv-text-3)' }}>
            {t(
              'Si tu audiencia son creadores de YouTube, YTubViral es una recomendación honesta — y te paga por hacerla. Sin letra pequeña, sin mínimos de audiencia, aprobación revisada a mano por el fundador.',
              'If your audience is YouTube creators, YTubViral is an honest recommendation — and it pays you for making it. No fine print, no minimum audience size, applications reviewed by hand by the founder.'
            )}
          </p>
        </header>

        <section className="mb-12 grid sm:grid-cols-3 gap-4">
          {[
            { n: '30%', l: t('de comisión recurrente', 'recurring commission') },
            { n: '12', l: t('meses por cada suscriptor', 'months per subscriber') },
            { n: '60', l: t('días de cookie de atribución', 'day attribution cookie') },
          ].map((s, i) => (
            <div key={i} className="rounded-xl p-5 text-center" style={{ background: 'var(--yv-surface)', border: '1px solid var(--yv-border)' }}>
              <p className="font-display font-bold text-3xl mb-1" style={{ color: 'var(--yv-brand)' }}>{s.n}</p>
              <p className="font-mono-jb text-[12px]" style={{ color: 'var(--yv-text-3)' }}>{s.l}</p>
            </div>
          ))}
        </section>

        <section className="mb-12">
          <h2 className="font-display font-bold text-2xl text-white mb-4">{t('Cómo funciona', 'How it works')}</h2>
          <ul className="space-y-3">
            {[
              { es: 'Te aprobamos y te damos un link con tu código (ytubviral.com/a/tucodigo) que puedes compartir en vídeo, descripción o donde quieras.', en: 'Once approved, you get a link with your code (ytubviral.com/a/yourcode) to share in a video, description, or anywhere.' },
              { es: 'Tu audiencia también puede citar tu código a mano al registrarse, sin necesidad de hacer clic — útil si lo mencionas de viva voz en un vídeo.', en: 'Your audience can also type your code by hand at signup, no click needed — useful if you mention it out loud in a video.' },
              { es: 'Cuando alguien se suscribe a Pro o Business por tu link o código, cobras el 30% de cada factura (sin IVA) durante los 12 meses siguientes a su primer pago.', en: 'When someone subscribes to Pro or Business through your link or code, you earn 30% of every invoice (excl. tax) for the 12 months following their first payment.' },
              { es: 'Liquidación mensual (umbral mínimo 50€) por PayPal o transferencia. Sin automatismos: lo revisamos y pagamos a mano.', en: 'Monthly payout (€50 minimum) via PayPal or bank transfer. No automation: we review and pay by hand.' },
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-3 font-mono-jb text-sm" style={{ color: 'var(--yv-text-2)' }}>
                <span className="font-display font-bold" style={{ color: 'var(--yv-brand)' }}>{i + 1}</span>
                <span>{lang === 'en' ? item.en : item.es}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mb-12 rounded-xl p-6" style={{ background: 'var(--yv-surface)', border: '1px solid var(--yv-border)' }}>
          <p className="font-mono-jb text-[12px] uppercase tracking-wider mb-2" style={{ color: 'var(--yv-text-4)' }}>{t('Un ejemplo real, sin inflar', 'A real example, not inflated')}</p>
          <p className="font-mono-jb text-sm leading-relaxed" style={{ color: 'var(--yv-text-2)' }}>
            {t(
              '10 personas de tu audiencia se hacen Pro (9,99€/mes) gracias a ti: son unos 30€/mes de comisión durante 12 meses (~360€ en total por esos 10). No prometemos más que eso — depende de tu audiencia y de si son un buen fit para la herramienta.',
              '10 people from your audience become Pro (€9.99/mo) thanks to you: that\'s about €30/mo in commission for 12 months (~€360 total for those 10). We don\'t promise more than that — it depends on your audience and whether they\'re a good fit for the tool.'
            )}
          </p>
        </section>

        <section className="mb-12">
          <h2 className="font-display font-bold text-2xl text-white mb-4">{t('Solicitar acceso', 'Apply')}</h2>
          <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
            <div>
              <label className="block font-mono-jb text-[13px] tracking-wider uppercase text-zinc-500 mb-2">{t('Nombre', 'Name')}</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} required
                className="soft-field py-3 px-4 text-sm" placeholder={t('Tu nombre o el de tu canal', 'Your name or your channel\'s')} />
            </div>
            <div>
              <label className="block font-mono-jb text-[13px] tracking-wider uppercase text-zinc-500 mb-2">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                className="soft-field py-3 px-4 text-sm" placeholder="you@email.com" />
            </div>
            <div>
              <label className="block font-mono-jb text-[13px] tracking-wider uppercase text-zinc-500 mb-2">
                {t('Tu canal/audiencia y cómo piensas promocionarlo', 'Your channel/audience and how you plan to promote it')}
              </label>
              <textarea value={channelInfo} onChange={(e) => setChannelInfo(e.target.value)} rows={4}
                className="soft-field py-3 px-4 text-sm" placeholder={t('Link a tu canal, tamaño aproximado de audiencia, y si lo harías en vídeo, descripción, newsletter...', 'Link to your channel, rough audience size, and whether you\'d do it in a video, description, newsletter...')} />
            </div>

            {result && (
              <div className="rounded-xl px-4 py-3 text-sm" style={{
                background: result.ok ? 'rgba(34,197,94,0.08)' : 'rgba(232,77,91,0.08)',
                border: `1px solid ${result.ok ? 'rgba(34,197,94,0.3)' : 'rgba(232,77,91,0.3)'}`,
                color: result.ok ? '#4ade80' : '#f87171',
              }}>
                {result.text}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="btn-offset py-3.5 px-7 font-display font-bold text-[15px] disabled:opacity-60">
              {loading ? t('Enviando...', 'Sending...') : t('Enviar solicitud →', 'Submit application →')}
            </button>
          </form>
          <p className="font-mono-jb text-[12px] mt-4" style={{ color: 'var(--yv-text-4)' }}>
            {t('Todas las solicitudes se revisan a mano. Sin aprobación automática.', 'All applications are reviewed by hand. No automatic approval.')}
          </p>
        </section>
      </article>
    </div>
  );
}
