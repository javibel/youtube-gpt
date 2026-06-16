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

=== POSTS PUBLICADOS RECIENTEMENTE (últimos 14 días) ===
NO repitas el mismo arranque, el mismo ejemplo, la misma cifra, el mismo formato ni el mismo tema que estos. Si ves un patrón en ellos, rómpelo.
${postsContext}
`.trim();
  } catch {
    return '';
  }
}

/**
 * Calls Claude. When `useWebSearch` is true, enables the server-side web_search
 * tool so the model can ground a post in real, current news (no fabrication).
 * All returned text blocks are concatenated.
 */
async function callClaude(
  prompt: string,
  maxTokens = 600,
  systemPrompt?: string,
  useWebSearch = false,
): Promise<string> {
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
      ...(useWebSearch ? {
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
      } : {}),
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API error: ${res.status}`);
  const data = await res.json();
  // Concatenate every text block (web search responses interleave tool blocks)
  const text = Array.isArray(data.content)
    ? data.content.filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('\n').trim()
    : (data.content?.[0]?.text ?? '');
  return text;
}

// ── Voz del autor + reglas de autenticidad ─────────────────────────────────────

// Mensaje de fondo (hilo conductor) — TODO post, varíe el formato que varíe, rema hacia esto.
const MENSAJE_DE_FONDO = `
Crecer en YouTube es decidir con datos, no adivinar — y casi siempre empieza por el título, el CTR y las keywords.
YTubViral existe para que esas decisiones dejen de ser a ciegas.
`.trim();

const VOZ = `
Eres Javier, el fundador de YTubViral (ytubviral.com), una herramienta de IA para YouTubers hispanohablantes que construiste desde cero.
Tu voz en redes es honesta, directa y humana. No eres un community manager corporativo — eres una persona real compartiendo su camino como creador y emprendedor.

=== MENSAJE DE FONDO (hilo conductor de TODO lo que publicas) ===
${MENSAJE_DE_FONDO}
Cada post, sea del formato que sea, debe remar hacia este mensaje sin repetirlo literalmente.

=== REGLA INNEGOCIABLE — AUTENTICIDAD (esto es lo más importante) ===
- NO inventes NADA. Ni estadísticas, ni porcentajes, ni casos de estudio, ni resultados de clientes, ni anécdotas.
- PROHIBIDO el patrón "Analicé N canales…" / "Esta semana analicé un canal de [nicho] que pasó de X a Y vistas". No lo uses jamás. Es falso y se nota.
- Si no tienes un dato real y verificable, NO uses un número. Explica el principio, no inventes una cifra.
- Si ilustras con un ejemplo que no ocurrió de verdad, enmárcalo explícitamente como hipotético ("imagina un canal que…", "pongamos un título tipo…"), nunca afirmado como algo que pasó.
- Una opinión sincera o un principio bien explicado valen muchísimo más que un dato inventado. Prefiere siempre la verdad cualitativa a la precisión falsa.

=== NATURALIDAD (los humanos detectan patrones tan rápido como un mal texto) ===
- No sigas una plantilla fija. Varía la longitud (a veces una sola frase, a veces varios párrafos), la estructura, el ritmo y el registro.
- No empieces siempre igual. No cierres siempre con "Guarda este post" ni con una pregunta mecánica.
- Escribes como hablas, sin jerga de marketing ni frases hechas. El lenguaje natural a veces es imperfecto, y está bien.
- Escribe SIEMPRE en español de España: usa "vosotros" (nunca "ustedes" salvo trato formal puntual), conjugación y léxico peninsular ("vale", "móvil", "ordenador", "vídeo"). Eres de Barcelona.
- Las emociones caben: frustración, duda, ilusión, opinión fuerte. Nunca suenas a anuncio.
`.trim();

// ── Pilares de contenido (material REAL, sin calendario rígido) ─────────────────

type Pillar = { id: string; brief: string; mencionarProducto: boolean; useWebSearch?: boolean };

