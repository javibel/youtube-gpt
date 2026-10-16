'use client';
import { Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import DashboardShell from '@/components/DashboardShell';
import { useLang } from '@/components/LangProvider';
import { useTrackedIntelAnalysis } from '@/lib/use-tracked-intel-analysis';
import type { TrackedSample } from '@/lib/tracked-intel-contract';
function IntelligenceView() {
  const { data: session, status } = useSession(), lang = useLang(), search = useSearchParams();
  const channelIds = search.get('channels')?.split(',') ?? [];
  const analysis = useTrackedIntelAnalysis(session, status, { lang, channelIds }), data = analysis.data;
  const t = (es: string, en: string) => lang === 'en' ? en : es;
  const number = (n: number | null) => n === null ? t('No informado', 'Not reported') : new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'es-ES', { maximumFractionDigits: 1 }).format(n);
  const sample = (c: TrackedSample) => <section key={c.id} className="yv-card space-y-3"><h3 className="font-display font-bold">{c.name}</h3>
    <p className="text-xs">{t('Muestra de búsqueda, hasta 5 resultados.', 'Search sample, up to 5 results.')} {c.hasMore && t('YouTube indica páginas adicionales sin consultar.', 'YouTube indicates additional pages that were not read.')}</p>
    {!c.videos.length && <p>{t('No hay vídeos disponibles en esta respuesta; no demuestra ausencia de publicaciones.', 'No videos are available in this response; this does not establish absence of uploads.')}</p>}
    {c.unavailableVideoIds.length > 0 && <p>{t('Metadatos no disponibles para', 'Metadata unavailable for')} {c.unavailableVideoIds.length} {t('resultados.', 'results.')}</p>}
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th>{t('Vídeo', 'Video')}</th><th>{t('Publicado', 'Published')}</th><th>{t('Vistas acumuladas', 'Lifetime views')}</th><th>{t('Me gusta', 'Likes')}</th><th>{t('Media desde publicación (vistas/h)', 'Average since publication (views/h)')}</th></tr></thead><tbody>{c.videos.map(v => <tr key={v.videoId}><td><a href={`https://www.youtube.com/watch?v=${v.videoId}`} target="_blank" rel="noopener noreferrer">{v.title}</a></td><td>{v.publishedAt.slice(0, 10)}</td><td>{number(v.views)}</td><td>{number(v.likes)}</td><td>{number(v.lifetimeViewsPerHour)}</td></tr>)}</tbody></table></div>
  </section>;
  const errors: Record<string, string> = { pro_required: t('Plan Pro requerido.', 'Pro plan required.'), youtube_not_connected: t('Conecta tu canal para autorizar esta consulta.', 'Connect your channel to authorize this query.'), token_expired: t('Reconecta tu canal antes de otra consulta.', 'Reconnect your channel before another query.'), selection_changed: t('La lista de canales cambió. Vuelve al seguimiento para seleccionar la lista actual.', 'The channel list changed. Return to tracking to select the current list.') };
  return <DashboardShell><div className="yv-page space-y-6"><header className="yv-page-header"><div><h1 className="yv-page-header__title">{t('Inteligencia de canales seguidos', 'Tracked channel intelligence')}</h1><p>{t('Muestras de publicaciones y estadísticas públicas, con ideas para investigar.', 'Publication samples and public statistics, with ideas to investigate.')}</p></div></header>
    <a href="/competitors/tracking">{t('Volver a canales seguidos', 'Back to tracked channels')}</a>
    {status === 'unauthenticated' ? <a href="/login">{t('Iniciar sesión', 'Sign in')}</a> : <button className="btn-offset px-6 py-3" onClick={analysis.analyze} disabled={!analysis.canAnalyze || analysis.loading}>{analysis.loading ? t('Consultando…', 'Loading…') : t('Consultar muestras', 'Analyze samples')}</button>}
    <p className="text-sm">{t('Hasta 10 canales de la selección y 5 resultados por canal durante los últimos 7 días solicitados. No es un historial completo ni prueba de demanda o de temas que faltan en tu canal.', 'Up to 10 selected channels and 5 results per channel during the requested last 7 days. This is not a complete history or proof of demand or topics missing from your channel.')}</p>
    {analysis.blocked && !analysis.loading && <p role="status">{t('Una consulta anterior no está reconciliada. Se conserva y no se repite automáticamente.', 'A previous analysis is unreconciled. It is retained and is not automatically repeated.')}</p>}
    {analysis.error && <p role="alert">{errors[analysis.error] ?? t('La consulta no se ha confirmado; no se ha reintentado.', 'The analysis is unconfirmed; it has not been retried.')}</p>}
    {!channelIds.length && <p role="alert">{t('Abre esta vista desde la lista de canales seguidos.', 'Open this view from the tracked channel list.')}</p>}
    {data && <><p className="text-sm">{t('Intervalo solicitado:', 'Requested range:')} {data.trackedIntelAnalysis.requestedAfter} — {data.trackedIntelAnalysis.requestedBefore}. {t('Cobertura y frescura no informadas; fuentes leídas por separado.', 'Coverage and freshness are not reported; sources are read separately.')}</p>
      <p className="text-sm">{t('Vistas/h es una media acumulada desde publicación, disponible tras al menos una hora; no mide velocidad reciente. Las definiciones de vistas pueden diferir entre formatos. Las estadísticas ausentes permanecen desconocidas.', 'Views/h is a lifetime average since publication, available after at least one hour; it does not measure recent velocity. View definitions can differ across formats. Missing statistics remain unknown.')}</p>
      <h2>{t('Muestras de canales seguidos', 'Tracked channel samples')} ({data.channels.length}/{data.trackedIntelAnalysis.channelIds.length})</h2>{data.channels.map(sample)}
      <h2>{t('Muestra de tu canal', 'Your channel sample')}</h2>{sample(data.ownChannel)}
      {data.insights ? <section className="yv-card"><h2>{t('IA: ideas que puedes investigar', 'AI: ideas to investigate')}</h2><ul>{data.insights.tips.map((tip, i) => <li key={i}>{tip}</li>)}</ul><h3>{t('Límites', 'Limitations')}</h3><ul>{data.insights.limitations.map((tip, i) => <li key={i}>{tip}</li>)}</ul></section> : <p>{data.adviceStatus === 'not-applicable' ? t('Muestra insuficiente para sugerir ideas con IA.', 'Insufficient sample for AI ideas.') : t('Ideas de IA no disponibles; no se repite la solicitud.', 'AI ideas unavailable; the request is not repeated.')}</p>}
    </>}
  </div></DashboardShell>;
}
export default function CompetitorIntelligencePage() { return <Suspense fallback={<p>…</p>}><IntelligenceView /></Suspense>; }
