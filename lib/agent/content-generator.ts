export type Platform = 'facebook' | 'instagram' | 'linkedin' | 'tiktok' | 'twitter';
export type PostType = 'morning' | 'evening';

const API_KEY = () => process.env.ANTHROPIC_API_KEY?.trim() ?? '';
const MODEL = 'claude-haiku-4-5-20251001';

async function callClaude(prompt: string, maxTokens = 600): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY(),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API error: ${res.status}`);
  const data = await res.json();
  return data.content?.[0]?.text ?? '';
}

// ── Prompts ──────────────────────────────────────────────────────────────────

const FACEBOOK_PROMPT = (type: PostType) => `
Eres el community manager de YTubViral (ytubviral.com), herramienta de IA para YouTubers hispanohablantes.
Genera un post de Facebook para el turno de ${type === 'morning' ? 'mañana (energético, motivador)' : 'tarde (reflexivo, inspiracional)'}.

Requisitos ESTRICTOS:
- Entre 150-300 palabras
- Usa emojis de forma natural
- 5-7 hashtags al final
- CTA claro al final con enlace ytubviral.com
- Tono cercano, directo, en español
- Menciona una feature concreta (títulos virales, scripts, keyword research, análisis de competidores, captions)
- Varía el ángulo: problema del creador → solución con YTubViral → CTA

Devuelve SOLO el texto del post, sin comentarios ni explicaciones.
`.trim();

const INSTAGRAM_PROMPT = (type: PostType) => `
Eres el community manager de YTubViral (ytubviral.com), herramienta de IA para YouTubers hispanohablantes.
Genera un caption de Instagram para el turno de ${type === 'morning' ? 'mañana (energético)' : 'tarde (inspiracional)'}.

Requisitos ESTRICTOS:
- Entre 100-150 palabras
- Emojis estratégicos
- Termina con "🔗 Link en bio"
- 10-15 hashtags al final (mezcla popular y nicho)
- Tono dinámico y visual
- Menciona ytubviral.com solo en el CTA de link en bio

Devuelve SOLO el caption con hashtags, sin comentarios.
`.trim();

const LINKEDIN_TOPICS = [
  'el tiempo que pierden los creadores en tareas repetitivas',
  'cómo el SEO de YouTube cambia las reglas del juego para canales pequeños',
  'por qué el 90% de los vídeos no llegan a 1000 vistas y cómo evitarlo',
  'la diferencia entre creadores que crecen y los que se estancan',
  'cómo analizar a la competencia en YouTube sin perder horas',
  'el papel de la IA en la producción de contenido en 2025',
  'por qué el título es más importante que el contenido del vídeo',
  'métricas que importan vs métricas que distraen en YouTube',
];

const LINKEDIN_PROMPT = (type: PostType) => {
  const topic = LINKEDIN_TOPICS[Math.floor(Math.random() * LINKEDIN_TOPICS.length)];
  return `
Eres el responsable de marketing de YTubViral (ytubviral.com), herramienta de IA para creadores de contenido.
Genera un post de LinkedIn para el turno de ${type === 'morning' ? 'mañana' : 'tarde'} sobre el tema: ${topic}

Requisitos ESTRICTOS:
- Entre 200-300 palabras
- Tono profesional y analítico
- Datos o estadísticas concretos cuando sea relevante
- 3-5 hashtags relevantes al final
- CTA con enlace a ytubviral.com
- Párrafos cortos, fácil de leer
- CERO markdown: no uses asteriscos, guiones bajos, almohadillas ni ningún símbolo de formato
- Solo texto plano con saltos de línea

Devuelve SOLO el texto del post, sin comentarios ni explicaciones.
`.trim();
};

const TIKTOK_PROMPT = (type: PostType) => `
Eres el community manager de YTubViral (ytubviral.com).
Genera el guión de un vídeo TikTok corto (30-60 segundos) para el turno de ${type === 'morning' ? 'mañana' : 'tarde'}.

Formato:
HOOK (primeros 3 segundos): [texto del hook]
DESARROLLO: [guión completo, conversacional, 60-100 palabras]
CTA: [llamada a la acción mencionando ytubviral.com]
CAPTION: [caption corto con emojis y 5-8 hashtags]
MEJOR HORA DE PUBLICACIÓN: [hora óptima]

Tono: directo, energético, informal. El contenido debe enganchar en los primeros 3 segundos.
Devuelve SOLO el contenido en el formato indicado.
`.trim();

const TWITTER_PROMPT = (type: PostType) => `
Eres el community manager de YTubViral (ytubviral.com).
Genera un hilo de X/Twitter (2-3 tweets) para el turno de ${type === 'morning' ? 'mañana' : 'tarde'}.

Formato:
TWEET 1 (máx 280 chars, con hook fuerte):
[texto]

TWEET 2 (desarrollo, máx 280 chars):
[texto]

TWEET 3 (CTA + link, máx 280 chars):
[texto con ytubviral.com]

HASHTAGS SUGERIDOS: #tag1 #tag2 #tag3
MEJOR HORA: [hora óptima]

Devuelve SOLO el hilo en el formato indicado, sin comentarios.
`.trim();

// ── Public functions ──────────────────────────────────────────────────────────

export async function generateSocialPost(
  platform: Platform,
  type: PostType
): Promise<string> {
  const prompts: Record<Platform, string> = {
    facebook: FACEBOOK_PROMPT(type),
    instagram: INSTAGRAM_PROMPT(type),
    linkedin: LINKEDIN_PROMPT(type),
    tiktok: TIKTOK_PROMPT(type),
    twitter: TWITTER_PROMPT(type),
  };
  return callClaude(prompts[platform], 700);
}

export async function generateYoutubeReply(
  commentText: string,
  authorName: string
): Promise<string> {
  const prompt = `
Eres el community manager de YTubViral (ytubviral.com).
Responde al siguiente comentario de YouTube de forma amigable, breve y útil.

Comentario de ${authorName}: "${commentText}"

Reglas:
- Respuesta en el mismo idioma que el comentario (español o inglés)
- Máximo 2-3 frases
- Tono cercano y agradecido
- Menciona ytubviral.com solo si es relevante al contexto
- No uses markdown

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
Redacta una respuesta profesional al siguiente email.

De: ${senderName}
Asunto: ${subject}
Contenido: ${emailBody.slice(0, 1500)}

Reglas:
- Responde en el mismo idioma que el email
- Tono profesional pero cercano
- Saludo personalizado con el nombre del remitente
- Responde directamente a lo que pregunta o solicita
- Firma SIEMPRE con: "Un saludo,\nEquipo YTubViral\nytubviral.com"
- Máximo 200 palabras
- Sin markdown, solo texto plano

Devuelve SOLO el cuerpo del email de respuesta.
`.trim();
  return callClaude(prompt, 400);
}
