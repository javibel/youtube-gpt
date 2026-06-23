'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type Konva from 'konva';
import { THUMB_W, THUMB_H, type PhotoItem, type TextItem } from '@/lib/thumbnail-types';

// ─── BiRefNet model cache (loads once per browser session) ───────────────────
let _biRefNetModel: unknown = null;
let _biRefNetProcessor: unknown = null;

async function getOrLoadBiRefNet(onStatus?: (msg: string) => void) {
  if (_biRefNetModel && _biRefNetProcessor) return { model: _biRefNetModel as any, processor: _biRefNetProcessor as any };
  onStatus?.('Descargando modelo IA (~60 MB, solo la primera vez)…');
  const { AutoModel, AutoProcessor, env } = await import('@huggingface/transformers');
  // Disable local model cache lookup — browser always fetches from HF CDN
  (env as any).allowLocalModels = false;
  const modelId = 'onnx-community/BiRefNet_lite';
  const [model, processor] = await Promise.all([
    AutoModel.from_pretrained(modelId, { dtype: 'fp32' }),
    AutoProcessor.from_pretrained(modelId),
  ]);
  _biRefNetModel = model;
  _biRefNetProcessor = processor;
  return { model: model as any, processor: processor as any };
}

/** Remove background using BiRefNet_lite (MIT, commercial-safe, runs client-side). */
async function removeBgBiRefNet(source: File | Blob, onStatus?: (msg: string) => void): Promise<Blob> {
  const { model, processor } = await getOrLoadBiRefNet(onStatus);
  const { RawImage } = await import('@huggingface/transformers');
  onStatus?.('Analizando imagen…');
  const url = URL.createObjectURL(source);
  const image = await RawImage.fromURL(url);
  URL.revokeObjectURL(url);
  const { pixel_values } = await processor(image);
  const rawOutput = await model({ input_image: pixel_values });
  // BiRefNet_lite ONNX output tensor name varies by model version — try common keys
  const maskTensor: any = rawOutput.output_image ?? rawOutput.output ?? rawOutput.pred ?? Object.values(rawOutput)[0];
  if (!maskTensor) throw new Error(`BiRefNet: unexpected output keys: ${Object.keys(rawOutput).join(',')}`);
  // Sigmoid → [0,255] mask at original resolution
  const mask = await RawImage.fromTensor(
    maskTensor[0].sigmoid().mul(255).to('uint8')
  ).resize(image.width, image.height);
  // Apply mask as alpha channel, keep original RGB
  const canvas = document.createElement('canvas');
  canvas.width = image.width; canvas.height = image.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const origBmp = await createImageBitmap(source);
  ctx.drawImage(origBmp, 0, 0);
  origBmp.close();
  const imgData = ctx.getImageData(0, 0, image.width, image.height);
  for (let i = 0; i < image.width * image.height; i++) {
    imgData.data[i * 4 + 3] = mask.data[i];
  }
  ctx.putImageData(imgData, 0, 0);
  return new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(), 'image/png'));
}

/** Fallback: IS-Net fp16 via @imgly/background-removal. */
async function removeBgISNet(source: File | Blob, onStatus?: (msg: string) => void): Promise<Blob> {
  onStatus?.('Cargando modelo de reserva…');
  const { removeBackground } = await import('@imgly/background-removal');
  onStatus?.('Procesando…');
  return removeBackground(source as File, { model: 'isnet_fp16', output: { format: 'image/png' } });
}

// ─── Image processing helpers ─────────────────────────────────────────────────

/**
 * BFS flood-fill from border pixels that match `bgColor` (±tolerance).
 * Replaces detected background with pure green so IS-Net sees maximum contrast.
 * Starting from the border avoids false-positives inside the subject.
 */
