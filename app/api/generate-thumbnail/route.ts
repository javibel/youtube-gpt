import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserPlan, getLimits, isPaid } from '@/lib/plans';
import { put } from '@vercel/blob';

export const maxDuration = 60;

function getIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip');
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return Response.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { tema, estilo, lang } = await request.json();

    if (!tema || typeof tema !== 'string' || tema.trim().length < 3) {
      return Response.json(
        { error: lang === 'en'
          ? 'Please describe your video topic (at least 3 characters)'
          : 'Describe el tema de tu vídeo (mínimo 3 caracteres)' },
        { status: 400 }
      );
    }

    // Auth + plan check
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    if (!user) {
      return Response.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    const plan = await getUserPlan(user.id);
    const isPro = isPaid(plan);

    if (!isPro) {
      return Response.json(
        { error: lang === 'en'
          ? 'AI Thumbnails are available on Pro and Business plans'
          : 'Las miniaturas con IA están disponibles en los planes Pro y Business',
          limitReached: true },
        { status: 403 }
      );
    }

    const limit = getLimits(plan).generationsPerMonth;

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const usedThisMonth = await prisma.generation.count({
      where: { userId: user.id, createdAt: { gte: startOfMonth } },
    });

    if (usedThisMonth >= limit) {
      return Response.json(
        { error: isPro ? 'Límite del plan Pro alcanzado' : 'Límite del plan gratuito alcanzado', limitReached: true },
        { status: 429 }
      );
    }

    // Rate limit: max 3 thumbnail generations per minute
    const rlKey = `gen-thumb:${user.id}`;
    const rlResult = await prisma.$queryRaw<{ hits: number }[]>`
      INSERT INTO rate_limits (key, hits, window_start)
      VALUES (${rlKey}, 1, NOW())
      ON CONFLICT (key) DO UPDATE
      SET
        hits = CASE
          WHEN rate_limits.window_start < NOW() - INTERVAL '1 minute'
          THEN 1
          ELSE rate_limits.hits + 1
        END,
        window_start = CASE
          WHEN rate_limits.window_start < NOW() - INTERVAL '1 minute'
          THEN NOW()
          ELSE rate_limits.window_start
        END
      RETURNING hits
    `;
    if (Number(rlResult[0].hits) > 3) {
      return Response.json(
        { error: lang === 'en'
          ? 'Too many requests. Wait a moment before trying again.'
          : 'Demasiadas solicitudes. Espera un momento antes de continuar.' },
        { status: 429 }
      );
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
    const ideogramKey = (process.env.IDEOGRAM_API_KEY || process.env.ideogram)?.trim();

    if (!anthropicKey || !ideogramKey) {
      return Response.json({ error: 'Servicio no disponible temporalmente' }, { status: 503 });
    }

    // Step 1: Claude generates an optimized image prompt for Ideogram
    const isEn = lang === 'en';
    const claudePrompt = `You are an expert YouTube thumbnail designer. Generate a detailed image generation prompt for creating a professional, click-worthy YouTube thumbnail.

VIDEO TOPIC: ${tema.trim()}
VISUAL STYLE: ${(estilo || 'viral').trim()}

Create a prompt that will generate a stunning YouTube thumbnail image. The prompt should describe:
- The main visual elements (objects, people, scenes)
- Color palette and lighting (high contrast, vibrant)
- Composition (rule of thirds, focal point)
- Mood and emotion that drives clicks
- Any text overlay to include (max 3-5 bold words)

Rules:
- The thumbnail must look professional, not AI-generated
- Use bold, contrasting colors
- Include clear focal points
- Text should be minimal but impactful
- Optimize for small display size (mobile)
- DO NOT describe generic stock-photo scenes
- Be SPECIFIC to the video topic

Respond with ONLY the image generation prompt, nothing else. Write the prompt in English regardless of input language.`;

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
        messages: [{ role: 'user', content: claudePrompt }],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.json();
      console.error('[generate-thumbnail] Claude error:', err);
      return Response.json(
        { error: isEn ? 'Error generating image prompt' : 'Error generando prompt de imagen' },
        { status: 500 }
      );
    }

    const claudeData = await claudeRes.json();
    const imagePrompt = claudeData.content[0].text.trim();

    // Step 2: Call Ideogram v3 TURBO (~9s vs ~50s for v4)
    const formData = new FormData();
    formData.append('prompt', imagePrompt);
    formData.append('resolution', '1312x736');
    formData.append('rendering_speed', 'TURBO');
    formData.append('magic_prompt', 'ON');
    formData.append('style_type', 'REALISTIC');

    const ideogramRes = await fetch('https://api.ideogram.ai/v1/ideogram-v3/generate', {
      method: 'POST',
      headers: { 'Api-Key': ideogramKey },
      body: formData,
    });

    const ideogramBody = await ideogramRes.text();
    if (!ideogramRes.ok) {
      console.error('[generate-thumbnail] Ideogram error:', ideogramRes.status, ideogramBody.slice(0, 500));
      return Response.json(
        { error: isEn ? 'Error generating thumbnail image' : 'Error generando imagen de miniatura' },
        { status: 500 }
      );
    }

    let ideogramData;
    try {
      ideogramData = JSON.parse(ideogramBody);
    } catch {
      console.error('[generate-thumbnail] Ideogram non-JSON response:', ideogramBody.slice(0, 500));
      return Response.json(
        { error: isEn ? 'Error generating thumbnail image' : 'Error generando imagen de miniatura' },
        { status: 500 }
      );
    }

    const imageUrl = ideogramData.data?.[0]?.url;

    if (!imageUrl) {
      console.error('[generate-thumbnail] No image URL in response:', ideogramData);
      return Response.json(
        { error: isEn ? 'No image was generated' : 'No se generó ninguna imagen' },
        { status: 500 }
      );
    }

    // Download from Ideogram and upload to Vercel Blob for permanent storage
    let permanentUrl = imageUrl; // fallback to ephemeral URL
    try {
      const imgRes = await fetch(imageUrl);
      if (imgRes.ok) {
        const imgBuffer = await imgRes.arrayBuffer();
        const filename = `thumbnails/${user.id}/${Date.now()}.png`;
        const blob = await put(filename, imgBuffer, {
          access: 'public',
          contentType: 'image/png',
        });
        permanentUrl = blob.url;
      }
    } catch (blobErr) {
      console.error('[generate-thumbnail] Blob upload failed, using ephemeral URL:', blobErr instanceof Error ? blobErr.message : blobErr);
    }

    // Save generation
    const ip = getIp(request);
    await prisma.generation.create({
      data: {
        userId: user.id,
        template: 'thumbnail',
        inputs: { tema, estilo, imagePrompt },
        output: permanentUrl,
        tokensUsed: claudeData.usage?.output_tokens ?? 0,
        ipAddress: ip,
      },
    });

    return Response.json({
      imageUrl: permanentUrl,
      prompt: imagePrompt,
    });
  } catch (error) {
    console.error('[generate-thumbnail] Error:', error);
    return Response.json({ error: 'Error al procesar la solicitud' }, { status: 500 });
  }
}
