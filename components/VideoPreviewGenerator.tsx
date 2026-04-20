'use client';

import { useRef, useState, useCallback, useEffect, RefObject } from 'react';

// ─── TvCanvasMirror ───────────────────────────────────────────────────────────
// Mirrors a source canvas into a display canvas that fits inside the TV screen.
// We need this because `object-fit: contain` doesn't apply to <canvas>.

function TvCanvasMirror({ canvasRef }: { canvasRef: RefObject<HTMLCanvasElement | null> }) {
  const mirrorRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let rafId: number;
    const draw = () => {
      const src  = canvasRef.current;
      const dst  = mirrorRef.current;
      if (!src || !dst) { rafId = requestAnimationFrame(draw); return; }
      const container = dst.parentElement;
      if (!container) { rafId = requestAnimationFrame(draw); return; }

      // Size mirror canvas to its CSS container
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      if (dst.width !== cw || dst.height !== ch) { dst.width = cw; dst.height = ch; }

      const ctx = dst.getContext('2d');
      if (!ctx) { rafId = requestAnimationFrame(draw); return; }

      // Letterbox the source frame into the mirror canvas
      const srcW = src.width; const srcH = src.height;
      const scale = Math.min(cw / srcW, ch / srcH);
      const dw = srcW * scale; const dh = srcH * scale;
      const dx = (cw - dw) / 2; const dy = (ch - dh) / 2;

      ctx.clearRect(0, 0, cw, ch);
      ctx.drawImage(src, dx, dy, dw, dh);

      rafId = requestAnimationFrame(draw);
    };
    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [canvasRef]);

  return (
    <canvas
      ref={mirrorRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
    />
  );
}
import { savePreview } from '@/lib/videoPreviewDB';

// ─── Types ────────────────────────────────────────────────────────────────────

type Lang       = 'es' | 'en';
type Transition = 'fade' | 'slideLeft' | 'slideUp' | 'zoom' | 'wipeRight';

interface Slide {
  sectionTitle: string;
  subtitle: string;
  emoji: string;
  gradient: [string, string];
  accentColor: string;
  transition: Transition;
  duration: number;
  index: number;
  total: number;
}

// ─── Canvas dimensions — always 4:3 to match the TV ──────────────────────────
const CANVAS_W = 1200;
const CANVAS_H = 900;

// ─── Palettes ─────────────────────────────────────────────────────────────────

const PALETTES: Array<[string, string, string]> = [
  ['#0f0c29', '#302b63', '#a78bfa'],
  ['#0c1a2e', '#1a3a5c', '#00D9FF'],
  ['#1a0533', '#2d1b69', '#e84d5b'],
  ['#0a2a0a', '#1a4a1a', '#7CFF00'],
  ['#2a0a0a', '#4a1a00', '#FF8A00'],
  ['#0a1a2a', '#1a2a4a', '#FF00FF'],
  ['#1a1a0a', '#3a2a00', '#FFE800'],
  ['#0a2a2a', '#004a4a', '#00FFA3'],
];

const TRANSITIONS: Transition[] = ['fade', 'slideLeft', 'slideUp', 'zoom', 'wipeRight'];

// ─── Emoji detection ──────────────────────────────────────────────────────────

function pickEmoji(title: string, text: string): string {
  const s = (title + ' ' + text).toLowerCase();
  if (/hook|gancho|atenci/.test(s))                     return '🎣';
  if (/intro|bienvenid|hola|quién soy/.test(s))         return '👋';
  if (/tip|consejo|truco|secreto|clave/.test(s))        return '💡';
  if (/error|problema|evit|fallo|mal /.test(s))         return '❌';
  if (/éxito|exito|result|funciona|crecer|logr/.test(s))return '🚀';
  if (/dinero|monetiz|ganar|ingreso|paga/.test(s))      return '💰';
  if (/cámara|video|film|grab|content/.test(s))         return '🎬';
  if (/suscript|audiencia|comunidad|canal/.test(s))     return '👥';
  if (/aprend|paso|tutori|cómo|guía/.test(s))           return '📚';
  if (/acción|click|suscrib|comenta|like/.test(s))      return '👆';
  if (/dato|estadístic|número|cifra/.test(s))           return '📊';
  if (/tiempo|duración|segundo|minuto/.test(s))         return '⏱️';
  if (/herramienta|app|software/.test(s))               return '🛠️';
  if (/historia|anécdota|cuando/.test(s))               return '📖';
  if (/pregunta|duda|¿/.test(s))                        return '❓';
  if (/siguiente|paso|next|ahora/.test(s))              return '➡️';
  return '🎯';
}

