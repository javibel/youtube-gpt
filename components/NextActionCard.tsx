'use client';

import { useEffect, useState, useCallback } from 'react';
import { useLang } from './LangProvider';
import { BoltIcon, TargetIcon, RocketIcon, VideoIcon, UsersIcon, DiamondIcon, CrossIcon } from './icons';

type NextAction = {
  id: string;
  title: { es: string; en: string };
  reason: { es: string; en: string };
  cta: { es: string; en: string };
  href: string;
};

const ICONS: Record<string, typeof BoltIcon> = {
  connect_channel: UsersIcon,
  first_generation: RocketIcon,
  score_recent_video: VideoIcon,
  optimize_low_score: TargetIcon,
  track_competitors: UsersIcon,
  best_time_stale: BoltIcon,
  trend_alert_unseen: BoltIcon,
  plan_week: BoltIcon,
  start_ab_test: DiamondIcon,
  daily_idea: RocketIcon,
};

function skipKey(): string {
  return `ytv_na_skip_${new Date().toISOString().slice(0, 10)}`;
}
function readSkipped(): string[] {
  try { return JSON.parse(localStorage.getItem(skipKey()) || '[]'); } catch { return []; }
}
function addSkipped(id: string) {
  try {
    const cur = readSkipped();
    if (!cur.includes(id)) localStorage.setItem(skipKey(), JSON.stringify([...cur, id]));
  } catch {}
}

// onAction: notifica al padre qué acción se está mostrando (o null) — el dashboard
// usa esto para suprimir el bloque "Ideas para hoy" cuando dispara daily_idea,
// evitando mostrar la misma idea dos veces.
export default function NextActionCard({ onAction }: { onAction?: (id: string | null) => void }) {
  const lang = useLang();
  const t = (es: string, en: string) => (lang === 'en' ? en : es);
  const [action, setAction] = useState<NextAction | null | undefined>(undefined); // undefined = cargando

  const load = useCallback(() => {
    const skip = readSkipped();
    const qs = skip.length ? `?skip=${skip.join(',')}` : '';
    fetch(`/api/next-action${qs}`)
      .then(r => r.json())
      .then(d => {
        setAction(d.action ?? null);
        onAction?.(d.action?.id ?? null);
      })
      .catch(() => { setAction(null); onAction?.(null); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!action) return null; // cargando o sin regla que dispare — el dashboard sigue con Ideas/Tip normal

  const Icon = ICONS[action.id] || BoltIcon;
  const href = `${action.href}${action.href.includes('?') ? '&' : '?'}from=next-action`;

  return (
    <div className="rounded-2xl border border-white/10 p-5 mb-4" style={{ background: 'rgba(232,77,91,0.06)' }}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="font-mono-jb text-[13px] tracking-wider uppercase inline-flex items-center gap-1.5" style={{ color: 'var(--yv-brand)' }}>
          <Icon size={13} /> {t('SIGUIENTE ACCIÓN', 'NEXT STEP')}
        </p>
        <button
          onClick={() => { addSkipped(action.id); load(); }}
          className="text-[12px] font-mono-jb hover:text-white transition flex-shrink-0"
          style={{ color: 'var(--yv-text-4)' }}
          aria-label={t('Descartar por hoy', 'Dismiss for today')}
        >
          <CrossIcon size={11} />
        </button>
      </div>
      <p className="text-sm font-semibold text-white leading-tight mb-1">{lang === 'en' ? action.title.en : action.title.es}</p>
      <p className="text-[13px] leading-snug mb-3" style={{ color: 'var(--yv-text-3)' }}>{lang === 'en' ? action.reason.en : action.reason.es}</p>
      <a href={href} className="btn-offset inline-flex px-4 py-2 text-[13px] font-display font-bold">
        {lang === 'en' ? action.cta.en : action.cta.es}
      </a>
    </div>
  );
}
