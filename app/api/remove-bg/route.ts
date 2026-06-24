import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

export const runtime = 'nodejs';
export const maxDuration = 60;

const GRADIO_SPACE = 'https://not-lain-background-removal.hf.space';

async function removeBgViaGradio(imageBuffer: ArrayBuffer, mimeType: string): Promise<ArrayBuffer> {
  const blob = new Blob([imageBuffer], { type: mimeType });
  const formData = new FormData();
  formData.append('files', blob, 'image.png');

  const uploadRes = await fetch(`${GRADIO_SPACE}/gradio_api/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!uploadRes.ok) throw new Error(`Gradio upload failed: ${uploadRes.status}`);
  const uploadedPaths: string[] = await uploadRes.json();
  const filePath = uploadedPaths[0];

  const callRes = await fetch(`${GRADIO_SPACE}/gradio_api/call/image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: [{ path: filePath, orig_name: 'image.png', mime_type: mimeType }],
    }),
  });
  if (!callRes.ok) throw new Error(`Gradio call failed: ${callRes.status}`);
  const { event_id } = await callRes.json();

  // Poll for result (max 50s)
  for (let i = 0; i < 25; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const pollRes = await fetch(`${GRADIO_SPACE}/gradio_api/call/image/${event_id}`);
    const text = await pollRes.text();

    if (text.includes('event: error')) throw new Error('Gradio processing error');
    if (!text.includes('event: complete')) continue;

    const dataLine = text.split('\n').find(l => l.startsWith('data:'));
    if (!dataLine) throw new Error('No data in Gradio response');
    const results = JSON.parse(dataLine.slice(5));
    const resultUrl = results[0][0]?.url;
    if (!resultUrl) throw new Error('No result URL from Gradio');

    const imgRes = await fetch(resultUrl);
    if (!imgRes.ok) throw new Error(`Failed to fetch result image: ${imgRes.status}`);
    return imgRes.arrayBuffer();
  }
  throw new Error('Gradio timeout');
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

    const original = await file.arrayBuffer();
    const mimeType = file.type || 'image/png';

    const resultPng = await removeBgViaGradio(original, mimeType);

    // Ensure output is valid PNG
    const buf = await sharp(Buffer.from(resultPng)).png().toBuffer();

    return new NextResponse(buf.buffer as ArrayBuffer, {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('[remove-bg]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