async function colorKeyPreprocess(source: Blob | File, bgColor: string, tolerance = 55): Promise<Blob> {
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

  const id = ctx.getImageData(0, 0, W, H);
  const d  = id.data;

  const tr = parseInt(bgColor.slice(1, 3), 16);
  const tg = parseInt(bgColor.slice(3, 5), 16);
  const tb = parseInt(bgColor.slice(5, 7), 16);
  const T2 = tolerance * tolerance;

  const matches = (i: number) => {
    const dr = d[i] - tr, dg = d[i + 1] - tg, db = d[i + 2] - tb;
    return dr * dr + dg * dg + db * db < T2;
  };

  const visited = new Uint8Array(W * H);
  const stack: number[] = [];

  // Seed from all four borders
  for (let x = 0; x < W; x++) {
    const t = x, b = (H - 1) * W + x;
    if (matches(t * 4) && !visited[t]) { visited[t] = 1; stack.push(t); }
    if (matches(b * 4) && !visited[b]) { visited[b] = 1; stack.push(b); }
  }
  for (let y = 1; y < H - 1; y++) {
    const l = y * W, r = y * W + W - 1;
    if (matches(l * 4) && !visited[l]) { visited[l] = 1; stack.push(l); }
    if (matches(r * 4) && !visited[r]) { visited[r] = 1; stack.push(r); }
  }

  // DFS flood-fill
  while (stack.length > 0) {
    const idx = stack.pop()!;
    const x = idx % W, y = Math.floor(idx / W);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      const ni = ny * W + nx;
      if (visited[ni] || !matches(ni * 4)) continue;
      visited[ni] = 1;
      stack.push(ni);
    }
  }

  // Replace background with pure green (#00ff00) → IS-Net sees max contrast
  for (let i = 0; i < W * H; i++) {
    if (!visited[i]) continue;
    d[i * 4]     = 0;
    d[i * 4 + 1] = 255;
    d[i * 4 + 2] = 0;
  }

  ctx.putImageData(id, 0, 0);
  return new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(), 'image/png'));
}

/** 5×5 Gaussian kernel convolution (σ≈1). Returns blurred pixel data. */
function gaussBlur5(src: Uint8ClampedArray, W: number, H: number): Uint8ClampedArray {
  const K = [1,4,6,4,1, 4,16,24,16,4, 6,24,36,24,6, 4,16,24,16,4, 1,4,6,4,1];
  const out = new Uint8ClampedArray(src.length);
  const S = W * 4;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0, tw = 0;
      for (let ky = -2; ky <= 2; ky++) {
        const sy = Math.max(0, Math.min(H - 1, y + ky)) * S;
        for (let kx = -2; kx <= 2; kx++) {
          const sx = Math.max(0, Math.min(W - 1, x + kx)) * 4;
          const k  = K[(ky + 2) * 5 + (kx + 2)];
          r += src[sy + sx]     * k;
          g += src[sy + sx + 1] * k;
          b += src[sy + sx + 2] * k;
          tw += k;
        }
      }
      const i = y * S + x * 4;
      out[i]   = Math.round(r / tw);
      out[i+1] = Math.round(g / tw);
      out[i+2] = Math.round(b / tw);
      out[i+3] = src[i+3];
    }
  }
  return out;
}

/**
 * 5×5 Gaussian unsharp mask (strength 1.5): out = src×2.5 − blurred×1.5.
 * Much more effective than 3×3 — lifts boundary contrast across a wider radius.
 */
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
  const blurred = gaussBlur5(src, W, H);
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    out[i]   = Math.max(0, Math.min(255, Math.round(src[i]   * 2.5 - blurred[i]   * 1.5)));
    out[i+1] = Math.max(0, Math.min(255, Math.round(src[i+1] * 2.5 - blurred[i+1] * 1.5)));
    out[i+2] = Math.max(0, Math.min(255, Math.round(src[i+2] * 2.5 - blurred[i+2] * 1.5)));
    out[i+3] = src[i+3];
  }
  ctx.putImageData(new ImageData(out, W, H), 0, 0);
  return new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(), 'image/png'));
}

