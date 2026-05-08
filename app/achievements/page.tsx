'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { getLangClient } from '@/lib/get-lang-client';
import DashboardShell from '@/components/DashboardShell';

type Lang = 'es' | 'en';

interface Achievement {
  key: string;
  icon: string;
  label: { es: string; en: string };
  desc: { es: string; en: string };
  category: 'milestone' | 'improvement' | 'streak' | 'learning';
  unlocked: boolean;
  unlockedAt: string | null;
}

interface AchievementsData {
  achievements: Achievement[];
  totalUnlocked: number;
  totalAvailable: number;
  newlyUnlocked: string[];
}

const CATEGORY_LABELS: Record<string, { es: string; en: string }> = {
  milestone: { es: 'Hitos', en: 'Milestones' },
  improvement: { es: 'Mejora', en: 'Improvement' },
  streak: { es: 'Rachas', en: 'Streaks' },
  learning: { es: 'Aprendizaje', en: 'Learning' },
};

const CATEGORY_ICONS: Record<string, string> = {
  milestone: 'M5 3v18l7-3 7 3V3',
  improvement: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
  streak: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  learning: 'M12 14l9-5-9-5-9 5 9 5z M12 14l6.16-3.422A12.083 12.083 0 0 1 21 12.5V17l-9 5-9-5v-4.5',
};

