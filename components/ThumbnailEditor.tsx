'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type Konva from 'konva';
import { THUMB_W, THUMB_H, type PhotoItem, type TextItem } from '@/lib/thumbnail-types';

// Konva requires DOM — load only on the client
const ThumbnailCanvasInner = dynamic(
  () => import('./ThumbnailCanvasInner'),
  {
    ssr: false,
    loading: () => (
      <div
        style={{ width: '100%', aspectRatio: `${THUMB_W}/${THUMB_H}`, background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <span style={{ color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace', fontSize: 14 }}>
          Loading editor…
        </span>
      </div>
    ),
  },
);

const FONTS = [
  { label: 'Impact',      value: 'Impact' },
  { label: 'Arial Black', value: 'Arial Black' },
  { label: 'Bebas Neue',  value: 'Bebas Neue' },
  { label: 'Anton',       value: 'Anton' },
  { label: 'Oswald',      value: 'Oswald' },
  { label: 'Arial',       value: 'Arial' },
];

const STYLES = [
  { label: 'Viral',         value: 'viral' },
  { label: 'Cinematic',     value: 'cinematic' },
  { label: 'Minimal',       value: 'minimal' },
  { label: 'Bold & Bright', value: 'bold' },
];

let _textCounter = 0;

interface Props {
  lang: string;
  isPro: boolean;
  onSaved?: (url: string) => void;
}

export default function ThumbnailEditor({ lang, isPro, onSaved }: Props) {
  const tr = useCallback((es: string, en: string) => lang === 'en' ? en : es, [lang]);

  // ─── Container sizing for responsive canvas ───────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);
  useEffect(() => {
    const measure = () => {
      if (containerRef.current) setContainerWidth(containerRef.current.clientWidth);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // ─── Konva stage ref (for export) ────────────────────────────────────────
  const stageRef = useRef<Konva.Stage | null>(null);

  // ─── Google Fonts for canvas ─────────────────────────────────────────────
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (document.querySelector('link[data-thumb-fonts]')) return;
    const link = document.createElement('link');
    link.rel  = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Anton&family=Oswald:wght@700&display=swap';
    link.setAttribute('data-thumb-fonts', '1');
    document.head.appendChild(link);
  }, []);

  // ─── Background ──────────────────────────────────────────────────────────
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [bgTopic,       setBgTopic]       = useState('');
  const [bgStyle,       setBgStyle]       = useState('viral');
  const [bgLoading,     setBgLoading]     = useState(false);
  const [bgError,       setBgError]       = useState('');

  const generateBackground = async () => {
    if (!bgTopic.trim()) return;
    setBgLoading(true); setBgError('');
    try {
      const body = new FormData();
      body.append('source', 'ai');
      body.append('tema',   bgTopic.trim());
      body.append('estilo', bgStyle);
      body.append('lang',   lang);
      const res  = await fetch('/api/thumbnail-background', { method: 'POST', body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      setBackgroundUrl(data.backgroundUrl);
    } catch (err) {
      setBgError(err instanceof Error ? err.message : 'Error');
    } finally {
      setBgLoading(false);
    }
  };

  const uploadBackground = async (file: File) => {
    setBgLoading(true); setBgError('');
    try {
      const body = new FormData();
      body.append('source',          'upload');
      body.append('backgroundFile',  file);
      body.append('lang',            lang);
      const res  = await fetch('/api/thumbnail-background', { method: 'POST', body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      setBackgroundUrl(data.backgroundUrl);
    } catch (err) {
      setBgError(err instanceof Error ? err.message : 'Error');
    } finally {
      setBgLoading(false);
    }
  };

  // ─── Photo ───────────────────────────────────────────────────────────────
  const [photo,           setPhoto]           = useState<PhotoItem | null>(null);
  const [removingBg,      setRemovingBg]      = useState(false);
  const [removeBgEnabled, setRemoveBgEnabled] = useState(true);
  const [selectedId,      setSelectedId]      = useState<string | null>(null);

  const handlePhotoUpload = async (file: File) => {
    setRemovingBg(true);
    let src = '';
    try {
      if (removeBgEnabled) {
        const { removeBackground } = await import('@imgly/background-removal');
        const blob = await removeBackground(file, { model: 'isnet_fp16', output: { format: 'image/png' } });
        src = URL.createObjectURL(blob);
      } else {
        src = URL.createObjectURL(file);
      }
    } catch {
      src = URL.createObjectURL(file); // fallback: use original
    } finally {
      setRemovingBg(false);
    }

    // Measure natural dimensions to set default size
    const img = new window.Image();
    img.src = src;
    await new Promise<void>(resolve => { img.onload = () => resolve(); img.onerror = () => resolve(); });

    const natW   = img.naturalWidth  || 400;
    const natH   = img.naturalHeight || 600;
    const defH   = Math.round(THUMB_H * 0.85);
    const defW   = Math.round(defH * (natW / natH));

    setPhoto({ src, x: 0, y: THUMB_H - defH, width: defW, height: defH, opacity: 1 });
    setSelectedId('photo');
  };

  // ─── Texts ───────────────────────────────────────────────────────────────
  const [texts, setTexts] = useState<TextItem[]>([]);

  const addText = () => {
    _textCounter++;
    const id: string = `text-${_textCounter}`;
    setTexts(prev => [
      ...prev,
      {
        id,
        text:        tr('TEXTO AQUÍ', 'YOUR TEXT'),
        x:           Math.round(THUMB_W * 0.08),
        y:           Math.round(THUMB_H * 0.35),
        width:       Math.round(THUMB_W * 0.55),
        fontSize:    100,
        fontFamily:  'Impact',
        fill:        '#ffffff',
        stroke:      '#000000',
        strokeWidth: 6,
        fontStyle:   '',
        rotation:    0,
      },
    ]);
    setSelectedId(id);
  };

  const updateText = (id: string, updates: Partial<TextItem>) =>
    setTexts(prev => prev.map(t => (t.id === id ? { ...t, ...updates } : t)));

  const deleteText = (id: string) => {
    setTexts(prev => prev.filter(t => t.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const selectedText = texts.find(t => t.id === selectedId) ?? null;

  // ─── Save / Export ────────────────────────────────────────────────────────
  const [saving,    setSaving]    = useState(false);
  const [savedUrl,  setSavedUrl]  = useState<string | null>(null);
  const [saveError, setSaveError] = useState('');

  const getDataURL = (): string | null => {
    const stage = stageRef.current;
    if (!stage) return null;
    const scale = containerWidth / THUMB_W;
    return stage.toDataURL({ mimeType: 'image/png', pixelRatio: 1 / scale });
  };

  const handleDownload = () => {
    const url = getDataURL();
    if (!url) return;
    const a  = document.createElement('a');
    a.href   = url;
    a.download = 'thumbnail.png';
    a.click();
  };

  const handleSave = async () => {
    const url = getDataURL();
    if (!url) return;
    setSaving(true); setSaveError('');
    try {
      const res  = await fetch(url);
      const blob = await res.blob();
      const file = new File([blob], 'thumbnail.png', { type: 'image/png' });

      const body = new FormData();
      body.append('image', file);
      body.append('meta', JSON.stringify({ topic: bgTopic, hasPhoto: !!photo, textCount: texts.length }));

      const saveRes  = await fetch('/api/thumbnail-save', { method: 'POST', body });
      const saveData = await saveRes.json();
      if (!saveRes.ok) throw new Error(saveData.error || 'Error saving');

      setSavedUrl(saveData.imageUrl);
      onSaved?.(saveData.imageUrl);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Error saving');
    } finally {
      setSaving(false);
    }
  };

  // ─── Not Pro ─────────────────────────────────────────────────────────────
  if (!isPro) {
    return (
      <div className="yv-card p-8 text-center">
        <p className="text-lg font-bold mb-2">{tr('Editor de miniaturas Pro', 'Pro Thumbnail Editor')}</p>
        <p className="text-[14px] mb-4" style={{ color: 'var(--yv-text-3)' }}>
          {tr('Disponible en planes Pro y Business', 'Available on Pro and Business plans')}
        </p>
        <a href="/pricing" className="btn-offset px-6 py-2.5 text-[14px] font-bold">{tr('Ver planes', 'See plans')}</a>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">

      {/* ── Background toolbar ─────────────────────────────────────────────── */}
      <div className="yv-card p-4">
        <p className="font-mono-jb text-[11px] tracking-wider uppercase mb-3" style={{ color: 'var(--yv-text-3)' }}>
          {tr('Fondo', 'Background')}
        </p>
        <div className="flex gap-2 flex-wrap items-end">
          <input
            className="soft-field flex-1 min-w-[160px] text-sm"
            placeholder={tr('Tema del vídeo…', 'Video topic…')}
            value={bgTopic}
            onChange={e => setBgTopic(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && generateBackground()}
          />
          <select
            className="soft-field text-sm py-[9px]"
            value={bgStyle}
            onChange={e => setBgStyle(e.target.value)}
          >
            {STYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <button
            onClick={generateBackground}
            disabled={bgLoading || !bgTopic.trim()}
            className="btn-offset px-5 py-2.5 text-[13px] font-bold disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {bgLoading
              ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full spin-r inline-block" />
              : tr('✨ Generar con IA', '✨ Generate with AI')}
          </button>
          <label className="soft-chip px-4 py-2.5 text-[13px] cursor-pointer hover:text-white transition whitespace-nowrap">
            {tr('📁 Subir fondo', '📁 Upload BG')}
            <input
              type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadBackground(f); e.target.value = ''; }}
            />
          </label>
        </div>
        {bgError && <p className="text-[12px] mt-2" style={{ color: '#f5a623' }}>{bgError}</p>}
      </div>

      {/* ── Editor row: canvas + controls ──────────────────────────────────── */}
      <div className="flex gap-4 items-start flex-wrap lg:flex-nowrap">

        {/* Canvas */}
        <div
          ref={containerRef}
          className="w-full lg:flex-1 min-w-0 rounded-xl overflow-hidden cursor-crosshair"
          style={{ border: '1px solid var(--yv-border)', background: '#111' }}
        >
          <ThumbnailCanvasInner
            containerWidth={Math.max(containerWidth, 1)}
            backgroundUrl={backgroundUrl}
            photo={photo}
            texts={texts}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onUpdatePhoto={u => setPhoto(prev => prev ? { ...prev, ...u } : prev)}
            onUpdateText={updateText}
            stageRef={stageRef}
          />
        </div>

        {/* Controls panel */}
        <div className="w-full lg:w-60 shrink-0 flex flex-col gap-3">

          {/* ── Photo ── */}
          <div className="yv-card p-4">
            <p className="font-mono-jb text-[11px] tracking-wider uppercase mb-3" style={{ color: 'var(--yv-text-3)' }}>
              {tr('Tu foto', 'Your photo')}
            </p>

            {/* Remove BG toggle */}
            <button
              onClick={() => setRemoveBgEnabled(p => !p)}
              className={`soft-chip w-full py-1.5 text-[11px] mb-3 ${removeBgEnabled ? 'soft-chip-active' : ''}`}
            >
              {removeBgEnabled ? '✓ ' : ''}{tr('Eliminar fondo', 'Remove BG')}
            </button>

            <label className="block cursor-pointer">
              <div className="btn-offset w-full text-center py-2 text-[13px] font-bold">
                {removingBg
                  ? <span className="flex items-center justify-center gap-2">
                      <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full spin-r" />
                      {tr('Procesando…', 'Processing…')}
                    </span>
                  : photo
                    ? tr('Cambiar foto', 'Change photo')
                    : tr('+ Añadir foto', '+ Add photo')}
              </div>
              <input
                type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                disabled={removingBg}
                onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f); e.target.value = ''; }}
              />
            </label>

            {photo && (
              <>
                {/* Opacity */}
                <div className="mt-3">
                  <div className="flex justify-between mb-1">
                    <span className="text-[11px] font-mono-jb" style={{ color: 'var(--yv-text-3)' }}>{tr('Opacidad', 'Opacity')}</span>
                    <span className="text-[11px] font-mono-jb" style={{ color: 'var(--yv-text-2)' }}>{Math.round(photo.opacity * 100)}%</span>
                  </div>
                  <input
                    type="range" min={0} max={1} step={0.05} value={photo.opacity}
                    onChange={e => setPhoto(p => p ? { ...p, opacity: Number(e.target.value) } : p)}
                    className="w-full accent-[#7CFF00]"
                  />
                </div>
                <button
                  className="mt-2 text-[11px] w-full text-center hover:text-white transition"
                  style={{ color: 'var(--yv-text-4)' }}
                  onClick={() => { setPhoto(null); if (selectedId === 'photo') setSelectedId(null); }}
                >
                  {tr('Quitar foto', 'Remove photo')}
                </button>
              </>
            )}
          </div>

          {/* ── Text ── */}
          <div className="yv-card p-4">
            <p className="font-mono-jb text-[11px] tracking-wider uppercase mb-3" style={{ color: 'var(--yv-text-3)' }}>
              {tr('Texto', 'Text')}
            </p>

            {selectedText ? (
              <div className="flex flex-col gap-2.5">
                {/* Content */}
                <textarea
                  rows={2}
                  className="soft-field resize-none text-sm"
                  value={selectedText.text}
                  onChange={e => updateText(selectedText.id, { text: e.target.value })}
                />

                {/* Font */}
                <select
                  className="soft-field text-sm py-1.5"
                  value={selectedText.fontFamily}
                  onChange={e => updateText(selectedText.id, { fontFamily: e.target.value })}
                >
                  {FONTS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>

                {/* Size */}
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-[10px] font-mono-jb" style={{ color: 'var(--yv-text-3)' }}>{tr('Tamaño', 'Size')}</span>
                    <span className="text-[10px] font-mono-jb" style={{ color: 'var(--yv-text-2)' }}>{selectedText.fontSize} px</span>
                  </div>
                  <input
                    type="range" min={16} max={300} step={2} value={selectedText.fontSize}
                    onChange={e => updateText(selectedText.id, { fontSize: Number(e.target.value) })}
                    className="w-full accent-[#7CFF00]"
                  />
                </div>

                {/* Color + Stroke */}
                <div className="flex gap-2">
                  <div className="flex-1">
                    <p className="text-[10px] font-mono-jb mb-1" style={{ color: 'var(--yv-text-4)' }}>{tr('Color', 'Color')}</p>
                    <input
                      type="color" value={selectedText.fill}
                      onChange={e => updateText(selectedText.id, { fill: e.target.value })}
                      className="w-full h-8 rounded cursor-pointer"
                      style={{ border: '1px solid var(--yv-border)', background: 'none' }}
                    />
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] font-mono-jb mb-1" style={{ color: 'var(--yv-text-4)' }}>{tr('Borde', 'Stroke')}</p>
                    <input
                      type="color" value={selectedText.stroke || '#000000'}
                      onChange={e => updateText(selectedText.id, { stroke: e.target.value, strokeWidth: Math.max(selectedText.strokeWidth || 0, 1) })}
                      className="w-full h-8 rounded cursor-pointer"
                      style={{ border: '1px solid var(--yv-border)', background: 'none' }}
                    />
                  </div>
                  <div>
                    <p className="text-[10px] font-mono-jb mb-1" style={{ color: 'var(--yv-text-4)' }}>{tr('Grosor', 'Width')}</p>
                    <input
                      type="number" min={0} max={40} step={1} value={selectedText.strokeWidth}
                      onChange={e => updateText(selectedText.id, { strokeWidth: Number(e.target.value) })}
                      className="soft-field w-14 text-sm py-1 text-center"
                    />
                  </div>
                </div>

                {/* Bold / Italic / Delete */}
                <div className="flex gap-1.5 items-center">
                  {(['bold', 'italic'] as const).map(style => {
                    const active = (selectedText.fontStyle || '').includes(style);
                    return (
                      <button
                        key={style}
                        onClick={() => {
                          const cur  = selectedText.fontStyle || '';
                          const next = active
                            ? cur.replace(style, '').trim()
                            : (cur + ' ' + style).trim();
                          updateText(selectedText.id, { fontStyle: next });
                        }}
                        className={`soft-chip px-3 py-1 text-[12px] font-mono-jb ${active ? 'soft-chip-active' : ''}`}
                        style={style === 'italic' ? { fontStyle: 'italic' } : { fontWeight: 700 }}
                      >
                        {style === 'bold' ? 'B' : 'I'}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => deleteText(selectedText.id)}
                    className="soft-chip px-3 py-1 text-[11px] ml-auto hover:text-red-400 transition"
                  >
                    {tr('Borrar', 'Delete')}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-[12px] mb-2" style={{ color: 'var(--yv-text-4)' }}>
                {tr('Selecciona un texto o añade uno nuevo.', 'Select a text layer or add one.')}
              </p>
            )}

            <button onClick={addText} className="btn-offset w-full py-2 text-[13px] font-bold mt-2">
              {tr('+ Añadir texto', '+ Add text')}
            </button>
          </div>

          {/* ── Save / Download ── */}
          <div className="flex flex-col gap-2">
            {savedUrl && (
              <a
                href={savedUrl} target="_blank" rel="noopener noreferrer"
                className="text-[12px] text-center py-1.5 rounded" style={{ color: '#7CFF00', background: 'rgba(124,255,0,0.08)', display: 'block' }}
              >
                {tr('✓ Guardado — abrir imagen', '✓ Saved — open image')}
              </a>
            )}
            {saveError && <p className="text-[12px]" style={{ color: '#f5a623' }}>{saveError}</p>}
            <button
              onClick={handleSave}
              disabled={saving || !backgroundUrl}
              className="btn-offset w-full py-3 text-[14px] font-bold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving
                ? <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full spin-r" />
                    {tr('Guardando…', 'Saving…')}
                  </span>
                : tr('💾 Guardar miniatura', '💾 Save thumbnail')}
            </button>
            <button
              onClick={handleDownload}
              disabled={!backgroundUrl}
              className="soft-chip w-full py-2.5 text-[13px] text-center disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {tr('⬇ Descargar PNG', '⬇ Download PNG')}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