/**
 * Transfer IS-Net's alpha onto the ORIGINAL photo so final colours are untouched.
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
    out[i+3] = maskData.data[i+3];
  }
  ctx.putImageData(new ImageData(out, W, H), 0, 0);
  return new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(), 'image/png'));
}

/** 3×3 mean alpha smoothing on boundary pixels (alpha 8-247). */
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
      const a = src[i + 3];
      if (a < 8 || a > 247) continue;
      const avg =
        src[(y-1)*STRIDE+(x-1)*4+3] + src[(y-1)*STRIDE+x*4+3] + src[(y-1)*STRIDE+(x+1)*4+3] +
        src[ y   *STRIDE+(x-1)*4+3] + a                         + src[ y   *STRIDE+(x+1)*4+3] +
        src[(y+1)*STRIDE+(x-1)*4+3] + src[(y+1)*STRIDE+x*4+3] + src[(y+1)*STRIDE+(x+1)*4+3];
      out[i + 3] = Math.round(avg / 9);
    }
  }
  ctx.putImageData(new ImageData(out, W, H), 0, 0);
  return new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(), 'image/png'));
}

/**
 * Fill interior transparent holes: BFS from border transparent pixels marks
 * "real background". Any transparent pixel not reachable from the border is
 * an interior hole (e.g. inside hair or clothing) — set alpha to 255.
 */
async function fillAlphaHoles(blob: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(blob);
  const { width: W, height: H } = bmp;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  bmp.close?.();
  const id  = ctx.getImageData(0, 0, W, H);
  const pix = id.data;

  const alpha = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) alpha[i] = pix[i * 4 + 3];

  const visited = new Uint8Array(W * H);
  const queue: number[] = [];

  const seed = (idx: number) => {
    if (!visited[idx] && alpha[idx] < 128) { visited[idx] = 1; queue.push(idx); }
  };
  for (let x = 0; x < W; x++) { seed(x); seed((H - 1) * W + x); }
  for (let y = 1; y < H - 1; y++) { seed(y * W); seed(y * W + W - 1); }

  let qi = 0;
  while (qi < queue.length) {
    const idx = queue[qi++];
    const x = idx % W, y = (idx / W) | 0;
    if (y > 0)     seed(idx - W);
    if (y < H - 1) seed(idx + W);
    if (x > 0)     seed(idx - 1);
    if (x < W - 1) seed(idx + 1);
  }

  for (let i = 0; i < W * H; i++) {
    if (!visited[i] && alpha[i] < 128) pix[i * 4 + 3] = 255;
  }

  ctx.putImageData(id, 0, 0);
  return new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(), 'image/png'));
}

/**
 * BFS from border pixels that match the background color (sampled from corners).
 * Any pixel the model removed that is NOT reachable from the border as background
 * is part of the subject (skin, clothing, hair) and gets restored.
 * Works regardless of subject color — arm skin, dark shirt, etc.
 */
