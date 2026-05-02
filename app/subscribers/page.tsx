'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import DashboardShell from '@/components/DashboardShell';
import { getLangClient } from '@/lib/get-lang-client';

type Lang = 'es' | 'en';

interface AgeGroup { group: string; percentage: number }
interface GenderSplit { gender: string; percentage: number }
interface Country { country: string; views: number; watchTime: number; subsGained: number }
interface SubSource { source: string; subsGained: number }
interface SubDay { day: string; gained: number; lost: number }
interface CollabSuggestion { channel: string; reason: string }
interface AiInsights {
  audienceProfile: string;
  interests: string[];
  collaborationSuggestions: CollabSuggestion[];
  growthTips: string[];
}

const GENDER_LABELS: Record<string, Record<Lang, string>> = {
  male: { es: 'Hombres', en: 'Male' },
  female: { es: 'Mujeres', en: 'Female' },
  user_specified: { es: 'Otro', en: 'Other' },
};
const GENDER_COLORS: Record<string, string> = {
  male: '#818cf8', female: '#f472b6', user_specified: '#a3a3a3',
};

const SOURCE_LABELS: Record<string, string> = {
  SUBSCRIBER: 'Subs feed', EXT_URL: 'External', YT_SEARCH: 'Search',
  RELATED_VIDEO: 'Suggested', YT_CHANNEL: 'Channel page', NOTIFICATION: 'Notifications',
  NO_LINK_OTHER: 'Direct', SHORTS: 'Shorts', PLAYLIST: 'Playlists',
  ADVERTISING: 'Ads', END_SCREEN: 'End screens', ANNOTATION: 'Cards',
};

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toString();
}