// ─── Markdown → Slides ────────────────────────────────────────────────────────

function cleanLine(t: string): string {
  return t.replace(/\*\*/g, '').replace(/\*/g, '').replace(/`[^`]+`/g, '').replace(/\([\d:]+\s*[-–]\s*[\d:]+\)/g, '').trim();
}

function parseScript(markdown: string): Slide[] {
  const slides: Slide[] = [];

  // ── Filter noise ──
  const usableLines = markdown.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .filter(l => !l.startsWith('>'))
    .filter(l => !/^-{3,}$/.test(l))
    .filter(l => !/^\[?\d{1,2}:\d{2}/.test(l))
    .filter(l => !/^\([\d:]+\s*[-–]\s*[\d:]+\)/.test(l));

  const hasHeaders = usableLines.some(l => /^#{1,3}\s/.test(l));

  if (hasHeaders) {
    // ── Mode A: markdown with ## section headers ──
    let sectionTitle = '';
    let collected: string[] = [];
    let idx = 0;

    const flush = () => {
      const subtitle = collected.join(' ').trim().replace(/\s+/g, ' ');
      if (subtitle.length < 8) return;
      const [cA, cB, accent] = PALETTES[idx % PALETTES.length];
      slides.push({
        sectionTitle: sectionTitle || `Parte ${idx + 1}`,
        subtitle: subtitle.slice(0, 140),
        emoji: pickEmoji(sectionTitle, subtitle),
        gradient: [cA, cB],
        accentColor: accent,
        transition: TRANSITIONS[idx % TRANSITIONS.length],
        duration: 5, index: idx, total: 0,
      });
      idx++;
      collected = [];
    };

    for (const t of usableLines) {
      if (/^#{1,3}\s/.test(t)) {
        flush();
        sectionTitle = t
          .replace(/^#{1,3}\s*/, '')
          .replace(/\([\d:]+\s*[-–]\s*[\d:]+\)/g, '')
          .replace(/[\u{1F300}-\u{1FBFF}]/gu, '')
          .replace(/\*\*/g, '')
          .replace(/[📌🎬📝🔑✅⚡🎯]/g, '')
          .trim();
        continue;
      }
      const bolds = [...t.matchAll(/\*\*([^*]{5,})\*\*/g)];
      if (bolds.length > 0 && collected.join(' ').length < 110) {
        collected.push(...bolds.map(m => m[1]));
        continue;
      }
      if (collected.length === 0) {
        const plain = cleanLine(t);
        if (plain.length >= 12) collected.push(plain);
      }
    }
    flush();

  } else {
    // ── Mode B: plain text — split into individual sentences ──
    const fullText = usableLines.join(' ');

    // Split on sentence boundaries (., !, ?)
    const sentences = fullText
      .split(/(?<=[.!?¡¿])\s+/)
      .map(s => s.trim())
      .filter(s => cleanLine(s).length > 10);

    sentences.slice(0, 10).forEach((sentence, idx) => {
      // Section title pill = bold keywords (if any), else empty string
      const boldWords = [...sentence.matchAll(/\*\*([^*]+)\*\*/g)].map(m => m[1].trim());
      const sectionTitle = boldWords.slice(0, 2).join(' + ').toUpperCase().slice(0, 20);

      // Subtitle = full sentence cleaned (no bold markers, no timestamps)
      const subtitle = cleanLine(sentence).slice(0, 130);

      const [cA, cB, accent] = PALETTES[idx % PALETTES.length];
      slides.push({
        sectionTitle,
        subtitle,
        emoji: pickEmoji(sectionTitle, subtitle),
        gradient: [cA, cB],
        accentColor: accent,
        transition: TRANSITIONS[idx % TRANSITIONS.length],
        duration: 5, index: idx, total: 0,
      });
    });
  }

  const result = slides.slice(0, 10);
  result.forEach((s, i) => { s.index = i; s.total = result.length; });
  return result;
}

// ─── Canvas helpers ───────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

// Draw a fully static slide onto ctx at (offsetX, offsetY) with given alpha
function drawSlide(
  ctx: CanvasRenderingContext2D,
  slide: Slide,
  W: number, H: number,
  alpha: number   = 1,
  offsetX: number = 0,
  offsetY: number = 0,
  scale: number   = 1,
) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.translate(offsetX, offsetY);
  if (scale !== 1) {
    ctx.translate(W / 2, H / 2);
    ctx.scale(scale, scale);
    ctx.translate(-W / 2, -H / 2);
  }

  // ── Background gradient ──
  const grad = ctx.createLinearGradient(0, 0, W * 0.6, H);
  grad.addColorStop(0, slide.gradient[0]);
  grad.addColorStop(1, slide.gradient[1]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Subtle dot grid
  ctx.fillStyle = 'rgba(255,255,255,0.018)';
  for (let y = 0; y < H; y += 60) for (let x = 0; x < W; x += 60) {
    ctx.beginPath(); ctx.arc(x + 30, y + 30, 1.5, 0, Math.PI * 2); ctx.fill();
  }

  // Accent left bar
  ctx.fillStyle = slide.accentColor;
  ctx.fillRect(0, 0, W * 0.012, H);

  const [ar, ag, ab] = hexToRgb(slide.accentColor);
  const isLandscape = W > H;

  if (isLandscape) {
    // ── LANDSCAPE (YouTube 16:9) ──────────────────────────────────

    // Top bar
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(0, 0, W, H * 0.09);

    // Logo
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = `bold ${Math.round(H * 0.04)}px monospace`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('YTubViral.com', W * 0.025, H * 0.045);

    // Counter
    ctx.fillStyle = slide.accentColor; ctx.textAlign = 'right';
    ctx.fillText(`${slide.index + 1} / ${slide.total}`, W * 0.975, H * 0.045);

    // Left panel: emoji
    const panelW = W * 0.40;
    ctx.font = `${Math.round(H * 0.38)}px serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(slide.emoji, panelW / 2, H * 0.52);

    // Section title under emoji
    ctx.fillStyle = slide.accentColor;
    ctx.font = `bold ${Math.round(H * 0.048)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(slide.sectionTitle.toUpperCase().slice(0, 18), panelW / 2, H * 0.80);

    // Vertical divider
    ctx.strokeStyle = `rgba(${ar},${ag},${ab},0.3)`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(panelW, H * 0.1); ctx.lineTo(panelW, H * 0.92); ctx.stroke();

    // Subtitle area (right panel)
    const textX   = panelW + W * 0.04;
    const textMaxW = W - panelW - W * 0.06;
    const fs = slide.subtitle.length > 90 ? Math.round(H * 0.066) : Math.round(H * 0.082);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${fs}px "Arial", sans-serif`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 12;
    const lines = wrapLines(ctx, slide.subtitle, textMaxW);
    const lineH = fs * 1.48;
    const totalH = lines.length * lineH;
    let startY = (H - totalH) / 2;
    lines.forEach((l, i) => ctx.fillText(l, textX, startY + i * lineH));
    ctx.shadowBlur = 0;

  } else {
    // ── PORTRAIT / SQUARE (TikTok / Instagram) ───────────────────

    // Top bar
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, W, H * 0.06);

    // Logo
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = `bold ${Math.round(W * 0.032)}px monospace`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('YTubViral.com', W * 0.038, H * 0.03);

    // Counter
    ctx.fillStyle = slide.accentColor; ctx.textAlign = 'right';
    ctx.fillText(`${slide.index + 1} / ${slide.total}`, W * 0.962, H * 0.03);

    // Section title pill
    const titleY = H * 0.11;
    ctx.font = `bold ${Math.round(W * 0.034)}px monospace`;
    ctx.textAlign = 'center';
    const titleTxt = slide.sectionTitle.toUpperCase().slice(0, 20);
    const pillW    = ctx.measureText(titleTxt).width + 44;
    ctx.fillStyle = `rgba(${ar},${ag},${ab},0.2)`;
    ctx.beginPath(); ctx.roundRect(W / 2 - pillW / 2, titleY - 24, pillW, 48, 24); ctx.fill();
    ctx.strokeStyle = `rgba(${ar},${ag},${ab},0.5)`; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = slide.accentColor; ctx.textBaseline = 'middle';
    ctx.fillText(titleTxt, W / 2, titleY);

    // Emoji (centered in upper visual area)
    ctx.font = `${Math.round(W * 0.30)}px serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(slide.emoji, W / 2, H * 0.36);

    // Subtitle card (lower portion)
    const cardPad = 44;
    const cardX   = 32;
    const cardY   = H * 0.57;
    const cardW   = W - 64;
    const cardH   = H * 0.33;

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath(); ctx.roundRect(cardX, cardY, cardW, cardH, 20); ctx.fill();
    ctx.strokeStyle = `rgba(${ar},${ag},${ab},0.45)`; ctx.lineWidth = 2; ctx.stroke();

    // Accent line at top of card
    ctx.fillStyle = slide.accentColor;
    ctx.beginPath(); ctx.roundRect(cardX + 20, cardY, 60, 4, 2); ctx.fill();

    // Subtitle text
    const fs = slide.subtitle.length > 100 ? Math.round(W * 0.048) : Math.round(W * 0.058);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${fs}px "Arial", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 8;
    const lines    = wrapLines(ctx, slide.subtitle, cardW - cardPad * 2);
    const lineH    = fs * 1.46;
    const totalTH  = lines.length * lineH;
    const startY   = cardY + (cardH - totalTH) / 2;
    lines.slice(0, 4).forEach((l, i) => ctx.fillText(l, W / 2, startY + i * lineH));
    ctx.shadowBlur = 0;
  }

  // ── Progress bar (bottom, always) ──
  const barY = H * 0.955;
  const barH2 = Math.round(H * 0.006);
  const barX = W * 0.04;
  const barW = W * 0.92;

  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH2, 3); ctx.fill();

  ctx.fillStyle = slide.accentColor;
  ctx.shadowColor = slide.accentColor; ctx.shadowBlur = 10;
  const done = (slide.index + 1) / slide.total;
  ctx.beginPath(); ctx.roundRect(barX, barY, barW * done, barH2, 3); ctx.fill();
  ctx.shadowBlur = 0;

  ctx.restore();
}

// ─── Transition renderer ──────────────────────────────────────────────────────

function renderTransition(
  ctx: CanvasRenderingContext2D,
  prevOffscreen: HTMLCanvasElement | null,
  currentSlide: Slide,
  W: number, H: number,
  t: number,  // 0 → 1 (transition progress)
) {
  const type = currentSlide.transition;

  switch (type) {
    case 'fade':
      if (prevOffscreen) { ctx.drawImage(prevOffscreen, 0, 0); }
      drawSlide(ctx, currentSlide, W, H, t);
      break;

    case 'slideLeft': {
      if (prevOffscreen) ctx.drawImage(prevOffscreen, -W * t, 0);
      drawSlide(ctx, currentSlide, W, H, 1, W * (1 - t));
      break;
    }

    case 'slideUp': {
      if (prevOffscreen) ctx.drawImage(prevOffscreen, 0, -H * t);
      drawSlide(ctx, currentSlide, W, H, 1, 0, H * (1 - t));
      break;
    }

    case 'zoom': {
      if (prevOffscreen) {
        ctx.save();
        ctx.globalAlpha = 1 - t;
        ctx.drawImage(prevOffscreen, 0, 0);
        ctx.restore();
      }
      drawSlide(ctx, currentSlide, W, H, t, 0, 0, 0.85 + 0.15 * t);
      break;
    }

    case 'wipeRight': {
      if (prevOffscreen) ctx.drawImage(prevOffscreen, 0, 0);
      const wipeW = W * t;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, wipeW, H);
      ctx.clip();
      drawSlide(ctx, currentSlide, W, H, 1);
      ctx.restore();
      // Accent edge line
      ctx.strokeStyle = currentSlide.accentColor;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(wipeW, 0); ctx.lineTo(wipeW, H); ctx.stroke();
      break;
    }
  }
}

// ─── Rate limit ───────────────────────────────────────────────────────────────

const DAILY_LIMIT = 50; // PRO-only feature — generous limit

function checkRateLimit() {
  const today = new Date().toISOString().split('T')[0];
  const count = parseInt(localStorage.getItem(`ytv_vp_${today}`) ?? '0', 10);
  return { allowed: count < DAILY_LIMIT, remaining: DAILY_LIMIT - count };
}
function bumpRateLimit() {
  const today = new Date().toISOString().split('T')[0];
  const k = `ytv_vp_${today}`;
  localStorage.setItem(k, String(parseInt(localStorage.getItem(k) ?? '0', 10) + 1));
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  scriptContent: string;
  generationId: string;
  scriptTitle?: string;
  lang: Lang;
  onClose: () => void;
  onSaved?: () => void;
}

const TRANSITION_DURATION = 0.55; // seconds

export default function VideoPreviewGenerator({
  scriptContent, generationId, scriptTitle = 'Script', lang, onClose, onSaved,
}: Props) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const offscRef    = useRef<HTMLCanvasElement | null>(null);
  const rafRef      = useRef<number>(0);
  const recorderRef = useRef<MediaRecorder | null>(null);

  const [status, setStatus]     = useState<'idle'|'generating'|'done'|'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const t = (es: string, en: string) => lang === 'en' ? en : es;

  const generate = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { allowed } = checkRateLimit();
    if (!allowed) {
      setStatus('error');
      setErrorMsg(t(`Límite de ${DAILY_LIMIT} videos/día alcanzado.`, `Daily limit of ${DAILY_LIMIT} videos reached.`));
      return;
    }

    const supportsCapture = typeof (canvas as HTMLCanvasElement & { captureStream?: () => MediaStream }).captureStream === 'function';
    if (!window.MediaRecorder || !supportsCapture) {
      setStatus('error');
      setErrorMsg(t('Tu navegador no soporta grabación. Usa Chrome o Edge.', 'Use Chrome or Edge for recording.'));
      return;
    }

    const slides = parseScript(scriptContent);
    if (slides.length === 0) {
      setStatus('error');
      setErrorMsg(t('El script no tiene texto suficiente.', 'The script does not have enough text.'));
      return;
    }

    setStatus('generating');
    setProgress(0);
    bumpRateLimit();

    const W = CANVAS_W, H = CANVAS_H;
    // Offscreen canvas for previous slide
    const offscreen = document.createElement('canvas');
    offscreen.width = W; offscreen.height = H;
    offscRef.current = offscreen;
    const offCtx = offscreen.getContext('2d')!;

    const totalDur = slides.reduce((s, sl) => s + sl.duration, 0) + slides.length * TRANSITION_DURATION;

    const stream = (canvas as HTMLCanvasElement & { captureStream: (fps: number) => MediaStream }).captureStream(30);
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 3_000_000 });
    recorderRef.current = recorder;
    const chunks: Blob[] = [];

    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = async () => {
      stream.getTracks().forEach(tr => tr.stop());
      const blob = new Blob(chunks, { type: mimeType });
      setVideoUrl(URL.createObjectURL(blob));
      setStatus('done'); setProgress(100);
      try {
        await savePreview({ id: generationId, blob, title: scriptTitle, format: '4x3', createdAt: new Date().toISOString() });
        onSaved?.();
      } catch { /* non-critical */ }
    };

    recorder.start(200);
    const startTime = performance.now();

    // Build timeline: for each slide, a transition period then a display period
    const timeline: Array<{ slide: Slide; startT: number; transEnd: number; slideEnd: number }> = [];
    let cursor = 0;
    for (const slide of slides) {
      const transEnd  = cursor + TRANSITION_DURATION;
      const slideEnd  = transEnd + slide.duration;
      timeline.push({ slide, startT: cursor, transEnd, slideEnd });
      cursor = slideEnd;
    }

    // Draw first slide onto offscreen initially (blank)
    offCtx.fillStyle = '#000'; offCtx.fillRect(0, 0, W, H);

    const animate = () => {
      const elapsed = (performance.now() - startTime) / 1000;

      if (elapsed >= totalDur + 0.3) {
        if (recorder.state === 'recording') recorder.stop();
        return;
      }

      setProgress(Math.min(95, Math.round((elapsed / totalDur) * 100)));

      // Find current segment
      const seg = timeline.find(s => elapsed >= s.startT && elapsed < s.slideEnd);

      if (!seg) {
        // Before first or after last — black
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      } else if (elapsed < seg.transEnd) {
        // Transition phase
        const tp = (elapsed - seg.startT) / TRANSITION_DURATION;
        renderTransition(ctx, offscRef.current, seg.slide, W, H, Math.min(1, tp));
      } else {
        // Static display phase — draw slide and refresh offscreen
        drawSlide(ctx, seg.slide, W, H);
        // Update offscreen for next transition
        offCtx.clearRect(0, 0, W, H);
        offCtx.drawImage(canvas, 0, 0);
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    setTimeout(() => {
      cancelAnimationFrame(rafRef.current);
      if (recorder.state === 'recording') recorder.stop();
    }, (totalDur + 5) * 1000);

  }, [scriptContent, generationId, scriptTitle, lang]);

  const handleDownload = () => {
    if (!videoUrl) return;
    const a = document.createElement('a');
    a.href = videoUrl;
    a.download = `ytubviral-preview-${generationId.slice(0, 8)}.webm`;
    a.click();
  };

  const handleClose = () => {
    cancelAnimationFrame(rafRef.current);
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    onClose();
  };

  const reset = () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setStatus('idle'); setVideoUrl(null); setProgress(0); setErrorMsg('');
  };

  const { remaining } = checkRateLimit();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(14px)' }}>
      <div className="relative w-full my-auto" style={{ maxWidth: 620 }}>

        {/* Close */}
        <button onClick={handleClose}
          className="absolute -top-10 right-0 font-mono-jb text-[12px] text-zinc-500 hover:text-white transition flex items-center gap-1.5">
          <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M18 6 6 18M6 6l12 12"/></svg>
          {t('Cerrar', 'Close')}
        </button>

        <div className="soft-card p-6 space-y-5">
          {/* Header */}
          <div>
            <p className="font-mono-jb text-[11px] tracking-[0.2em] uppercase mb-1" style={{ color: '#00D9FF' }}>
              VIDEO PREVIEW · PRO
            </p>
            <h2 className="font-display font-bold text-xl">{t('Storyboard animado', 'Animated storyboard')}</h2>
            <p className="font-mono-jb text-[11px] text-zinc-500 mt-1 truncate max-w-xs">"{scriptTitle}"</p>
          </div>

          {/* Canvas preview — TV2 frame ON TOP, video plays behind */}
          <div className="flex justify-center">
            {/* Hidden canvas at full resolution for MediaRecorder */}
            <canvas
              ref={canvasRef}
              width={CANVAS_W}
              height={CANVAS_H}
              style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 1, height: 1 }}
            />

            <div style={{ position: 'relative', display: 'inline-block', width: '100%', maxWidth: 500 }}>

              {/* ── Layer 1 (behind): video/canvas content ── */}
              <div style={{
                position: 'absolute',
                left: '11%', top: '10%',
                width: '65%', height: '79%',
                zIndex: 1,
                overflow: 'hidden',
                background: '#000810',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {status !== 'done' && <TvCanvasMirror canvasRef={canvasRef} />}
                {status === 'done' && videoUrl && (
                  <video src={videoUrl} autoPlay loop muted playsInline
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                )}
                {status === 'idle' && (
                  <div style={{
                    position: 'absolute', inset: 0, zIndex: 2,
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 8,
                    background: 'rgba(3,4,12,0.95)',
                  }}>
                    <span style={{ fontSize: 28 }}>📺</span>
                    <p style={{ fontFamily: 'monospace', fontSize: 10, color: '#52525b', textAlign: 'center', padding: '0 10px', lineHeight: 1.4 }}>
                      {t('La animación aparecerá aquí', 'Animation will appear here')}
                    </p>
                  </div>
                )}
                {/* CRT scanlines */}
                <div style={{
                  position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5,
                  background: 'repeating-linear-gradient(0deg, transparent 0px, transparent 3px, rgba(0,0,0,0.06) 3px, rgba(0,0,0,0.06) 4px)',
                }} />
                {/* Screen glare */}
                <div style={{
                  position: 'absolute', top: 0, left: 0, width: '55%', height: '40%',
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, transparent 60%)',
                  pointerEvents: 'none', zIndex: 6, borderRadius: '0 0 80% 0',
                }} />
              </div>

              {/* ── Layer 2 (on top): TV2 frame — transparent screen reveals video ── */}
              <img
                src="/TV2.webp"
                alt=""
                draggable={false}
                style={{
                  width: '100%', display: 'block',
                  position: 'relative', zIndex: 10,
                  userSelect: 'none', pointerEvents: 'none',
                }}
              />
            </div>
          </div>

          {/* Progress bar */}
          {status === 'generating' && (
            <div className="space-y-2">
              <div className="flex justify-between font-mono-jb text-[10px] text-zinc-500">
                <span>{t('Renderizando slides...', 'Rendering slides...')}</span>
                <span>{progress}%</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div className="h-full rounded-full transition-all duration-200"
                  style={{ width: `${progress}%`, background: 'linear-gradient(90deg,#00D9FF,#FF00FF)' }} />
              </div>
            </div>
          )}

          {status === 'error' && (
            <p className="font-mono-jb text-[12px]" style={{ color: 'var(--red)' }}>{errorMsg}</p>
          )}

          {status === 'idle' && (
            <p className="font-mono-jb text-[10px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
              {t(`${remaining} generaciones restantes hoy`, `${remaining} remaining today`)}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            {status === 'idle' && (
              <button onClick={generate} className="btn-offset flex-1 py-3 text-[13px] font-display gap-2">
                🎬 {t('Generar storyboard', 'Generate storyboard')}
              </button>
            )}
            {status === 'generating' && (
              <button disabled className="btn-offset flex-1 py-3 text-[13px] font-display gap-2 opacity-50 cursor-not-allowed flex items-center justify-center">
                <svg className="animate-spin" width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                {t('Procesando...', 'Processing...')}
              </button>
            )}
            {status === 'done' && (
              <>
                <button onClick={handleDownload} className="btn-offset flex-1 py-3 text-[13px] font-display gap-2"
                  style={{ background: '#00D9FF', borderColor: '#00D9FF', color: '#000' }}>
                  ⬇️ {t('Descargar', 'Download')}
                </button>
                <button onClick={reset} className="btn-offset btn-offset-white py-3 px-4 text-[13px] font-display">
                  ↺ {t('Regenerar', 'Regenerate')}
                </button>
              </>
            )}
            {status === 'error' && (
              <button onClick={() => setStatus('idle')} className="btn-offset btn-offset-white flex-1 py-3 text-[13px] font-display">
                {t('Intentar de nuevo', 'Try again')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
