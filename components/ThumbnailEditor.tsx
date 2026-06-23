'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type Konva from 'konva';
import { THUMB_W, THUMB_H, type PhotoItem, type TextItem } from '@/lib/thumbnail-types';

// ─── Image processing helpers ─────────────────────────────────────────────────

/** Composite image/blob onto a solid colour background (helps IS-Net detect edges). */
async function compositeOntoColor(source: Blob | File, color: string): Promise<Blob> {
  const MAX = 1800;
  const bmp = await createImageBitmap(source as Blob);
  const scale = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
  const W = Math.round(bmp.width * scale);
  const H = Math.round(bmp.height * scale);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(bmp, 0, 0, W, H);
  bmp.close?.();
  return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(), 'image/png'));
}

/** 3×3 unsharp mask — sharpens edges so IS-Net finds boundaries more accurately. */
async function edgeEnhanceForRemoval(source: Blob | File): Promise<Blob> {
  const MAX = 1800;
  const bmp = await createImageBitmap(source as Blob);
  const scale = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
  const W = Math.round(bmp.width * scale);
  const H = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, W, H);
  bmp.close?.();
  const id  = ctx.getImageData(0, 0, W, H);
  const src = id.data;
  const out = new Uint8ClampedArray(src.length);
  const CENTER = 2.4, SIDE = -0.175, STRIDE = W * 4;
  for (let y = 0; y < H; y++) {
    const yT = Math.max(0, y - 1) * STRIDE;
    const yM = y                  * STRIDE;
    const yB = Math.min(H - 1, y + 1) * STRIDE;
    for (let x = 0; x < W; x++) {
      const xL = Math.max(0, x - 1)     * 4;
      const xC = x                       * 4;
      const xR = Math.min(W - 1, x + 1) * 4;
      const i  = yM + xC;
      for (let ch = 0; ch < 3; ch++) {
        const nb = src[yT+xL+ch] + src[yT+xC+ch] + src[yT+xR+ch]
                 + src[yM+xL+ch]                   + src[yM+xR+ch]
                 + src[yB+xL+ch] + src[yB+xC+ch] + src[yB+xR+ch];
        out[i+ch] = Math.max(0, Math.min(255, Math.round(src[i+ch] * CENTER + nb * SIDE)));
      }
      out[i+3] = src[i+3];
    }
  }
  ctx.putImageData(new ImageData(out, W, H), 0, 0);
  return new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(), 'image/png'));
}

/**
 * After IS-Net removes the colour background, transfer its alpha mask onto the
 * ORIGINAL photo so the final result has the user's real colours (not the tinted version).
 */
async function applyAlphaMaskToOriginal(origFile: File, maskedBlob: Blob): Promise<Blob> {
  const [origBmp, maskedBmp] = await Promise.all([
    createImageBitmap(origFile as Blob),
    createImageBitmap(maskedBlob),
  ]);
  const W = maskedBmp.width, H = maskedBmp.height;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(origBmp, 0, 0, W, H);
  origBmp.close?.();
  const origData = ctx.getImageData(0, 0, W, H);
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(maskedBmp, 0, 0);
  maskedBmp.close?.();
  const maskData = ctx.getImageData(0, 0, W, H);
  const out = new Uint8ClampedArray(origData.data.length);
  for (let i = 0; i < out.length; i += 4) {
    out[i]   = origData.data[i];
    out[i+1] = origData.data[i+1];
    out[i+2] = origData.data[i+2];
    out[i+3] = maskData.data[i+3]; // alpha from IS-Net
  }
  ctx.putImageData(new ImageData(out, W, H), 0, 0);
  return new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(), 'image/png'));
}

