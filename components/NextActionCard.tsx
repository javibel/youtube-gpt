'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useLang } from './LangProvider';
import { BoltIcon, TargetIcon, RocketIcon, VideoIcon, UsersIcon, DiamondIcon, CrossIcon } from './icons';

type NextAction = {
  id: string;
  title: { es: string; en: string };
  reason: { es: string; en: string };
  cta: { es: string; en: string };
  href: string;
  score?: number;
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
function writeSkipped(ids: string[]) {
  try { localStorage.setItem(skipKey(), JSON.stringify(ids)); } catch {}
}

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

  const [actions, setActions] = useState<NextAction[] | undefined>(undefined); // undefined = cargando
  const [skipped, setSkipped] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  // Última descartada, para poder deshacer un clic accidental en la X.
  const [undone, setUndone] = useState<NextAction | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onActionRef = useRef(onAction);
  useEffect(() => { onActionRef.current = onAction; }, [onAction]);

  useEffect(() => {
    setSkipped(readSkipped());
    fetch('/api/next-action')
      .then(r => r.json())
      .then(d => setActions(Array.isArray(d.actions) ? d.actions : d.action ? [d.action] : []))
      .catch(() => setActions([]));
    return () => { if (undoTimer.current) clearTimeout(undoTimer.current); };
  }, []);

  const visible = (actions ?? []).filter(a => !skipped.includes(a.id));
  const pos = visible.length ? Math.min(index, visible.length - 1) : 0;
  const current = visible[pos] ?? null;

  useEffect(() => { onActionRef.current?.(current?.id ?? null); }, [current?.id]);

  const clearUndo = useCallback(() => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndone(null);
  }, []);

  function dismiss(action: NextAction) {
    const next = [...skipped, action.id];
    setSkipped(next);
    writeSkipped(next);
    setUndone(action);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndone(null), 12000);
  }

  function undo() {
    if (!undone) return;
    const next = skipped.filter(id => id !== undone.id);
    setSkipped(next);
    writeSkipped(next);
    const i = (actions ?? []).filter(a => !next.includes(a.id)).findIndex(a => a.id === undone.id);
    if (i >= 0) setIndex(i);
    clearUndo();
  }

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

  if (actions === undefined) return null; // cargando

  // Sin sugerencias visibles: si acaba de descartar la última dejamos el deshacer
  // a la vista — si no, el clic accidental sería irreversible hasta mañana.
  if (!current) {
    return undone ? <div className="yv-glass p-4 mb-6">{undoBar}</div> : null;
  }

  const Icon = ICONS[current.id] || BoltIcon;
  const href = `${current.href}${current.href.includes('?') ? '&' : '?'}from=next-action`;
  const navBtn = 'p-1 rounded transition disabled:opacity-25 disabled:cursor-default hover:text-white';

  return (
    <div className="yv-glass yv-glass--brand p-6 mb-6">
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
                    onClick={() => { setIndex(pos - 1); clearUndo(); }}
                    disabled={pos === 0}
                    className={navBtn}
                    aria-label={t('Sugerencia anterior', 'Previous suggestion')}
                    title={t('Sugerencia anterior', 'Previous suggestion')}
                  >
                    <Chevron dir="left" />
                  </button>
                  <span className="font-mono-jb text-[12px] tabular-nums select-none">{pos + 1}/{visible.length}</span>
                  <button
                    onClick={() => { setIndex(pos + 1); clearUndo(); }}
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
                onClick={() => dismiss(current)}
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
