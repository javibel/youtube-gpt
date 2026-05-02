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
      <div className="min-h-screen grain flex items-center justify-center" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen grain flex items-center justify-center" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
        <div className="text-center">
          <h1 className="font-display font-bold text-3xl text-white mb-4">{t('Logros', 'Achievements')}</h1>
          <p className="text-zinc-500 mb-6 font-mono-jb text-sm">{t('Inicia sesión para ver tus logros.', 'Sign in to view your achievements.')}</p>
          <a href="/login" className="btn-offset inline-flex px-8 py-3 text-sm font-display">{t('Iniciar sesión', 'Sign in')}</a>
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
      {/* Header */}
      <div className="border-b border-white/10" style={{ background: '#0B0B0D' }}>
        <div className="max-w-4xl mx-auto px-6 py-8">
          <p className="font-mono-jb text-[11px] tracking-[0.3em] uppercase mb-2" style={{ color: 'var(--red)' }}>
            {t('LOGROS', 'ACHIEVEMENTS')}
          </p>
          <h1 className="font-display font-bold text-3xl md:text-4xl text-white">
            {t('Tus logros', 'Your Achievements')}
          </h1>
          {data && (
            <div className="flex items-center gap-4 mt-3">
              <div className="flex-1 max-w-xs">
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-1000"
                    style={{ width: `${pct}%`, background: pct >= 80 ? '#22c55e' : pct >= 40 ? '#FFE800' : 'var(--red)' }}
                  />
                </div>
              </div>
              <span className="font-mono-jb text-sm text-zinc-400">
                {data.totalUnlocked}/{data.totalAvailable}
                <span className="text-zinc-600 ml-1">({pct}%)</span>
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {loading && (
          <div className="flex items-center gap-3 justify-center py-20">
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}

        {error && <p className="text-red-400 font-mono-jb text-sm text-center py-8">{error}</p>}

        {/* Newly unlocked toast */}
        {data && data.newlyUnlocked.length > 0 && (
          <div className="rounded-xl border p-4" style={{ background: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.25)' }}>
            <p className="font-display font-bold text-sm text-green-400 mb-2">
              {t('Nuevos logros desbloqueados!', 'New achievements unlocked!')}
            </p>
            <div className="flex flex-wrap gap-2">
              {data.newlyUnlocked.map(key => {
                const def = data.achievements.find(a => a.key === key);
                if (!def) return null;
                return (
                  <span key={key} className="inline-flex items-center gap-1.5 font-mono-jb text-xs px-3 py-1.5 rounded-lg" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
                    <span>{def.icon}</span> {def.label[lang]}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Achievement categories */}
        {grouped.map(group => (
          <div key={group.category}>
            <div className="flex items-center gap-2 mb-4">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={CATEGORY_ICONS[group.category]} />
              </svg>
              <h2 className="font-display font-bold text-lg text-white">
                {CATEGORY_LABELS[group.category][lang]}
              </h2>
              <span className="font-mono-jb text-[10px] text-zinc-600">
                {group.items.filter(a => a.unlocked).length}/{group.items.length}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {group.items.map(achievement => (
                <div
                  key={achievement.key}
                  className={`rounded-xl border p-4 transition ${achievement.unlocked ? 'border-white/15' : 'border-white/5 opacity-50'}`}
                  style={{ background: achievement.unlocked ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.01)' }}
                >
                  <div className="flex items-start gap-3">
                    <span className={`text-2xl ${achievement.unlocked ? '' : 'grayscale'}`}>
                      {achievement.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-display font-bold text-sm text-white">{achievement.label[lang]}</h3>
                      <p className="font-mono-jb text-[10px] text-zinc-500 mt-0.5">{achievement.desc[lang]}</p>
                      {achievement.unlocked && achievement.unlockedAt && (
                        <p className="font-mono-jb text-[9px] text-zinc-600 mt-1.5">
                          {fmtDate(achievement.unlockedAt, lang)}
                        </p>
                      )}
                      {!achievement.unlocked && (
                        <div className="mt-1.5 flex items-center gap-1">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                          <span className="font-mono-jb text-[9px] text-zinc-600">{t('Bloqueado', 'Locked')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </DashboardShell>
  );
}