async function restoreNonBackgroundPixels(masked: Blob, original: File | Blob, tolerance = 35): Promise<Blob> {
  const [maskedBmp, origBmp] = await Promise.all([
    createImageBitmap(masked),
    createImageBitmap(original as Blob),
  ]);
  const W = maskedBmp.width, H = maskedBmp.height;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  ctx.drawImage(origBmp, 0, 0, W, H);
  origBmp.close?.();
  const orig = ctx.getImageData(0, 0, W, H).data;

  // Sample background color from 4 corners of the original
  const corners = [0, (W - 1), (H - 1) * W, (H - 1) * W + (W - 1)];
  let bgR = 0, bgG = 0, bgB = 0;
  for (const c of corners) { bgR += orig[c*4]; bgG += orig[c*4+1]; bgB += orig[c*4+2]; }
  bgR = bgR / 4; bgG = bgG / 4; bgB = bgB / 4;

  const T2 = tolerance * tolerance;
  const isBg = (idx: number) => {
    const dr = orig[idx*4] - bgR, dg = orig[idx*4+1] - bgG, db = orig[idx*4+2] - bgB;
    return dr*dr + dg*dg + db*db < T2;
  };

  // BFS flood-fill from all border pixels that match the background color
  const confirmed = new Uint8Array(W * H);
  const queue: number[] = [];
  const seed = (i: number) => { if (!confirmed[i] && isBg(i)) { confirmed[i] = 1; queue.push(i); } };
  for (let x = 0; x < W; x++) { seed(x); seed((H - 1) * W + x); }
  for (let y = 1; y < H - 1; y++) { seed(y * W); seed(y * W + W - 1); }
  let qi = 0;
  while (qi < queue.length) {
    const i = queue[qi++];
    const x = i % W, y = (i / W) | 0;
    if (y > 0   && !confirmed[i-W] && isBg(i-W)) { confirmed[i-W] = 1; queue.push(i-W); }
    if (y < H-1 && !confirmed[i+W] && isBg(i+W)) { confirmed[i+W] = 1; queue.push(i+W); }
    if (x > 0   && !confirmed[i-1] && isBg(i-1)) { confirmed[i-1] = 1; queue.push(i-1); }
    if (x < W-1 && !confirmed[i+1] && isBg(i+1)) { confirmed[i+1] = 1; queue.push(i+1); }
  }

  // Apply: model removed a pixel that isn't confirmed background → restore it
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(maskedBmp, 0, 0, W, H);
  maskedBmp.close?.();
  const id  = ctx.getImageData(0, 0, W, H);
  const pix = id.data;

  for (let i = 0; i < W * H; i++) {
    if (pix[i*4+3] < 200 && !confirmed[i]) {
      pix[i*4]   = orig[i*4];
      pix[i*4+1] = orig[i*4+1];
      pix[i*4+2] = orig[i*4+2];
      pix[i*4+3] = 255;
    }
  }

  ctx.putImageData(id, 0, 0);
  return new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(), 'image/png'));
}

/**
 * Expand the alpha mask by `radius` pixels (separable max-filter: H then V).
 * Recovers edges that IS-Net eroded without touching RGB values.
 */
async function dilateAlpha(blob: Blob, radius = 3): Promise<Blob> {
  const bmp = await createImageBitmap(blob);
  const { width: W, height: H } = bmp;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  bmp.close?.();
  const id  = ctx.getImageData(0, 0, W, H);
  const pix = id.data;

  const alpha = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) alpha[i] = pix[i * 4 + 3];

  // Horizontal pass
  const hPass = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let max = 0;
      const x0 = Math.max(0, x - radius), x1 = Math.min(W - 1, x + radius);
      for (let nx = x0; nx <= x1; nx++) { const v = alpha[y * W + nx]; if (v > max) max = v; }
      hPass[y * W + x] = max;
    }
  }

  // Vertical pass
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let max = 0;
      const y0 = Math.max(0, y - radius), y1 = Math.min(H - 1, y + radius);
      for (let ny = y0; ny <= y1; ny++) { const v = hPass[ny * W + x]; if (v > max) max = v; }
      pix[(y * W + x) * 4 + 3] = max;
    }
  }

  ctx.putImageData(id, 0, 0);
  return new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(), 'image/png'));
}

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