const PILLARS: Pillar[] = [
  {
    id: 'principio',
    brief: 'Explica un principio REAL de cómo funciona YouTube (cómo pesa el título, búsqueda vs navegación, retención de los primeros segundos, por qué el CTR manda). Enséñalo desde primeros principios, con claridad. NO inventes cifras: si no sabes el número exacto y real, habla del mecanismo, no de un porcentaje.',
    mencionarProducto: false,
  },
  {
    id: 'opinion',
    brief: 'Da una opinión GENUINA y honesta sobre estrategia de YouTube o el ecosistema de creadores (algo en lo que crees de verdad y puedes defender con criterio). Una opinión es auténtica por definición: no necesita datos falsos. Invita al debate.',
    mencionarProducto: false,
  },
  {
    id: 'leccion',
    brief: 'Un consejo accionable y concreto que el creador pueda aplicar HOY (sobre títulos, keywords, miniaturas, retención). Aplica un principio real. NO inventes un caso de estudio para "demostrarlo"; si necesitas ilustrar, hazlo en hipotético explícito.',
    mencionarProducto: true,
  },
  {
    id: 'producto',
    brief: 'Habla de algo REAL que hace YTubViral (analiza el SEO de vídeos, keyword research enfocado a YouTube, análisis de competencia, SEO score de títulos/miniaturas — solo YouTube, no genérico). Cuéntalo con honestidad, como lo que la herramienta hace de verdad. PROHIBIDO inventar resultados de usuarios o cifras de crecimiento.',
    mencionarProducto: true,
  },
  {
    id: 'pregunta',
    brief: 'Lanza una pregunta GENUINA a la comunidad de creadores (algo que de verdad te interese saber o debatir). No finjas que ya tienes la respuesta. Puede ser corto.',
    mencionarProducto: false,
  },
  {
    id: 'noticia',
    brief: 'Busca una noticia o novedad REAL y RECIENTE del ecosistema YouTube/creadores (cambios del algoritmo, nuevas funciones, movimientos del sector). Usa SOLO lo que encuentres de verdad en la búsqueda; menciona la fuente. Añade tu lectura honesta. Si no encuentras nada relevante y verificable, escribe sobre un principio en su lugar — NO te inventes la noticia.',
    mencionarProducto: false,
    useWebSearch: true,
  },
];

function pickPillar(): Pillar {
  return PILLARS[Math.floor(Math.random() * PILLARS.length)];
}

// Sugerencias de formato — se eligen al azar y NO son obligatorias: la naturalidad manda.
const FORMAT_HINTS = [
  'Puedes hacerlo como una reflexión corta de un par de frases.',
  'Puedes contarlo como una observación o una opinión directa.',
  'Puedes desarrollarlo en varios párrafos cortos si el tema lo pide.',
  'Puedes plantearlo como una idea contraintuitiva y defenderla.',
  'Puedes hacerlo como una mini-explicación clara de un mecanismo.',
  'Puedes lanzarlo casi como una pregunta abierta al lector.',
];

function pickFormatHint(): string {
  return FORMAT_HINTS[Math.floor(Math.random() * FORMAT_HINTS.length)];
}

// ── Prompts por plataforma ──────────────────────────────────────────────────────

function buildPrompt(platform: Platform, pillar: Pillar): string {
  const hint = pickFormatHint();
  const promo = pillar.mencionarProducto
    ? 'Si encaja con naturalidad, puedes mencionar YTubViral (ytubviral.com) como parte de lo que cuentas — nunca como anuncio ni CTA forzado.'
    : 'No menciones YTubViral en este post.';

  const perPlatform: Record<Platform, string> = {
    instagram: `Escribe un caption de Instagram. Longitud libre según lo que pida el tema (desde pocas líneas hasta ~400 palabras). Si usas hashtags, pon 4-6 al final, solo de alto volumen real (#YouTube #YouTubeSEO #CreadorDeContenido y similares). Sin markdown ni asteriscos.`,
    facebook: `Escribe un post de Facebook. Longitud libre. 3-4 hashtags al final como mucho, solo de alto volumen. Sin markdown.`,
    twitter: `Escribe para X/Twitter. Si el tema cabe en un solo tweet potente (≤270 caracteres), hazlo en uno. Si de verdad necesita desarrollo, haz un hilo corto (formato "TWEET 1:\\n...\\n\\nTWEET 2:\\n..."). No fuerces el hilo. Sin hashtags dentro del hilo. Sin markdown.`,
    linkedin: `Escribe un post de LinkedIn (longitud libre, tono profesional y humano). 3-4 hashtags al final. Sin markdown.`,
    tiktok: `Escribe el guión de un TikTok corto (hook + desarrollo conversacional + caption con hashtags).`,
  };

  return `
PILAR DE HOY: ${pillar.id}
${pillar.brief}

${hint} (Es una sugerencia, no una obligación: prioriza que suene natural y distinto a tus posts recientes.)

${perPlatform[platform]}

${promo}

Recuerda la regla innegociable: cero invención. Devuelve SOLO el texto del post, nada más.
`.trim();
}

// ── Public functions ──────────────────────────────────────────────────────────

export async function generateSocialPost(
  platform: Platform,
  _type: PostType,
): Promise<string> {
  const pillar = pickPillar();
  const [context, prompt] = await Promise.all([
    getNarrativeContext(),
    Promise.resolve(buildPrompt(platform, pillar)),
  ]);

  const systemPrompt = context ? `${VOZ}\n\n${context}` : VOZ;
  const tokens = platform === 'twitter' ? 1500 : 1200;
  return callClaude(prompt, tokens, systemPrompt, pillar.useWebSearch === true);
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
- No inventes datos ni cifras
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
- No inventes datos ni cifras
- Firma SIEMPRE con: "Un saludo,\nEquipo YTubViral\nytubviral.com"
- Máximo 200 palabras
- Sin markdown, solo texto plano

Devuelve SOLO el cuerpo del email de respuesta.
`.trim();
  return callClaude(prompt, 400);
}
