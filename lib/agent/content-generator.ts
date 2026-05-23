import { prisma } from '@/lib/prisma';

export type Platform = 'facebook' | 'instagram' | 'linkedin' | 'tiktok' | 'twitter';
export type PostType = 'morning' | 'evening';

const API_KEY = () => process.env.ANTHROPIC_API_KEY?.trim() ?? '';
const MODEL = 'claude-haiku-4-5-20251001';

// ── Memoria narrativa ─────────────────────────────────────────────────────────

async function getNarrativeContext(): Promise<string> {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 14);

    const [bibleRows, recentPosts] = await Promise.all([
      prisma.$queryRaw<{ value: string }[]>`
        SELECT value FROM narrative_bible WHERE key = 'main' LIMIT 1
      `,
      prisma.socialPost.findMany({
        where: { status: 'published', publishedAt: { gte: since } },
        orderBy: { publishedAt: 'desc' },
        select: { platform: true, content: true, publishedAt: true },
        take: 20,
      }),
    ]);

    const bible = bibleRows[0]?.value ?? '';

    const postsContext = recentPosts.length > 0
      ? recentPosts.map(p =>
          `[${p.platform} - ${p.publishedAt?.toLocaleDateString('es-ES')}]\n${p.content.slice(0, 300)}${p.content.length > 300 ? '...' : ''}`
        ).join('\n\n')
      : 'Aún no hay posts publicados.';

    return `
=== BIBLIA DEL PERSONAJE (lee esto siempre antes de escribir) ===
${bible}

=== POSTS PUBLICADOS RECIENTEMENTE (últimos 14 días — NO te repitas ni te contradigas) ===
${postsContext}
`.trim();
  } catch {
    return '';
  }
}