function BarChart({ items, colorFn }: { items: { label: string; value: number; pct: number }[]; colorFn?: (i: number) => string }) {
  const max = Math.max(...items.map(i => i.pct), 1);
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={item.label}>
          <div className="flex justify-between mb-0.5">
            <span className="font-mono-jb text-[11px] text-zinc-400">{item.label}</span>
            <span className="font-mono-jb text-[11px] text-zinc-500">{item.pct.toFixed(1)}%</span>
          </div>
          <div className="h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${(item.pct / max) * 100}%`, background: colorFn ? colorFn(i) : '#9B2020' }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function SubscribersPage() {
  const { data: session, status } = useSession();
  const [lang, setLang] = useState<Lang>('es');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ageGroups, setAgeGroups] = useState<AgeGroup[]>([]);
  const [genderSplit, setGenderSplit] = useState<GenderSplit[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [subsSources, setSubsSources] = useState<SubSource[]>([]);
  const [subsTimeline, setSubsTimeline] = useState<SubDay[]>([]);
  const [summary, setSummary] = useState<{ totalSubsGained: number; totalSubsLost: number; netGrowth: number } | null>(null);
  const [aiInsights, setAiInsights] = useState<AiInsights | null>(null);

  useEffect(() => { setLang(getLangClient()); }, []);
  const t = (es: string, en: string) => lang === 'en' ? en : es;

  useEffect(() => {
    if (status !== 'authenticated') return;
    setLoading(true);
    fetch(`/api/youtube/subscribers?lang=${lang}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          if (data.error === 'pro_required') setError(t('Plan Pro requerido.', 'Pro plan required.'));
          else if (data.error === 'youtube_not_connected') setError(t('Conecta tu canal de YouTube primero.', 'Connect your YouTube channel first.'));
          else setError(data.error);
          return;
        }
        setAgeGroups(data.ageGroups || []);
        setGenderSplit(data.genderSplit || []);
        setCountries(data.countries || []);
        setSubsSources(data.subsSources || []);
        setSubsTimeline(data.subsTimeline || []);
        setSummary(data.summary || null);
        setAiInsights(data.aiInsights || null);
      })
      .catch(() => setError(t('Error de conexión', 'Connection error')))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen grain flex items-center justify-center" style={{ background: 'var(--ink)' }}>
        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen grain flex items-center justify-center" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
        <div className="text-center">
          <h1 className="font-display font-bold text-3xl text-white mb-4">{t('Audiencia', 'Audience')}</h1>
          <a href="/login" className="btn-offset inline-flex px-8 py-3 text-sm font-display">{t('Iniciar sesión', 'Sign in')}</a>
        </div>
      </div>
    );
  }

  // Subs timeline sparkline
  const timelineMax = Math.max(...subsTimeline.map(d => d.gained), 1);

  // Total views for country percentages
  const totalCountryViews = countries.reduce((s, c) => s + c.views, 0);

  // Total subs for source percentages
  const totalSubsSources = subsSources.reduce((s, src) => s + src.subsGained, 0);

  return (
    <DashboardShell>
      {/* Header */}
      <div className="border-b border-white/10" style={{ background: '#0B0B0D' }}>
        <div className="max-w-6xl mx-auto px-6 py-8">
          <p className="font-mono-jb text-[11px] tracking-[0.3em] uppercase mb-2" style={{ color: 'var(--red)' }}>
            {t('ANÁLISIS DE AUDIENCIA', 'AUDIENCE ANALYSIS')}
          </p>
          <h1 className="font-display font-bold text-3xl text-white">
            {t('¿Quién ve tus vídeos?', 'Who watches your videos?')}
          </h1>
          <p className="text-zinc-500 font-mono-jb text-xs mt-1">
            {t('Demografía, geografía, fuentes de suscriptores y oportunidades de colaboración.', 'Demographics, geography, subscriber sources, and collaboration opportunities.')}
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {loading && (
          <div className="flex items-center gap-3 justify-center py-20">
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <span className="text-zinc-500 font-mono-jb text-sm">{t('Analizando audiencia...', 'Analyzing audience...')}</span>
          </div>
        )}

        {error && (
          <div className="text-center py-12">
            <p className="text-red-400 font-mono-jb text-sm">{error}</p>
            {error.includes('canal') || error.includes('channel') ? (
              <a href="/dashboard" className="btn-offset inline-flex px-6 py-2 text-sm font-display mt-4">{t('Ir al dashboard', 'Go to dashboard')}</a>
            ) : null}
          </div>
        )}

        {!loading && !error && summary && (
          <div className="space-y-6 animate-in fade-in duration-500">

            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-4">
              <div className="soft-card p-5 text-center">
                <p className="font-display font-bold text-3xl" style={{ color: '#22c55e' }}>+{fmtNum(summary.totalSubsGained)}</p>
                <p className="font-mono-jb text-[10px] text-zinc-500 mt-1">{t('SUBS GANADOS (90D)', 'SUBS GAINED (90D)')}</p>
              </div>
              <div className="soft-card p-5 text-center">
                <p className="font-display font-bold text-3xl" style={{ color: '#e84d5b' }}>-{fmtNum(summary.totalSubsLost)}</p>
                <p className="font-mono-jb text-[10px] text-zinc-500 mt-1">{t('SUBS PERDIDOS (90D)', 'SUBS LOST (90D)')}</p>
              </div>
              <div className="soft-card p-5 text-center">
                <p className="font-display font-bold text-3xl" style={{ color: summary.netGrowth >= 0 ? '#22c55e' : '#e84d5b' }}>
                  {summary.netGrowth >= 0 ? '+' : ''}{fmtNum(summary.netGrowth)}
                </p>
                <p className="font-mono-jb text-[10px] text-zinc-500 mt-1">{t('CRECIMIENTO NETO', 'NET GROWTH')}</p>
              </div>
            </div>

            {/* Subs timeline */}
            {subsTimeline.length > 5 && (
              <div className="soft-card p-5">
                <p className="font-mono-jb text-[10px] tracking-[0.2em] text-zinc-500 uppercase mb-3">
                  {t('SUSCRIPTORES GANADOS POR DÍA (90D)', 'SUBSCRIBERS GAINED PER DAY (90D)')}
                </p>
                <div className="flex items-end gap-px h-20">
                  {subsTimeline.map((d, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center" title={`${d.day}: +${d.gained} / -${d.lost}`}>
                      <div
                        className="w-full rounded-t-sm"
                        style={{
                          height: `${Math.max((d.gained / timelineMax) * 80, d.gained > 0 ? 2 : 0)}px`,
                          background: d.gained > d.lost * 2 ? '#22c55e' : '#9B2020',
                          opacity: 0.7,
                        }}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex justify-between font-mono-jb text-[9px] text-zinc-700 mt-1">
                  <span>{subsTimeline[0]?.day}</span>
                  <span>{subsTimeline[subsTimeline.length - 1]?.day}</span>
                </div>
              </div>
            )}

            {/* Demographics + Gender */}
            <div className="grid md:grid-cols-2 gap-4">
              {/* Age groups */}
              {ageGroups.length > 0 && (
                <div className="soft-card p-5">
                  <p className="font-mono-jb text-[10px] tracking-[0.2em] text-zinc-500 uppercase mb-4">
                    {t('EDAD', 'AGE')}
                  </p>
                  <BarChart
                    items={ageGroups.map(a => ({ label: a.group, value: a.percentage, pct: a.percentage }))}
                    colorFn={() => '#818cf8'}
                  />
                </div>
              )}

              {/* Gender */}
              {genderSplit.length > 0 && (
                <div className="soft-card p-5">
                  <p className="font-mono-jb text-[10px] tracking-[0.2em] text-zinc-500 uppercase mb-4">
                    {t('GÉNERO', 'GENDER')}
                  </p>
                  <div className="flex items-center gap-6 mb-4">
                    {genderSplit.map(g => (
                      <div key={g.gender} className="text-center">
                        <p className="font-display font-bold text-3xl" style={{ color: GENDER_COLORS[g.gender] || '#a3a3a3' }}>
                          {g.percentage.toFixed(1)}%
                        </p>
                        <p className="font-mono-jb text-[10px] text-zinc-500 mt-1">
                          {GENDER_LABELS[g.gender]?.[lang] || g.gender}
                        </p>
                      </div>
                    ))}
                  </div>
                  {/* Gender bar */}
                  <div className="h-3 rounded-full flex overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
                    {genderSplit.map(g => (
                      <div
                        key={g.gender}
                        className="h-full transition-all duration-700"
                        style={{ width: `${g.percentage}%`, background: GENDER_COLORS[g.gender] || '#a3a3a3' }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Countries + Sub sources */}
            <div className="grid md:grid-cols-2 gap-4">
              {/* Countries */}
              {countries.length > 0 && (
                <div className="soft-card p-5">
                  <p className="font-mono-jb text-[10px] tracking-[0.2em] text-zinc-500 uppercase mb-4">
                    {t('PAÍSES TOP', 'TOP COUNTRIES')}
                  </p>
                  <div className="space-y-2">
                    {countries.slice(0, 10).map((c, i) => {
                      const pct = totalCountryViews > 0 ? (c.views / totalCountryViews) * 100 : 0;
                      return (
                        <div key={c.country} className="flex items-center gap-3">
                          <span className="font-display font-bold text-sm w-5 text-center" style={{ color: i < 3 ? 'var(--red)' : 'var(--text-faint)' }}>
                            {i + 1}
                          </span>
                          <span className="font-mono-jb text-[11px] text-zinc-400 w-8">{c.country}</span>
                          <div className="flex-1 h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.04)' }}>
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: i < 3 ? 'var(--red)' : 'rgba(255,255,255,0.15)' }} />
                          </div>
                          <span className="font-mono-jb text-[10px] text-zinc-500 w-12 text-right">{pct.toFixed(1)}%</span>
                          <span className="font-mono-jb text-[10px] text-zinc-600 w-16 text-right">{fmtNum(c.views)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Subscriber sources */}
              {subsSources.length > 0 && (
                <div className="soft-card p-5">
                  <p className="font-mono-jb text-[10px] tracking-[0.2em] text-zinc-500 uppercase mb-4">
                    {t('FUENTES DE SUSCRIPTORES', 'SUBSCRIBER SOURCES')}
                  </p>
                  <BarChart
                    items={subsSources.slice(0, 8).map(s => ({
                      label: SOURCE_LABELS[s.source] || s.source,
                      value: s.subsGained,
                      pct: totalSubsSources > 0 ? (s.subsGained / totalSubsSources) * 100 : 0,
                    }))}
                    colorFn={(i) => i < 3 ? '#22c55e' : 'rgba(255,255,255,0.2)'}
                  />
                </div>
              )}
            </div>

            {/* AI Insights */}
            {aiInsights && (
              <div className="space-y-4">
                {/* Audience profile */}
                <div className="soft-card p-5" style={{ borderColor: 'rgba(139,92,246,0.2)' }}>
                  <div className="flex items-center gap-2 mb-3">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.5">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                    </svg>
                    <h3 className="font-display font-bold text-sm text-purple-300">{t('Perfil de tu audiencia', 'Your audience profile')}</h3>
                  </div>
                  <p className="text-zinc-300 text-sm leading-relaxed">{aiInsights.audienceProfile}</p>

                  {/* Interests */}
                  {aiInsights.interests.length > 0 && (
                    <div className="mt-4">
                      <p className="font-mono-jb text-[10px] text-zinc-600 uppercase mb-2">{t('INTERESES', 'INTERESTS')}</p>
                      <div className="flex flex-wrap gap-2">
                        {aiInsights.interests.map((interest, i) => (
                          <span key={i} className="font-mono-jb text-[11px] px-3 py-1 rounded-full" style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', color: '#c4b5fd' }}>
                            {interest}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Collaboration suggestions */}
                {aiInsights.collaborationSuggestions.length > 0 && (
                  <div className="soft-card p-5" style={{ borderColor: 'rgba(34,197,94,0.2)' }}>
                    <div className="flex items-center gap-2 mb-3">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                      </svg>
                      <h3 className="font-display font-bold text-sm text-green-300">{t('Canales para colaborar', 'Channels to collaborate with')}</h3>
                    </div>
                    <div className="space-y-3">
                      {aiInsights.collaborationSuggestions.map((collab, i) => (
                        <div key={i} className="flex items-start gap-3">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center font-mono-jb text-[10px] font-bold" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
                            {i + 1}
                          </span>
                          <div>
                            <p className="font-display font-bold text-sm text-white">{collab.channel}</p>
                            <p className="text-zinc-400 text-xs mt-0.5">{collab.reason}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Growth tips */}
                {aiInsights.growthTips.length > 0 && (
                  <div className="soft-card p-5" style={{ borderColor: 'rgba(129,140,248,0.2)' }}>
                    <div className="flex items-center gap-2 mb-3">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2.5">
                        <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/><line x1="9" y1="21" x2="15" y2="21"/>
                      </svg>
                      <h3 className="font-display font-bold text-sm text-indigo-300">{t('Tips de crecimiento', 'Growth tips')}</h3>
                    </div>
                    <ul className="space-y-2">
                      {aiInsights.growthTips.map((tip, i) => (
                        <li key={i} className="text-zinc-300 text-sm flex items-start gap-2">
                          <span className="text-indigo-400 font-mono-jb text-[10px] mt-0.5">{i + 1}.</span>
                          <span className="leading-relaxed">{tip}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Private data badge */}
            <div className="text-center py-4">
              <span className="inline-flex items-center gap-2 font-mono-jb text-[10px] text-zinc-600 border border-white/8 rounded-full px-4 py-1.5">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                {t('Datos privados de YouTube Analytics — solo accesibles con OAuth', 'Private YouTube Analytics data — only accessible with OAuth')}
              </span>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
