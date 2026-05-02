'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { getLangClient } from '@/lib/get-lang-client';
import DashboardShell from '@/components/DashboardShell';

type Lang = 'es' | 'en';

interface VideoItem {
  videoId: string;
  title: string;
  thumbnail: string;
  publishedAt: string;
  views: number;
  likes: number;
  score: number;
}

interface VideoDetail {
  videoId: string;
  title: string;
  description: string;
  tags: string[];
  thumbnail: string;
  publishedAt: string;
  categoryId: string;
  views: number;
  likes: number;
  comments: number;
}

interface HistoryEntry {
  id: string;
  field: string;
  oldValue: string;
  newValue: string;
  scoreBefore: number | null;
  scoreAfter: number | null;
  viewsBefore: number | null;
  createdAt: string;
}

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
  const [lang, setLang] = useState<Lang>('es');
  const t = (es: string, en: string) => lang === 'en' ? en : es;

  // State
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<VideoDetail | null>(null);
  const [loadingVideo, setLoadingVideo] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [checks, setChecks] = useState<{ key: string; ok: boolean; w: number }[]>([]);
  const [score, setScore] = useState(0);
  const [originalScore, setOriginalScore] = useState(0);
  const [error, setError] = useState('');

  // Edit state
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editTags, setEditTags] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ success: boolean; aiSuggestion?: { es: string; en: string } } | null>(null);

  // Original values for diff
  const originalRef = useRef<{ title: string; description: string; tags: string[] }>({ title: '', description: '', tags: [] });

  // Debounce score calculation
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => { setLang(getLangClient()); }, []);

  // Load videos list
  const loadVideos = useCallback(async () => {
    setLoadingList(true);
    setError('');
    try {
      const res = await fetch('/api/youtube/optimize');
      const data = await res.json();
      if (!res.ok) {
        if (data.error === 'pro_required') setError(t('Esta función requiere el plan Pro.', 'This feature requires the Pro plan.'));
        else if (data.error === 'youtube_not_connected') setError(t('Conecta tu canal de YouTube primero desde el Dashboard.', 'Connect your YouTube channel first from the Dashboard.'));
        else setError(data.error || 'Error');
        return;
      }
      setVideos(data.videos || []);
    } catch {
      setError(t('Error de conexión', 'Connection error'));
    } finally {
      setLoadingList(false);
    }
  }, [lang]);

  useEffect(() => {
    if (status === 'authenticated') loadVideos();
  }, [status, loadVideos]);

  // Select a video for editing
  async function selectVideo(videoId: string) {
    setLoadingVideo(true);
    setError('');
    setSaveResult(null);
    try {
      const res = await fetch(`/api/youtube/optimize?videoId=${videoId}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Error');
        return;
      }
      setSelectedVideo(data.video);
      setEditTitle(data.video.title);
      setEditDesc(data.video.description);
      setEditTags((data.video.tags || []).join(', '));
      setScore(data.score);
      setOriginalScore(data.score);
      setChecks(data.checks || []);
      setHistory(data.history || []);
      originalRef.current = {
        title: data.video.title,
        description: data.video.description,
        tags: data.video.tags || [],
      };
    } catch {
      setError(t('Error de conexión', 'Connection error'));
    } finally {
      setLoadingVideo(false);
    }
  }

  // Real-time score update (debounced)
  function updateScore(title: string, desc: string, tagsStr: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const tags = tagsStr.split(',').map(t => t.trim()).filter(Boolean);
        const res = await fetch('/api/youtube/optimize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, description: desc, tags }),
        });
        const data = await res.json();
        if (res.ok) {
          setScore(data.score);
          setChecks(data.checks || []);
        }
      } catch { /* silent */ }
    }, 400);
  }

  function onTitleChange(v: string) {
    setEditTitle(v);
    updateScore(v, editDesc, editTags);
  }
  function onDescChange(v: string) {
    setEditDesc(v);
    updateScore(editTitle, v, editTags);
  }
  function onTagsChange(v: string) {
    setEditTags(v);
    updateScore(editTitle, editDesc, v);
  }

  // Save to YouTube
  async function handleSave() {
    if (!selectedVideo) return;
    setSaving(true);
    setError('');
    setSaveResult(null);
    try {
      const tags = editTags.split(',').map(t => t.trim()).filter(Boolean);
      const res = await fetch('/api/youtube/optimize', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId: selectedVideo.videoId,
          title: editTitle,
          description: editDesc,
          tags,
          categoryId: selectedVideo.categoryId,
          original: originalRef.current,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Error saving to YouTube');
        return;
      }
      setSaveResult({ success: true, aiSuggestion: data.aiSuggestion });
      setScore(data.scoreAfter);
      setOriginalScore(data.scoreAfter);
      // Update original ref so subsequent saves diff correctly
      originalRef.current = { title: editTitle, description: editDesc, tags };
      // Refresh history
      const hRes = await fetch(`/api/youtube/optimize?videoId=${selectedVideo.videoId}`);
      const hData = await hRes.json();
      if (hRes.ok) setHistory(hData.history || []);
    } catch {
      setError(t('Error de conexión', 'Connection error'));
    } finally {
      setSaving(false);
    }
  }

  const hasChanges = selectedVideo && (
    editTitle !== originalRef.current.title ||
    editDesc !== originalRef.current.description ||
    editTags !== (originalRef.current.tags || []).join(', ')
  );

  const scoreDelta = score - originalScore;

  // ── Render ─────────────────────────────────────────────────────────────

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
          <h1 className="font-display font-bold text-3xl text-white mb-4">{t('Optimizar Vídeo', 'Optimize Video')}</h1>
          <p className="text-zinc-500 mb-6 font-mono-jb text-sm">{t('Inicia sesión para optimizar tus vídeos.', 'Sign in to optimize your videos.')}</p>
          <a href="/login" className="btn-offset inline-flex px-8 py-3 text-sm font-display">{t('Iniciar sesión', 'Sign in')}</a>
        </div>
      </div>
    );
  }

  return (
    <DashboardShell>
      <div className="max-w-[1400px] mx-auto px-6 py-12">

        {/* Page title */}
        <div className="mb-10">
          <p className="font-mono-jb text-[10px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--red)' }}>
            {t('OPTIMIZACIÓN', 'OPTIMIZATION')}
          </p>
          <h1 className="font-display font-bold text-4xl md:text-5xl text-white leading-tight">
            {t('Optimizar', 'Optimize')}{' '}
            <span style={{ color: 'var(--red)' }}>{t('y guardar.', '& save.')}</span>
          </h1>
          <p className="text-zinc-500 mt-3 text-sm font-mono-jb max-w-xl">
            {t(
              'Edita título, descripción y tags con score en tiempo real. Guarda directamente en YouTube con un click.',
              'Edit title, description and tags with real-time score. Save directly to YouTube with one click.'
            )}
          </p>
        </div>

        {error && (
          <div className="mb-6 px-4 py-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-sm font-mono-jb">
            {error}
          </div>
        )}

        {/* ── VIDEO SELECTOR ──────────────────────────────────────────── */}
        {!selectedVideo && (
          <>
            {loadingList ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              </div>
            ) : videos.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-zinc-400 font-mono-jb text-sm">
                  {t('No se encontraron vídeos. Conecta tu canal desde el Dashboard.', 'No videos found. Connect your channel from the Dashboard.')}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-zinc-400 font-mono-jb text-xs mb-4">{t('Selecciona un vídeo para optimizar:', 'Select a video to optimize:')}</p>
                {videos.map(v => (
                  <button
                    key={v.videoId}
                    onClick={() => selectVideo(v.videoId)}
                    className="w-full flex items-center gap-4 p-4 rounded-xl border border-white/10 hover:border-white/25 transition text-left"
                    style={{ background: 'rgba(255,255,255,0.02)' }}
                  >
                    {v.thumbnail && (
                      <img src={v.thumbnail} alt="" className="w-32 h-18 rounded-lg object-cover flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-display font-semibold text-sm truncate">{v.title}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-zinc-500 font-mono-jb text-[11px]">{fmtNum(v.views)} {t('vistas', 'views')}</span>
                        <span className="text-zinc-600 font-mono-jb text-[11px]">{fmtDate(v.publishedAt, lang)}</span>
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
              onClick={() => { setSelectedVideo(null); setSaveResult(null); }}
              className="flex items-center gap-2 text-zinc-500 hover:text-white font-mono-jb text-xs mb-6 transition"
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
                <div className="flex items-center gap-4 mt-2 text-zinc-500 font-mono-jb text-[11px]">
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
                <div className="rounded-xl border border-white/10 p-5" style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <div className="flex items-center justify-between mb-3">
                    <label className="font-mono-jb text-[11px] tracking-wider text-zinc-400 uppercase">
                      {t('Título', 'Title')}
                    </label>
                    <span className="font-mono-jb text-[11px]" style={{ color: editTitle.length >= 30 && editTitle.length <= 70 ? '#22c55e' : '#e84d5b' }}>
                      {editTitle.length}/70
                    </span>
                  </div>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={e => onTitleChange(e.target.value)}
                    maxLength={100}
                    className="w-full bg-transparent border border-white/10 rounded-lg px-4 py-3 text-white font-display text-lg focus:outline-none focus:border-white/30 transition"
                    placeholder={t('Título del vídeo...', 'Video title...')}
                  />
                  {/* Title checks inline */}
                  <div className="flex flex-wrap gap-3 mt-3">
                    {checks.filter(c => c.key.startsWith('title_')).map(c => (
                      <span key={c.key} className="flex items-center gap-1.5 font-mono-jb text-[10px] text-zinc-500">
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
                <div className="rounded-xl border border-white/10 p-5" style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <div className="flex items-center justify-between mb-3">
                    <label className="font-mono-jb text-[11px] tracking-wider text-zinc-400 uppercase">
                      {t('Descripción', 'Description')}
                    </label>
                    <span className="font-mono-jb text-[11px] text-zinc-600">
                      {editDesc.split(/\s+/).filter(Boolean).length} {t('palabras', 'words')}
                    </span>
                  </div>
                  <textarea
                    value={editDesc}
                    onChange={e => onDescChange(e.target.value)}
                    rows={10}
                    className="w-full bg-transparent border border-white/10 rounded-lg px-4 py-3 text-zinc-300 font-mono-jb text-sm focus:outline-none focus:border-white/30 transition resize-y"
                    placeholder={t('Descripción del vídeo...', 'Video description...')}
                  />
                  <div className="flex flex-wrap gap-3 mt-3">
                    {checks.filter(c => c.key.startsWith('desc_')).map(c => (
                      <span key={c.key} className="flex items-center gap-1.5 font-mono-jb text-[10px] text-zinc-500">
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
                <div className="rounded-xl border border-white/10 p-5" style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <div className="flex items-center justify-between mb-3">
                    <label className="font-mono-jb text-[11px] tracking-wider text-zinc-400 uppercase">
                      Tags
                    </label>
                    <span className="font-mono-jb text-[11px] text-zinc-600">
                      {editTags.split(',').filter(t => t.trim()).length} tags
                    </span>
                  </div>
                  <textarea
                    value={editTags}
                    onChange={e => onTagsChange(e.target.value)}
                    rows={3}
                    className="w-full bg-transparent border border-white/10 rounded-lg px-4 py-3 text-zinc-300 font-mono-jb text-sm focus:outline-none focus:border-white/30 transition resize-y"
                    placeholder={t('tag1, tag2, tag3...', 'tag1, tag2, tag3...')}
                  />
                  <div className="flex flex-wrap gap-3 mt-3">
                    {checks.filter(c => c.key.startsWith('tags_')).map(c => (
                      <span key={c.key} className="flex items-center gap-1.5 font-mono-jb text-[10px] text-zinc-500">
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
                    disabled={saving || !hasChanges}
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
                    <span className="text-zinc-600 font-mono-jb text-xs">{t('Sin cambios', 'No changes')}</span>
                  )}
                </div>

                {/* Save result */}
                {saveResult?.success && (
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
                        <p className="text-zinc-400 font-mono-jb text-[10px] tracking-wider uppercase mb-1">{t('Siguiente paso', 'Next step')}</p>
                        <p className="text-zinc-300 font-mono-jb text-sm">
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
                <div className="rounded-xl border border-white/10 p-6 text-center" style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <p className="font-mono-jb text-[10px] tracking-[0.3em] uppercase text-zinc-500 mb-4">SEO SCORE</p>
                  <div className="flex justify-center">
                    <ScoreRing score={score} size={120} />
                  </div>
                  {scoreDelta !== 0 && (
                    <div className="mt-3 font-mono-jb text-sm font-bold" style={{ color: scoreDelta > 0 ? '#22c55e' : '#e84d5b' }}>
                      {scoreDelta > 0 ? '+' : ''}{scoreDelta} {t('puntos', 'points')}
                    </div>
                  )}
                </div>

                {/* Checklist summary */}
                <div className="rounded-xl border border-white/10 p-5" style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <p className="font-mono-jb text-[10px] tracking-[0.3em] uppercase text-zinc-500 mb-3">CHECKLIST</p>
                  <div className="space-y-2">
                    {checks.map(c => (
                      <div key={c.key} className="flex items-center justify-between">
                        <span className="flex items-center gap-2 font-mono-jb text-xs text-zinc-400">
                          <CheckDot ok={c.ok} />
                          {c.key.replace(/_/g, ' ')}
                        </span>
                        <span className="font-mono-jb text-[10px] text-zinc-600">{c.w}pt</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 pt-3 border-t border-white/10 flex justify-between font-mono-jb text-xs">
                    <span className="text-zinc-400">{checks.filter(c => c.ok).length}/{checks.length} {t('pasados', 'passed')}</span>
                    <span style={{ color: scoreColor(score) }}>{score}/100</span>
                  </div>
                </div>

                {/* History */}
                {history.length > 0 && (
                  <div className="rounded-xl border border-white/10 p-5" style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <p className="font-mono-jb text-[10px] tracking-[0.3em] uppercase text-zinc-500 mb-3">
                      {t('HISTORIAL DE CAMBIOS', 'CHANGE HISTORY')}
                    </p>
                    <div className="space-y-3 max-h-80 overflow-y-auto">
                      {history.map(h => (
                        <div key={h.id} className="p-3 rounded-lg border border-white/5" style={{ background: 'rgba(255,255,255,0.015)' }}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-mono-jb text-[10px] uppercase tracking-wider" style={{ color: 'var(--red)' }}>
                              {h.field}
                            </span>
                            <span className="font-mono-jb text-[10px] text-zinc-600">
                              {fmtDate(h.createdAt, lang)}
                            </span>
                          </div>
                          {h.field === 'title' && (
                            <>
                              <p className="text-zinc-600 font-mono-jb text-[11px] line-through truncate">{h.oldValue}</p>
                              <p className="text-zinc-300 font-mono-jb text-[11px] truncate">{h.newValue}</p>
                            </>
                          )}
                          {h.field === 'description' && (
                            <p className="text-zinc-400 font-mono-jb text-[11px]">{t('Descripción actualizada', 'Description updated')}</p>
                          )}
                          {h.field === 'tags' && (
                            <p className="text-zinc-400 font-mono-jb text-[11px]">{t('Tags actualizados', 'Tags updated')}</p>
                          )}
                          {h.scoreBefore != null && h.scoreAfter != null && (
                            <div className="mt-1 font-mono-jb text-[10px]">
                              <span className="text-zinc-600">{h.scoreBefore}</span>
                              <span className="text-zinc-600 mx-1">&rarr;</span>
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
