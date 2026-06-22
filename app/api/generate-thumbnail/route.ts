import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserPlan, getLimits, isPaid } from '@/lib/plans';
import { put } from '@vercel/blob';
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const sharp: any = require('sharp');

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

    const form = await request.formData();
    const tema = (form.get('tema') as string)?.trim();
    const estilo = (form.get('estilo') as string)?.trim() || 'viral';
    const lang = (form.get('lang') as string) || 'en';
    const facePosition = (form.get('facePosition') as string) || 'right';
    const facePhotoFile = form.get('facePhoto') as File | null;
    const isEn = lang === 'en';

    if (!tema || tema.length < 3) {
      return Response.json(
        { error: isEn
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
        { error: isEn
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
        { error: isEn
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

    // Validate face photo if provided
    let facePhotoBuffer: Buffer | null = null;
    if (facePhotoFile && facePhotoFile.size > 0) {
      if (facePhotoFile.size > 5 * 1024 * 1024) {
        return Response.json(
          { error: isEn ? 'Photo must be under 5MB' : 'La foto no puede superar 5MB' },
          { status: 400 }
        );
      }
      facePhotoBuffer = Buffer.from(await facePhotoFile.arrayBuffer());
    }

    const hasFace = !!facePhotoBuffer;
    const faceOnLeft = facePosition === 'left';

    // Step 1: Claude generates an optimized image prompt for Ideogram
    const compositionInstruction = hasFace
      ? `CRITICAL COMPOSITION RULE (NON-NEGOTIABLE): A real person's photo will be composited on the ${faceOnLeft ? 'LEFT' : 'RIGHT'} side of the thumbnail and will cover roughly the ${faceOnLeft ? 'left 42%' : 'right 42%'} of the image, full height. ANYTHING drawn in that zone gets hidden behind the person and is wasted.

MANDATORY:
- The ${faceOnLeft ? 'LEFT 42%' : 'RIGHT 42%'} of the image is a RESERVED KEEP-OUT ZONE for the person. Put NOTHING important there: no text, no faces, no characters, no logos, no key objects, no focal points. Only background texture (gradients, lighting, subtle patterns) that complements a person standing there.
- ALL text (max 3-5 bold words), key visual elements, and the main focal point MUST go on the ${faceOnLeft ? 'RIGHT ~58%' : 'LEFT ~58%'} of the image.
- DO NOT generate any people, characters, or faces anywhere in the image — the real person is added later.
- The keep-out zone must still look intentional (dramatic lighting/gradient), never flat or empty.`
      : `The thumbnail should have a clear focal point and bold visual elements distributed across the image.
You may include stylized silhouettes or abstract human forms if relevant, but avoid photorealistic faces.`;

    const claudePrompt = `You are an expert YouTube thumbnail designer. Generate a detailed image generation prompt for creating a professional, click-worthy YouTube thumbnail background.

VIDEO TOPIC: ${tema}
VISUAL STYLE: ${estilo}

${compositionInstruction}

Create a prompt that describes:
- Background scene, environment, or abstract design that fits the topic
- Color palette and lighting (high contrast, vibrant, cinematic)
- Any text overlay to include (max 3-5 bold words) — position on the ${hasFace ? (faceOnLeft ? 'right side' : 'left side') : 'image'}
- Mood and emotion that drives clicks
- Style should look professional, not AI-generated

Rules:
- Use bold, contrasting colors
- Optimize for small display size (mobile)
- Be SPECIFIC to the video topic
- The image must work as a YouTube thumbnail (16:9 ratio, 1312x736px)

Respond with ONLY the image generation prompt, nothing else. Write in English.`;

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

    // Step 2: Call Ideogram v3 TURBO
    const ideogramForm = new FormData();
    ideogramForm.append('prompt', imagePrompt);
    ideogramForm.append('resolution', '1312x736');
    ideogramForm.append('rendering_speed', 'TURBO');
    ideogramForm.append('magic_prompt', 'ON');
    ideogramForm.append('style_type', 'REALISTIC');

    const ideogramRes = await fetch('https://api.ideogram.ai/v1/ideogram-v3/generate', {
      method: 'POST',
      headers: { 'Api-Key': ideogramKey },
      body: ideogramForm,
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

    // Step 3: Download background and optionally composite with face photo
    const bgRes = await fetch(imageUrl);
    if (!bgRes.ok) {
      return Response.json(
        { error: isEn ? 'Error downloading generated image' : 'Error descargando imagen generada' },
        { status: 500 }
      );
    }
    let finalBuffer: Buffer = Buffer.from(await bgRes.arrayBuffer());

    if (facePhotoBuffer) {
      finalBuffer = Buffer.from(await compositeFaceOnBackground(finalBuffer, facePhotoBuffer, faceOnLeft));
    }

    // Step 4: Upload to Vercel Blob
    let permanentUrl = imageUrl;
    try {
      const filename = `thumbnails/${user.id}/${Date.now()}.png`;
      const blob = await put(filename, finalBuffer, {
        access: 'public',
        contentType: 'image/png',
      });
      permanentUrl = blob.url;
    } catch (blobErr) {
      console.error('[generate-thumbnail] Blob upload failed:', blobErr instanceof Error ? blobErr.message : blobErr);
    }

    // Save generation
    const ip = getIp(request);
    await prisma.generation.create({
      data: {
        userId: user.id,
        template: 'thumbnail',
        inputs: { tema, estilo, imagePrompt, hasFace, facePosition },
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

/**
 * Composite a face photo onto a background image.
 * - Resizes face to ~45% of background height, anchored to bottom
 * - Positions on left or right side
 * - Adds subtle drop shadow for depth
 */
async function compositeFaceOnBackground(
  bgBuffer: Buffer,
  faceBuffer: Buffer,
  faceOnLeft: boolean,
): Promise<Buffer> {
  const BG_W = 1312;
  const BG_H = 736;

  // Ensure background is exactly 1312x736
  const bg = sharp(bgBuffer).resize(BG_W, BG_H, { fit: 'cover' });

  // Process face: fit inside a bounded box so it never dominates the thumbnail
  // or spills into the text zone. Claude's composition prompt keeps text on the
  // opposite side, so the face stays on its clean side. ~40% width × ~58% height.
  const maxFaceW = Math.round(BG_W * 0.40);
  const maxFaceH = Math.round(BG_H * 0.58);
  const resizedFace = await sharp(faceBuffer)
    .resize(maxFaceW, maxFaceH, { fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .png()
    .toBuffer();

  const faceMeta = await sharp(resizedFace).metadata();
  const faceW = faceMeta.width || maxFaceW;
  const faceH = faceMeta.height || maxFaceH;

  // Position: anchored to bottom on the chosen side, small insets so it doesn't
  // touch the edges or cross the centerline into the text zone.
  const sideMargin = Math.round(BG_W * 0.03);
  const bottomInset = Math.round(BG_H * 0.02);
  const left = faceOnLeft ? sideMargin : BG_W - faceW - sideMargin;
  const top = BG_H - faceH - bottomInset;

  // Create shadow layer (slightly offset, blurred)
  const shadowOffset = 4;
  const shadowBuffer = await sharp(resizedFace)
    .modulate({ brightness: 0 }) // make fully black
    .blur(12)
    .ensureAlpha(0.35) // semi-transparent
    .toBuffer();

  // Composite: shadow first, then face
  const composites = [
    {
      input: shadowBuffer,
      left: left + shadowOffset,
      top: top + shadowOffset,
      blend: 'over' as const,
    },
    {
      input: resizedFace,
      left,
      top,
      blend: 'over' as const,
    },
  ];

  return bg
    .composite(composites)
    .png({ quality: 90 })
    .toBuffer();
}
