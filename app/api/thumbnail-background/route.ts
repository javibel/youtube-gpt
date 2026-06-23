import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserPlan, isPaid } from '@/lib/plans';
import { put } from '@vercel/blob';

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return Response.json({ error: 'No autorizado' }, { status: 401 });
    }

    const form = await request.formData();
    const source = (form.get('source') as string) || 'ai';
    const lang   = (form.get('lang')   as string) || 'en';
    const isEn   = lang === 'en';

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    if (!user) return Response.json({ error: 'Usuario no encontrado' }, { status: 404 });

    const plan = await getUserPlan(user.id);
    if (!isPaid(plan)) {
      return Response.json(
        { error: isEn ? 'Pro plan required' : 'Se requiere plan Pro', limitReached: true },
        { status: 403 },
      );
    }

    /* ── User-uploaded background ── */
    if (source === 'upload') {
      const bgFile = form.get('backgroundFile') as File | null;
      if (!bgFile || bgFile.size === 0) {
        return Response.json({ error: isEn ? 'No file provided' : 'Sin archivo' }, { status: 400 });
      }
      if (bgFile.size > 15 * 1024 * 1024) {
        return Response.json({ error: isEn ? 'File must be under 15 MB' : 'Máx 15 MB' }, { status: 400 });
      }
      const ext      = bgFile.type.includes('png') ? 'png' : bgFile.type.includes('webp') ? 'webp' : 'jpg';
      const buffer   = Buffer.from(await bgFile.arrayBuffer());
      const filename = `thumbnails/bg/${user.id}/${Date.now()}.${ext}`;
      const blob     = await put(filename, buffer, { access: 'public', contentType: bgFile.type });
      return Response.json({ backgroundUrl: blob.url, prompt: null });
    }

    /* ── AI generation ── */
    const tema   = (form.get('tema')   as string)?.trim();
    const estilo = (form.get('estilo') as string)?.trim() || 'viral';

    if (!tema || tema.length < 3) {
      return Response.json(
        { error: isEn ? 'Describe your video topic (min 3 chars)' : 'Describe el tema (mín 3 caracteres)' },
        { status: 400 },
      );
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
    const ideogramKey  = (process.env.IDEOGRAM_API_KEY || process.env.ideogram)?.trim();
    if (!anthropicKey || !ideogramKey) {
      return Response.json({ error: 'Servicio no disponible' }, { status: 503 });
    }

    // Rate limit: max 5 background generations per minute
    const rlKey = `gen-thumb-bg:${user.id}`;
    const rlResult = await prisma.$queryRaw<{ hits: number }[]>`
      INSERT INTO rate_limits (key, hits, window_start)
      VALUES (${rlKey}, 1, NOW())
      ON CONFLICT (key) DO UPDATE
      SET
        hits = CASE
          WHEN rate_limits.window_start < NOW() - INTERVAL '1 minute' THEN 1
          ELSE rate_limits.hits + 1
        END,
        window_start = CASE
          WHEN rate_limits.window_start < NOW() - INTERVAL '1 minute' THEN NOW()
          ELSE rate_limits.window_start
        END
      RETURNING hits
    `;
    if (Number(rlResult[0].hits) > 5) {
      return Response.json(
        { error: isEn ? 'Too many requests — wait a moment' : 'Demasiadas solicitudes — espera un momento' },
        { status: 429 },
      );
    }

    // Claude generates Ideogram prompt
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        messages: [{
          role: 'user',
          content: `Generate an Ideogram v3 image prompt for a YouTube thumbnail background.
VIDEO TOPIC: ${tema}
VISUAL STYLE: ${estilo}

Rules:
- NO text in the image (will be added as overlay later)
- NO people, faces or characters (user's photo will be composited later)
- Bold, high-contrast colors optimised for YouTube thumbnails
- 16:9 ratio, 1312×736 px
- Professional cinematic look, dramatic lighting

Respond with ONLY the image generation prompt in English.`,
        }],
      }),
    });

    if (!claudeRes.ok) {
      return Response.json({ error: isEn ? 'Error generating prompt' : 'Error generando prompt' }, { status: 500 });
    }
    const claudeData  = await claudeRes.json();
    const imagePrompt = claudeData.content[0].text.trim();

    // Ideogram v3 TURBO
    const ideogramForm = new FormData();
    ideogramForm.append('prompt', imagePrompt);
    ideogramForm.append('resolution', '1312x736');
    ideogramForm.append('rendering_speed', 'TURBO');
    ideogramForm.append('magic_prompt', 'ON');
    ideogramForm.append('style_type', 'REALISTIC');

    const ideogramRes  = await fetch('https://api.ideogram.ai/v1/ideogram-v3/generate', {
      method: 'POST',
      headers: { 'Api-Key': ideogramKey },
      body: ideogramForm,
    });

    if (!ideogramRes.ok) {
      const body = await ideogramRes.text();
      console.error('[thumbnail-background] Ideogram error:', ideogramRes.status, body.slice(0, 300));
      return Response.json({ error: isEn ? 'Error generating image' : 'Error generando imagen' }, { status: 500 });
    }

    const ideogramData = await ideogramRes.json();
    const imageUrl     = ideogramData.data?.[0]?.url;
    if (!imageUrl) {
      return Response.json({ error: isEn ? 'No image generated' : 'No se generó imagen' }, { status: 500 });
    }

    // Download and re-host on Vercel Blob for CORS-safe canvas access
    const bgRes    = await fetch(imageUrl);
    const bgBuffer = Buffer.from(await bgRes.arrayBuffer());
    const filename = `thumbnails/bg/${user.id}/${Date.now()}.jpg`;
    const blob     = await put(filename, bgBuffer, { access: 'public', contentType: 'image/jpeg' });

    return Response.json({ backgroundUrl: blob.url, prompt: imagePrompt });
  } catch (error) {
    console.error('[thumbnail-background] Error:', error);
    return Response.json({ error: 'Error al procesar la solicitud' }, { status: 500 });
  }
}
