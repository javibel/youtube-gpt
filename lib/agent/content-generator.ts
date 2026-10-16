import { getMessagesTask } from '@/lib/ai/task-runtime';
import { prisma } from '@/lib/prisma';
import { randomUUID } from 'node:crypto';
import { runCronSocialPost, type NativeCronSocialPost } from '@/lib/cron-dispatch-original';

export type Platform = 'facebook' | 'instagram' | 'tiktok' | 'twitter';
export type PostType = 'morning' | 'evening';


// ── Memoria narrativa ─────────────────────────────────────────────────────────

type SocialSource={pillars:{id:number;channel:string;pillar:string;created_at:string}[];bible:{key:string;value:string}[];posts:{id:string;platform:string;content:string;publishedAt:string}[]};
function getNarrativeContext(source:SocialSource): string {
    const bible = source.bible[0]?.value ?? '', recentPosts=source.posts;

    const postsContext = recentPosts.length > 0
      ? recentPosts.map(p =>
          `[${p.platform} - ${new Date(p.publishedAt).toLocaleDateString('es-ES')}]\n${p.content.slice(0, 300)}${p.content.length > 300 ? '...' : ''}`
        ).join('\n\n')
      : 'Aún no hay posts publicados.';

    return `
=== BIBLIA DEL PERSONAJE (lee esto siempre antes de escribir) ===
${bible}

=== POSTS PUBLICADOS RECIENTEMENTE (últimos 14 días) ===
NO repitas el mismo arranque, el mismo ejemplo, la misma cifra, el mismo formato ni el mismo tema que estos. Si ves un patrón en ellos, rómpelo.
${postsContext}
`.trim();
}

/**
 * Calls Claude. When `useWebSearch` is true, enables the server-side web_search
 * tool so the model can ground a post in real, current news (no fabrication).
 * All returned text blocks are concatenated.
 */
async function runContentTask(
  taskType: string,
  prompt: string,
  maxTokens = 600,
  systemPrompt?: string,
  useWebSearch = false,
): Promise<string> {
  const task = await getMessagesTask({ serviceId: 'brand-agent', taskType, language: taskType.endsWith('reply') ? 'auto' : 'es', instructionsVersion: taskType + '-v1',
    ...(systemPrompt ? { requiredCapabilities: ['prompt_cache'] } : {}),
  });
  const result = await task.create({ max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }],
    ...(systemPrompt ? { system: systemPrompt } : {}),
    ...(useWebSearch ? { tools: [{ name: 'web_search' as const, maxCalls: 3 }] } : {}),
  });
  return result.content[0].text;

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

=== DATOS REALES AUTORIZADOS (única fuente de cifras propias) ===
Del estudio propio con la API oficial de YouTube (público en ytubviral.com/youtube-title-study — puedes citarlo, con o sin link):
- 1.814 títulos reales analizados: 1.027 de trending global (30 países) + 787 de los vídeos más vistos en 16 nichos de creador.
- Longitud mediana: 48 caracteres en trending vs 69 en los top de nicho.
- Títulos con número: 29% trending vs 41% nicho. Listicles: 6% vs 21%. Palabras gancho: 7% vs 27%.
- Lectura honesta: los títulos estructurados correlacionan con los más vistos DENTRO de un nicho; el trending de masas (música/tráilers) no los necesita.
Estas son las ÚNICAS cifras propias que puedes usar. Cualquier otra cifra, solo si viene de una búsqueda web con fuente real.

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
- NUNCA nombres, cites ni enlaces a herramientas de la competencia (OutlierKit, VidIQ, TubeBuddy, ViewStats y similares).
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
    brief: 'Busca una noticia o novedad REAL y RECIENTE del ecosistema YouTube/creadores (cambios del algoritmo, nuevas funciones, movimientos del sector). Usa SOLO lo que encuentres de verdad en la búsqueda. FUENTES: cita el anuncio oficial de YouTube o un medio neutral; NUNCA cites, nombres ni enlaces a herramientas de la competencia (OutlierKit, VidIQ, TubeBuddy, ViewStats y similares) como fuente — si la noticia solo aparece en sus blogs, preséntala como información pública ampliamente reportada, sin atribuirla a ninguna herramienta concreta. Añade tu lectura honesta. Si no encuentras nada relevante y verificable, escribe sobre un principio en su lugar — NO te inventes la noticia.',
    mencionarProducto: false,
    useWebSearch: true,
  },
];