// Common background colours users shoot against (NOT chroma key — the real background)
const BG_COLORS = [
  { label:'Blanco',   value:'#ffffff' },
  { label:'Gris',     value:'#aaaaaa' },
  { label:'Beige',    value:'#f0e8d8' },
  { label:'Azul',     value:'#4a6fa5' },
  { label:'Verde',    value:'#2d7a2d' },
  { label:'Negro',    value:'#1a1a1a' },
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
      body.append('source', 'upload'); body.append('backgroundFile', file); body.append('lang', lang);
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
  const [photo,         setPhoto]         = useState<PhotoItem | null>(null);
  const [photoOrigFile, setPhotoOrigFile] = useState<File | null>(null);
  const [photoOrigSrc,  setPhotoOrigSrc]  = useState<string | null>(null);
  const [bgRemoved,     setBgRemoved]     = useState(false);
  const [removingBg,    setRemovingBg]    = useState(false);
  const [bgStatus,      setBgStatus]      = useState('');
  const [bgKeyColor,    setBgKeyColor]    = useState('#ffffff'); // user's actual background colour
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
    setPhoto(prev => prev ? { ...prev, src } : { src, x: 0, y: THUMB_H - defH, width: defW, height: defH, opacity: 1 });
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
    let masked: Blob | null = null;
    try {
      // Try BiRefNet_lite first (superior quality)
      masked = await removeBgBiRefNet(photoOrigFile, msg => setBgStatus(msg));
    } catch (biErr) {
      console.error('[BiRefNet] failed, falling back to IS-Net:', biErr);
      try {
        masked = await removeBgISNet(photoOrigFile, msg => setBgStatus(msg));
      } catch (isNetErr) {
        console.error('[ISNet] fallback also failed:', isNetErr);
        const msg = String(biErr instanceof Error ? biErr.message : biErr).slice(0, 80);
        setBgStatus(`Error: ${msg}`);
        setTimeout(() => setBgStatus(''), 6000);
        setRemovingBg(false);
        return;
      }
    }
    try {
      setBgStatus('Refinando bordes…');
      // 1) Restore subject pixels (any color) the model wrongly removed:
      //    BFS from corners finds confirmed background; non-background removed pixels → restore
      const recovered = await restoreNonBackgroundPixels(masked!, photoOrigFile);
      // 2) Dilate to recover eroded edges
      const dilated = await dilateAlpha(recovered, 6);
      // 3) Fill interior holes
      const filled  = await fillAlphaHoles(dilated);
      // 4) Feather
      const refined = await smoothBgMaskEdges(filled);
      setPhoto(p => p ? { ...p, src: URL.createObjectURL(refined) } : p);
      setBgRemoved(true);
    } catch (postErr) {
      console.error('[BgRemoval] post-processing failed:', postErr);
      // Still show the raw result
      setPhoto(p => p ? { ...p, src: URL.createObjectURL(masked!) } : p);
      setBgRemoved(true);
    } finally {
      setRemovingBg(false);
      setBgStatus('');
    }
  };

  const handleRestoreOriginal = () => {
    if (!photoOrigSrc) return;
    setPhoto(p => p ? { ...p, src: photoOrigSrc } : p);
    setBgRemoved(false);
  };

  // Crop confirm
  const handleCropConfirm = async (blob: Blob) => {
    if (!cropTarget) return;
    if (cropTarget.type === 'photo') {
      const src  = URL.createObjectURL(blob);
      const file = new File([blob], 'cropped.png', { type: 'image/png' });
      setPhotoOrigFile(file);
      setPhotoOrigSrc(src);
      setBgRemoved(false);

      // Measure cropped image natural dimensions to preserve aspect ratio on canvas
      const img = new window.Image();
      img.src = src;
      await new Promise<void>(resolve => { img.onload = () => resolve(); img.onerror = () => resolve(); });
      const natW = img.naturalWidth  || 400;
      const natH = img.naturalHeight || 600;
      const ar   = natW / natH;

      setPhoto(prev => {
        if (!prev) {
          const defH = Math.round(THUMB_H * 0.85);
          return { src, x: 0, y: THUMB_H - defH, width: Math.round(defH * ar), height: defH, opacity: 1 };
        }
        // Keep current height, recalculate width from new AR — no deformation
        return { ...prev, src, width: Math.round(prev.height * ar) };
      });
      setSelectedId('photo');
    } else {
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
              onUpdatePhoto={u => setPhoto(prev => prev ? { ...prev, ...u } : prev)}
              onUpdateText={updateText}
              stageRef={stageRef}
            />
          </div>

          {/* CropUI overlay — same dimensions as canvas, no layout shift */}
          {cropTarget && (
            <CropUI
              src={cropTarget.src}
              label={cropTarget.type === 'photo'
                ? tr('Recortar foto', 'Crop photo')
                : tr('Recortar fondo', 'Crop background')}
              cW={containerWidth}
              cH={containerHeight}
              onConfirm={handleCropConfirm}
              onCancel={() => setCropTarget(null)}
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

                {/* Background colour picker (for BFS colour key) */}
                <div className="mt-3">
                  <p className="text-[10px] font-mono-jb mb-1.5 leading-tight" style={{ color: 'var(--yv-text-4)' }}>
                    {tr('Color de tu fondo real', 'Your background colour')}
                  </p>
                  <div className="flex gap-1.5 flex-wrap">
                    {BG_COLORS.map(c => (
                      <button
                        key={c.value}
                        onClick={() => setBgKeyColor(c.value)}
                        title={c.label}
                        style={{
                          width: 22, height: 22, borderRadius: 4,
                          background: c.value,
                          border: bgKeyColor === c.value
                            ? '2px solid #7CFF00'
                            : `2px solid ${c.value === '#ffffff' || c.value === '#f0e8d8' ? 'rgba(255,255,255,0.2)' : 'transparent'}`,
                          boxShadow: bgKeyColor === c.value ? '0 0 0 1px #7CFF00' : 'none',
                          cursor: 'pointer', flexShrink: 0,
                        }}
                      />
                    ))}
                    {/* Custom colour */}
                    <label style={{ position:'relative', cursor:'pointer', flexShrink:0, width:22, height:22 }}>
                      <div style={{
                        width:22, height:22, borderRadius:4,
                        background: BG_COLORS.some(c => c.value === bgKeyColor) ? 'transparent' : bgKeyColor,
                        border: !BG_COLORS.some(c => c.value === bgKeyColor) ? '2px solid #7CFF00' : '2px solid rgba(255,255,255,0.15)',
                        boxShadow: !BG_COLORS.some(c => c.value === bgKeyColor) ? '0 0 0 1px #7CFF00' : 'none',
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize:13, color:'rgba(255,255,255,0.5)',
                      }}>
                        {BG_COLORS.some(c => c.value === bgKeyColor) ? '+' : ''}
                      </div>
                      <input type="color" value={bgKeyColor} onChange={e => setBgKeyColor(e.target.value)}
                        style={{ position:'absolute', inset:0, opacity:0, cursor:'pointer', width:'100%', height:'100%' }} />
                    </label>
                  </div>
                  <p className="text-[9px] mt-1 leading-tight" style={{ color:'var(--yv-text-4)' }}>
                    {tr('La IA reemplazará ese color antes de detectar al sujeto.',
                        'The AI will replace that colour before detecting the subject.')}
                  </p>
                </div>

                {/* Remove / restore */}
                <div className="mt-2.5">
                  {!bgRemoved ? (
                    <button onClick={handleRemoveBg} disabled={removingBg}
                      className="soft-chip w-full py-1.5 text-[11px] disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {removingBg
                        ? <span className="flex items-center justify-center gap-1.5">
                            <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full spin-r" />
                            <span className="truncate max-w-[130px]">{bgStatus || tr('Procesando…', 'Processing…')}</span>
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
                    <span className="text-[11px] font-mono-jb" style={{ color:'var(--yv-text-3)' }}>{tr('Opacidad','Opacity')}</span>
                    <span className="text-[11px] font-mono-jb" style={{ color:'var(--yv-text-2)' }}>{Math.round(photo.opacity * 100)}%</span>
                  </div>
                  <input type="range" min={0} max={1} step={0.05} value={photo.opacity}
                    onChange={e => setPhoto(p => p ? { ...p, opacity: Number(e.target.value) } : p)}
                    className="w-full accent-[#7CFF00]" />
                </div>

                <button
                  className="mt-2 text-[11px] w-full text-center hover:text-white transition"
                  style={{ color:'var(--yv-text-4)' }}
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
                className="text-[12px] text-center py-1.5 rounded"
                style={{ color:'#7CFF00', background:'rgba(124,255,0,0.08)', display:'block' }}>
                {tr('✓ Guardado — abrir imagen', '✓ Saved — open image')}
              </a>
            )}
            {saveErr && <p className="text-[12px]" style={{ color:'#f5a623' }}>{saveErr}</p>}
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