async function callClaude(prompt: string, maxTokens = 600, systemPrompt?: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY(),
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'prompt-caching-2024-07-31',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      ...(systemPrompt ? {
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      } : {}),
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API error: ${res.status}`);
  const data = await res.json();
  return data.content?.[0]?.text ?? '';
}

// ── Día de la semana ──────────────────────────────────────────────────────────

const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

type DayTheme = {
  tema: string;
  descripcion: string;
  mencionarProducto: boolean;
};

const TEMAS_SEMANA: Record<number, DayTheme> = {
  0: { tema: 'dato / estadística sorprendente de YouTube',  descripcion: 'un dato real que pocos conocen sobre YouTube, algoritmo, CTR, retención. Que la gente quiera guardarlo o compartirlo. Incluye el número concreto.', mencionarProducto: false },
  1: { tema: 'error común que cometen YouTubers',           descripcion: 'un error específico que ves en canales pequeños, con explicación de por qué falla y qué hacer en su lugar. Práctico y accionable.', mencionarProducto: false },
  2: { tema: 'tip práctico con resultado medible',          descripcion: 'un truco concreto de SEO, títulos, thumbnails o retención que da resultados. Con formato "haz X para conseguir Y". Menciona YTubViral como herramienta que ayuda.', mencionarProducto: true },
  3: { tema: 'mini tutorial / how-to',                      descripcion: 'explica paso a paso algo útil: cómo investigar keywords, cómo analizar competencia, cómo optimizar un título. 3-5 pasos concretos.', mencionarProducto: true },
  4: { tema: 'herramienta destacada + uso real',            descripcion: 'muestra una funcionalidad específica de YTubViral con caso de uso real. No como anuncio — como "mira lo que descubrí analizando X".', mencionarProducto: true },
  5: { tema: 'pregunta / debate con opinión',               descripcion: 'lanza una pregunta polarizante sobre YouTube que genere debate. Da tu opinión primero. Ej: "¿Los Shorts canibalizan los long-form?"', mencionarProducto: false },
  6: { tema: 'comparativa / antes vs después',              descripcion: 'compara dos enfoques, muestra un antes/después de optimizar un título o thumbnail, o datos de un canal antes y después de aplicar una estrategia.', mencionarProducto: true },
};

function getTodayTheme(): DayTheme {
  const day = new Date().getDay();
  return TEMAS_SEMANA[day];
}

function getTodayDayName(): string {
  return DAYS[new Date().getDay()];
}

// ── Voz del autor ─────────────────────────────────────────────────────────────

const VOZ = `
Eres Javier, el fundador de YTubViral (ytubviral.com), una herramienta de IA para YouTubers hispanohablantes que construiste desde cero.
Tu voz en redes es honesta, directa y humana. No eres un community manager corporativo — eres una persona real compartiendo su camino como creador y emprendedor.

Principios de tu forma de escribir:
- Compartes tanto los errores y dudas como los éxitos. Las vulnerabilidades conectan más que los logros.
- Usas un lenguaje natural, a veces imperfecto. No todo tiene que estar pulido.
- Cuentas historias concretas, no generalidades. "Esta semana" no "siempre".
- Escribes como hablas, sin jerga de marketing ni frases hechas.
- Nunca suenas a anuncio. Si mencionas YTubViral, es porque viene al hilo de lo que estás contando, nunca como CTA forzado.
- Las emociones son bienvenidas: frustración, orgullo, incertidumbre, ilusión.
- Preguntas genuinas al final si encajan, no de forma mecánica.
`.trim();

// ── Prompts ──────────────────────────────────────────────────────────────────

const FACEBOOK_PROMPT = (): string => {
  const theme = getTodayTheme();
  const day = getTodayDayName();
  return `
Hoy es ${day}. El tema del día es: ${theme.tema}
Contexto: ${theme.descripcion}
${theme.mencionarProducto ? 'Menciona YTubViral (ytubviral.com) de forma natural como herramienta que usas/construyes. No como anuncio — como parte de la historia.' : 'No menciones YTubViral hoy.'}

Escribe un post de Facebook (150-250 palabras) que la gente quiera GUARDAR o COMPARTIR.
- El post debe aportar VALOR PRÁCTICO: un dato, un tip, un método, algo accionable
- Empieza con una frase que enganche (dato sorprendente, pregunta provocadora, o afirmación contraintuitiva)
- Tono conversacional pero con sustancia — no reflexiones vacías
- Si incluyes números o datos, que sean específicos (no "muchos youtubers", sino "el 73% de canales pequeños")
- Emojis solo si salen naturales
- SIEMPRE incluye 4-6 hashtags relevantes al final (mezcla ES + EN: #youtube #youtubeseo #creadordecontenido #youtubetips #creadores)
- Termina con pregunta que invite a comentar O con un "guarda este post"
- Sin CTA de marketing forzado, sin urgencia artificial

Devuelve SOLO el texto del post.
`.trim();
};

const INSTAGRAM_PROMPT = (): string => {
  const theme = getTodayTheme();
  const day = getTodayDayName();
  return `
Hoy es ${day}. El tema del día es: ${theme.tema}
Contexto: ${theme.descripcion}
${theme.mencionarProducto ? 'Menciona YTubViral (ytubviral.com) como herramienta que usas/construyes, de forma natural.' : 'No menciones YTubViral hoy.'}

Escribe un caption de Instagram (100-180 palabras) que la gente quiera GUARDAR.
- Primera línea BRUTAL que enganche (dato, pregunta provocadora, afirmación contraintuitiva)
- Contenido de VALOR: tip práctico, dato real, método paso a paso, o comparativa
- Emojis estratégicos (✅ para listas, 📊 para datos, 💡 para tips — no exagerar)
- Termina con pregunta que genere comentarios O con "🔗 Link en bio" si mencionas ytubviral
- 8-12 hashtags al final (mezcla): #youtube #youtubeseo #youtubetips #contentcreator #creadordecontenido #youtubegrowth #smallyoutuber #creadores #marketingdigital #youtuber
- El contenido debe ser ÚTIL para alguien que quiere crecer en YouTube

Devuelve SOLO el caption con hashtags.
`.trim();
};

const LINKEDIN_TOPICS_PERSONALES = [
  'un error que cometiste al empezar a construir YTubViral',
  'algo que aprendiste esta semana sobre YouTube o SEO que te sorprendió',
  'la diferencia entre cuando empezaste y ahora como creador o emprendedor',
  'una decisión difícil que tuviste que tomar en tu proyecto',
  'lo que nadie te cuenta sobre lanzar una herramienta para creadores',
  'un momento en el que dudaste si seguir adelante',
  'algo que cambiarías si pudieras empezar de nuevo',
  'una observación honesta sobre el ecosistema de YouTube en España',
  'por qué los creadores pequeños tienen más ventajas de las que creen',
  'una semana complicada y qué sacaste de ella',
];

const LINKEDIN_PROMPT = (): string => {
  const theme = getTodayTheme();
  const day = getTodayDayName();
  const topicPersonal = LINKEDIN_TOPICS_PERSONALES[Math.floor(Math.random() * LINKEDIN_TOPICS_PERSONALES.length)];
  const topicFinal = theme.mencionarProducto ? topicPersonal : `${theme.descripcion} (ángulo personal y honesto)`;

  return `
Hoy es ${day}. El tema del día es: ${theme.tema}
Escribe sobre: ${topicFinal}
${theme.mencionarProducto ? 'Puedes mencionar YTubViral de forma natural si encaja con la historia.' : 'No menciones YTubViral ni hagas ningún tipo de promoción hoy.'}

Escribe un post de LinkedIn (200-350 palabras).
- Empieza con una frase directa que genere curiosidad, sin "En este post voy a..."
- Cuenta algo real, específico, con detalles concretos
- Párrafos cortos (2-3 líneas máximo)
- Puede terminar con una pregunta genuina a tu red, o simplemente con una reflexión
- 3-4 hashtags al final, nada más
- CERO markdown: sin asteriscos, guiones, almohadillas ni negritas
- Solo texto plano con saltos de línea

Devuelve SOLO el texto del post.
`.trim();
};

const TIKTOK_PROMPT = (): string => {
  const theme = getTodayTheme();
  const day = getTodayDayName();
  return `
Hoy es ${day}. El tema del día es: ${theme.tema}
Contexto: ${theme.descripcion}

Escribe el guión de un vídeo TikTok corto (30-60 segundos) con voz personal y auténtica.

Formato:
HOOK (primeros 3 segundos): [algo que genere curiosidad real, sin clickbait exagerado]
DESARROLLO: [guión conversacional, 60-100 palabras, tono de persona hablando]
CAPTION: [caption corto con emojis naturales y 5-8 hashtags]

${theme.mencionarProducto ? 'Puedes mencionar YTubViral si encaja naturalmente.' : 'No menciones YTubViral hoy.'}
Devuelve SOLO el contenido en el formato indicado.
`.trim();
};

const TWITTER_PROMPT = (): string => {
  const theme = getTodayTheme();
  const day = getTodayDayName();
  return `
Hoy es ${day}. El tema del día es: ${theme.tema}
Contexto: ${theme.descripcion}

Escribe un hilo de X/Twitter (2-3 tweets) con voz personal y directa.

Formato:
TWEET 1 (máx 280 chars, arranca con algo real):
[texto]

TWEET 2 (desarrollo honesto, máx 280 chars):
[texto]

TWEET 3 (cierre o pregunta genuina, máx 280 chars):
[texto${theme.mencionarProducto ? ' — puedes incluir ytubviral.com si viene natural' : ''}]

HASHTAGS SUGERIDOS: [3-4 hashtags relevantes]

Devuelve SOLO el hilo en el formato indicado.
`.trim();
};

// ── Public functions ──────────────────────────────────────────────────────────

export async function generateSocialPost(
  platform: Platform,
  type: PostType
): Promise<string> {
  const [context, prompt] = await Promise.all([
    getNarrativeContext(),
    Promise.resolve({
      facebook: FACEBOOK_PROMPT(),
      instagram: INSTAGRAM_PROMPT(),
      linkedin: LINKEDIN_PROMPT(),
      tiktok: TIKTOK_PROMPT(),
      twitter: TWITTER_PROMPT(),
    }[platform]),
  ]);

  // VOZ + narrative context as cached system prompt (static per session)
  const systemPrompt = context ? `${VOZ}\n\n${context}` : VOZ;
  return callClaude(prompt!, 700, systemPrompt);
}

export async function generateYoutubeReply(
  commentText: string,
  authorName: string
): Promise<string> {
  const prompt = `
Eres Javier, el fundador de YTubViral (ytubviral.com).
Responde al siguiente comentario de YouTube de forma cercana y genuina.

Comentario de ${authorName}: "${commentText}"

Reglas:
- Respuesta en el mismo idioma que el comentario (español o inglés)
- Máximo 2-3 frases
- Tono humano, como respondería una persona real, no un community manager
- Menciona ytubviral.com solo si es relevante al contexto
- Sin markdown

Devuelve SOLO el texto de la respuesta.
`.trim();
  return callClaude(prompt, 150);
}

export async function generateGmailReply(
  subject: string,
  emailBody: string,
  senderName: string
): Promise<string> {
  const prompt = `
Eres el equipo de soporte de YTubViral (ytubviral.com).
Redacta una respuesta al siguiente email.

De: ${senderName}
Asunto: ${subject}
Contenido: ${emailBody.slice(0, 1500)}

Reglas:
- Responde en el mismo idioma que el email
- Tono profesional pero cercano, como una persona real
- Saludo personalizado con el nombre del remitente
- Responde directamente a lo que pregunta o solicita
- Firma SIEMPRE con: "Un saludo,\nEquipo YTubViral\nytubviral.com"
- Máximo 200 palabras
- Sin markdown, solo texto plano

Devuelve SOLO el cuerpo del email de respuesta.
`.trim();
  return callClaude(prompt, 400);
}
