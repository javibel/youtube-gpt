'use client';

import { useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useNextAction } from '@/lib/use-next-action';
import { useLang } from './LangProvider';
import { BoltIcon, TargetIcon, RocketIcon, VideoIcon, UsersIcon, DiamondIcon, CrossIcon } from './icons';

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

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={dir === 'left' ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} />
    </svg>
  );
}

// onAction: notifica al padre qué acción se está mostrando (o null) — el dashboard
// usa esto para suprimir el bloque "Ideas para hoy" cuando se muestra daily_idea,
// evitando enseñar la misma idea dos veces. Cambia al navegar entre sugerencias.
export default function NextActionCard({ onAction }: { onAction?: (id: string | null) => void }) {
  const lang = useLang();
  const t = (es: string, en: string) => (lang === 'en' ? en : es);

  const { data: session, status } = useSession();
  const card = useNextAction(session?.user?.id, session?.user?.email, status);
  const { rows: actions, skipped, index, undone, loaded, loading, error } = card;
  const onActionRef = useRef(onAction);
  useEffect(() => { onActionRef.current = onAction; }, [onAction]);
  const visible = actions.filter(a => !skipped.includes(a.id));
  const pos = visible.length ? Math.min(index, visible.length - 1) : 0;
  const current = visible[pos] ?? null;
  useEffect(() => { onActionRef.current?.(current?.id ?? null); }, [current?.id, card.ownerKey]);
  const { undo } = card;
  const warning = error && (
    <p role="alert" className="text-sm mb-3" style={{ color: 'var(--yv-text-3)' }}>
      {t('No se pudieron consultar las sugerencias.', 'Suggestions could not be loaded.')}
      {' '}<button onClick={() => void card.retry()} disabled={loading} className="underline">
        {loading ? t('Cargando…', 'Loading…') : t('Reintentar', 'Retry')}
      </button>
    </p>
  );

  const undoBar = undone && (
    <p className="font-mono-jb text-[12px] flex items-center gap-2 flex-wrap" style={{ color: 'var(--yv-text-4)' }}>
      <span>
        {t('Descartada por hoy:', 'Dismissed for today:')}{' '}
        <span style={{ color: 'var(--yv-text-3)' }}>{lang === 'en' ? undone.title.en : undone.title.es}</span>
      </span>
      <button onClick={undo} className="underline hover:text-white transition" style={{ color: 'var(--yv-brand)' }}>
        {t('Deshacer', 'Undo')}
      </button>
    </p>
  );

  if (!loaded && !error) return null; // cargando

  // Sin sugerencias visibles: si acaba de descartar la última dejamos el deshacer
  // a la vista — si no, el clic accidental sería irreversible hasta mañana.
  if (!current) {
    return undone || error ? <div className="yv-glass p-4 mb-6">{warning}{undoBar}</div> : null;
  }

  const Icon = ICONS[current.id] || BoltIcon;
  const href = `${current.href}${current.href.includes('?') ? '&' : '?'}from=next-action`;
  const navBtn = 'p-1 rounded transition disabled:opacity-25 disabled:cursor-default hover:text-white';

  return (
    <div className="yv-glass yv-glass--brand p-6 mb-6">
      {warning}
      <div className="flex items-center justify-between gap-6 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="font-mono-jb text-[13px] tracking-wider uppercase inline-flex items-center gap-1.5" style={{ color: 'var(--yv-brand)' }}>
              <Icon size={13} /> {t('SIGUIENTE ACCIÓN', 'NEXT STEP')}
            </p>
            <div className="flex items-center gap-1 flex-shrink-0" style={{ color: 'var(--yv-text-4)' }}>
              {visible.length > 1 && (
                <>
                  <button
                    onClick={() => { card.navigate(pos - 1); }}
                    disabled={pos === 0}
                    className={navBtn}
                    aria-label={t('Sugerencia anterior', 'Previous suggestion')}
                    title={t('Sugerencia anterior', 'Previous suggestion')}
                  >
                    <Chevron dir="left" />
                  </button>
                  <span className="font-mono-jb text-[12px] tabular-nums select-none">{pos + 1}/{visible.length}</span>
                  <button
                    onClick={() => { card.navigate(pos + 1); }}
                    disabled={pos === visible.length - 1}
                    className={navBtn}
                    aria-label={t('Siguiente sugerencia', 'Next suggestion')}
                    title={t('Siguiente sugerencia', 'Next suggestion')}
                  >
                    <Chevron dir="right" />
                  </button>
                </>
              )}
              <button
                onClick={() => card.dismiss(current.id)}
                className={`${navBtn} ml-1`}
                aria-label={t('Descartar por hoy', 'Dismiss for today')}
                title={t('Descartar por hoy', 'Dismiss for today')}
              >
                <CrossIcon size={11} />
              </button>
            </div>
          </div>
          <p className="font-display font-bold text-lg text-white leading-tight mb-1">{lang === 'en' ? current.title.en : current.title.es}</p>
          <p className="text-sm leading-snug" style={{ color: 'var(--yv-text-3)' }}>{lang === 'en' ? current.reason.en : current.reason.es}</p>
        </div>
        <div className="flex items-center gap-6 flex-shrink-0">
          {typeof current.score === 'number' && (
            <div className="text-right">
              <div className="font-display font-bold text-4xl leading-none" style={{ color: 'var(--yv-text-1)' }}>
                {current.score}<span className="text-lg" style={{ color: 'var(--yv-text-4)' }}>/100</span>
              </div>
            </div>
          )}
          <a href={href} className="btn-offset inline-flex px-5 py-2.5 text-[13px] font-display font-bold whitespace-nowrap">
            {lang === 'en' ? current.cta.en : current.cta.es} →
          </a>
        </div>
      </div>
      {undone && <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>{undoBar}</div>}
    </div>
  );
}
