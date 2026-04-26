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
type Transition = 'fade' | 'slideLeft' | 'slideUp' | 'zoom' | 'wipeRight' | 'pushRight' | 'slideDown' | 'curtain' | 'zoomOut' | 'blinds' | 'dissolve';
type Layout = 'left' | 'right' | 'center';

interface Slide {
  sectionTitle: string;
  subtitle: string;
  emoji: string;
  gradient: [string, string];
  accentColor: string;
  transition: Transition;
  layout: Layout;
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

const TRANSITIONS: Transition[] = ['fade', 'slideLeft', 'slideUp', 'zoom', 'wipeRight', 'pushRight', 'slideDown', 'curtain', 'zoomOut', 'blinds', 'dissolve'];
const LAYOUTS: Layout[] = ['left', 'right', 'center'];

// ─── Emoji detection ──────────────────────────────────────────────────────────

const FALLBACK_EMOJIS = ['🎯', '✨', '💥', '🔥', '⭐', '💫', '🏆', '🌟', '🎪', '⚡', '🎭', '🌀', '🔮', '🎲', '🧩', '🦋'];

function pickEmoji(title: string, text: string, idx = 0): string {
  const s = (title + ' ' + text).toLowerCase();

  // Hooks / atención
  if (/hook|gancho|atenci|captura|primer|opening|start/.test(s))  return '🎣';
  // Intro / presentación
  if (/intro|bienvenid|hola|quién soy|welcome|who am i|presento|about me/.test(s)) return '👋';
  // Consejos / tips
  if (/\btip\b|consejo|truco|secreto|hack|pro tip|clave|advice/.test(s)) return '💡';
  // Errores / advertencias
  if (/error|evita|fallo|mal |mistake|avoid|wrong|no hagas|don't|warning|cuidado/.test(s)) return '⚠️';
  // Problemas / bugs
  if (/problema|bug|issue|falla|crash|roto|broken/.test(s))        return '🔧';
  // Éxito / resultados / crecer
  if (/éxito|exito|result|funciona|crecer|logr|success|grow|achiev/.test(s)) return '🚀';
  // Viral / tendencia
  if (/viral|trending|tenden|explod|boom|millón|million/.test(s))  return '📈';
  // Dinero / monetización
  if (/dinero|monetiz|ganar|ingreso|pago|sueldo|money|earn|revenue|income|dollar|euro/.test(s)) return '💰';
  // Patrocinios / brand deals
  if (/patrocin|sponsor|brand deal|partner|colabor/.test(s))       return '🤝';
  // Cámara / grabación
  if (/cámara|camera|grab|record|shoot|filma/.test(s))             return '📷';
  // Vídeo / contenido
  if (/\bvideo\b|\bvídeo\b|content|contenido|film/.test(s))        return '🎬';
  // Edición / post-producción
  if (/edic|edit|corte|cut|premiere|davinci|after effect/.test(s)) return '✂️';
  // Miniatura / thumbnail
  if (/miniatura|thumbnail|portada|cover|ctr/.test(s))             return '🖼️';
  // Título / headline
  if (/título|title|headline|titular/.test(s))                     return '📝';
  // Descripción / SEO
  if (/descripci|description|seo|keyword|palabr clave/.test(s))    return '🔑';
  // Suscriptores / audiencia / comunidad
  if (/suscript|subscriber|audiencia|audience|comunidad|community|fans/.test(s)) return '👥';
  // Canal / plataforma
  if (/canal|channel|youtube|plataforma|platform/.test(s))         return '📺';
  // Aprender / guía / tutorial
  if (/aprend|learn|tutori|guía|guide|paso a paso|step by step/.test(s)) return '📚';
  // Estrategia / plan
  if (/estrategia|strategy|plan|método|method|sistema|system/.test(s)) return '🗺️';
  // Call to action / interacción
  if (/cta|call to action|suscrib|subscribe|comenta|comment|like|comparte|share/.test(s)) return '👆';
  // Estadísticas / datos / analytics
  if (/estadístic|analytics|analítica|metric|dato|data|cifra|número|stat/.test(s)) return '📊';
  // Algoritmo / recomendación
  if (/algoritmo|algorithm|recomend|recommend|suggest|suggest/.test(s)) return '🤖';
  // Tiempo / duración / velocidad
  if (/tiempo|duración|rápido|fast|quick|veloc|second|minuto|minute/.test(s)) return '⏱️';
  // Herramientas / apps / software
  if (/herramienta|tool|app|software|plugin|extensión|extension/.test(s)) return '🛠️';
  // IA / inteligencia artificial
  if (/ia\b|ai\b|inteligencia artificial|artificial intelligence|chatgpt|claude|gpt/.test(s)) return '🧠';
  // Historia / narrativa / storytelling
  if (/historia|story|narrativa|narrative|anécdota|experiencia|experience/.test(s)) return '📖';
  // Pregunta / curiosidad
  if (/pregunta|question|¿|ask|wonder|curiosid|curious|por qué|why/.test(s)) return '❓';
  // Siguiente / CTA de cierre
  if (/siguiente|next step|ahora|now|conclu|final|summary|resumen|wrap/.test(s)) return '➡️';
  // Música / audio / sonido
  if (/música|music|sound|audio|beat|canción|song|melodía/.test(s)) return '🎵';
  // Viajes / lugares
  if (/viaj|travel|trip|lugar|place|destino|destination|ciudad|city/.test(s)) return '✈️';
  // Comida / recetas
  if (/comid|food|receta|recipe|cocin|cook|restaurante|restaurant/.test(s)) return '🍕';
  // Fitness / deporte / salud
  if (/fitness|gym|ejercicio|exercise|sport|deporte|salud|health|entrena/.test(s)) return '💪';
  // Motivación / mentalidad
  if (/motivac|motivation|mindset|mentalidad|actitud|attitude/.test(s)) return '🔥';
  // Reto / competición
  if (/reto|challenge|versus|vs |compet|torneo|tournament/.test(s)) return '🏅';
  // Humor / entretenimiento
  if (/divertid|funny|humor|gracia|joke|entreteni|entertain/.test(s)) return '😂';
  // Misterio / revelación / descubrimiento
  if (/secret|misterio|mystery|reveal|descubr|discover|sorpresa|surprise/.test(s)) return '🔍';
  // Tecnología / gadgets / setup
  if (/tecnolog|tech|gadget|setup|equipo|gear|dispositivo|device/.test(s)) return '💻';
  // Redes sociales / social media
  if (/instagram|tiktok|twitter|redes sociales|social media/.test(s)) return '📱';
  // Colaboración / collab
  if (/colabo|collab|featuring|ft\.|con |with /.test(s))            return '🎤';
  // Fans / comunidad activa
  if (/fan|seguidor|follower|comments section/.test(s))              return '❤️';
  // Final / conclusión / despedida
  if (/adiós|bye|despedida|farewell|hasta pronto|see you/.test(s))  return '👊';

  return FALLBACK_EMOJIS[idx % FALLBACK_EMOJIS.length];
}

// ─── Markdown → Slides ────────────────────────────────────────────────────────

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function cleanLine(t: string): string {
  return t.replace(/\*\*/g, '').replace(/\*/g, '').replace(/`[^`]+`/g, '').replace(/\([\d:]+\s*[-–]\s*[\d:]+\)/g, '').trim();
}

function parseScript(markdown: string): Slide[] {
  const slides: Slide[] = [];
  const transitionOrder = shuffleArray(TRANSITIONS);
  const layoutOrder = shuffleArray([...LAYOUTS, ...LAYOUTS, ...LAYOUTS, 'left', 'right'] as Layout[]);

  // ── Mode C: storyboard format  "0-5s: LABEL | Description" ──────────────
  const allLines = markdown.split('\n').map(l => l.trim()).filter(Boolean);
  const storyboardLines = allLines.filter(l => /^\d+\s*s?[-–]\s*\d+\s*s?\s*:/.test(l));

  if (storyboardLines.length >= 2) {
    storyboardLines.slice(0, 15).forEach((line, idx) => {
      const m = line.match(/^(\d+)\s*s?[-–]\s*(\d+)\s*s?\s*:\s*(.+)/);
      if (!m) return;
      const rawDur = Math.max(3, Math.min(8, parseInt(m[2]) - parseInt(m[1])));
      const content = m[3].trim();

      let sectionTitle = `SCENE ${idx + 1}`;
      let subtitle = content;
      const pipeIdx = content.indexOf('|');
      if (pipeIdx > 0) {
        sectionTitle = content.slice(0, pipeIdx).trim();
        subtitle = content.slice(pipeIdx + 1).trim();
      }

      const cleaned = cleanLine(subtitle).slice(0, 130);
      if (cleaned.length < 4) return;

      const [cA, cB, accent] = PALETTES[idx % PALETTES.length];
      slides.push({
        sectionTitle: sectionTitle.replace(/[^\w\s]/g, '').trim().toUpperCase().slice(0, 20),
        subtitle: cleaned,
        emoji: pickEmoji(sectionTitle, cleaned, idx),
        gradient: [cA, cB],
        accentColor: accent,
        transition: transitionOrder[idx % transitionOrder.length],
        layout: layoutOrder[idx % layoutOrder.length],
        duration: Math.max(5, rawDur),
        index: idx, total: 0,
      });
    });

    if (slides.length > 0) {
      const result = slides.slice(0, 15);
      result.forEach((s, i) => { s.index = i; s.total = result.length; });
      return result;
    }
  }

  // ── Filter noise (Modes A & B) ─────────────────────────────────────────
  const usableLines = allLines
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
        emoji: pickEmoji(sectionTitle, subtitle, idx),
        gradient: [cA, cB],
        accentColor: accent,
        transition: transitionOrder[idx % transitionOrder.length],
        layout: layoutOrder[idx % layoutOrder.length],
        duration: 7, index: idx, total: 0,
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

    sentences.slice(0, 15).forEach((sentence, idx) => {
      // Section title pill = bold keywords (if any), else empty string
      const boldWords = [...sentence.matchAll(/\*\*([^*]+)\*\*/g)].map(m => m[1].trim());
      const sectionTitle = boldWords.slice(0, 2).join(' + ').toUpperCase().slice(0, 20);

      // Subtitle = full sentence cleaned (no bold markers, no timestamps)
      const subtitle = cleanLine(sentence).slice(0, 130);

      const [cA, cB, accent] = PALETTES[idx % PALETTES.length];
      slides.push({
        sectionTitle,
        subtitle,
        emoji: pickEmoji(sectionTitle, subtitle, idx),
        gradient: [cA, cB],
        accentColor: accent,
        transition: transitionOrder[idx % transitionOrder.length],
        layout: layoutOrder[idx % layoutOrder.length],
        duration: 7, index: idx, total: 0,
      });
    });
  }

  const result = slides.slice(0, 15);
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
    // ── LANDSCAPE ─────────────────────────────────────────────────

    // Top bar
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(0, 0, W, H * 0.09);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = `bold ${Math.round(H * 0.04)}px monospace`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('YTubViral.com', W * 0.025, H * 0.045);
    ctx.fillStyle = slide.accentColor; ctx.textAlign = 'right';
    ctx.fillText(`${slide.index + 1} / ${slide.total}`, W * 0.975, H * 0.045);

    const layout = slide.layout ?? 'left';

    if (layout === 'center') {
      // ── CENTER: emoji arriba centrado, texto centrado debajo ──
      // Glow de fondo en el centro
      const glow = ctx.createRadialGradient(W / 2, H * 0.38, 0, W / 2, H * 0.38, H * 0.4);
      glow.addColorStop(0, `rgba(${ar},${ag},${ab},0.12)`);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

      // Emoji (más pequeño, centrado)
      ctx.font = `${Math.round(H * 0.22)}px serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(slide.emoji, W / 2, H * 0.32);

      // Section title pill centrado
      const titleTxtC = slide.sectionTitle.toUpperCase().slice(0, 22);
      ctx.font = `bold ${Math.round(H * 0.042)}px monospace`;
      const pillWC = ctx.measureText(titleTxtC).width + 36;
      ctx.fillStyle = `rgba(${ar},${ag},${ab},0.18)`;
      ctx.beginPath(); ctx.roundRect(W / 2 - pillWC / 2, H * 0.50 - 18, pillWC, 36, 18); ctx.fill();
      ctx.strokeStyle = `rgba(${ar},${ag},${ab},0.45)`; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = slide.accentColor; ctx.textBaseline = 'middle';
      ctx.fillText(titleTxtC, W / 2, H * 0.50);

      // Texto centrado — font adaptativo con shrink suave
      const textMaxWC = W * 0.82;
      let fsC = Math.round(H * 0.075);
      ctx.font = `bold ${fsC}px "Arial", sans-serif`;
      let linesC = wrapLines(ctx, slide.subtitle, textMaxWC);
      while (linesC.length > 3 && fsC > Math.round(H * 0.055)) {
        fsC = Math.round(fsC * 0.93);
        ctx.font = `bold ${fsC}px "Arial", sans-serif`;
        linesC = wrapLines(ctx, slide.subtitle, textMaxWC);
      }
      linesC = linesC.slice(0, 3);
      const lineHC = fsC * 1.45;
      const totalHC = linesC.length * lineHC;
      const startYC = Math.min(H * 0.62, H * 0.90 - totalHC);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 14;
      linesC.forEach((l, i) => ctx.fillText(l, W / 2, startYC + i * lineHC));
      ctx.shadowBlur = 0;

    } else {
      // ── LEFT / RIGHT: dos paneles ──
      const emojiOnLeft = layout !== 'right';
      const panelW  = W * 0.40;
      const textPanelW = W - panelW;
      const emojiCX = emojiOnLeft ? panelW / 2 : W - panelW / 2;
      const divX    = emojiOnLeft ? panelW : W - panelW;
      const textX   = emojiOnLeft ? panelW + W * 0.04 : W * 0.04;
      const textMaxW = textPanelW - W * 0.08;  // usa el panel correcto (60% canvas)

      // Emoji grande en el panel correspondiente
      ctx.font = `${Math.round(H * 0.38)}px serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(slide.emoji, emojiCX, H * 0.52);

      // Section title bajo el emoji
      ctx.fillStyle = slide.accentColor;
      ctx.font = `bold ${Math.round(H * 0.048)}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(slide.sectionTitle.toUpperCase().slice(0, 18), emojiCX, H * 0.80);

      // Divisor vertical
      ctx.strokeStyle = `rgba(${ar},${ag},${ab},0.3)`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(divX, H * 0.1); ctx.lineTo(divX, H * 0.92); ctx.stroke();

      // Texto — font adaptativo con shrink suave para homogeneidad
      let fs = Math.round(H * 0.075);
      ctx.font = `bold ${fs}px "Arial", sans-serif`;
      let lines = wrapLines(ctx, slide.subtitle, textMaxW);
      while (lines.length > 4 && fs > Math.round(H * 0.055)) {
        fs = Math.round(fs * 0.93);
        ctx.font = `bold ${fs}px "Arial", sans-serif`;
        lines = wrapLines(ctx, slide.subtitle, textMaxW);
      }
      lines = lines.slice(0, 4);
      const lineH = fs * 1.48;
      const totalH = lines.length * lineH;
      const startY = Math.max(H * 0.11, Math.min((H - totalH) / 2, H * 0.90 - totalH));
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 12;
      lines.forEach((l, i) => ctx.fillText(l, textX, startY + i * lineH));
      ctx.shadowBlur = 0;
    }

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

    case 'pushRight': {
      // Old slide exits right, new comes from left
      if (prevOffscreen) ctx.drawImage(prevOffscreen, W * t, 0);
      drawSlide(ctx, currentSlide, W, H, 1, -W * (1 - t));
      break;
    }

    case 'slideDown': {
      // Old slide exits down, new comes from top
      if (prevOffscreen) ctx.drawImage(prevOffscreen, 0, H * t);
      drawSlide(ctx, currentSlide, W, H, 1, 0, -H * (1 - t));
      break;
    }

    case 'curtain': {
      // Reveal new slide from center outward, like opening curtains
      if (prevOffscreen) ctx.drawImage(prevOffscreen, 0, 0);
      const halfW = (W * t) / 2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(W / 2 - halfW, 0, halfW * 2, H);
      ctx.clip();
      drawSlide(ctx, currentSlide, W, H, 1);
      ctx.restore();
      if (t < 0.98) {
        ctx.strokeStyle = currentSlide.accentColor;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(W / 2 - halfW, 0); ctx.lineTo(W / 2 - halfW, H);
        ctx.moveTo(W / 2 + halfW, 0); ctx.lineTo(W / 2 + halfW, H);
        ctx.stroke();
      }
      break;
    }

    case 'zoomOut': {
      // Current slide shrinks away while new one fades in behind it
      drawSlide(ctx, currentSlide, W, H, 1);
      if (prevOffscreen) {
        ctx.save();
        ctx.globalAlpha = 1 - t;
        const sc = 1 + t * 0.18;
        ctx.translate(W / 2, H / 2);
        ctx.scale(sc, sc);
        ctx.translate(-W / 2, -H / 2);
        ctx.drawImage(prevOffscreen, 0, 0);
        ctx.restore();
      }
      break;
    }

    case 'blinds': {
      // Venetian blinds: new slide revealed through horizontal strips
      if (prevOffscreen) ctx.drawImage(prevOffscreen, 0, 0);
      const strips = 10;
      const stripH = H / strips;
      ctx.save();
      ctx.beginPath();
      for (let i = 0; i < strips; i++) {
        const visH = stripH * t;
        const y = i * stripH + (stripH - visH) / 2;
        ctx.rect(0, y, W, visH);
      }
      ctx.clip();
      drawSlide(ctx, currentSlide, W, H, 1);
      ctx.restore();
      break;
    }

    case 'dissolve': {
      // Pixel-block dissolve: random blocks reveal the new slide
      if (prevOffscreen) ctx.drawImage(prevOffscreen, 0, 0);
      const bs = 30;
      const cols = Math.ceil(W / bs);
      const rows = Math.ceil(H / bs);
      const totalBlocks = cols * rows;
      const revealCount = Math.floor(totalBlocks * t);
      // Deterministic pseudo-random order based on position
      ctx.save();
      ctx.beginPath();
      for (let n = 0; n < revealCount; n++) {
        // Simple LCG-like scramble for deterministic order
        const scrambled = (n * 2654435761) % totalBlocks;
        const col = scrambled % cols;
        const row = Math.floor(scrambled / cols);
        ctx.rect(col * bs, row * bs, bs, bs);
      }
      ctx.clip();
      drawSlide(ctx, currentSlide, W, H, 1);
      ctx.restore();
      break;
    }
  }
}