/** Smooth jagged alpha edges produced by IS-Net at boundary pixels (alpha 8-247). */
async function smoothBgMaskEdges(blob: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(blob);
  const { width: W, height: H } = bmp;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  bmp.close?.();
  const id = ctx.getImageData(0, 0, W, H);
  const src = id.data;
  const out = new Uint8ClampedArray(src.length);
  out.set(src);
  const STRIDE = W * 4;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * STRIDE + x * 4;
      const a = src[i+3];
      if (a < 8 || a > 247) continue;
      const avg =
        src[(y-1)*STRIDE+(x-1)*4+3] + src[(y-1)*STRIDE+x*4+3] + src[(y-1)*STRIDE+(x+1)*4+3] +
        src[ y   *STRIDE+(x-1)*4+3] + a                         + src[ y   *STRIDE+(x+1)*4+3] +
        src[(y+1)*STRIDE+(x-1)*4+3] + src[(y+1)*STRIDE+x*4+3] + src[(y+1)*STRIDE+(x+1)*4+3];
      out[i+3] = Math.round(avg / 9);
    }
  }
  ctx.putImageData(new ImageData(out, W, H), 0, 0);
  return new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(), 'image/png'));
}

// ─── Crop UI ─────────────────────────────────────────────────────────────────

type CropHandle = 'move' | 'tl' | 'tr' | 'bl' | 'br';
interface CropRect { x: number; y: number; w: number; h: number; }

