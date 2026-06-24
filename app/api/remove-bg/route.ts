import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Model priority: RMBG-2.0 (best quality) → BiRefNet full (MIT, no gating)
const MODELS = ['briaai/RMBG-2.0', 'ZhengPeng7/BiRefNet'];

async function callHfModel(modelId: string, body: ArrayBuffer, token: string): Promise<ArrayBuffer> {
  const res = await fetch(
    `https://api-inference.huggingface.co/models/${modelId}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
        Accept: 'image/png',
      },
      body,
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HF ${modelId} ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.arrayBuffer();
}

async function applyMaskToImage(original: ArrayBuffer, mask: ArrayBuffer): Promise<ArrayBuffer> {
  const { width, height } = await sharp(Buffer.from(original)).metadata();
  const normalizedMask = await sharp(Buffer.from(mask))
    .grayscale()
    .resize(width!, height!)
    .png()
    .toBuffer();
  const result = await sharp(Buffer.from(original))
    .ensureAlpha()
    .composite([{ input: normalizedMask, blend: 'dest-in' }])
    .png()
    .toBuffer();
  return result.buffer as ArrayBuffer;
}

export async function POST(req: NextRequest) {
  try {
    const token = process.env.HF_TOKEN;
    if (!token) {
      return NextResponse.json({ error: 'HF_TOKEN not configured' }, { status: 500 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

    const original = await file.arrayBuffer();

    let lastError: Error | null = null;
    for (const modelId of MODELS) {
      try {
        const result = await callHfModel(modelId, original, token);
        const meta = await sharp(Buffer.from(result)).metadata();

        let finalPng: ArrayBuffer;
        if (meta.channels === 4) {
          // Model returned RGBA directly (composited)
          const buf = await sharp(Buffer.from(result)).png().toBuffer();
          finalPng = buf.buffer as ArrayBuffer;
        } else {
          // Grayscale mask — compose with original
          finalPng = await applyMaskToImage(original, result);
        }

        return new NextResponse(finalPng, {
          headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' },
        });
      } catch (err) {
        console.error(`[remove-bg] ${modelId} failed:`, err);
        lastError = err as Error;
      }
    }

    return NextResponse.json({ error: lastError?.message ?? 'All models failed' }, { status: 500 });
  } catch (err) {
    console.error('[remove-bg]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
