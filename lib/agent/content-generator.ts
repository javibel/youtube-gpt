import { prisma } from '@/lib/prisma';

export type Platform = 'facebook' | 'instagram' | 'linkedin' | 'tiktok' | 'twitter';
export type PostType = 'morning' | 'evening';

const API_KEY = () => process.env.ANTHROPIC_API_KEY?.trim() ?? '';
const MODEL = 'claude-sonnet-4-6';

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

// ── Post format rotation ─────────────────────────────────────────────────────

type PostFormat = { nombre: string; instruccion: string };

const POST_FORMATS: PostFormat[] = [
  { nombre: 'listicle', instruccion: 'Formato LISTA numerada: "X cosas que..." o "X errores que...". Cada punto con emoji + frase corta + explicación de 1 línea.' },
  { nombre: 'micro-story', instruccion: 'Formato HISTORIA: Arranca con un momento concreto ("La semana pasada analicé un canal que..."). Conflicto → descubrimiento → lección accionable.' },
  { nombre: 'hot-take', instruccion: 'Formato OPINIÓN FUERTE: Empieza con una afirmación contraintuitiva o polémica sobre YouTube. Defiéndela con datos o experiencia. Invita al debate.' },
  { nombre: 'framework', instruccion: 'Formato MÉTODO/FRAMEWORK: Presenta un sistema de 3-5 pasos con nombre propio. Ej: "El método 3T para títulos", "La regla del 80/20 en thumbnails". Que sea guardable como referencia.' },
];

function getTodayFormat(): PostFormat {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  return POST_FORMATS[dayOfYear % POST_FORMATS.length];
}

// ── Prompts ──────────────────────────────────────────────────────────────────

const FACEBOOK_PROMPT = (): string => {
  const theme = getTodayTheme();
  const day = getTodayDayName();
  const format = getTodayFormat();
  const isShort = format.nombre === 'hot-take';
  return `
Hoy es ${day}. El tema del día es: ${theme.tema}
Contexto: ${theme.descripcion}
${theme.mencionarProducto ? 'Menciona YTubViral (ytubviral.com) de forma natural, como parte de tu historia, NUNCA como anuncio.' : 'No menciones YTubViral hoy.'}

${format.instruccion}

Escribe un post de Facebook (${isShort ? '60-100' : '350-500'} palabras) optimizado para COMPARTIR.

REGLAS DE ENGAGEMENT:
- Primera frase: DEBE parar el scroll. Usa una de estas fórmulas:
  * Dato con número: "El 92% de los canales de YouTube mueren antes de los 100 subs"
  * Contradicción: "Publicar más vídeos NO hace crecer tu canal"
  * Confesión: "Cometí este error durante 6 meses y me costó 10K views"
  * Pregunta directa: "¿Cuántas horas pierdes optimizando títulos que nadie busca?"
- Cada párrafo debe aportar VALOR CONCRETO — si quitas un párrafo y no se pierde nada útil, sobra
- Datos específicos siempre: "el 73% de canales pequeños" no "muchos youtubers"
- Tono: como hablarías con un amigo creador en un café, no como un post corporativo
- CERO frases hechas: nada de "en este mundo digital", "el contenido es rey", "la clave del éxito"
- Cierra con UNA de estas: pregunta polarizante / "comparte si conoces a alguien que..." / dato que deje pensando
- 4-5 hashtags al final: #YouTube #YouTubeSEO #Creadores #YouTubeTips + 1 del tema
- Sin markdown, sin asteriscos, sin negritas

Devuelve SOLO el texto del post.
`.trim();
};

const INSTAGRAM_PROMPT = (): string => {
  const theme = getTodayTheme();
  const day = getTodayDayName();
  const format = getTodayFormat();
  return `
Hoy es ${day}. El tema del día es: ${theme.tema}
Contexto: ${theme.descripcion}
${theme.mencionarProducto ? 'Menciona YTubViral (ytubviral.com) de forma natural como herramienta que usas.' : 'No menciones YTubViral hoy.'}

${format.instruccion}

Escribe un caption de Instagram (300-500 palabras) diseñado para que lo GUARDEN.

ESTRUCTURA OBLIGATORIA:
1. HOOK (primera línea, separada del resto): La frase que decide si leen o siguen scrolleando. Fórmulas probadas:
   - "Nadie te dice esto sobre [tema] pero..."
   - "[Número]% de YouTubers hacen esto mal"
   - "Dejé de hacer [X] y mi canal creció [Y]%"
   - "Si tu CTR está bajo 5%, lee esto"
   NO uses: "Hoy vamos a hablar de...", "En este post...", "Sabes que..."

2. CUERPO (valor denso, cada línea debe enseñar algo):
   - Usa emojis como bullets: ✅ para tips, ❌ para errores, 📊 para datos, 🔥 para énfasis
   - Párrafos de 1-2 líneas máximo
   - Incluye al menos UN dato numérico real
   - Si es listicle: cada punto = emoji + afirmación corta + por qué importa
   - Si es historia: situación concreta → qué descubriste → qué cambió

3. CTA (último párrafo, separado):
   - "Guarda este post" o "Comparte con un creador" (el algoritmo premia saves y shares)
   - Si mencionas ytubviral: "Link en bio"
   - O pregunta que genere comentarios: "¿Cuál de estos errores cometiste?"

4. HASHTAGS (línea final, separada por un salto):
   5-8 hashtags mezclando ES + EN, relevantes al tema concreto del post.
   Pool: #YouTube #YouTubeSEO #YouTubeTips #ContentCreator #CreadorDeContenido #YouTubeGrowth #SmallYouTuber #SEO #Thumbnails #CTR #YouTubeAlgorithm #Creadores

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
  const format = getTodayFormat();
  return `
Hoy es ${day}. El tema del día es: ${theme.tema}
Contexto: ${theme.descripcion}

${format.instruccion}

Escribe un hilo de X/Twitter de 6-8 tweets que pueda viralizarse en el feed "Para ti".

REGLAS CRÍTICAS:
- TWEET 1 es el que decide TODO. Debe funcionar SOLO, sin contexto. Fórmulas que funcionan:
  * "Analicé [X] canales de YouTube. Esto es lo que encontré:"
  * "[Dato brutal]. Y nadie habla de esto."
  * "El mayor error que veo en canales pequeños (y cómo evitarlo):"
  * Opinión fuerte: "Los Shorts están matando canales. Y la gente no se da cuenta."
- Cada tweet = UNA idea clara, completa en sí misma
- Usa numeración: 1/, 2/, 3/... (señal visual de hilo, genera clicks)
- MÁXIMO 270 caracteres por tweet (deja margen para el numerador)
- El penúltimo tweet: el insight más potente o el dato más sorprendente (la gente suele abandonar al final, pon lo mejor antes)
- Último tweet: cierre + "Sígueme para más sobre YouTube" + ${theme.mencionarProducto ? 'mención natural a ytubviral.com' : 'pregunta que genere respuestas'}
- Sin hashtags dentro del hilo (rompen la lectura)
- Tono: directo, seguro, con datos. No hedging ("creo que", "tal vez"). Afirma.

Formato EXACTO (respeta esto al pie de la letra):
TWEET 1:
[texto]

TWEET 2:
[texto]

TWEET 3:
[texto]

(continúa hasta TWEET 6-8)

Devuelve SOLO los tweets en el formato indicado, nada más.
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
  const tokens = platform === 'twitter' ? 1500 : 1200;
  return callClaude(prompt!, tokens, systemPrompt);
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