// ─── Retro effects ───────────────────────────────────────────────────────────

function drawStaticNoise(ctx: CanvasRenderingContext2D, W: number, H: number, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const bs = 6;
  for (let y = 0; y < H; y += bs) {
    for (let x = 0; x < W; x += bs) {
      const v = Math.floor(Math.random() * 256);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(x, y, bs, bs);
    }
  }
  // CRT scanlines over noise
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  for (let y = 0; y < H; y += bs) ctx.fillRect(0, y + Math.floor(bs / 2), W, Math.ceil(bs / 2));
  // Occasional bright horizontal bar
  if (Math.random() < 0.3) {
    const barY = Math.random() * H;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, barY, W, 30 + Math.random() * 60);
  }
  ctx.restore();
}

function applyVintageOverlay(ctx: CanvasRenderingContext2D, W: number, H: number) {
  // Warm sepia tint
  ctx.save();
  ctx.fillStyle = 'rgba(100, 60, 10, 0.07)';
  ctx.fillRect(0, 0, W, H);
  // Vignette
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.50)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
  // Film grain
  for (let i = 0; i < 1200; i++) {
    const gx = Math.random() * W;
    const gy = Math.random() * H;
    const bright = Math.random() > 0.5 ? 220 : 30;
    ctx.fillStyle = `rgba(${bright},${bright},${bright},${0.02 + Math.random() * 0.04})`;
    ctx.fillRect(gx, gy, 1.5, 1.5);
  }
  // CRT scanlines (subtle)
  ctx.fillStyle = 'rgba(0,0,0,0.04)';
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 2);
  ctx.restore();
}