function fmtDate(iso: string, lang: Lang): string {
  try {
    return new Date(iso).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-ES', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return ''; }
}

export default function AchievementsPage() {
  const { data: session, status } = useSession();
  const [lang, setLang] = useState<Lang>('es');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<AchievementsData | null>(null);

  useEffect(() => { setLang(getLangClient()); }, []);
  const t = (es: string, en: string) => lang === 'en' ? en : es;

  useEffect(() => {
    if (status !== 'authenticated') return;
    setLoading(true);
    fetch('/api/achievements')
      .then(r => r.json())
      .then(res => {
        if (res.error) setError(res.error);
        else setData(res);
      })
      .catch(() => setError(t('Error de conexión', 'Connection error')))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen grain flex items-center justify-center" style={{ background: 'var(--yv-bg-0)', color: 'var(--yv-text-2)' }}>
        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen grain flex items-center justify-center" style={{ background: 'var(--yv-bg-0)', color: 'var(--yv-text-2)' }}>
        <div className="text-center">
          <h1 className="yv-h1" style={{ marginBottom: 16 }}>{t('Logros', 'Achievements')}</h1>
          <p style={{ color: 'var(--yv-text-3)', fontFamily: 'var(--yv-font-mono)', fontSize: 'var(--yv-text-sm)', marginBottom: 24 }}>{t('Inicia sesión para ver tus logros.', 'Sign in to view your achievements.')}</p>
          <a href="/login" className="yv-btn yv-btn--primary" style={{ padding: '0 32px', height: 42 }}>{t('Iniciar sesión', 'Sign in')}</a>
        </div>
      </div>
    );
  }

  const pct = data ? Math.round((data.totalUnlocked / data.totalAvailable) * 100) : 0;

  // Group by category
  const grouped = data
    ? (['milestone', 'improvement', 'streak', 'learning'] as const).map(cat => ({
        category: cat,
        items: data.achievements.filter(a => a.category === cat),
      }))
    : [];

  return (
    <DashboardShell>
      <div className="yv-page" style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
        {/* §3 Page header */}
        <header className="yv-page-header">
          <div className="yv-page-header__left">
            <span className="yv-page-header__eyebrow">{t('Gamificación', 'Gamification')}</span>
            <h1 className="yv-page-header__title">{t('Tus logros', 'Your Achievements')}</h1>
            {data && (
              <p className="yv-page-header__desc">
                {t(
                  `Has conseguido ${data.totalUnlocked} de ${data.totalAvailable} logros. Sigue creando para desbloquear el resto.`,
                  `You've unlocked ${data.totalUnlocked} of ${data.totalAvailable} achievements. Keep creating to unlock the rest.`
                )}
              </p>
            )}
          </div>
          {data && (
            <div className="yv-page-header__actions">
              <span style={{
                fontFamily: 'var(--yv-font-mono)', fontSize: 'var(--yv-text-xs)',
                color: 'var(--yv-text-3)',
                background: 'var(--yv-bg-3)',
                border: '1px solid var(--yv-border-subtle)',
                padding: '2px 8px', borderRadius: 999,
              }}>
                {data.totalUnlocked}/{data.totalAvailable}
              </span>
            </div>
          )}
        </header>

        {loading && (
          <div className="flex items-center gap-3 justify-center py-20">
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}

        {error && <p style={{ color: 'var(--yv-brand)', fontFamily: 'var(--yv-font-mono)', fontSize: 'var(--yv-text-sm)', textAlign: 'center', padding: '32px 0' }}>{error}</p>}

        {/* §4.2 Newly unlocked toast — highlighted card state */}
        {data && data.newlyUnlocked.length > 0 && (
          <div style={{
            background: 'var(--yv-success-soft)',
            border: '1px solid rgba(34,197,94,0.25)',
            borderRadius: 'var(--yv-radius-lg)',
            padding: 'var(--yv-space-4)',
          }}>
            <p style={{ fontWeight: 600, fontSize: 'var(--yv-text-base)', color: 'var(--yv-success)', marginBottom: 8 }}>
              {t('Nuevos logros desbloqueados!', 'New achievements unlocked!')}
            </p>
            <div className="flex flex-wrap gap-2">
              {data.newlyUnlocked.map(key => {
                const def = data.achievements.find(a => a.key === key);
                if (!def) return null;
                return (
                  <span key={key} className="yv-badge yv-badge--success">
                    <img src={def.icon} alt="" width={16} height={16} className="inline" /> {def.label[lang]}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* §7 Achievement categories as sections */}
        {grouped.map(group => {
          const unlockedCount = group.items.filter(a => a.unlocked).length;
          return (
            <section key={group.category}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--yv-brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d={CATEGORY_ICONS[group.category]} />
                </svg>
                <h2 style={{
                  font: '600 17px/1.2 var(--yv-font-sans)',
                  color: 'var(--yv-text-1)', margin: 0,
                }}>
                  {CATEGORY_LABELS[group.category][lang]}
                </h2>
                {/* §6.2 Counter badge */}
                <span style={{
                  fontFamily: 'var(--yv-font-mono)', fontSize: 11,
                  color: 'var(--yv-text-3)',
                  background: 'var(--yv-bg-3)',
                  border: '1px solid var(--yv-border-subtle)',
                  padding: '2px 8px', borderRadius: 999,
                }}>{unlockedCount}/{group.items.length}</span>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 14,
              }}>
                {group.items.map(achievement => (
                  <div
                    key={achievement.key}
                    style={achievement.unlocked ? {
                      /* §4.2 Active/earned state */
                      background: 'var(--yv-bg-2)',
                      border: '1px solid var(--yv-brand-border)',
                      boxShadow: '0 0 0 1px var(--yv-brand-soft) inset, 0 12px 24px -16px rgba(232,77,91,.5)',
                      borderRadius: 12, padding: 16,
                    } : {
                      /* §4.2 Locked/empty state */
                      background: 'transparent',
                      border: '1px dashed var(--yv-border)',
                      borderRadius: 12, padding: 16,
                      opacity: 0.6,
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <img src={achievement.icon} alt="" width={24} height={24} className={achievement.unlocked ? '' : 'grayscale'} />
                      <div className="flex-1 min-w-0">
                        <h3 style={{ font: '600 14px/1.3 var(--yv-font-sans)', color: 'var(--yv-text-1)' }}>
                          {achievement.label[lang]}
                        </h3>
                        <p style={{ fontFamily: 'var(--yv-font-mono)', fontSize: 'var(--yv-text-xs)', color: 'var(--yv-text-2)', marginTop: 4 }}>
                          {achievement.desc[lang]}
                        </p>
                        {achievement.unlocked && achievement.unlockedAt && (
                          <p style={{ fontFamily: 'var(--yv-font-mono)', fontSize: 11, color: 'var(--yv-text-3)', marginTop: 6 }}>
                            {fmtDate(achievement.unlockedAt, lang)}
                          </p>
                        )}
                        {!achievement.unlocked && (
                          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--yv-text-4)" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                            <span style={{
                              fontFamily: 'var(--yv-font-mono)', fontSize: 10, fontWeight: 600,
                              color: 'var(--yv-text-4)',
                              textTransform: 'uppercase', letterSpacing: '0.08em',
                            }}>{t('Bloqueado', 'Locked')}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </DashboardShell>
  );
}