// Anti-repetición: registra el pilar usado por canal y excluye los 2 últimos
// al elegir, para que no salga el mismo pilar dos veces seguidas (ni A-B-A).
function pickPillar(recent:string[]): Pillar {
  const pool = PILLARS.filter(p => !recent.includes(p.id));
  const arr = pool.length ? pool : PILLARS;
  return arr[Math.floor(Math.random() * arr.length)];
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

const sourceSql=`jsonb_build_object(
  'pillars',COALESCE((SELECT jsonb_agg(to_jsonb(h) ORDER BY h.created_at DESC,h.id DESC) FROM
    (SELECT id,channel,pillar,created_at FROM social_pillar_history WHERE channel=$3 ORDER BY created_at DESC,id DESC LIMIT 2) h),'[]'::jsonb),
  'bible',COALESCE((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.key) FROM (SELECT key,value FROM narrative_bible WHERE key='main') b),'[]'::jsonb),
  'posts',COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p."publishedAt" DESC,p.id DESC) FROM
    (SELECT id,platform,content,"publishedAt" FROM social_posts WHERE status='published' AND "publishedAt">=timezone('UTC',$6::timestamptz)
      ORDER BY "publishedAt" DESC,id DESC LIMIT 20) p),'[]'::jsonb))`;
const noPriorSocialPost=`NOT EXISTS(SELECT 1 FROM social_posts WHERE platform=$3 AND "createdAt">=$2::date AND "createdAt"<($2::date+1))`;
function validSource(s:SocialSource,platform:string):boolean {
  return !!s&&Object.keys(s).sort().join(',')==='bible,pillars,posts'&&Array.isArray(s.pillars)&&s.pillars.length<=2
    &&s.pillars.every(v=>Number.isInteger(v.id)&&v.channel===platform&&typeof v.pillar==='string'&&Number.isFinite(Date.parse(v.created_at)))
    &&Array.isArray(s.bible)&&s.bible.length<=1&&s.bible.every(v=>v.key==='main'&&typeof v.value==='string'&&v.value.length<=100000)
    &&Array.isArray(s.posts)&&s.posts.length<=20&&s.posts.every(v=>typeof v.id==='string'&&typeof v.platform==='string'&&typeof v.content==='string'&&v.content.length<=20000&&Number.isFinite(Date.parse(v.publishedAt)));
}
export function generateSocialPost(
  platform: Platform,
  type: PostType,
  original?: NativeCronSocialPost,
): Promise<string> {
  return runCronSocialPost(original,platform,type,async({date,at,checkBeforeDispatch:check})=>{
    check();const since=new Date(at-14*86400000),rows=await prisma.$queryRawUnsafe<{source:SocialSource}[]>('SELECT '+sourceSql.replaceAll('$3','$1').replaceAll('$6','$2')+' AS source',platform,since);check();
    if(!Array.isArray(rows)||rows.length!==1||Object.keys(rows[0]).length!==1||!validSource(rows[0].source,platform))throw Error('social_post_unconfirmed');
    const source=rows[0].source,sourceJson=JSON.stringify(source),pillar=pickPillar(source.pillars.map(v=>v.pillar)),context=getNarrativeContext(source),prompt=buildPrompt(platform,pillar),systemPrompt=context?`${VOZ}\n\n${context}`:VOZ;
    const id=randomUUID(),args=[id,date,platform,type,sourceJson,since];check();
    const admission=await prisma.$queryRawUnsafe<{id:string;date:string;platform:string;slot:string;state:string}[]>(`
      INSERT INTO social_post_generation_attempts(id,date,platform,slot)
      SELECT $1,$2,$3,$4 WHERE ${sourceSql}=$5::jsonb AND ${noPriorSocialPost}
      ON CONFLICT(date,platform,slot) DO NOTHING RETURNING id,date,platform,slot,state`,...args);
    if(!Array.isArray(admission)||admission.length!==1||Object.keys(admission[0]).length!==5||admission[0].id!==id||admission[0].date!==date||admission[0].platform!==platform||admission[0].slot!==type||admission[0].state!=='pending')throw Error('social_post_unconfirmed');check();
    const task=await getMessagesTask({operationKey:id,serviceId:'brand-agent',taskType:'brand.social-post',language:'es',instructionsVersion:'brand.social-post-v1',requiredCapabilities:['prompt_cache']});check();
    const negative=await prisma.$queryRawUnsafe<{eligible:boolean}[]>(`SELECT EXISTS(SELECT 1 FROM social_post_generation_attempts WHERE id=$1 AND date=$2 AND platform=$3 AND slot=$4 AND state='pending' AND ${sourceSql}=$5::jsonb AND ${noPriorSocialPost}) AS eligible`,...args);check();
    if(!Array.isArray(negative)||negative.length!==1||Object.keys(negative[0]).length!==1||negative[0].eligible!==true)throw Error('social_post_unconfirmed');
    // The exact invoked model promise may finish its own SQL completion after retirement.
    const result=await task.create({max_tokens:1200,messages:[{role:'user',content:prompt}],system:systemPrompt,...(pillar.useWebSearch?{tools:[{name:'web_search' as const,maxCalls:3}]}:{})});
    if(!Array.isArray(result.content)||result.content.length!==1||result.content[0]?.type!=='text'||typeof result.content[0].text!=='string'||!result.content[0].text.trim()||result.content[0].text.length>20000)throw Error('social_post_unconfirmed');
    const content=result.content[0].text;
    const saved=await prisma.$queryRawUnsafe<{id:string}[]>(`
      WITH own AS MATERIALIZED(SELECT id FROM social_post_generation_attempts WHERE id=$1 AND date=$2 AND platform=$3 AND slot=$4 AND state='pending'
        AND ${sourceSql}=$5::jsonb AND ${noPriorSocialPost} FOR UPDATE),
      history AS(INSERT INTO social_pillar_history(channel,pillar) SELECT $3,$8 FROM own RETURNING id),
      completed AS(UPDATE social_post_generation_attempts SET state='completed',content=$7,pillar=$8,"completedAt"=timezone('UTC',clock_timestamp())
        WHERE id=$1 AND date=$2 AND platform=$3 AND slot=$4 AND state='pending' AND EXISTS(SELECT 1 FROM history) RETURNING id)
      SELECT id FROM completed`,...args,content,pillar.id);
    if(!Array.isArray(saved)||saved.length!==1||Object.keys(saved[0]).length!==1||saved[0].id!==id)throw Error('social_post_unconfirmed');
    return content;
  });
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
  return runContentTask('brand.youtube-reply', prompt, 150);
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
  return runContentTask('brand.gmail-reply', prompt, 400);
}