function applyGlitch(ctx: CanvasRenderingContext2D, snapshot: HTMLCanvasElement, W: number, H: number) {
  ctx.save();

  // Horizontal slice displacement (more slices, bigger offsets)
  const numSlices = 4 + Math.floor(Math.random() * 6);
  for (let i = 0; i < numSlices; i++) {
    const sy = Math.random() * H;
    const sh = 2 + Math.random() * 40;
    const dx = (Math.random() - 0.5) * 90;
    ctx.drawImage(snapshot, 0, sy, W, sh, dx, sy, W, sh);
  }

  // RGB channel split — red shifted right, blue shifted left
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.18;
  ctx.drawImage(snapshot, 6 + Math.random() * 10, 0);   // red offset
  ctx.globalAlpha = 0.12;
  ctx.drawImage(snapshot, -(4 + Math.random() * 8), 0); // blue offset

  // Colored horizontal bar bleeds
  ctx.globalCompositeOperation = 'screen';
  const numBars = 1 + Math.floor(Math.random() * 3);
  for (let b = 0; b < numBars; b++) {
    const barColors = ['#FF0033', '#00FFFF', '#FF00FF', '#FFE800'];
    ctx.globalAlpha = 0.06 + Math.random() * 0.10;
    ctx.fillStyle = barColors[Math.floor(Math.random() * barColors.length)];
    const gy = Math.random() * H;
    ctx.fillRect(0, gy, W, 4 + Math.random() * 50);
  }

  // Occasional full-frame color flash
  if (Math.random() < 0.25) {
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.04;
    ctx.fillStyle = Math.random() < 0.5 ? '#00FFFF' : '#FF0033';
    ctx.fillRect(0, 0, W, H);
  }

  ctx.restore();
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

  const [status, setStatus]     = useState<'idle'|'adapting'|'generating'|'done'|'error'>('idle');
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

    // ── Adapt script to storyboard format via AI ──────────────────────────
    setStatus('adapting');
    let scriptForSlides = scriptContent;
    try {
      const sbRes = await fetch('/api/storyboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script: scriptContent, lang }),
      });
      if (sbRes.ok) {
        const sbData = await sbRes.json();
        if (sbData.storyboard?.trim()) scriptForSlides = sbData.storyboard;
      }
    } catch { /* fall back to original script */ }

    const slides = parseScript(scriptForSlides);
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

    // Snapshot canvas for glitch effect
    const snapCanvas = document.createElement('canvas');
    snapCanvas.width = W; snapCanvas.height = H;
    const snapCtx = snapCanvas.getContext('2d')!;

    // Retro timing constants
    const STATIC_DUR = 0.85; // seconds of TV static noise at start/end
    const SFADE      = 0.30; // seconds of fade between static and first/last slide
    const slideOffset = STATIC_DUR + SFADE;

    const slideDur = slides.reduce((s, sl) => s + sl.duration, 0) + slides.length * TRANSITION_DURATION;
    const totalDur = slideOffset + slideDur + SFADE + STATIC_DUR;

    const stream = (canvas as HTMLCanvasElement & { captureStream: (fps: number) => MediaStream }).captureStream(15);
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 80_000 });
    recorderRef.current = recorder;
    const chunks: Blob[] = [];

    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = async () => {
      stream.getTracks().forEach(tr => tr.stop());
      const blob = new Blob(chunks, { type: mimeType });
      setVideoUrl(URL.createObjectURL(blob));
      setStatus('done'); setProgress(100);

      // Save to IndexedDB (local, for immediate re-access)
      try {
        await savePreview({ id: generationId, blob, title: scriptTitle, format: '4x3', createdAt: new Date().toISOString() });
      } catch { /* non-critical */ }

      // Save to DB — binary FormData (no base64 overhead)
      try {
        const form = new FormData();
        form.append('video', blob, 'preview.webm');
        form.append('title', scriptTitle);
        const saveRes = await fetch('/api/video-previews', { method: 'POST', body: form });
        if (!saveRes.ok) {
          const errText = await saveRes.text().catch(() => '');
          console.error('[VideoPreview] save failed', saveRes.status, errText);
        }
      } catch (err) { console.error('[VideoPreview] save error', err); }

      onSaved?.();
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

    let lastGlitch = -999;

    const animate = () => {
      const elapsed   = (performance.now() - startTime) / 1000;
      const slideTime = Math.max(0, elapsed - slideOffset);

      if (elapsed >= totalDur + 0.3) {
        if (recorder.state === 'recording') recorder.stop();
        return;
      }

      setProgress(Math.min(95, Math.round((elapsed / totalDur) * 100)));

      if (elapsed < STATIC_DUR) {
        // ── Intro: TV static noise ──
        drawStaticNoise(ctx, W, H);

      } else if (elapsed < STATIC_DUR + SFADE) {
        // ── Fade-in: noise dissolves into first slide ──
        const fadeT = (elapsed - STATIC_DUR) / SFADE;
        if (timeline.length > 0) {
          drawSlide(ctx, timeline[0].slide, W, H, 1);
          applyVintageOverlay(ctx, W, H);
        }
        drawStaticNoise(ctx, W, H, 1 - fadeT);

      } else if (slideTime >= slideDur && slideTime < slideDur + SFADE) {
        // ── Fade-out: last slide dissolves into noise ──
        const fadeT = (slideTime - slideDur) / SFADE;
        if (timeline.length > 0) {
          drawSlide(ctx, timeline[timeline.length - 1].slide, W, H, 1);
          applyVintageOverlay(ctx, W, H);
        }
        drawStaticNoise(ctx, W, H, fadeT);

      } else if (slideTime >= slideDur + SFADE) {
        // ── Outro: TV static noise ──
        drawStaticNoise(ctx, W, H);

      } else {
        // ── Normal slide rendering ──
        const seg = timeline.find(s => slideTime >= s.startT && slideTime < s.slideEnd);

        if (!seg) {
          ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
        } else if (slideTime < seg.transEnd && seg.slide.index > 0) {
          // Transition phase (skip for first slide — it appears from static intro)
          const tp = (slideTime - seg.startT) / TRANSITION_DURATION;
          renderTransition(ctx, offscRef.current, seg.slide, W, H, Math.min(1, tp));
        } else {
          // Static display phase — draw slide and refresh offscreen
          drawSlide(ctx, seg.slide, W, H);
          offCtx.clearRect(0, 0, W, H);
          offCtx.drawImage(canvas, 0, 0);
        }

        // Vintage overlay on every slide frame
        applyVintageOverlay(ctx, W, H);

        // Random glitch (~2.2% per frame, min 0.4s between glitches)
        if (Math.random() < 0.022 && elapsed - lastGlitch > 0.4) {
          snapCtx.drawImage(canvas, 0, 0);
          applyGlitch(ctx, snapCanvas, W, H);
          lastGlitch = elapsed;
        }
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
              VIDEO TIPS · PRO
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
                left: '11%', top: '16%',
                width: '62%', height: '67%',
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
          {status === 'adapting' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 font-mono-jb text-[10px] text-zinc-500">
                <svg className="animate-spin flex-shrink-0" width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                {t('Adaptando guión a storyboard visual...', 'Adapting script to visual storyboard...')}
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div className="h-full rounded-full animate-pulse" style={{ width: '40%', background: 'linear-gradient(90deg,#FFE800,#FF8A00)' }} />
              </div>
            </div>
          )}

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
            {(status === 'adapting' || status === 'generating') && (
              <button disabled className="btn-offset flex-1 py-3 text-[13px] font-display gap-2 opacity-50 cursor-not-allowed flex items-center justify-center">
                <svg className="animate-spin" width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                {status === 'adapting' ? t('Adaptando...', 'Adapting...') : t('Procesando...', 'Processing...')}
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
