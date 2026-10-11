'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useLang } from '@/components/LangProvider';
import DashboardShell from '@/components/DashboardShell';
import { useOptimizeScore } from '@/lib/use-optimize-score';
import { useOptimizeRead } from '@/lib/use-optimize-read';
import { useOptimizeSave } from '@/lib/use-optimize-save';
import { readConfirmedOptimizeSave, validOptimizeSave } from '@/lib/optimize-save-client';
import type { OptimizeSave } from '@/lib/optimize-save-client';
import type { OptimizeVideo as VideoDetail, OptimizeHistory as HistoryEntry } from '@/lib/optimize-read-client';

type Lang = 'es' | 'en';

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toString();
}

function fmtDate(iso: string, lang: Lang): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-ES', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return ''; }
}

function scoreColor(s: number): string {
  if (s >= 70) return '#22c55e';
  if (s >= 40) return '#FFE800';
  return '#e84d5b';
}

function scoreBg(s: number): string {
  if (s >= 70) return 'rgba(34,197,94,0.12)';
  if (s >= 40) return 'rgba(255,232,0,0.10)';
  return 'rgba(232,77,91,0.12)';
}

// ── Score ring SVG ─────────────────────────────────────────────────────

function ScoreRing({ score, size = 100 }: { score: number; size?: number }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = scoreColor(score);

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 0.5s ease' }}
      />
      <text
        x={size / 2} y={size / 2}
        textAnchor="middle" dominantBaseline="central"
        className="font-display font-bold"
        style={{ fontSize: size * 0.32, fill: color, transform: 'rotate(90deg)', transformOrigin: 'center' }}
      >
        {score}
      </text>
    </svg>
  );
}

// ── Check indicator ────────────────────────────────────────────────────

function CheckDot({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#22c55e' }} />
  ) : (
    <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#e84d5b' }} />
  );
}

// ── Main page ──────────────────────────────────────────────────────────

