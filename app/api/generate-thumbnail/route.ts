import { getMessagesTask } from '@/lib/ai/task-runtime';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserPlan, getLimits, isPaid } from '@/lib/plans';
import { put } from '@vercel/blob';
import { rateLimitDb } from '@/lib/rate-limit-db';
import { backgroundImageAvailable, generateBackgroundImage } from '@/lib/image/background-image-provider';
import sharp from 'sharp';
import { keyedLegacyThumbnail, type ThumbnailResult } from '@/lib/image/legacy-thumbnail-attempt';

export const maxDuration = 60;

// A local deadline does not cancel late storage/history writes or authorize recovery.
async function bounded<T>(work:()=>Promise<T>, signal:AbortSignal):Promise<T> {
  if(signal.aborted)throw Error('Unconfirmed');
  let rejectWait:(error:Error)=>void=()=>{};
  const interrupted=new Promise<never>((_,reject)=>{rejectWait=reject;});
  const stop=()=>rejectWait(Error('Unconfirmed'));
  signal.addEventListener('abort',stop,{once:true});const timer=setTimeout(stop,15_000);
  try {const value=await Promise.race([work(),interrupted]);if(signal.aborted)throw Error('Unconfirmed');return value;}
  finally {clearTimeout(timer);signal.removeEventListener('abort',stop);}
}
const decode=(bytes:Buffer)=>sharp(bytes,{limitInputPixels:40_000_000});
function getIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip');
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id || !session.user.email) {
      return Response.json({ error: 'No autorizado' }, { status: 401 });
    }

    let form:FormData;
    try {form=await request.formData();}catch{return Response.json({error:'invalid_input'},{status:400});}
    if (['tema', 'estilo', 'lang', 'facePosition', 'thumbnailText', 'faceScale'].some(key => form.has(key) && typeof form.get(key) !== 'string') || typeof form.get('facePhoto') === 'string') {
      return Response.json({ error: 'invalid_input' }, { status: 400 });
    }
    const tema = (form.get('tema') as string)?.trim();
    const estilo = (form.get('estilo') as string)?.trim() || 'viral';
    const lang = (form.get('lang') as string) || 'en';
    const facePosition = (form.get('facePosition') as string) || 'right';
    const facePhotoFile = form.get('facePhoto') as File | null;
    const customText = ((form.get('thumbnailText') as string) || '').trim();
    const scale=(form.get('faceScale') as string)||'80';
    const faceScalePct=Number(scale);
    if(!['en','es'].includes(lang)||!['viral','cinematic','minimal','bold'].includes(estilo)||!['left','right'].includes(facePosition)||customText.length>60||!/^\d+$/.test(scale)||!Number.isInteger(faceScalePct)||faceScalePct<40||faceScalePct>100)return Response.json({error:'invalid_input'},{status:400});
    if(facePhotoFile&&(!facePhotoFile.size||facePhotoFile.size>5*1024*1024||!['image/png','image/jpeg','image/webp'].includes(facePhotoFile.type)))return Response.json({error:'invalid_input'},{status:400});
    const isEn = lang === 'en';

    if (!tema || tema.length < 3 || tema.length > 500) {
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

    if(user.id!==session.user.id)return Response.json({error:'No autorizado'},{status:401});
    const key=request.headers.get('Idempotency-Key');
    if(key!==null&&!/^[A-Za-z0-9_-]{1,128}$/.test(key))return Response.json({error:'invalid_operation_key'},{status:400});
    let facePhotoBuffer:Buffer|null=null;
    if(facePhotoFile)facePhotoBuffer=Buffer.from(await bounded(()=>facePhotoFile.arrayBuffer(),request.signal));
    const prepare=async():Promise<Response|(()=>Promise<ThumbnailResult>)>=>{
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

    if(!backgroundImageAvailable())return Response.json({error:'Servicio no disponible',code:'image_service_unavailable',retryMayConsume:false},{status:503});
    if(facePhotoFile){
      try{
        const meta=await bounded(()=>decode(facePhotoBuffer!).metadata(),request.signal);
        if(!meta.width||!meta.height||meta.width>16384||meta.height>16384||meta.width*meta.height>40_000_000||!meta.format||!['png','jpeg','webp'].includes(meta.format))throw Error('Invalid photo');
      }catch{return Response.json({error:'invalid_photo'},{status:400});}
    }
    if(request.signal.aborted)throw Error('Unconfirmed');
    if(!key&&!await rateLimitDb('gen-thumb:'+user.id,3,1,true))return Response.json({error:'Solicitud no admitida'},{status:429});

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

    const textDirective = customText
      ? `TEXT OVERLAY: DO NOT render any text in this image — the user's text will be added as a separate overlay on top by us. Generate only the background/scene. Keep ${hasFace ? `the ${faceOnLeft ? 'right' : 'left'} side (where the overlay will sit)` : 'the central area'} relatively uncluttered so the text reads clearly.`
      : `TEXT OVERLAY: Choose a short, punchy text overlay (max 3-5 bold words) relevant to the topic, positioned ${hasFace ? `on the ${faceOnLeft ? 'right' : 'left'} side (away from the person zone)` : 'on the image'}, large, bold, high-contrast.`;

    const claudePrompt = `You are an expert YouTube thumbnail designer. Generate a detailed image generation prompt for creating a professional, click-worthy YouTube thumbnail background.

VIDEO TOPIC: ${tema}
VISUAL STYLE: ${estilo}

${compositionInstruction}

${textDirective}

Create a prompt that describes:
- Background scene, environment, or abstract design that fits the topic
- Color palette and lighting (high contrast, vibrant, cinematic)
- Mood and emotion that drives clicks
- Style should look professional, not AI-generated

Rules:
- Use bold, contrasting colors
- Optimize for small display size (mobile)
- Be SPECIFIC to the video topic
- The image must work as a YouTube thumbnail (16:9 ratio, 1312x736px)

Respond with ONLY the image generation prompt, nothing else. Write in English.`;

    let task;
    try {
      task = await getMessagesTask({ userId: user.id, taskType: 'thumbnail.image-prompt', language: 'en', instructionsVersion: 'thumbnail-image-prompt-v1' });
    } catch {
      return Response.json({ error: 'Servicio no disponible temporalmente' }, { status: 503 });
    }
    return async()=>{
    if(request.signal.aborted)throw Error('Unconfirmed');
    const promptResult = await task.create({ max_tokens: 400, messages: [{ role: 'user', content: claudePrompt }] });
    const imagePrompt=promptResult.content?.[0]?.text?.trim();
    if(typeof imagePrompt!=='string'||!imagePrompt||imagePrompt.length>4000||promptResult.incomplete===true||request.signal.aborted)throw Error('Unconfirmed');
    const image=await generateBackgroundImage(imagePrompt,request.signal);
    // Always normalize to PNG; raw JPEG/WebP must not be labelled or stored as PNG.
    let finalBuffer:Buffer=Buffer.from(await bounded(()=>decode(Buffer.from(image.bytes)).resize(1312,736,{fit:'cover'}).png().toBuffer(),request.signal));

    if (facePhotoBuffer) {
      finalBuffer = Buffer.from(await bounded(()=>compositeFaceOnBackground(finalBuffer, facePhotoBuffer!, faceOnLeft, faceScalePct),request.signal));
    }

    // User-supplied text: render as a bold overlay ON TOP of everything (above the
    // face too), on the opposite side from the face so it never gets covered and
    // never covers the person. Ideogram is told NOT to draw text in this case.
    if (customText) {
      finalBuffer = Buffer.from(await bounded(()=>overlayText(finalBuffer, customText, faceOnLeft, hasFace),request.signal));
    }

    if(!finalBuffer.length||finalBuffer.length>15*1024*1024||!finalBuffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('Unconfirmed');
    const blob=await bounded(()=>put('thumbnails/'+user.id+'/'+Date.now()+'.png',finalBuffer,{access:'public',contentType:'image/png'}),request.signal);
    if(typeof blob?.url!=='string'||blob.url.length>4096)throw Error('Unconfirmed');
    const stored=new URL(blob.url);if(stored.protocol!=='https:'||stored.username||stored.password||stored.hash)throw Error('Unconfirmed');
    const permanentUrl=blob.url;

    return {imageUrl:permanentUrl,prompt:imagePrompt,inputs:{tema,estilo,imagePrompt,hasFace,facePosition,faceScalePct,customText},tokensUsed:promptResult.usage?.output_tokens??0,ipAddress:getIp(request)};
    };
    };
    if(key)return await keyedLegacyThumbnail(user.id,key,[tema,estilo,lang,facePosition,faceScalePct,customText],facePhotoBuffer?{type:facePhotoFile!.type,bytes:facePhotoBuffer}:null,request.signal,prepare);
    const generate=await prepare();if(generate instanceof Response)return generate;
    const result=await generate();
    await bounded(()=>prisma.generation.create({data:{userId:user.id,template:'thumbnail',inputs:result.inputs,output:result.imageUrl,tokensUsed:result.tokensUsed,ipAddress:result.ipAddress}}),request.signal);
    return Response.json({imageUrl:result.imageUrl,prompt:result.prompt},{headers:{'Cache-Control':'no-store'}});
  } catch {
    return Response.json({error:'Miniatura sin confirmar. Repetir puede consumir de nuevo.',code:'image_result_unconfirmed',retryMayConsume:true},{status:503});
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
  faceScalePct: number = 80,
): Promise<Buffer> {
  const BG_W = 1312;
  const BG_H = 736;

  // Ensure background is exactly 1312x736
  const bg = decode(bgBuffer).resize(BG_W, BG_H, { fit: 'cover' });

  // Trim the transparent padding around the bg-removed cutout so the person is
  // tight in its bounding box (otherwise it floats in the middle of the reserved
  // zone). Only trim when the image has an alpha channel (bg-removed PNG); a raw
  // uploaded photo (fallback path) is an opaque rectangle and must NOT be trimmed.
  let faceSrc = faceBuffer;
  const srcMeta = await decode(faceBuffer).metadata();
  if (srcMeta.hasAlpha) {
    try {
      const trimmed = await decode(faceBuffer).trim({ threshold: 2 }).png().toBuffer();
      const tMeta = await decode(trimmed).metadata();
      if ((tMeta.width || 0) > 10 && (tMeta.height || 0) > 10) faceSrc = trimmed;
    } catch {
      /* trim failed — keep original */
    }
  }

  // Dilate the alpha channel to recover edges eroded by client-side background
  // removal (e.g. an arm or finger silhouette that got clipped). We blur the
  // alpha mask outward, threshold to a new binary boundary, then re-feather.
  if (srcMeta.hasAlpha) {
    try {
      const alphaChannel = await decode(faceSrc).extractChannel('alpha').png().toBuffer();
      const dilatedAlpha = await decode(alphaChannel)
        .blur(5)        // expand signal ~5 px outward
        .threshold(8)   // any value ≥ 8 → 255 (recovered boundary)
        .blur(1)        // slight re-feather for smooth edge
        .png()
        .toBuffer();
      const rgbOnly = await decode(faceSrc).removeAlpha().png().toBuffer();
      const dilatedFace = await decode(rgbOnly).joinChannel(dilatedAlpha).png().toBuffer();
      if (dilatedFace.length > 100) faceSrc = dilatedFace;
    } catch {
      /* dilation failed — keep original */
    }
  }

  // Process face: fit inside a bounded box controlled by faceScalePct (40–100% of
  // BG height). Width stays capped at 42% of BG width so the text zone is never
  // encroached regardless of how tall the person is.
  const maxFaceW = Math.round(BG_W * 0.42);
  const maxFaceH = Math.round(BG_H * (faceScalePct / 100));
  const resizedFace = await decode(faceSrc)
    .resize(maxFaceW, maxFaceH, { fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .png()
    .toBuffer();

  const faceMeta = await decode(resizedFace).metadata();
  const faceW = faceMeta.width || maxFaceW;
  const faceH = faceMeta.height || maxFaceH;

  // Position: flush to the bottom + chosen side edge (no inset) so the person is
  // aligned with the corner — never floating/offset. The opposite side stays free
  // for the text (Claude's keep-out zone).
  const left = faceOnLeft ? 0 : BG_W - faceW;
  const top = BG_H - faceH;

  // Create shadow layer (slightly offset, blurred)
  const shadowOffset = 4;
  const shadowBuffer = await decode(resizedFace)
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

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Build an SVG text overlay: large, bold, white with black outline + semi-transparent
 * background box for guaranteed readability on any background. Uses no SVG filters
 * (feDropShadow can fail in some librsvg builds); instead renders a dark shadow copy
 * of the text offset by a few pixels, then the white stroked main text on top.
 * Placed on the side OPPOSITE the face (or centered when there's no face).
 */
function buildTextSvg(text: string, faceOnLeft: boolean, hasFace: boolean): string {
  const W = 1312;
  const H = 736;
  const padX = Math.round(W * 0.04); // 52 px

  let zoneX: number;
  let zoneW: number;
  if (hasFace) {
    if (faceOnLeft) {
      // Text on the right — start at 44 % to give a wider usable zone
      zoneX = Math.round(W * 0.44);
      zoneW = W - zoneX - padX;
    } else {
      zoneX = padX;
      zoneW = Math.round(W * 0.52);
    }
  } else {
    zoneX = padX;
    zoneW = W - padX * 2;
  }

  const t = text.trim();
  const len = t.length;
  let fontSize: number;
  if (len <= 8) fontSize = 120;
  else if (len <= 14) fontSize = 100;
  else if (len <= 20) fontSize = 84;
  else if (len <= 30) fontSize = 68;
  else fontSize = 56;

  const charW = fontSize * 0.55;
  const maxChars = Math.max(6, Math.floor(zoneW / charW));
  const words = t.split(/\s+/);
  const lines: string[] = [];
  let curLine = '';
  for (const w of words) {
    const test = curLine ? curLine + ' ' + w : w;
    if (test.length > maxChars && curLine) {
      lines.push(curLine);
      curLine = w;
    } else {
      curLine = test;
    }
  }
  if (curLine) lines.push(curLine);

  const lineH = Math.round(fontSize * 1.1);
  const blockH = lines.length * lineH;
  const padY = Math.round(fontSize * 0.35);
  const startY = Math.round((H - blockH) / 2 + fontSize * 0.8);
  const cx = Math.round(zoneX + zoneW / 2);

  // Semi-transparent dark background box for contrast on any BG
  const boxX = Math.max(0, zoneX - Math.round(padX * 0.3));
  const boxY = Math.max(0, startY - Math.round(fontSize * 0.85) - padY);
  const boxW = Math.min(W - boxX, zoneW + Math.round(padX * 0.6));
  const boxH = blockH + padY * 2;
  const rx = Math.round(fontSize * 0.12);

  // Shadow offset (no filter — just a dark copy of the text, slightly shifted)
  const sDx = Math.round(fontSize * 0.04);
  const sDy = Math.round(fontSize * 0.05);
  const strokeW = Math.max(6, Math.round(fontSize * 0.10));

  const shadowTspans = lines
    .map((l, i) => `<tspan x="${cx + sDx}" y="${startY + sDy + i * lineH}">${escapeXml(l.toUpperCase())}</tspan>`)
    .join('');
  const mainTspans = lines
    .map((l, i) => `<tspan x="${cx}" y="${startY + i * lineH}">${escapeXml(l.toUpperCase())}</tspan>`)
    .join('');

  return (
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">` +
    // Dark translucent box behind the text block
    `<rect x="${boxX}" y="${boxY}" width="${boxW}" height="${boxH}" rx="${rx}" fill="#000000" fill-opacity="0.60"/>` +
    // Shadow: dark copy of the text, shifted a few pixels
    `<text font-family="Arial Black, Impact, Arial, sans-serif" font-weight="900" font-size="${fontSize}" text-anchor="middle" fill="#000000" fill-opacity="0.70" letter-spacing="2">${shadowTspans}</text>` +
    // Main text: white fill + thick black stroke (stroke rendered first via paint-order)
    `<text font-family="Arial Black, Impact, Arial, sans-serif" font-weight="900" font-size="${fontSize}" text-anchor="middle" fill="#ffffff" stroke="#000000" stroke-width="${strokeW}" paint-order="stroke" stroke-linejoin="round" letter-spacing="2">${mainTspans}</text>` +
    `</svg>`
  );
}

async function overlayText(
  bgBuffer: Buffer,
  text: string,
  faceOnLeft: boolean,
  hasFace: boolean,
): Promise<Buffer> {
  const W = 1312;
  const H = 736;
  const svg = Buffer.from(buildTextSvg(text, faceOnLeft, hasFace));
  return decode(bgBuffer)
    .resize(W, H, { fit: 'cover' })
    .composite([{ input: svg, blend: 'over' as const }])
    .png({ quality: 90 })
    .toBuffer();
}
