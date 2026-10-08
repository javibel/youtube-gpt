'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useSession } from 'next-auth/react';
import { useThumbnailSave } from '@/lib/use-thumbnail-save';
import { useThumbnailPhoto } from '@/lib/use-thumbnail-photo';
import { useThumbnailBackground } from '@/lib/use-thumbnail-background';
import type Konva from 'konva';
import { THUMB_W, THUMB_H, type TextItem } from '@/lib/thumbnail-types';
import { SparkleIcon, UploadIcon, ScissorsIcon, CheckIcon, SaveIcon, DownloadIcon } from '@/components/icons';

// ─── Crop UI ─────────────────────────────────────────────────────────────────

type CropHandle = 'move' | 'tl' | 'tr' | 'bl' | 'br';
interface CropRect { x: number; y: number; w: number; h: number; }
interface DisplayBounds { x: number; y: number; w: number; h: number; }

/**
 * Renders as an overlay (position:absolute inset:0) over the canvas.
 * Uses object-fit:contain + clip-path so the image is always contained
 * within the canvas dimensions regardless of photo aspect ratio.
 */
function CropUI({
  src,
  label,
  cW,
  cH,
  onConfirm,
  onCancel,
}: {
  src: string;
  label: string;
  cW: number;   // container width px
  cH: number;   // container height px
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [imgEl, setImgEl]   = useState<HTMLImageElement | null>(null);
  const [crop, setCrop]     = useState<CropRect>({ x: 0.05, y: 0.05, w: 0.9, h: 0.9 });
  const boundsRef = useRef<DisplayBounds>({ x: 0, y: 0, w: cW, h: cH });
  const drag = useRef<{ handle: CropHandle; mx0: number; my0: number; crop0: CropRect } | null>(null);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = src;
    img.onload = () => {
      setImgEl(img);
      const imgAR = img.naturalWidth / img.naturalHeight;
      const cAR   = cW / cH;
      let bx: number, by: number, bw: number, bh: number;
      if (imgAR > cAR) {
        // Image wider → letterbox (bars top/bottom)
        bw = cW; bh = cW / imgAR; bx = 0; by = (cH - bh) / 2;
      } else {
        // Image taller → pillarbox (bars left/right)
        bh = cH; bw = cH * imgAR; by = 0; bx = (cW - bw) / 2;
      }
      boundsRef.current = { x: bx, y: by, w: bw, h: bh };
    };
    return () => { img.onload = null; };
  }, [src, cW, cH]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!drag.current || !outerRef.current) return;
      const r  = outerRef.current.getBoundingClientRect();
      const b  = boundsRef.current;
      // Normalise to image-space (0-1) relative to the displayed bounds
      const mx = Math.max(0, Math.min(1, (e.clientX - r.left  - b.x) / b.w));
      const my = Math.max(0, Math.min(1, (e.clientY - r.top   - b.y) / b.h));
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
    if (!outerRef.current) return;
    const r = outerRef.current.getBoundingClientRect();
    const b = boundsRef.current;
    drag.current = {
      handle,
      mx0:   Math.max(0, Math.min(1, (e.clientX - r.left - b.x) / b.w)),
      my0:   Math.max(0, Math.min(1, (e.clientY - r.top  - b.y) / b.h)),
      crop0: { ...crop },
    };
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

  // Convert crop rect (image-space 0-1) to container percentage coords
  const b = boundsRef.current;
  const L  = (b.x + crop.x           * b.w) / cW;
  const T  = (b.y + crop.y           * b.h) / cH;
  const R  = (b.x + (crop.x + crop.w)* b.w) / cW;
  const B  = (b.y + (crop.y + crop.h)* b.h) / cH;
  const HP = 10; // handle size px

  // clip-path using container percentages
  const clip = `inset(${T*100}% ${(1-R)*100}% ${(1-B)*100}% ${L*100}%)`;

  return (
    <div ref={outerRef} style={{ position:'absolute', inset:0, background:'#000', userSelect:'none', cursor:'crosshair' }}>
      {/* Label */}
      {label && (
        <div style={{
          position:'absolute', top:8, left:8, zIndex:30,
          background:'rgba(0,0,0,0.7)', color:'rgba(255,255,255,0.7)',
          fontSize:10, fontFamily:'monospace', padding:'2px 6px', borderRadius:4,
        }}>
          {label}
        </div>
      )}

      {/* Dim image (full container, object-fit:contain) */}
      <img src={src} alt="" draggable={false} style={{
        position:'absolute', inset:0, width:'100%', height:'100%',
        objectFit:'contain', opacity:0.3, display:'block',
      }} />

      {imgEl && (
        <>
          {/* Bright image clipped to crop area */}
          <img src={src} alt="" draggable={false} style={{
            position:'absolute', inset:0, width:'100%', height:'100%',
            objectFit:'contain', clipPath: clip, pointerEvents:'none',
          }} />

          {/* Crop rect (border + handles + grid) */}
          <div
            style={{
              position:'absolute',
              left:   `${L*100}%`, top:    `${T*100}%`,
              width:  `${(R-L)*100}%`, height: `${(B-T)*100}%`,
              outline: '2px solid #7CFF00', cursor:'move', boxSizing:'border-box',
            }}
            onMouseDown={e => startDrag(e, 'move')}
          >
            {/* Rule-of-thirds */}
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

          {/* Size readout */}
          <div style={{
            position:'absolute', left:`${L*100}%`, top:`${B*100}%`, transform:'translateY(3px)',
            background:'rgba(0,0,0,0.75)', color:'#999', fontSize:10,
            padding:'1px 5px', borderRadius:3, fontFamily:'monospace', pointerEvents:'none',
          }}>
            {`${Math.round(crop.w*imgEl.naturalWidth)} × ${Math.round(crop.h*imgEl.naturalHeight)}`}
          </div>

          {/* Confirm / Cancel */}
          <div style={{
            position:'absolute', bottom:10, left:'50%', transform:'translateX(-50%)',
            display:'flex', gap:8, zIndex:30,
          }}>
            <button onClick={onCancel}
              className="soft-chip px-5 py-2 text-[13px]"
              style={{ background:'rgba(0,0,0,0.85)' }}>
              Cancelar
            </button>
            <button onClick={confirm}
              className="btn-offset px-5 py-2 text-[13px] font-bold">
              Confirmar recorte
            </button>
          </div>
        </>
      )}

      {!imgEl && (
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <span style={{ color:'rgba(255,255,255,0.25)', fontSize:13 }}>Cargando…</span>
        </div>
      )}
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

let _textCounter = 0;

interface Props {
  lang: string;
  isPro: boolean;
  onSaved?: (url: string) => void;
}

// ─── Main editor ──────────────────────────────────────────────────────────────

export default function ThumbnailEditor({ lang, isPro, onSaved }: Props) {
  const { data: session, status: sessionStatus } = useSession();
  const tr = useCallback((es: string, en: string) => lang === 'en' ? en : es, [lang]);

  // Container sizing
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);
  const containerHeight = Math.round(containerWidth * THUMB_H / THUMB_W);
  useEffect(() => {
    const measure = () => { if (containerRef.current) setContainerWidth(containerRef.current.clientWidth); };
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const stageRef = useRef<Konva.Stage | null>(null);

  // Google Fonts
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (document.querySelector('link[data-thumb-fonts]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Anton&family=Oswald:wght@700&display=swap';
    link.setAttribute('data-thumb-fonts', '1');
    document.head.appendChild(link);
  }, []);

  // ─── Background ──────────────────────────────────────────────────────────
  const background = useThumbnailBackground(session?.user?.id,session?.user?.email,sessionStatus,lang,isPro);
  const {backgroundUrl,topic:bgTopic,style:bgStyle,busy:bgLoading} = background;
  const setBgTopic = background.setTopic,setBgStyle = background.setStyle;
  const generateBackground = background.pending ? background.retry : background.generate;
  const uploadBackground = background.upload;
  const bgError = background.error ? ({
    input: tr('Tema entre 3 y 500 caracteres; archivo PNG, JPEG o WebP de hasta 15 MB.','Topic between 3 and 500 characters; PNG, JPEG or WebP file up to 15 MB.'),
    unconfirmed: tr('Fondo sin confirmar. Se conserva el anterior; repetir puede generar otro consumo o subida.','Background unconfirmed. The previous one is retained; repeating may consume or upload again.'),
    timeout: tr('Respuesta demasiado lenta. El servidor podría haber completado el fondo; repetir puede consumir de nuevo.','Response took too long. The server may have completed the background; repeating may consume again.'),
    pending: tr('Generación pendiente de confirmar. Este intento no ejecutará otro modelo.','Generation is awaiting confirmation. This attempt will not run another model.'),
    limit: tr('Límite del plan. El fondo anterior se conserva.','Plan limit. The previous background is retained.'),
  })[background.error] : '';

  // ─── Photo ───────────────────────────────────────────────────────────────
  const photoState = useThumbnailPhoto(session?.user?.id,session?.user?.email,sessionStatus,lang,isPro);
  const {photo,originalSrc:photoOrigSrc,removed:bgRemoved,busy:removingBg} = photoState;
  const bgStatus = removingBg ? tr('Procesando…','Processing…') : '';
  const photoError = photoState.error ? ({
    invalid: tr('Usa PNG, JPEG o WebP, sin superar 10 MB.','Use PNG, JPEG or WebP, up to 10 MB.'),
    decode: tr('No se pudo leer la foto. La anterior se conserva; prueba otro archivo.','Could not read the photo. The previous one is retained; try another file.'),
    unconfirmed: tr('El resultado de eliminar el fondo no está confirmado. Reintenta para consultar este mismo intento. Descartarlo e iniciar otro podría consumir de nuevo; la foto original se conserva.','Background removal is unconfirmed. Retry to check this same attempt. Discarding it and starting another may consume again; the original photo is retained.'),
  })[photoState.error] : '';
  const [selectedId,setSelectedId] = useState<string | null>(null);
  const [cropTarget,setCropTarget] = useState<{src:string;type:'photo'|'bg'} | null>(null);
  const cropCurrent = useRef(cropTarget);cropCurrent.current = cropTarget;
  const cropFlight = useRef<object | null>(null);
  const handlePhotoUpload = async (file: File) => {if(await photoState.upload(file) && photoState.current())setSelectedId('photo');};
  const handleRemoveBg = photoState.removeBackground;
  const handleRestoreOriginal = photoState.restore;
  const handleCropConfirm = async (blob: Blob) => {
    const target = cropTarget;
    if(!target || cropCurrent.current !== target || !photoState.current() || cropFlight.current === target)return;
    cropFlight.current = target;let confirmed = false;
    try {
      if(target.type === 'photo') {
        confirmed = await photoState.crop(target.src,blob,() => cropCurrent.current === target);
        if(confirmed && photoState.current())setSelectedId('photo');
      } else {
        confirmed = await background.crop(target.src,blob,() => cropCurrent.current === target);
      }
    } finally {
      if(cropFlight.current === target)cropFlight.current = null;
      if(confirmed && photoState.current() && cropCurrent.current === target){cropCurrent.current = null;setCropTarget(null);}
    }
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
  const getDataURL = () => {
    const stage = stageRef.current;
    if (!stage) return null;
    return stage.toDataURL({ mimeType: 'image/png', pixelRatio: 1 / (containerWidth / THUMB_W) });
  };
  const save = useThumbnailSave(session?.user?.id,session?.user?.email,sessionStatus,lang,isPro,
    JSON.stringify([backgroundUrl,bgTopic,photo,texts]), () => {
      const dataUrl = getDataURL();
      return dataUrl ? {dataUrl,meta:{topic:bgTopic,hasPhoto:!!photo,textCount:texts.length}} : null;
    },onSaved);
  const {busy:saving,savedUrl} = save;
  const saveErr = save.error ? ({
    unconfirmed: tr('Guardado sin confirmar. Reintenta la misma captura o consulta tu historial.', 'Save unconfirmed. Retry the same snapshot or check your history.'),
    timeout: tr('La respuesta tardó demasiado. La captura podría haberse guardado; reintenta para comprobarla.', 'The response took too long. The snapshot may have been saved; retry to check it.'),
    conflict: tr('La captura no coincide con el guardado. Consulta tu historial antes de guardar otra.', 'The snapshot conflicts with its saved image. Check your history before saving another.'),
    limit: tr('Límite del plan alcanzado. Puedes reintentar para recuperar una captura ya guardada.', 'Plan limit reached. You can retry to recover an already saved snapshot.'),
    capture: tr('No se pudo capturar el PNG. Comprueba la imagen y el tema (máx. 500 caracteres).', 'Could not capture the PNG. Check the image and topic (max. 500 characters).'),
  })[save.error] : '';

  const handleDownload = () => {
    if (!save.current()) return;
    const url = getDataURL(); if (!url) return;
    const a = document.createElement('a'); a.href = url; a.download = 'thumbnail.png'; a.click();
  };

  const handleSave = save.pending ? save.retrySave : save.save;

  // ─── Gate ─────────────────────────────────────────────────────────────────
  if(!photoState.current())return <p>{tr('Inicia sesión para editar miniaturas.','Sign in to edit thumbnails.')}</p>;
  if (!isPro) {
    return (
      <div className="yv-card p-8 text-center">
        <p className="text-lg font-bold mb-2">{tr('Editor de miniaturas Pro', 'Pro Thumbnail Editor')}</p>
        <p className="text-[14px] mb-4" style={{ color: 'var(--yv-text-3)' }}>
          {tr('Disponible en planes Pro y Business', 'Available on Pro and Business plans')}
        </p>
        {save.pending && <div role="alert">
          <p>{saveErr || tr('Hay una captura pendiente de confirmar.', 'A snapshot is awaiting confirmation.')}</p>
          <button onClick={save.retrySave} disabled={saving}>{tr('Reintentar guardado', 'Retry saving')}</button>
          <a href="/dashboard">{tr('Consultar historial', 'Check history')}</a>
        </div>}
        {background.pending && <div role="alert">
          <p>{tr('El fondo anterior está pendiente de confirmar. Reintenta la misma captura.','The previous background is awaiting confirmation. Retry the same snapshot.')}</p>
          <button onClick={background.retry} disabled={bgLoading}>{tr('Volver a intentar fondo','Try background again')}</button>
          <button onClick={background.discard}>{tr('Descartar intento de fondo','Discard background attempt')}</button>
        </div>}
        {photoState.pendingRemoval && <div role="alert">
          <p>{photoError || tr('La eliminación anterior está pendiente de confirmar. Consulta el mismo intento.','The previous removal is awaiting confirmation. Check the same attempt.')}</p>
          <button onClick={photoState.retryRemoval} disabled={removingBg}>{tr('Volver a intentar eliminación','Try removal again')}</button>
          <button onClick={handleRestoreOriginal}>{tr('Descartar intento de eliminación','Discard removal attempt')}</button>
        </div>}
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
            onClick={generateBackground} disabled={bgLoading || (!background.pending && !bgTopic.trim())}
            className="btn-offset px-5 py-2.5 text-[13px] font-bold disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {bgLoading
              ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full spin-r inline-block" />
              : <span className="inline-flex items-center gap-1.5"><SparkleIcon size={13} /> {background.pending ? tr('Volver a intentar fondo','Try background again') : tr('Generar con IA', 'Generate with AI')}</span>}
          </button>
          <label className="soft-chip px-4 py-2.5 text-[13px] cursor-pointer hover:text-white transition whitespace-nowrap inline-flex items-center gap-1.5">
            <UploadIcon size={13} /> {tr('Subir fondo', 'Upload BG')}
            <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
              disabled={bgLoading || background.pending}
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadBackground(f); e.target.value = ''; }} />
          </label>
          {backgroundUrl && (
            <button
              onClick={() => setCropTarget({ src: backgroundUrl, type: 'bg' })}
              className="soft-chip px-4 py-2.5 text-[13px] hover:text-white transition whitespace-nowrap inline-flex items-center gap-1.5"
            >
              <ScissorsIcon size={13} /> {tr('Recortar fondo', 'Crop BG')}
            </button>
          )}
        </div>
        {bgError && <p role="alert" className="text-[12px] mt-2" style={{ color: '#f5a623' }}>{bgError}</p>}
        {background.pending && <div className="text-[12px] mt-2" role="status">
          <p>{background.pendingKind!=='ai' ? tr('El reintento conserva la misma captura y recupera la subida si quedó confirmada. Puede volver a subir los mismos bytes si no hay recibo; descartarla no cancela el servidor.','Retry retains the same snapshot and recovers a confirmed upload. It may upload the same bytes again without a receipt; discarding does not cancel the server.') : tr('Se conserva el intento original. Si sigue pendiente, no se generará otro automáticamente. Descartarlo permite una solicitud nueva y podría consumir de nuevo; no cancela el servidor.','The original attempt is retained. If it remains pending, another image is not generated automatically. Discarding allows a new request and may consume again; it does not cancel the server.')}</p>
          {background.pendingStale && <p>{tr('Los cambios del tema o estilo no se incluyen en este intento.','Topic or style edits are not included in this attempt.')}</p>}
          <button onClick={() => { background.discard();if(cropTarget?.type === 'bg'){cropCurrent.current = null;setCropTarget(null);} }} className="soft-chip px-3 py-1.5 mt-1">{tr('Descartar intento de fondo','Discard background attempt')}</button>
        </div>}
        {background.resultStale && <p className="text-[12px] mt-2">{tr('El fondo mostrado corresponde al tema o estilo anterior.','The displayed background belongs to the earlier topic or style.')}</p>}
        <p className="text-[11px] mt-2.5" style={{ color: 'var(--yv-text-4)' }}>
          {tr('YouTube recomienda 1920×1080 px (16:9). Mínimo: 1280×720. Menos de 2 MB.',
              'YouTube recommends 1920×1080 px (16:9). Minimum: 1280×720. Under 2 MB.')}
        </p>
      </div>

      {/* ── Editor row ──────────────────────────────────────────────────────── */}
      <div className="flex gap-4 items-start flex-wrap lg:flex-nowrap">

        {/* Canvas + crop overlay */}
        <div
          ref={containerRef}
          className="w-full lg:flex-1 min-w-0 rounded-xl overflow-hidden"
          style={{
            border: '1px solid var(--yv-border)',
            background: '#111',
            position: 'relative', // required for CropUI overlay
          }}
        >
          {/* Canvas always mounted to keep containerWidth accurate */}
          <div style={{ cursor: 'crosshair' }}>
            <ThumbnailCanvasInner
              containerWidth={Math.max(containerWidth, 1)}
              backgroundUrl={backgroundUrl}
              photo={photo}
              texts={texts}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onUpdatePhoto={photoState.updatePhoto}
              onUpdateText={updateText}
              stageRef={stageRef}
            />
          </div>

          {/* CropUI overlay — same dimensions as canvas, no layout shift */}
          {cropTarget && (cropTarget.type === 'bg' ? cropTarget.src === backgroundUrl : cropTarget.src === photoOrigSrc) && (
            <CropUI
              src={cropTarget.src}
              label={cropTarget.type === 'photo'
                ? tr('Recortar foto', 'Crop photo')
                : tr('Recortar fondo', 'Crop background')}
              cW={containerWidth}
              cH={containerHeight}
              onConfirm={handleCropConfirm}
              onCancel={() => { if(cropTarget.type === 'bg')background.cancelCrop();cropCurrent.current = null;setCropTarget(null); }}
            />
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
              {tr('Alta resolución. Fondo uniforme da mejor resultado.',
                  'High resolution. Solid background gives best results.')}
            </p>

            {photoError && <p role="alert" className="text-[12px] mb-2" style={{color:'#f5a623'}}>{photoError}</p>}

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
                    className="soft-chip w-full py-1.5 text-[11px] mt-2 disabled:opacity-40 inline-flex items-center justify-center gap-1.5"
                  >
                    <ScissorsIcon size={11} /> {tr('Recortar foto', 'Crop photo')}
                  </button>
                )}

                {/* Remove / restore */}
                <div className="mt-2.5">
                  {!bgRemoved ? (
                    <button onClick={photoState.error === 'unconfirmed' ? photoState.retryRemoval : handleRemoveBg} disabled={removingBg}
                      className="soft-chip w-full py-1.5 text-[11px] disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {removingBg
                        ? <span className="flex items-center justify-center gap-1.5">
                            <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full spin-r" />
                            <span className="truncate max-w-[130px]">{bgStatus || tr('Procesando…', 'Processing…')}</span>
                          </span>
                        : photoState.error === 'unconfirmed' ? tr('Volver a intentar eliminación','Try removal again') : tr('Eliminar fondo', 'Remove BG')}
                    </button>
                  ) : (
                    <button onClick={handleRestoreOriginal}
                      className="soft-chip w-full py-1.5 text-[11px] soft-chip-active"
                    >
                      {tr('Restaurar original', 'Restore original')}
                    </button>
                  )}
                </div>

                {photoState.pendingRemoval && !removingBg && <button onClick={handleRestoreOriginal} className="soft-chip w-full py-1.5 text-[11px] mt-2">{tr('Descartar intento de eliminación','Discard removal attempt')}</button>}

                {/* Opacity */}
                <div className="mt-3">
                  <div className="flex justify-between mb-1">
                    <span className="text-[11px] font-mono-jb" style={{ color:'var(--yv-text-3)' }}>{tr('Opacidad','Opacity')}</span>
                    <span className="text-[11px] font-mono-jb" style={{ color:'var(--yv-text-2)' }}>{Math.round(photo.opacity * 100)}%</span>
                  </div>
                  <input type="range" min={0} max={1} step={0.05} value={photo.opacity}
                    onChange={e => photoState.updatePhoto({opacity:Number(e.target.value)})}
                    className="w-full accent-[#7CFF00]" />
                </div>

                <button
                  className="mt-2 text-[11px] w-full text-center hover:text-white transition"
                  style={{ color:'var(--yv-text-4)' }}
                  onClick={() => {
                    photoState.clear();cropCurrent.current = null;setCropTarget(null);
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
                    <span className="text-[10px] font-mono-jb" style={{ color:'var(--yv-text-3)' }}>{tr('Tamaño','Size')}</span>
                    <span className="text-[10px] font-mono-jb" style={{ color:'var(--yv-text-2)' }}>{selectedText.fontSize} px</span>
                  </div>
                  <input type="range" min={16} max={300} step={2} value={selectedText.fontSize}
                    onChange={e => updateText(selectedText.id, { fontSize: Number(e.target.value) })}
                    className="w-full accent-[#7CFF00]" />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <p className="text-[10px] font-mono-jb mb-1" style={{ color:'var(--yv-text-4)' }}>{tr('Color','Color')}</p>
                    <input type="color" value={selectedText.fill}
                      onChange={e => updateText(selectedText.id, { fill: e.target.value })}
                      className="w-full h-8 rounded cursor-pointer"
                      style={{ border:'1px solid var(--yv-border)', background:'none' }} />
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] font-mono-jb mb-1" style={{ color:'var(--yv-text-4)' }}>{tr('Borde','Stroke')}</p>
                    <input type="color" value={selectedText.stroke || '#000000'}
                      onChange={e => updateText(selectedText.id, { stroke: e.target.value, strokeWidth: Math.max(selectedText.strokeWidth || 0, 1) })}
                      className="w-full h-8 rounded cursor-pointer"
                      style={{ border:'1px solid var(--yv-border)', background:'none' }} />
                  </div>
                  <div>
                    <p className="text-[10px] font-mono-jb mb-1" style={{ color:'var(--yv-text-4)' }}>{tr('Grosor','Width')}</p>
                    <input type="number" min={0} max={40} step={1} value={selectedText.strokeWidth}
                      onChange={e => updateText(selectedText.id, { strokeWidth: Number(e.target.value) })}
                      className="soft-field w-14 text-sm py-1 text-center" />
                  </div>
                </div>
                <div className="flex gap-1.5 items-center">
                  {(['bold','italic'] as const).map(style => {
                    const active = (selectedText.fontStyle || '').includes(style);
                    return (
                      <button key={style}
                        onClick={() => {
                          const cur = selectedText.fontStyle || '';
                          updateText(selectedText.id, { fontStyle: active ? cur.replace(style,'').trim() : (cur+' '+style).trim() });
                        }}
                        className={`soft-chip px-3 py-1 text-[12px] font-mono-jb ${active ? 'soft-chip-active' : ''}`}
                        style={style === 'italic' ? { fontStyle:'italic' } : { fontWeight:700 }}
                      >
                        {style === 'bold' ? 'B' : 'I'}
                      </button>
                    );
                  })}
                  <button onClick={() => deleteText(selectedText.id)}
                    className="soft-chip px-3 py-1 text-[11px] ml-auto hover:text-red-400 transition">
                    {tr('Borrar','Delete')}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-[12px] mb-2" style={{ color:'var(--yv-text-4)' }}>
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
                className="text-[12px] text-center py-1.5 rounded inline-flex items-center justify-center gap-1.5"
                style={{ color:'#7CFF00', background:'rgba(124,255,0,0.08)', display:'flex' }}>
                <CheckIcon size={12} /> {save.savedStale ? tr('Captura anterior guardada — abrir imagen', 'Earlier snapshot saved — open image') : tr('Guardado — abrir imagen', 'Saved — open image')}
              </a>
            )}
            {saveErr && <div role="alert" className="text-[12px]" style={{ color:'#f5a623' }}><p>{saveErr}</p><a href="/dashboard">{tr('Consultar historial', 'Check history')}</a></div>}
            {save.pendingStale && <p>{tr('El reintento guarda la captura original. Los cambios posteriores aún no están guardados.', 'Retry saves the original snapshot. Later edits are not saved yet.')}</p>}
            <button onClick={handleSave} disabled={saving || (!save.pending && !backgroundUrl)}
              className="btn-offset w-full py-3 text-[14px] font-bold disabled:opacity-40 disabled:cursor-not-allowed">
              {saving
                ? <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full spin-r" />
                    {tr('Guardando…', 'Saving…')}
                  </span>
                : <span className="inline-flex items-center justify-center gap-1.5"><SaveIcon size={14} /> {save.pending ? tr('Reintentar guardado', 'Retry saving') : tr('Guardar miniatura', 'Save thumbnail')}</span>}
            </button>
            <button onClick={handleDownload} disabled={!backgroundUrl}
              className="soft-chip w-full py-2.5 text-[13px] text-center disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5">
              <DownloadIcon size={13} /> {tr('Descargar PNG', 'Download PNG')}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