export default function OptimizePage() {
  const { data: session, status } = useSession();
  const lang = useLang();
  const t = (es: string, en: string) => lang === 'en' ? en : es;

  // State
  const [selectedSource, setSelectedVideo] = useState<VideoDetail | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [baseChecks, setChecks] = useState<{ key: string; ok: boolean; w: number }[]>([]);
  const [baseScore, setScore] = useState(0);
  const [originalScore, setOriginalScore] = useState(0);
  const [error, setError] = useState('');

  // Edit state
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editTags, setEditTags] = useState('');

  // Original values for diff
  const originalRef = useRef<{ title: string; description: string; tags: string[] }>({ title: '', description: '', tags: [] });

  const owner = { userId: session?.user?.id || '', email: session?.user?.email ?? null };
  const account = JSON.stringify([status, owner.userId, owner.email]);
  const liveAccount = useRef(account);
  liveAccount.current = account;
  const [selection, setSelection] = useState<{ account: string; videoId: string } | null>(null);
  const selectionSerial = useRef(0);
  const requestId = selection?.account === account ? selection.videoId : null;
  const list = useOptimizeRead(owner, status, null, lang, requestId === null);
  const detail = useOptimizeRead(owner, status, requestId, lang, requestId !== null);
  const listData = list.data?.kind === 'list' ? list.data : null;
  const detailData = detail.data?.kind === 'detail' ? detail.data : null;
  const videos = listData?.videos ?? [];
  const loadingList = list.loading;
  const loadingVideo = detail.loading;
  const selectedVideo = detailData?.video === selectedSource && selection?.account === account ? selectedSource : null;
  const selectionVersion = selectionSerial.current;
  const hasChanges = !!selectedVideo && (
    editTitle !== originalRef.current.title ||
    editDesc !== originalRef.current.description ||
    editTags !== originalRef.current.tags.join(', ')
  );
  const saveInput = { videoId: selectedVideo?.videoId || '', title: editTitle, description: editDesc,
    tags: editTags.split(',').map(tag => tag.trim()).filter(Boolean), categoryId: selectedVideo?.categoryId || '22',
    original: originalRef.current };
  const save = useOptimizeSave(owner, status, requestId, lang, JSON.stringify(saveInput));
  const appliedSave = useRef<OptimizeSave | null>(null);
  const matchesSavedDraft = (a: OptimizeSave) => a.input.title === editTitle && a.input.description === editDesc
    && JSON.stringify(a.input.tags) === JSON.stringify(saveInput.tags);
  const saveResult = save.outcome?.status === 'confirmed' && save.attempt && matchesSavedDraft(save.attempt) ? save.outcome : null;
  const saving = save.saving;
  const canEdit = () => { const a = save.currentAttempt(); return save.canEdit() && (a?.outcome?.status !== 'confirmed' || appliedSave.current === a || !matchesSavedDraft(a)); };
  const preview = useOptimizeScore(owner, status, {
    videoId: selectedVideo?.videoId || '', title: editTitle, description: editDesc,
    tags: editTags.split(',').map(tag => tag.trim()).filter(Boolean),
  }, selectedVideo, hasChanges);
  // Do not present a score from an earlier draft as the current preview.
  const score = selectedVideo ? (hasChanges ? preview.data?.score ?? null : baseScore) : null;
  const checks = selectedVideo ? (hasChanges ? preview.data?.checks ?? [] : baseChecks) : [];

  useEffect(() => {
    if (!detail.canAct() || !detailData || detailData.video === selectedSource) return;
    const data = detailData;
    setSelectedVideo(data.video);
    setEditTitle(data.video.title);
    setEditDesc(data.video.description);
    setEditTags(data.video.tags.join(', '));
    setScore(data.score);
    setOriginalScore(data.score);
    setChecks(data.checks);
    setHistory(data.history);
    originalRef.current = { title: data.video.title, description: data.video.description, tags: [...data.video.tags] };
  }, [detailData]); // eslint-disable-line react-hooks/exhaustive-deps

  function selectVideo(videoId: string) {
    if (!list.canAct() || liveAccount.current !== account || selectionSerial.current !== selectionVersion
      || !listData?.videos.some(v => v.videoId === videoId)) return;
    selectionSerial.current++;
    detail.retire(); preview.retire();
    setSelectedVideo(null);
    setSelection({ account, videoId });
    setError('');
  }
  function backToList() {
    if (!detail.canAct() || selectionSerial.current !== selectionVersion) return;
    selectionSerial.current++;
    detail.retire(); preview.retire();
    setSelection(null); setSelectedVideo(null); setError('');
  }
  function readError(code: string) {
    if (code === 'pro_required') return t('Esta función requiere el plan Pro.', 'This feature requires the Pro plan.');
    if (code === 'youtube_not_connected') return t('Conecta tu canal de YouTube primero desde el Dashboard.', 'Connect your YouTube channel first from the Dashboard.');
    if (code === 'video_not_found') return t('El vídeo seleccionado no está disponible.', 'The selected video is unavailable.');
    return t('No se pudieron cargar los datos.', 'Could not load the data.');
  }

  function onTitleChange(v: string) { if (preview.canEdit() && canEdit()) setEditTitle(v); }
  function onDescChange(v: string) { if (preview.canEdit() && canEdit()) setEditDesc(v); }
  function onTagsChange(v: string) { if (preview.canEdit() && canEdit()) setEditTags(v); }

  // Save to YouTube
  function handleSave() {
    if (!selectedVideo || !detail.canAct() || !canEdit() || !hasChanges || !validOptimizeSave(saveInput)
      || liveAccount.current !== account || selectionSerial.current !== selectionVersion) return;
    setError(''); save.start(saveInput);
  }

  useEffect(() => {
    if (!save.canAct() || !detail.canAct() || !save.attempt || !saveResult || appliedSave.current === save.attempt) return;
    appliedSave.current = save.attempt;
    // Apply only the exact original acknowledgement, then install its one
    // coordinated GET. A history read cannot acknowledge or repeat a PUT.
    const i = saveResult.input;
    originalRef.current = { title: i.title, description: i.description, tags: [...i.tags] };
    setEditTitle(i.title); setEditDesc(i.description); setEditTags(i.tags.join(', '));
    setScore(saveResult.score); setOriginalScore(saveResult.score); setChecks(saveResult.checks);
    preview.retire();
    if (!save.attempt.read || save.attempt.read.pending) {
      const read = readConfirmedOptimizeSave(save.attempt); if (read) detail.install(read);
    }
  }, [save.attempt, saveResult]); // eslint-disable-line react-hooks/exhaustive-deps

  const scoreDelta = score === null ? 0 : score - originalScore;

  // ── Render ─────────────────────────────────────────────────────────────

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--yv-light)', color: 'var(--yv-text-1)' }}>
        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--yv-light)', color: 'var(--yv-text-1)' }}>
        <div className="text-center">
          <h1 className="font-display font-bold text-3xl text-white mb-4">{t('Optimizar Vídeo', 'Optimize Video')}</h1>
          <p className="mb-6 font-mono-jb text-sm" style={{ color: 'var(--yv-text-3)' }}>{t('Inicia sesión para optimizar tus vídeos.', 'Sign in to optimize your videos.')}</p>
          <a href="/login" className="btn-offset inline-flex px-8 py-3 text-sm font-display">{t('Iniciar sesión', 'Sign in')}</a>
        </div>
      </div>
    );
  }

  return (
    <DashboardShell>
      <div className="yv-page">

        {/* Page title */}
        <header className="yv-page-header mb-10">
          <div className="yv-page-header__left">
            <span className="yv-page-header__eyebrow">{t('OPTIMIZACIÓN', 'OPTIMIZATION')}</span>
            <h1 className="yv-page-header__title">
              {t('Optimizar', 'Optimize')}{' '}
              <span style={{ color: 'var(--yv-brand)' }}>{t('y guardar.', '& save.')}</span>
            </h1>
            <p className="yv-page-header__desc">
              {t(
                'Edita título, descripción y tags con score en tiempo real. Guarda directamente en YouTube con un click.',
                'Edit title, description and tags with real-time score. Save directly to YouTube with one click.'
              )}
            </p>
          </div>
        </header>

        {error && (
          <div className="mb-6 px-4 py-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-sm font-mono-jb">
            {error}
          </div>
        )}

        {requestId && <div role="status" className="mb-6 font-mono-jb text-sm">
          {saving && t('Guardando en YouTube…', 'Saving to YouTube…')}
          {save.outcome?.status === 'unconfirmed' && t('No se ha confirmado la publicación ni su historial. No vuelvas a guardar estos cambios.', 'The publication and its history are unconfirmed. Do not save these changes again.')}
          {save.outcome?.status === 'unconfirmed' && save.pending && <p>{t('La solicitud original sigue pendiente.', 'The original request is still pending.')}</p>}
          {save.blocked && !saving && save.outcome?.status !== 'unconfirmed' && <p>{saveResult
            ? t('Los cambios están confirmados; no se puede iniciar otro guardado desde esta sesión.', 'The changes are confirmed; this session cannot start another save.')
            : t('El guardado anterior no permite iniciar otro. Conserva esta sesión; no se ha confirmado su cierre.', 'The previous save prevents another attempt. Keep this session; its completion is unconfirmed.')}</p>}
          {save.outcome?.status === 'rejected' && <p>{save.outcome.error === 'invalid_input'
            ? t('Revisa el título, la descripción y los tags antes de guardar.', 'Check the title, description and tags before saving.')
            : readError(save.outcome.error)}</p>}
          {saveResult && t('Publicación e historial confirmados. Consultando los datos del vídeo.', 'Publication and history confirmed. Reading the video data.')}
        </div>}

        {((requestId ? detail.error : list.error) || (requestId ? detail.loading : list.loading)) && (
          <div role="status" className="mb-6 font-mono-jb text-sm">
            {(requestId ? detail.loading : list.loading) && t('Cargando datos…', 'Loading data…')}
            {(requestId ? detail.error : list.error) && <>
              <p>{readError(requestId ? detail.error : list.error)}</p>
              {(requestId ? detail.pending : list.pending) && <p>{t('La lectura original sigue pendiente.', 'The original read is still pending.')}</p>}
              <button type="button" disabled={requestId ? detail.pending : list.pending} onClick={requestId ? detail.retry : list.retry} className="mt-2 underline disabled:opacity-40">
                {t('Reintentar lectura', 'Retry read')}
              </button>
            </>}
          </div>
        )}
        {requestId && !selectedVideo && <button type="button" onClick={backToList} className="mb-6 underline">{t('Volver a la lista', 'Back to list')}</button>}
        {!requestId && listData?.coverage === 'partial' && <p role="status" className="mb-6 font-mono-jb text-sm">
          {t('Datos parciales:', 'Partial data:')} {listData.videos.length}/{listData.requestedVideoIds.length} {t('vídeos disponibles.', 'videos available.')}
        </p>}

        {/* ── VIDEO SELECTOR ──────────────────────────────────────────── */}
        {!requestId && (
          <>
            {loadingList ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              </div>
            ) : listData?.coverage === 'complete' && videos.length === 0 ? (
              <div className="text-center py-20">
                <p className="font-mono-jb text-sm" style={{ color: 'var(--yv-text-2)' }}>
                  {t('No se encontraron vídeos en la búsqueda confirmada.', 'No videos found in the confirmed search.')}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="font-mono-jb text-[13px] mb-4" style={{ color: 'var(--yv-text-2)' }}>{t('Selecciona un vídeo para optimizar:', 'Select a video to optimize:')}</p>
                {videos.map(v => (
                  <button
                    key={v.videoId}
                    data-video-id={v.videoId}
                    onClick={() => selectVideo(v.videoId)}
                    className="yv-card yv-glass--hover w-full flex items-center gap-4 p-4 transition text-left"
                  >
                    {v.thumbnail && (
                      <img src={v.thumbnail} alt="" className="w-32 h-18 rounded-lg object-cover flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-display font-semibold text-sm truncate">{v.title}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-3)' }}>{fmtNum(v.views)} {t('vistas', 'views')}</span>
                        <span className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-4)' }}>{fmtDate(v.publishedAt, lang)}</span>
                      </div>
                    </div>
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center font-mono-jb text-lg font-bold flex-shrink-0"
                      style={{ background: scoreBg(v.score), color: scoreColor(v.score), border: `1px solid ${scoreColor(v.score)}33` }}
                    >
                      {v.score}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── LOADING VIDEO DETAIL ────────────────────────────────────── */}
        {loadingVideo && (
          <div className="flex items-center justify-center py-20">
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}

        {/* ── EDIT MODE ───────────────────────────────────────────────── */}
        {selectedVideo && !loadingVideo && (
          <div>
            {/* Back button */}
            <button
              onClick={backToList}
              className="flex items-center gap-2 hover:text-white font-mono-jb text-[13px] mb-6 transition"
              style={{ color: 'var(--yv-text-3)' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
              {t('Volver a la lista', 'Back to list')}
            </button>

            {/* Video header */}
            <div className="flex items-start gap-5 mb-8">
              {selectedVideo.thumbnail && (
                <img src={selectedVideo.thumbnail} alt="" className="w-40 h-24 rounded-xl object-cover flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-white font-display font-bold text-lg truncate">{selectedVideo.title}</p>
                <div className="flex items-center gap-4 mt-2 font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-3)' }}>
                  <span>{fmtNum(selectedVideo.views)} {t('vistas', 'views')}</span>
                  <span>{fmtNum(selectedVideo.likes)} likes</span>
                  <span>{fmtNum(selectedVideo.comments)} {t('comentarios', 'comments')}</span>
                  <span>{fmtDate(selectedVideo.publishedAt, lang)}</span>
                </div>
              </div>
            </div>

            {/* Main editor layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              {/* ── Left: Editor (2 cols) ─────────────────────────────── */}
              <div className="lg:col-span-2 space-y-6">

                {/* Title */}
                <div className="yv-card p-5">
                  <div className="flex items-center justify-between mb-3">
                    <label className="font-mono-jb text-[13px] tracking-wider uppercase" style={{ color: 'var(--yv-text-2)' }}>
                      {t('Título', 'Title')}
                    </label>
                    <span className="font-mono-jb text-[13px]" style={{ color: editTitle.length >= 30 && editTitle.length <= 70 ? '#22c55e' : '#e84d5b' }}>
                      {editTitle.length}/70
                    </span>
                  </div>
                  <input
                    type="text"
                    value={editTitle}
                    disabled={!canEdit()}
                    onChange={e => onTitleChange(e.target.value)}
                    maxLength={100}
                    className="yv-input text-white font-display text-lg"
                    placeholder={t('Título del vídeo...', 'Video title...')}
                  />
                  {/* Title checks inline */}
                  <div className="flex flex-wrap gap-3 mt-3">
                    {checks.filter(c => c.key.startsWith('title_')).map(c => (
                      <span key={c.key} className="flex items-center gap-1.5 font-mono-jb text-[13px] yv-muted">
                        <CheckDot ok={c.ok} />
                        {c.key === 'title_length' ? t('Longitud', 'Length') :
                         c.key === 'title_number' ? t('Números', 'Numbers') :
                         c.key === 'title_caps' ? t('No ALL CAPS', 'No ALL CAPS') :
                         c.key === 'title_emoji' ? 'Emoji' :
                         c.key === 'title_power' ? t('Palabra poder', 'Power word') : c.key}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Description */}
                <div className="yv-card p-5">
                  <div className="flex items-center justify-between mb-3">
                    <label className="font-mono-jb text-[13px] tracking-wider uppercase" style={{ color: 'var(--yv-text-2)' }}>
                      {t('Descripción', 'Description')}
                    </label>
                    <span className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-4)' }}>
                      {editDesc.split(/\s+/).filter(Boolean).length} {t('palabras', 'words')}
                    </span>
                  </div>
                  <textarea
                    value={editDesc}
                    disabled={!canEdit()}
                    onChange={e => onDescChange(e.target.value)}
                    rows={10}
                    className="yv-input text-[color:var(--yv-text-2)] font-mono-jb text-sm resize-y"
                    placeholder={t('Descripción del vídeo...', 'Video description...')}
                  />
                  <div className="flex flex-wrap gap-3 mt-3">
                    {checks.filter(c => c.key.startsWith('desc_')).map(c => (
                      <span key={c.key} className="flex items-center gap-1.5 font-mono-jb text-[13px] yv-muted">
                        <CheckDot ok={c.ok} />
                        {c.key === 'desc_length' ? t('100+ palabras', '100+ words') :
                         c.key === 'desc_links' ? 'Links' :
                         c.key === 'desc_timestamps' ? 'Timestamps' :
                         c.key === 'desc_hashtags' ? 'Hashtags' :
                         c.key === 'desc_cta' ? 'CTA' : c.key}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Tags */}
                <div className="yv-card p-5">
                  <div className="flex items-center justify-between mb-3">
                    <label className="font-mono-jb text-[13px] tracking-wider uppercase" style={{ color: 'var(--yv-text-2)' }}>
                      Tags
                    </label>
                    <span className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-4)' }}>
                      {editTags.split(',').filter(t => t.trim()).length} tags
                    </span>
                  </div>
                  <textarea
                    value={editTags}
                    disabled={!canEdit()}
                    onChange={e => onTagsChange(e.target.value)}
                    rows={3}
                    className="yv-input text-[color:var(--yv-text-2)] font-mono-jb text-sm resize-y"
                    placeholder={t('tag1, tag2, tag3...', 'tag1, tag2, tag3...')}
                  />
                  <div className="flex flex-wrap gap-3 mt-3">
                    {checks.filter(c => c.key.startsWith('tags_')).map(c => (
                      <span key={c.key} className="flex items-center gap-1.5 font-mono-jb text-[13px] yv-muted">
                        <CheckDot ok={c.ok} />
                        {c.key === 'tags_count' ? t('5-20 tags', '5-20 tags') :
                         c.key === 'tags_long' ? t('Tags largos', 'Long-tail') :
                         c.key === 'tags_short' ? t('Tags cortos', 'Short tags') : c.key}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Save button */}
                <div className="flex items-center gap-4">
                  <button
                    onClick={handleSave}
                    data-optimize-save="true"
                    disabled={!canEdit() || !hasChanges || !validOptimizeSave(saveInput)}
                    className="btn-offset px-8 py-3.5 text-sm font-mono-jb tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ borderRadius: '10px' }}
                  >
                    {saving ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        {t('Guardando en YouTube...', 'Saving to YouTube...')}
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                          <polyline points="17 8 12 3 7 8"/>
                          <line x1="12" x2="12" y1="3" y2="15"/>
                        </svg>
                        {t('Guardar en YouTube', 'Save to YouTube')}
                      </span>
                    )}
                  </button>
                  {!hasChanges && selectedVideo && (
                    <span className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-4)' }}>{t('Sin cambios', 'No changes')}</span>
                  )}
                </div>

                {/* Save result */}
                {saveResult && (
                  <div className="rounded-xl border border-green-500/30 p-5" style={{ background: 'rgba(34,197,94,0.06)' }}>
                    <div className="flex items-center gap-2 mb-2">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5">
                        <path d="M20 6L9 17l-5-5"/>
                      </svg>
                      <span className="text-green-400 font-display font-semibold text-sm">
                        {t('Cambios guardados en YouTube', 'Changes saved to YouTube')}
                      </span>
                    </div>
                    {saveResult.aiSuggestion && (
                      <div className="mt-3 p-3 rounded-lg border border-purple-500/20" style={{ background: 'rgba(139,92,246,0.06)' }}>
                        <p className="font-mono-jb text-[13px] tracking-wider uppercase mb-1" style={{ color: 'var(--yv-text-2)' }}>{t('Siguiente paso', 'Next step')}</p>
                        <p className="text-[color:var(--yv-text-2)] font-mono-jb text-sm">
                          {lang === 'en' ? saveResult.aiSuggestion.en : saveResult.aiSuggestion.es}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── Right sidebar: Score + Checks + History ────────── */}
              <div className="space-y-6">

                {/* Score card */}
                <div className="yv-card p-6 text-center">
                  <p className="font-mono-jb text-[13px] tracking-[0.3em] uppercase yv-muted mb-4">SEO SCORE</p>
                  <div className="flex justify-center">
                    <span aria-label="SEO score">{score !== null ? <ScoreRing score={score} size={120} /> : '—'}</span>
                  </div>
                  <div role="status" className="mt-3 font-mono-jb text-sm">
                    {preview.loading && t('Calculando puntuación…', 'Calculating score…')}
                    {preview.error && t('No se pudo calcular la puntuación.', 'Could not calculate the score.')}
                    {preview.error && preview.pending && <p>{t('El cálculo original sigue pendiente.', 'The original calculation is still pending.')}</p>}
                    {preview.error && <button type="button" onClick={preview.retry} disabled={preview.pending} className="mt-2 underline disabled:opacity-40">
                      {t('Reintentar cálculo', 'Retry calculation')}
                    </button>}
                  </div>
                  {scoreDelta !== 0 && (
                    <div className="mt-3 font-mono-jb text-sm font-bold" style={{ color: scoreDelta > 0 ? '#22c55e' : '#e84d5b' }}>
                      {scoreDelta > 0 ? '+' : ''}{scoreDelta} {t('puntos', 'points')}
                    </div>
                  )}
                </div>

                {/* Checklist summary */}
                <div className="yv-card p-5">
                  <p className="font-mono-jb text-[13px] tracking-[0.3em] uppercase yv-muted mb-3">CHECKLIST</p>
                  <div className="space-y-2">
                    {checks.map(c => (
                      <div key={c.key} className="flex items-center justify-between">
                        <span className="flex items-center gap-2 font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-2)' }}>
                          <CheckDot ok={c.ok} />
                          {c.key.replace(/_/g, ' ')}
                        </span>
                        <span className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-4)' }}>{c.w}pt</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-3 flex justify-between font-mono-jb text-[13px]" style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,.08)' }}>
                    <span style={{ color: 'var(--yv-text-2)' }}>{score !== null ? checks.filter(c => c.ok).length + '/' + checks.length : '—'} {t('pasados', 'passed')}</span>
                    <span style={{ color: score !== null ? scoreColor(score) : 'var(--yv-text-4)' }}>{score !== null ? score + '/100' : '—'}</span>
                  </div>
                </div>

                {/* History */}
                {history.length > 0 && (
                  <div className="yv-card p-5">
                    <p className="font-mono-jb text-[13px] tracking-[0.3em] uppercase yv-muted mb-3">
                      {t('HISTORIAL DE CAMBIOS', 'CHANGE HISTORY')}
                    </p>
                    <div className="space-y-3 max-h-80 overflow-y-auto">
                      {history.map(h => (
                        <div key={h.id} className="p-3 rounded-lg" style={{ background: 'var(--yv-glass-chip)' }}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-mono-jb text-[13px] uppercase tracking-wider" style={{ color: 'var(--yv-brand)' }}>
                              {h.field}
                            </span>
                            <span className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-4)' }}>
                              {fmtDate(h.createdAt, lang)}
                            </span>
                          </div>
                          {h.field === 'title' && (
                            <>
                              <p className="font-mono-jb text-[13px] line-through truncate" style={{ color: 'var(--yv-text-4)' }}>{h.oldValue}</p>
                              <p className="text-[color:var(--yv-text-2)] font-mono-jb text-[13px] truncate">{h.newValue}</p>
                            </>
                          )}
                          {h.field === 'description' && (
                            <p className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-2)' }}>{t('Descripción actualizada', 'Description updated')}</p>
                          )}
                          {h.field === 'tags' && (
                            <p className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-2)' }}>{t('Tags actualizados', 'Tags updated')}</p>
                          )}
                          {h.scoreBefore != null && h.scoreAfter != null && (
                            <div className="mt-1 font-mono-jb text-[13px]">
                              <span style={{ color: 'var(--yv-text-4)' }}>{h.scoreBefore}</span>
                              <span className="mx-1" style={{ color: 'var(--yv-text-4)' }}>&rarr;</span>
                              <span style={{ color: scoreColor(h.scoreAfter) }}>{h.scoreAfter}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
