 'use client';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import DashboardShell from '@/components/DashboardShell';
import { useLang } from '@/components/LangProvider';
import { useRevenueAnalysis } from '@/lib/use-revenue-analysis';
export default function RevenuePage() {
  const { data: session, status } = useSession(), lang = useLang();
  const [currency, setCurrency] = useState<'USD' | 'EUR'>('USD'), [rpm, setRpm] = useState('');
  const scenarioRpm = rpm === '' ? undefined : /^\d{1,4}(?:\.\d{1,4})?$/.test(rpm) && Number(rpm) <= 1000 ? Number(rpm) : NaN;
  const analysis = useRevenueAnalysis(session, status, { lang, currency, ...(scenarioRpm === undefined ? {} : { scenarioRpm }) });
  const t = (es: string, en: string) => lang === 'en' ? en : es, data = analysis.data;
  const money = (n: number) => new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'es-ES', { style: 'currency', currency: data?.revenue.currency ?? currency }).format(n);
  const number = (n: number) => new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'es-ES').format(n);
  if (status === 'unauthenticated') return <DashboardShell><div className="yv-page"><h1>{t('Ingresos de YouTube', 'YouTube revenue')}</h1><a href="/login">{t('Iniciar sesión', 'Sign in')}</a></div></DashboardShell>;
  const errors: Record<string, string> = {
    pro_required: t('Plan Pro requerido.', 'Pro plan required.'), youtube_not_connected: t('Conecta tu canal primero.', 'Connect your channel first.'),
    token_expired: t('Reconecta tu canal para autorizar otra consulta.', 'Reconnect your channel to authorize another query.'), no_activity_data: t('YouTube no devolvió datos de actividad.', 'YouTube returned no activity data.'),
  };
  return <DashboardShell><div className="yv-page space-y-6">
    <header className="yv-page-header"><div className="yv-page-header__left"><span className="yv-page-header__eyebrow">{t('INGRESOS Y ESCENARIOS', 'REVENUE AND SCENARIOS')}</span>
      <h1 className="yv-page-header__title">{data?.channel.name ?? t('Tu canal', 'Your channel')}</h1>
      <p className="yv-page-header__desc">{t('Estimaciones reportadas por YouTube y supuestos manuales separados.', 'YouTube-reported estimates and separate manual assumptions.')}</p></div></header>
    <div className="yv-card flex flex-wrap items-end gap-4">
      <label className="text-sm">{t('Moneda', 'Currency')}<select aria-label={t('Moneda', 'Currency')} value={currency} onChange={e => setCurrency(e.target.value as 'USD' | 'EUR')} className="block border rounded p-2 bg-transparent"><option value="USD">USD</option><option value="EUR">EUR</option></select></label>
      <label className="text-sm">{t('RPM neto supuesto (opcional, 0–1000)', 'Assumed net RPM (optional, 0–1000)')}<input aria-label="RPM" value={rpm} onChange={e => setRpm(e.target.value)} inputMode="decimal" placeholder="0.00" className="block border rounded p-2 bg-transparent" /></label>
      <button onClick={analysis.analyze} disabled={!analysis.canAnalyze || analysis.loading || status !== 'authenticated'} className="btn-offset px-6 py-3">{analysis.loading ? t('Consultando…', 'Loading…') : t('Consultar ingresos', 'Analyze revenue')}</button>
      <p className="text-xs w-full">{t('El RPM es tu supuesto de ingresos netos por 1000 vistas, en la moneda elegida. No se infiere un CPM por país.', 'RPM is your assumed net revenue per 1,000 views in the selected currency. Country CPM is not inferred.')}</p>
    </div>
    {Number.isNaN(scenarioRpm) && <p role="alert">{t('Introduce un RPM válido o deja el campo vacío.', 'Enter a valid RPM or leave it blank.')}</p>}
    {analysis.error && <p role="alert" className="text-red-400">{errors[analysis.error] ?? t('No se pudo confirmar la consulta. No se ha reintentado.', 'The analysis could not be confirmed. It has not been retried.')}</p>}
    {data && <>
      <p className="text-sm">{t('Intervalo solicitado:', 'Requested range:')} {data.revenueAnalysis.requestedStartDate} — {data.revenueAnalysis.requestedEndDate}. {t('28 días incluidos. La cobertura efectiva y la frescura no están informadas; los informes se leen por separado.', '28 inclusive days. Actual coverage and freshness are not reported; reports are read separately.')}</p>
      <div className="grid md:grid-cols-3 gap-4">
        <div className="yv-card"><h2>{t('Estimación reportada por YouTube', 'YouTube-reported estimate')}</h2><p className="text-2xl">{data.revenue.amount === null ? t('No disponible', 'Unavailable') : money(data.revenue.amount)}</p><p className="text-xs">{data.revenue.status === 'reported-estimate' ? t('Suma de los días devueltos. Sujeta a ajustes; no es una liquidación.', 'Sum of returned days. Subject to adjustment; not settled earnings.') : t('No se interpreta como cero ni como prueba de que el canal no monetiza.', 'This does not mean zero revenue or establish that the channel is not monetized.')}</p></div>
        <div className="yv-card"><h2>{t('Vistas reportadas del canal', 'Reported channel views')}</h2><p className="text-2xl">{number(data.traffic.views)}</p><p>{number(data.traffic.watchMinutes)} {t('minutos de visionado', 'watch minutes')}</p></div>
        <div className="yv-card"><h2>{t('Escenario manual', 'Manual scenario')}</h2><p className="text-2xl">{data.scenario ? money(data.scenario.amount) : t('Sin supuesto de RPM', 'No RPM assumption')}</p><p className="text-xs">{t('Vistas reportadas × tu RPM / 1000. Es un escenario, no ingresos observados ni una previsión.', 'Reported views × your RPM / 1,000. A scenario, not observed earnings or a forecast.')}</p></div>
      </div>
      <div className="grid md:grid-cols-2 gap-4"><section className="yv-card"><h2>{t('Países por vistas (hasta 20)', 'Countries by views (up to 20)')}</h2><ul>{data.traffic.countries.map(c => <li key={c.country}>{c.country}: {number(c.views)} {t('vistas', 'views')}</li>)}</ul><p className="text-xs">{t('La lista limitada no equivale al total del canal.', 'The capped list is not the channel total.')}</p></section>
      <section className="yv-card"><h2>{t('Vídeos por vistas (hasta 15)', 'Videos by views (up to 15)')}</h2><ul>{data.traffic.videos.map(v => <li key={v.videoId}><a href={`https://www.youtube.com/watch?v=${v.videoId}`} target="_blank" rel="noopener noreferrer">{v.title}</a>: {number(v.views)}</li>)}</ul><p className="text-xs">{t('No se reparten ingresos del canal entre vídeos por su número de vistas.', 'Channel revenue is not allocated to videos by view count.')}</p></section></div>
      <section className="yv-card"><h2>{t('Días devueltos por YouTube', 'Days returned by YouTube')}</h2><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th>{t('Fecha', 'Date')}</th><th>{t('Vistas', 'Views')}</th><th>{t('Minutos', 'Minutes')}</th></tr></thead><tbody>{data.traffic.days.map(d => <tr key={d.date}><td>{d.date}</td><td>{number(d.views)}</td><td>{number(d.watchMinutes)}</td></tr>)}</tbody></table></div><p className="text-xs">{t('Los días ausentes no se rellenan con ceros ni se usan para extrapolar ingresos.', 'Missing days are not filled with zeros or used to extrapolate revenue.')}</p></section>
      {data.insights ? <section className="yv-card"><h2>{t('IA: ideas que puedes investigar', 'AI: ideas to investigate')}</h2><ul>{data.insights.tips.map((tip, i) => <li key={i}>{tip}</li>)}</ul><h3>{t('Límites de los datos', 'Data limitations')}</h3><ul>{data.insights.limitations.map((tip, i) => <li key={i}>{tip}</li>)}</ul></section> : <p>{t('Consejos de IA no disponibles. Los datos anteriores permanecen separados de cualquier escenario.', 'AI tips unavailable. The data above remains separate from any scenario.')}</p>}
    </>}
  </div></DashboardShell>;
}