function CropUI({
  src,
  label,
  onConfirm,
  onCancel,
}: {
  src: string;
  label: string;
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [imgEl, setImgEl]   = useState<HTMLImageElement | null>(null);
  const [crop, setCrop]     = useState<CropRect>({ x: 0.05, y: 0.05, w: 0.9, h: 0.9 });
  const drag = useRef<{ handle: CropHandle; mx0: number; my0: number; crop0: CropRect } | null>(null);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // needed for canvas drawImage on cross-origin URLs
    img.src = src;
    img.onload = () => setImgEl(img);
    return () => { img.onload = null; };
  }, [src]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!drag.current || !containerRef.current) return;
      const r  = containerRef.current.getBoundingClientRect();
      const mx = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      const my = Math.max(0, Math.min(1, (e.clientY - r.top)  / r.height));
      const dx = mx - drag.current.mx0;
      const dy = my - drag.current.my0;
      const c  = drag.current.crop0;
      const M  = 0.05;
      let { x, y, w, h } = c;
      switch (drag.current.handle) {
        case 'move': x = Math.max(0, Math.min(1-w, c.x+dx)); y = Math.max(0, Math.min(1-h, c.y+dy)); break;
        case 'tl':   x = Math.min(c.x+c.w-M, c.x+dx); w = c.w-(x-c.x); y = Math.min(c.y+c.h-M, c.y+dy); h = c.h-(y-c.y); break;
        case 'tr':   y = Math.min(c.y+c.h-M, c.y+dy); h = c.h-(y-c.y); w = Math.max(M, c.w+dx); break;
        case 'bl':   x = Math.min(c.x+c.w-M, c.x+dx); w = c.w-(x-c.x); h = Math.max(M, c.h+dy); break;
        case 'br':   w = Math.max(M, c.w+dx); h = Math.max(M, c.h+dy); break;
      }
      x = Math.max(0, x); y = Math.max(0, y);
      w = Math.min(1-x, w); h = Math.min(1-y, h);
      setCrop({ x, y, w, h });
    };
    const onUp = () => { drag.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  const startDrag = (e: React.MouseEvent, handle: CropHandle) => {
    e.preventDefault(); e.stopPropagation();
    if (!containerRef.current) return;
    const r = containerRef.current.getBoundingClientRect();
    drag.current = { handle, mx0: (e.clientX-r.left)/r.width, my0: (e.clientY-r.top)/r.height, crop0: { ...crop } };
  };

  const confirm = () => {
    if (!imgEl) return;
    const sx = Math.round(crop.x * imgEl.naturalWidth);
    const sy = Math.round(crop.y * imgEl.naturalHeight);
    const sw = Math.max(1, Math.round(crop.w * imgEl.naturalWidth));
    const sh = Math.max(1, Math.round(crop.h * imgEl.naturalHeight));
    const cv = document.createElement('canvas');
    cv.width = sw; cv.height = sh;
    cv.getContext('2d')!.drawImage(imgEl, sx, sy, sw, sh, 0, 0, sw, sh);
    cv.toBlob(b => { if (b) onConfirm(b); }, 'image/png');
  };

  const { x, y, w, h } = crop;
  const HP = 10;

  return (
    <div style={{ width: '100%' }}>
      {label && (
        <p className="font-mono-jb text-[11px] tracking-wider uppercase mb-2" style={{ color: 'var(--yv-text-3)' }}>
          {label}
        </p>
      )}
      <div
        ref={containerRef}
        className="relative select-none"
        style={{ lineHeight: 0, borderRadius: 8, overflow: 'hidden', cursor: 'crosshair', background: '#000' }}
      >
        {imgEl ? (
          <>
            {/* Dimmed base image */}
            <img src={src} alt="" draggable={false} style={{ width: '100%', display: 'block', opacity: 0.3 }} />

            {/* Crop rect */}
            <div
              style={{ position:'absolute', left:`${x*100}%`, top:`${y*100}%`, width:`${w*100}%`, height:`${h*100}%`,
                cursor:'move', boxSizing:'border-box', outline:'2px solid #7CFF00' }}
              onMouseDown={e => startDrag(e, 'move')}
            >
              {/* Bright image clipped to crop area */}
              <div style={{ position:'absolute', inset:0, overflow:'hidden', pointerEvents:'none' }}>
                <img src={src} alt="" draggable={false} style={{
                  position:'absolute', display:'block',
                  left:`${-(x/w)*100}%`, top:`${-(y/h)*100}%`, width:`${(1/w)*100}%`,
                }} />
              </div>
              {/* Rule-of-thirds grid */}
              {[1/3,2/3].map((p,i) => (
                <div key={`v${i}`} style={{ position:'absolute', top:0, bottom:0, left:`${p*100}%`, width:1, background:'rgba(255,255,255,0.2)', pointerEvents:'none' }} />
              ))}
              {[1/3,2/3].map((p,i) => (
                <div key={`h${i}`} style={{ position:'absolute', left:0, right:0, top:`${p*100}%`, height:1, background:'rgba(255,255,255,0.2)', pointerEvents:'none' }} />
              ))}
              {/* Corner handles */}
              {(['tl','tr','bl','br'] as CropHandle[]).map(hnd => (
                <div key={hnd} onMouseDown={e => startDrag(e, hnd)} style={{
                  position:'absolute', width:HP, height:HP, background:'#7CFF00', borderRadius:2, zIndex:10,
                  top:    hnd.startsWith('t') ? -HP/2 : undefined,
                  bottom: hnd.startsWith('b') ? -HP/2 : undefined,
                  left:   hnd.endsWith('l')   ? -HP/2 : undefined,
                  right:  hnd.endsWith('r')   ? -HP/2 : undefined,
                  cursor: hnd==='tl'||hnd==='br' ? 'nwse-resize' : 'nesw-resize',
                }} />
              ))}
            </div>
            {/* Size label */}
            <div style={{
              position:'absolute', left:`${x*100}%`, top:`${(y+h)*100}%`, transform:'translateY(3px)',
              background:'rgba(0,0,0,0.75)', color:'#aaa', fontSize:10, padding:'1px 5px',
              borderRadius:3, fontFamily:'monospace', pointerEvents:'none',
            }}>
              {`${Math.round(crop.w*imgEl.naturalWidth)} × ${Math.round(crop.h*imgEl.naturalHeight)}`}
            </div>
          </>
        ) : (
          <div style={{ height:160, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <span style={{ color:'rgba(255,255,255,0.25)', fontSize:13 }}>Cargando…</span>
          </div>
        )}
      </div>
      <div className="flex gap-2 mt-3">
        <button onClick={onCancel} className="soft-chip flex-1 py-2 text-[13px]">Cancelar</button>
        <button onClick={confirm} disabled={!imgEl} className="btn-offset flex-1 py-2 text-[13px] font-bold disabled:opacity-40">
          Confirmar recorte
        </button>
      </div>
    </div>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ThumbnailCanvasInner = dynamic(
  () => import('./ThumbnailCanvasInner'),
  {
    ssr: false,
    loading: () => (
      <div style={{ width:'100%', aspectRatio:`${THUMB_W}/${THUMB_H}`, background:'#111', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <span style={{ color:'rgba(255,255,255,0.25)', fontFamily:'monospace', fontSize:14 }}>Loading editor…</span>
      </div>
    ),
  },
);

const FONTS = [
  { label:'Impact',      value:'Impact' },
  { label:'Arial Black', value:'Arial Black' },
  { label:'Bebas Neue',  value:'Bebas Neue' },
  { label:'Anton',       value:'Anton' },
  { label:'Oswald',      value:'Oswald' },
  { label:'Arial',       value:'Arial' },
];

const STYLES = [
  { label:'Viral',         value:'viral' },
  { label:'Cinematic',     value:'cinematic' },
  { label:'Minimal',       value:'minimal' },
  { label:'Bold & Bright', value:'bold' },
];

// Preset background colours for the removal step (high contrast against most subjects)
const REMOVAL_COLORS = [
  { label:'Verde', value:'#39ff14' },
  { label:'Azul',  value:'#0040ff' },
  { label:'Rojo',  value:'#ff0000' },
  { label:'Blanco',value:'#ffffff' },
  { label:'Negro', value:'#000000' },
];

let _textCounter = 0;

interface Props {
  lang: string;
  isPro: boolean;
  onSaved?: (url: string) => void;
}

// ─── Main editor ──────────────────────────────────────────────────────────────

export default function ThumbnailEditor({ lang, isPro, onSaved }: Props) {
  const tr = useCallback((es: string, en: string) => lang === 'en' ? en : es, [lang]);

  // Container sizing
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);
  useEffect(() => {
    const measure = () => { if (containerRef.current) setContainerWidth(containerRef.current.clientWidth); };
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const stageRef = useRef<Konva.Stage | null>(null);

  // Google Fonts for canvas text
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
      body.append('source', 'ai'); body.append('tema', bgTopic.trim());
      body.append('estilo', bgStyle); body.append('lang', lang);
      const res = await fetch('/api/thumbnail-background', { method: 'POST', body });
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
      body.append('source', 'upload'); body.append('backgroundFile', file); body.append('lang', lang);
      const res = await fetch('/api/thumbnail-background', { method: 'POST', body });
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
  const [photo,         setPhoto]         = useState<PhotoItem | null>(null);
  const [photoOrigFile, setPhotoOrigFile] = useState<File | null>(null);
  const [photoOrigSrc,  setPhotoOrigSrc]  = useState<string | null>(null);
  const [bgRemoved,     setBgRemoved]     = useState(false);
  const [removingBg,    setRemovingBg]    = useState(false);
  const [removeBgColor, setRemoveBgColor] = useState('#39ff14');
  const [selectedId,    setSelectedId]    = useState<string | null>(null);

  // Crop
  const [cropTarget, setCropTarget] = useState<{ src: string; type: 'photo' | 'bg' } | null>(null);

  const placePhoto = async (src: string, file?: File) => {
    const img = new window.Image();
    img.src = src;
    await new Promise<void>(resolve => { img.onload = () => resolve(); img.onerror = () => resolve(); });
    const natW = img.naturalWidth  || 400;
    const natH = img.naturalHeight || 600;
    const defH = Math.round(THUMB_H * 0.85);
    const defW = Math.round(defH * (natW / natH));
    setPhoto(prev =>
      prev ? { ...prev, src }
           : { src, x: 0, y: THUMB_H - defH, width: defW, height: defH, opacity: 1 }
    );
    if (file) { setPhotoOrigFile(file); setPhotoOrigSrc(src); setBgRemoved(false); }
    setSelectedId('photo');
  };

  const handlePhotoUpload = async (file: File) => {
    const src = URL.createObjectURL(file);
    await placePhoto(src, file);
  };

  const handleRemoveBg = async () => {
    if (!photoOrigFile) return;
    setRemovingBg(true);
    try {
      // 1. Composite onto chosen solid colour → IS-Net sees high contrast background
      const colorBacked = await compositeOntoColor(photoOrigFile, removeBgColor);
      // 2. Sharpen edges
      const enhanced    = await edgeEnhanceForRemoval(colorBacked);
      // 3. IS-Net removes the solid background
      const { removeBackground } = await import('@imgly/background-removal');
      const masked = await removeBackground(enhanced, { model: 'isnet_fp16', output: { format: 'image/png' } });
      // 4. Transfer alpha to ORIGINAL (preserves user's real colours)
      const withOrig = await applyAlphaMaskToOriginal(photoOrigFile, masked);
      // 5. Smooth jagged boundary
      const refined = await smoothBgMaskEdges(withOrig);
      setPhoto(p => p ? { ...p, src: URL.createObjectURL(refined) } : p);
      setBgRemoved(true);
    } catch {
      // silent: keep current photo
    } finally {
      setRemovingBg(false);
    }
  };

  const handleRestoreOriginal = () => {
    if (!photoOrigSrc) return;
    setPhoto(p => p ? { ...p, src: photoOrigSrc } : p);
    setBgRemoved(false);
  };

  // Crop confirm handler
  const handleCropConfirm = async (blob: Blob) => {
    if (!cropTarget) return;
    if (cropTarget.type === 'photo') {
      const src  = URL.createObjectURL(blob);
      const file = new File([blob], 'cropped.png', { type: 'image/png' });
      setPhotoOrigFile(file);
      setPhotoOrigSrc(src);
      setBgRemoved(false);
      await placePhoto(src);
      // placePhoto without 'file' arg → keeps position if photo already placed
    } else {
      // Re-host on Vercel Blob for CORS-safe canvas access
      setBgLoading(true);
      try {
        const file = new File([blob], 'bg-cropped.png', { type: 'image/png' });
        const body = new FormData();
        body.append('source', 'upload'); body.append('backgroundFile', file); body.append('lang', lang);
        const res  = await fetch('/api/thumbnail-background', { method: 'POST', body });
        const data = await res.json();
        if (res.ok) setBackgroundUrl(data.backgroundUrl);
      } catch {}
      finally { setBgLoading(false); }
    }
    setCropTarget(null);
  };

  // ─── Texts ───────────────────────────────────────────────────────────────
  const [texts, setTexts] = useState<TextItem[]>([]);

  const addText = () => {
    _textCounter++;
    const id = `text-${_textCounter}`;
    setTexts(prev => [...prev, {
      id, text: tr('TEXTO AQUÍ', 'YOUR TEXT'),
      x: Math.round(THUMB_W * 0.08), y: Math.round(THUMB_H * 0.35),
      width: Math.round(THUMB_W * 0.55),
      fontSize: 100, fontFamily: 'Impact',
      fill: '#ffffff', stroke: '#000000', strokeWidth: 6,
      fontStyle: '', rotation: 0,
    }]);
    setSelectedId(id);
  };

  const updateText = (id: string, updates: Partial<TextItem>) =>
    setTexts(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));

  const deleteText = (id: string) => {
    setTexts(prev => prev.filter(t => t.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const selectedText = texts.find(t => t.id === selectedId) ?? null;

  // ─── Save / Export ────────────────────────────────────────────────────────
  const [saving,   setSaving]   = useState(false);
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [saveErr,  setSaveErr]  = useState('');

  const getDataURL = () => {
    const stage = stageRef.current;
    if (!stage) return null;
    return stage.toDataURL({ mimeType: 'image/png', pixelRatio: 1 / (containerWidth / THUMB_W) });
  };

  const handleDownload = () => {
    const url = getDataURL(); if (!url) return;
    const a = document.createElement('a'); a.href = url; a.download = 'thumbnail.png'; a.click();
  };

  const handleSave = async () => {
    const url = getDataURL(); if (!url) return;
    setSaving(true); setSaveErr('');
    try {
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], 'thumbnail.png', { type: 'image/png' });
      const body = new FormData();
      body.append('image', file);
      body.append('meta', JSON.stringify({ topic: bgTopic, hasPhoto: !!photo, textCount: texts.length }));
      const res  = await fetch('/api/thumbnail-save', { method: 'POST', body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      setSavedUrl(data.imageUrl); onSaved?.(data.imageUrl);
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  };

  // ─── Gate ─────────────────────────────────────────────────────────────────
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

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">

      {/* ── Background toolbar ──────────────────────────────────────────────── */}
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
          <select className="soft-field text-sm py-[9px]" value={bgStyle} onChange={e => setBgStyle(e.target.value)}>
            {STYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <button
            onClick={generateBackground} disabled={bgLoading || !bgTopic.trim()}
            className="btn-offset px-5 py-2.5 text-[13px] font-bold disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {bgLoading
              ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full spin-r inline-block" />
              : tr('✨ Generar con IA', '✨ Generate with AI')}
          </button>
          <label className="soft-chip px-4 py-2.5 text-[13px] cursor-pointer hover:text-white transition whitespace-nowrap">
            {tr('📁 Subir fondo', '📁 Upload BG')}
            <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadBackground(f); e.target.value = ''; }} />
          </label>
          {backgroundUrl && (
            <button
              onClick={() => setCropTarget({ src: backgroundUrl, type: 'bg' })}
              className="soft-chip px-4 py-2.5 text-[13px] hover:text-white transition whitespace-nowrap"
            >
              {tr('✂ Recortar fondo', '✂ Crop BG')}
            </button>
          )}
        </div>
        {bgError && <p className="text-[12px] mt-2" style={{ color: '#f5a623' }}>{bgError}</p>}
        <p className="text-[11px] mt-2.5" style={{ color: 'var(--yv-text-4)' }}>
          {tr('YouTube recomienda 1920×1080 px (16:9). Mínimo: 1280×720. Menos de 2 MB.',
              'YouTube recommends 1920×1080 px (16:9). Minimum: 1280×720. Under 2 MB.')}
        </p>
      </div>

      {/* ── Editor row ──────────────────────────────────────────────────────── */}
      <div className="flex gap-4 items-start flex-wrap lg:flex-nowrap">

        {/* Canvas / Crop overlay */}
        <div
          ref={containerRef}
          className="w-full lg:flex-1 min-w-0 rounded-xl overflow-hidden"
          style={{ border: '1px solid var(--yv-border)', background: '#111' }}
        >
          {cropTarget ? (
            <div className="p-4">
              <CropUI
                src={cropTarget.src}
                label={cropTarget.type === 'photo'
                  ? tr('Recortar foto', 'Crop photo')
                  : tr('Recortar fondo', 'Crop background')}
                onConfirm={handleCropConfirm}
                onCancel={() => setCropTarget(null)}
              />
            </div>
          ) : (
            <div style={{ cursor: 'crosshair' }}>
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
          )}
        </div>

        {/* Controls panel */}
        <div className="w-full lg:w-60 shrink-0 flex flex-col gap-3">

          {/* ── Photo ── */}
          <div className="yv-card p-4">
            <p className="font-mono-jb text-[11px] tracking-wider uppercase mb-1" style={{ color: 'var(--yv-text-3)' }}>
              {tr('Tu foto', 'Your photo')}
            </p>
            <p className="text-[10px] mb-3 leading-snug" style={{ color: 'var(--yv-text-4)' }}>
              {tr('Alta resolución, fondo liso o de estudio da mejor resultado.',
                  'High res with a plain or studio background works best.')}
            </p>

            {/* Upload */}
            <label className="block cursor-pointer">
              <div className="btn-offset w-full text-center py-2 text-[13px] font-bold">
                {photo ? tr('Cambiar foto', 'Change photo') : tr('+ Añadir foto', '+ Add photo')}
              </div>
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                disabled={removingBg}
                onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f); e.target.value = ''; }} />
            </label>

            {photo && (
              <>
                {/* Crop */}
                {photoOrigSrc && (
                  <button
                    onClick={() => setCropTarget({ src: photoOrigSrc, type: 'photo' })}
                    disabled={removingBg}
                    className="soft-chip w-full py-1.5 text-[11px] mt-2 disabled:opacity-40"
                  >
                    {tr('✂ Recortar foto', '✂ Crop photo')}
                  </button>
                )}

                {/* Background removal colour picker */}
                <div className="mt-3">
                  <p className="text-[10px] font-mono-jb mb-1.5" style={{ color: 'var(--yv-text-4)' }}>
                    {tr('Color de fondo para detección', 'BG colour for detection')}
                  </p>
                  <div className="flex gap-1.5 flex-wrap">
                    {REMOVAL_COLORS.map(c => (
                      <button
                        key={c.value}
                        onClick={() => setRemoveBgColor(c.value)}
                        title={c.label}
                        style={{
                          width: 22, height: 22, borderRadius: 4,
                          background: c.value,
                          border: removeBgColor === c.value ? '2px solid #7CFF00' : '2px solid transparent',
                          outline: removeBgColor === c.value ? '1px solid #7CFF00' : 'none',
                          cursor: 'pointer',
                          flexShrink: 0,
                        }}
                      />
                    ))}
                    {/* Custom colour */}
                    <label title="Color personalizado" style={{ position: 'relative', cursor: 'pointer', flexShrink: 0 }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: 4,
                        background: REMOVAL_COLORS.some(c => c.value === removeBgColor) ? 'transparent' : removeBgColor,
                        border: !REMOVAL_COLORS.some(c => c.value === removeBgColor) ? '2px solid #7CFF00' : '2px solid rgba(255,255,255,0.15)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, color: 'var(--yv-text-3)',
                      }}>
                        {REMOVAL_COLORS.some(c => c.value === removeBgColor) ? '+' : ''}
                      </div>
                      <input type="color" value={removeBgColor} onChange={e => setRemoveBgColor(e.target.value)}
                        style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }} />
                    </label>
                  </div>
                  <p className="text-[9px] mt-1 leading-tight" style={{ color: 'var(--yv-text-4)' }}>
                    {tr('Elige un color que contraste con tu fondo real antes de eliminar.',
                        'Pick a colour that contrasts with your actual background before removing.')}
                  </p>
                </div>

                {/* Remove / restore BG */}
                <div className="mt-2.5">
                  {!bgRemoved ? (
                    <button onClick={handleRemoveBg} disabled={removingBg}
                      className="soft-chip w-full py-1.5 text-[11px] disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {removingBg
                        ? <span className="flex items-center justify-center gap-1.5">
                            <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full spin-r" />
                            {tr('Procesando…', 'Processing…')}
                          </span>
                        : tr('Eliminar fondo', 'Remove BG')}
                    </button>
                  ) : (
                    <button onClick={handleRestoreOriginal}
                      className="soft-chip w-full py-1.5 text-[11px] soft-chip-active"
                    >
                      {tr('Restaurar original', 'Restore original')}
                    </button>
                  )}
                </div>

                {/* Opacity */}
                <div className="mt-3">
                  <div className="flex justify-between mb-1">
                    <span className="text-[11px] font-mono-jb" style={{ color: 'var(--yv-text-3)' }}>{tr('Opacidad', 'Opacity')}</span>
                    <span className="text-[11px] font-mono-jb" style={{ color: 'var(--yv-text-2)' }}>{Math.round(photo.opacity * 100)}%</span>
                  </div>
                  <input type="range" min={0} max={1} step={0.05} value={photo.opacity}
                    onChange={e => setPhoto(p => p ? { ...p, opacity: Number(e.target.value) } : p)}
                    className="w-full accent-[#7CFF00]" />
                </div>

                <button
                  className="mt-2 text-[11px] w-full text-center hover:text-white transition"
                  style={{ color: 'var(--yv-text-4)' }}
                  onClick={() => {
                    setPhoto(null); setPhotoOrigFile(null); setPhotoOrigSrc(null); setBgRemoved(false);
                    if (selectedId === 'photo') setSelectedId(null);
                  }}
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
                <textarea rows={2} className="soft-field resize-none text-sm"
                  value={selectedText.text}
                  onChange={e => updateText(selectedText.id, { text: e.target.value })} />
                <select className="soft-field text-sm py-1.5"
                  value={selectedText.fontFamily}
                  onChange={e => updateText(selectedText.id, { fontFamily: e.target.value })}>
                  {FONTS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-[10px] font-mono-jb" style={{ color: 'var(--yv-text-3)' }}>{tr('Tamaño', 'Size')}</span>
                    <span className="text-[10px] font-mono-jb" style={{ color: 'var(--yv-text-2)' }}>{selectedText.fontSize} px</span>
                  </div>
                  <input type="range" min={16} max={300} step={2} value={selectedText.fontSize}
                    onChange={e => updateText(selectedText.id, { fontSize: Number(e.target.value) })}
                    className="w-full accent-[#7CFF00]" />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <p className="text-[10px] font-mono-jb mb-1" style={{ color: 'var(--yv-text-4)' }}>{tr('Color', 'Color')}</p>
                    <input type="color" value={selectedText.fill}
                      onChange={e => updateText(selectedText.id, { fill: e.target.value })}
                      className="w-full h-8 rounded cursor-pointer"
                      style={{ border: '1px solid var(--yv-border)', background: 'none' }} />
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] font-mono-jb mb-1" style={{ color: 'var(--yv-text-4)' }}>{tr('Borde', 'Stroke')}</p>
                    <input type="color" value={selectedText.stroke || '#000000'}
                      onChange={e => updateText(selectedText.id, { stroke: e.target.value, strokeWidth: Math.max(selectedText.strokeWidth || 0, 1) })}
                      className="w-full h-8 rounded cursor-pointer"
                      style={{ border: '1px solid var(--yv-border)', background: 'none' }} />
                  </div>
                  <div>
                    <p className="text-[10px] font-mono-jb mb-1" style={{ color: 'var(--yv-text-4)' }}>{tr('Grosor', 'Width')}</p>
                    <input type="number" min={0} max={40} step={1} value={selectedText.strokeWidth}
                      onChange={e => updateText(selectedText.id, { strokeWidth: Number(e.target.value) })}
                      className="soft-field w-14 text-sm py-1 text-center" />
                  </div>
                </div>
                <div className="flex gap-1.5 items-center">
                  {(['bold', 'italic'] as const).map(style => {
                    const active = (selectedText.fontStyle || '').includes(style);
                    return (
                      <button key={style}
                        onClick={() => {
                          const cur = selectedText.fontStyle || '';
                          updateText(selectedText.id, { fontStyle: active ? cur.replace(style, '').trim() : (cur + ' ' + style).trim() });
                        }}
                        className={`soft-chip px-3 py-1 text-[12px] font-mono-jb ${active ? 'soft-chip-active' : ''}`}
                        style={style === 'italic' ? { fontStyle: 'italic' } : { fontWeight: 700 }}
                      >
                        {style === 'bold' ? 'B' : 'I'}
                      </button>
                    );
                  })}
                  <button onClick={() => deleteText(selectedText.id)}
                    className="soft-chip px-3 py-1 text-[11px] ml-auto hover:text-red-400 transition">
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
              <a href={savedUrl} target="_blank" rel="noopener noreferrer"
                className="text-[12px] text-center py-1.5 rounded"
                style={{ color: '#7CFF00', background: 'rgba(124,255,0,0.08)', display: 'block' }}>
                {tr('✓ Guardado — abrir imagen', '✓ Saved — open image')}
              </a>
            )}
            {saveErr && <p className="text-[12px]" style={{ color: '#f5a623' }}>{saveErr}</p>}
            <button onClick={handleSave} disabled={saving || !backgroundUrl}
              className="btn-offset w-full py-3 text-[14px] font-bold disabled:opacity-40 disabled:cursor-not-allowed">
              {saving
                ? <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full spin-r" />
                    {tr('Guardando…', 'Saving…')}
                  </span>
                : tr('💾 Guardar miniatura', '💾 Save thumbnail')}
            </button>
            <button onClick={handleDownload} disabled={!backgroundUrl}
              className="soft-chip w-full py-2.5 text-[13px] text-center disabled:opacity-40 disabled:cursor-not-allowed">
              {tr('⬇ Descargar PNG', '⬇ Download PNG')}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
