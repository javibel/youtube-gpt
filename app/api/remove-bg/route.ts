import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.REMOVE_BG_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'REMOVE_BG_API_KEY not configured' }, { status: 500 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

    const outForm = new FormData();
    outForm.append('image_file', file, 'image.png');
    outForm.append('size', 'auto');

    const res = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey },
      body: outForm,
    });

    if (!res.ok) {
      const err = await res.text().catch(() => String(res.status));
      return NextResponse.json({ error: `remove.bg: ${err.slice(0, 150)}` }, { status: 500 });
    }

    const png = await res.arrayBuffer();
    return new NextResponse(png, {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('[remove-bg]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
