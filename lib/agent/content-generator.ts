import { getMessagesTask } from '@/lib/ai/task-runtime';
import { prisma } from '@/lib/prisma';
import { randomUUID,createHmac } from 'node:crypto';
import { runCronSocialPost, type NativeCronSocialPost } from '@/lib/cron-dispatch-original';
import { runNativeAdminSocialPreview, type NativeAdminSocialPreview } from '@/lib/admin-social-preview-native';
import { runNativeAdminSocialDraft, type NativeAdminSocialDraft } from '@/lib/admin-social-publish-native';

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

export function generateAdminSocialPreview(original?:NativeAdminSocialPreview){
  return runNativeAdminSocialPreview(original,async own=>{
    const result={facebook:'',instagram:'',tiktok:null,twitter:null};
    for(const platform of ['facebook','instagram'] as const){
      own.check();const since=new Date(own.at-14*86400000),rows=await prisma.$queryRawUnsafe<{source:SocialSource}[]>('SELECT '+sourceSql.replaceAll('$3','$1').replaceAll('$6','$2')+' AS source',platform,since);own.check();
      if(!Array.isArray(rows)||rows.length!==1||!validSource(rows[0].source,platform))throw Error('social_preview_unconfirmed');
      const source=rows[0].source,pillar=pickPillar(source.pillars.map(v=>v.pillar)),context=getNarrativeContext(source),system=context?`${VOZ}\n\n${context}`:VOZ,prompt=buildPrompt(platform,pillar),id=randomUUID();
      const args=[id,own.commandRef,platform,own.type,JSON.stringify(source),since,own.actorId,own.email,own.verifiedAt,own.sessionRef];
      const actor=`EXISTS(SELECT 1 FROM users WHERE id=$7 AND email=$8 AND "emailVerified"=timezone('UTC',$9::timestamptz))`;
      const pending=`id=$1 AND "commandRef"=$2 AND platform=$3 AND type=$4 AND "userId"=$7 AND email=$8 AND "sessionRef"=$10 AND state='pending'`;
      own.check();const admitted=await prisma.$queryRawUnsafe<{id:string;commandRef:string;platform:string;type:string;userId:string;state:string}[]>(`
        INSERT INTO admin_social_preview_attempts(id,"commandRef",platform,type,"userId",email,"sessionRef")
        SELECT $1,$2,$3,$4,$7,$8,$10 WHERE ${sourceSql}=$5::jsonb AND ${actor}
        ON CONFLICT("commandRef",platform) DO NOTHING RETURNING id,"commandRef",platform,type,"userId",state`,...args);own.check();
      if(!Array.isArray(admitted)||admitted.length!==1||Object.keys(admitted[0]).length!==6||admitted[0].id!==id||admitted[0].commandRef!==own.commandRef||admitted[0].platform!==platform||admitted[0].type!==own.type||admitted[0].userId!==own.actorId||admitted[0].state!=='pending')throw Error('social_preview_unconfirmed');
      const task=await getMessagesTask({operationKey:id,serviceId:'brand-agent',taskType:'brand.social-post',language:'es',instructionsVersion:'brand.social-post-v1',requiredCapabilities:['prompt_cache']});own.check();
      const negative=await prisma.$queryRawUnsafe<{eligible:boolean}[]>(`SELECT EXISTS(SELECT 1 FROM admin_social_preview_attempts WHERE ${pending} AND ${sourceSql}=$5::jsonb AND ${actor}) AS eligible`,...args);own.check();
      if(!Array.isArray(negative)||negative.length!==1||Object.keys(negative[0]).length!==1||negative[0].eligible!==true)throw Error('social_preview_unconfirmed');
      const generated=await task.create({max_tokens:1200,messages:[{role:'user',content:prompt}],system,...(pillar.useWebSearch?{tools:[{name:'web_search' as const,maxCalls:3}]}:{})});
      if(!Array.isArray(generated.content)||generated.content.length!==1||generated.content[0]?.type!=='text'||typeof generated.content[0].text!=='string'||!generated.content[0].text.trim()||generated.content[0].text.length>20000)throw Error('social_preview_unconfirmed');
      const content=generated.content[0].text,saved=await prisma.$queryRawUnsafe<{id:string}[]>(`UPDATE admin_social_preview_attempts SET state='completed',content=$11,pillar=$12,"completedAt"=timezone('UTC',clock_timestamp()) WHERE ${pending} AND ${sourceSql}=$5::jsonb AND ${actor} RETURNING id`,...args,content,pillar.id);
      if(!Array.isArray(saved)||saved.length!==1||Object.keys(saved[0]).length!==1||saved[0].id!==id)throw Error('social_preview_unconfirmed');
      result[platform]=content;own.check();
    }
    return result;
  });
}

declare const adminSocialDraftResult: unique symbol;
export type AdminSocialDraftResult={readonly[adminSocialDraftResult]:true};
type DraftDetails={id:string;commandRef:string;userId:string;sessionRef:string;platform:'facebook'|'instagram';type:PostType;content:string;pillar:string};
type FacebookPublication=Readonly<{platform:'facebook';recordId:string;postId:string}>;
type InstagramPublication=Readonly<{platform:'instagram';recordId:string;postId:string}>;
type PreparedDraft=DraftDetails&{validate:()=>Promise<void>;publish:(image?:boolean)=>Promise<FacebookPublication|InstagramPublication>;purpose?:'consume'|'facebook-text'|'facebook-infographic'|'instagram-infographic';use?:Promise<unknown>};
const preparedDrafts=new WeakMap<object,PreparedDraft>();

async function readManualSocialBody(response:Response,limit:number,remaining:()=>number):Promise<Buffer>{
  if(!response.body)throw Error('social_publish_unconfirmed');const reader=response.body.getReader(),parts:Uint8Array[]=[];let length=0;
  try{for(;;){let timer:ReturnType<typeof setTimeout>|undefined;try{const part=await Promise.race([reader.read(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('social_publish_unconfirmed')),remaining());})]);remaining();if(part.done)break;length+=part.value.byteLength;if(length>limit)throw Error('social_publish_unconfirmed');parts.push(part.value);}finally{clearTimeout(timer);}}return Buffer.concat(parts);}
  finally{void reader.cancel().catch(()=>{});}
}

// Separate from a preview and from the cron: only this native draft child may
// admit and complete this command's own SQL/model work. Rows never issue a child.
export function generateAdminSocialDraft(platform:'facebook'|'instagram',type:PostType,original?:NativeAdminSocialDraft):Promise<AdminSocialDraftResult>{
  return runNativeAdminSocialDraft(original,platform,type,async own=>{
    const check=own.checkBeforeDispatch;await own.validateBeforeDispatch();
    const since=new Date(own.at-14*86400000),rows=await prisma.$queryRawUnsafe<{source:SocialSource}[]>('SELECT '+sourceSql.replaceAll('$3','$1').replaceAll('$6','$2')+' AS source',platform,since);check();
    if(!Array.isArray(rows)||rows.length!==1||Object.keys(rows[0]).length!==1||!validSource(rows[0].source,platform))throw Error('social_publish_unconfirmed');
    const source=rows[0].source,sourceJson=JSON.stringify(source),pillar=pickPillar(source.pillars.map(v=>v.pillar)),context=getNarrativeContext(source),system=context?`${VOZ}\n\n${context}`:VOZ,prompt=buildPrompt(platform,pillar),id=randomUUID();
    const args=[id,own.commandRef,platform,type,sourceJson,since,own.actorId,own.email,own.verifiedAt,own.sessionRef];
    const actor=`EXISTS(SELECT 1 FROM users WHERE id=$7 AND email=$8 AND "emailVerified"=timezone('UTC',$9::timestamptz))`;
    const ownRow=`id=$1 AND "commandRef"=$2 AND platform=$3 AND type=$4 AND "userId"=$7 AND email=$8 AND "sessionRef"=$10`;
    await own.validateBeforeDispatch();const admitted=await prisma.$queryRawUnsafe<{id:string;commandRef:string;platform:string;type:string;userId:string;state:string}[]>(`
      INSERT INTO admin_social_draft_attempts(id,"commandRef",platform,type,"userId",email,"sessionRef")
      SELECT $1,$2,$3,$4,$7,$8,$10 WHERE ${sourceSql}=$5::jsonb AND ${actor}
      ON CONFLICT("commandRef",platform) DO NOTHING RETURNING id,"commandRef",platform,type,"userId",state`,...args);check();
    if(!Array.isArray(admitted)||admitted.length!==1||Object.keys(admitted[0]).length!==6||admitted[0].id!==id||admitted[0].commandRef!==own.commandRef||admitted[0].platform!==platform||admitted[0].type!==type||admitted[0].userId!==own.actorId||admitted[0].state!=='pending')throw Error('social_publish_unconfirmed');
    const task=await getMessagesTask({operationKey:id,serviceId:'brand-agent',taskType:'brand.social-post',language:'es',instructionsVersion:'brand.social-post-v1',requiredCapabilities:['prompt_cache']});check();
    await own.validateBeforeDispatch();const eligible=await prisma.$queryRawUnsafe<{eligible:boolean}[]>(`SELECT EXISTS(SELECT 1 FROM admin_social_draft_attempts WHERE ${ownRow} AND state='pending' AND ${sourceSql}=$5::jsonb AND ${actor}) AS eligible`,...args);check();
    if(!Array.isArray(eligible)||eligible.length!==1||Object.keys(eligible[0]).length!==1||eligible[0].eligible!==true)throw Error('social_publish_unconfirmed');
    const generated=await task.create({max_tokens:1200,messages:[{role:'user',content:prompt}],system,...(pillar.useWebSearch?{tools:[{name:'web_search' as const,maxCalls:3}]}:{})});
    if(!Array.isArray(generated.content)||generated.content.length!==1||generated.content[0]?.type!=='text'||typeof generated.content[0].text!=='string'||!generated.content[0].text.trim()||generated.content[0].text.length>20000)throw Error('social_publish_unconfirmed');
    // The already invoked model may settle only its own completion after caller
    // retirement. No later platform/consumer/HTTP ACK is admitted after retirement.
    const content=generated.content[0].text,saved=await prisma.$queryRawUnsafe<{id:string}[]>(`UPDATE admin_social_draft_attempts SET state='completed',content=$11,pillar=$12,"completedAt"=timezone('UTC',clock_timestamp()) WHERE ${ownRow} AND state='pending' AND ${sourceSql}=$5::jsonb AND ${actor} RETURNING id`,...args,content,pillar.id);
    if(!Array.isArray(saved)||saved.length!==1||Object.keys(saved[0]).length!==1||saved[0].id!==id)throw Error('social_publish_unconfirmed');
    await own.validateBeforeDispatch();
    // Only this exact publication's acknowledged post/history may be excluded
    // from its original source veto. Foreign writes still invalidate the source.
    let published:{postId:string;historyId:number}|undefined,intent:{imageUrl:string|null}|undefined;
    const retainedSource=sourceSql.replace('WHERE channel=$3','WHERE channel=$3 AND id<>$14::integer').replace("WHERE status='published'","WHERE status='published' AND id<>$13");
    const validate=async()=>{
      await own.validateBeforeDispatch();const result=await prisma.$queryRawUnsafe<{eligible:boolean}[]>(`SELECT EXISTS(SELECT 1 FROM admin_social_draft_attempts WHERE ${ownRow} AND state='completed' AND content=$11 AND pillar=$12 AND "completedAt" IS NOT NULL AND ${published?retainedSource:sourceSql}=$5::jsonb AND ${actor}${published?` AND EXISTS(SELECT 1 FROM social_posts WHERE id=$13 AND platform=$3 AND content=$11 AND status='published' AND "bufferId"=$15 AND "publishedAt" IS NOT NULL AND "imageUrl" IS NOT DISTINCT FROM $16::text AND "errorMsg" IS NULL) AND EXISTS(SELECT 1 FROM social_pillar_history WHERE id=$14::integer AND channel=$3 AND pillar=$12)`:intent?` AND EXISTS(SELECT 1 FROM social_posts WHERE id=$1 AND platform=$3 AND content=$11 AND status='publishing' AND "publishedAt" IS NULL AND "bufferId" IS NULL AND "imageUrl" IS NOT DISTINCT FROM $13::text AND "errorMsg" IS NULL)`:''}) AS eligible`,...args,content,pillar.id,...(published?[id,published.historyId,published.postId,intent!.imageUrl]:intent?[intent.imageUrl]:[]));
      check();if(!Array.isArray(result)||result.length!==1||Object.keys(result[0]).length!==1||result[0].eligible!==true)throw Error('social_publish_unconfirmed');await own.validateBeforeDispatch();
    };
    const publish=async(image=false):Promise<FacebookPublication|InstagramPublication>=>{
      const instagram=platform==='instagram';if(instagram&&!image)throw Error('social_publish_unconfirmed');
      const page=instagram?process.env.INSTAGRAM_ACCOUNT_ID:process.env.META_PAGE_ID,token=instagram?process.env.INSTAGRAM_ACCESS_TOKEN:process.env.META_PAGE_ACCESS_TOKEN,secret=process.env.META_APP_SECRET;
      // Trusted server version only;no legacy version,host or token fallback.
      const version=instagram?process.env.INSTAGRAM_GRAPH_API_VERSION:undefined;
      if(!page||!/^\d{1,32}$/.test(page)||!token||/[\x00-\x1f\x7f]/.test(token))throw Error('social_publish_unconfirmed');
      if(instagram&&(!version||!/^v[1-9]\d{0,2}\.0$/.test(version)))throw Error('social_publish_unconfirmed');
      const blobToken=image?process.env.BLOB_READ_WRITE_TOKEN:undefined,store=image?blobToken?.match(/^vercel_blob_rw_([a-zA-Z0-9]+)_[a-zA-Z0-9]+$/)?.[1]:undefined;
      if(image&&!store)throw Error('social_publish_unconfirmed');
      const config=()=>{check();if((instagram?process.env.INSTAGRAM_ACCOUNT_ID:process.env.META_PAGE_ID)!==page||(instagram?process.env.INSTAGRAM_ACCESS_TOKEN:process.env.META_PAGE_ACCESS_TOKEN)!==token||process.env.META_APP_SECRET!==secret||instagram&&process.env.INSTAGRAM_GRAPH_API_VERSION!==version||image&&process.env.BLOB_READ_WRITE_TOKEN!==blobToken)throw Error('social_publish_unconfirmed');};
      await validate();config();
      // The draft's UUID is also this one publication's record ID. INSERT ACK
      // never authorizes adoption of an existing pending/failed/published row.
      const admitted=await prisma.$queryRawUnsafe<{id:string}[]>(`INSERT INTO social_posts(id,platform,content,status)
        SELECT $1,$3,$11,'publishing' WHERE EXISTS(SELECT 1 FROM admin_social_draft_attempts WHERE ${ownRow} AND state='completed' AND content=$11 AND pillar=$12)
          AND ${sourceSql}=$5::jsonb AND ${actor}
        ON CONFLICT(id) DO NOTHING RETURNING id`,...args,content,pillar.id);
      config();if(!Array.isArray(admitted)||admitted.length!==1||Object.keys(admitted[0]).length!==1||admitted[0].id!==id)throw Error('social_publish_unconfirmed');
      intent={imageUrl:null};
      await validate();const eligible=await prisma.$queryRawUnsafe<{eligible:boolean}[]>(`SELECT EXISTS(SELECT 1 FROM social_posts WHERE id=$1 AND platform=$2 AND content=$3 AND status='publishing' AND "publishedAt" IS NULL AND "bufferId" IS NULL AND "imageUrl" IS NULL AND "errorMsg" IS NULL) AS eligible`,id,platform,content);
      config();if(!Array.isArray(eligible)||eligible.length!==1||Object.keys(eligible[0]).length!==1||eligible[0].eligible!==true)throw Error('social_publish_unconfirmed');
      await validate();config();
      if(image){
        const {renderManualSocialInfographic}=await import('@/lib/agent/manual-social-infographic');await validate();config();
        const rendered=renderManualSocialInfographic(content),png=await readManualSocialBody(rendered,5*1024*1024,own.remainingBeforeDispatch);config();
        if(!rendered.ok||rendered.headers.get('content-type')!=='image/png'||png.length<33||!png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||png.readUInt32BE(16)!==1080||png.readUInt32BE(20)!==1080)throw Error('social_publish_unconfirmed');
        let bytes=png;
        if(instagram){const {encodeManualSocialJpeg}=await import('@/lib/agent/manual-social-jpeg');await validate();config();bytes=await encodeManualSocialJpeg(png);await validate();config();if(bytes.length<4||bytes.length>5*1024*1024||bytes.readUInt16BE(0)!==0xffd8||bytes.readUInt16BE(bytes.length-2)!==0xffd9)throw Error('social_publish_unconfirmed');}
        await validate();config();const pathname=`social-manual/${id}.${instagram?'jpg':'png'}`,contentType=instagram?'image/jpeg':'image/png';
        // Installed Blob protocol12,but one native PUT only:no SDK retry,
        // ambient API/OIDC override,overwrite,lookup or URL-based adoption.
        const uploaded=await fetch('https://vercel.com/api/blob/?'+new URLSearchParams({pathname}),{method:'PUT',redirect:'error',headers:{authorization:'Bearer '+blobToken,'x-vercel-blob-store-id':store!,'x-api-version':'12','x-api-blob-request-id':`${store}:${own.at}:${id}`,'x-api-blob-request-attempt':'0','x-vercel-blob-access':'public','x-add-random-suffix':'0','x-allow-overwrite':'0','x-content-type':contentType,'x-content-length':String(bytes.length)},body:Uint8Array.from(bytes),signal:AbortSignal.timeout(own.remainingBeforeDispatch())});
        // This same invoked upload may record only its own URL after retirement.
        const raw:unknown=await uploaded.json();
        if(!uploaded.ok||uploaded.redirected||!raw||typeof raw!=='object'||Array.isArray(raw)||!('url'in raw)||typeof raw.url!=='string'||raw.url!==`https://${store!.toLowerCase()}.public.blob.vercel-storage.com/${pathname}`||!('pathname'in raw)||raw.pathname!==pathname||!('contentType'in raw)||raw.contentType!==contentType)throw Error('social_publish_unconfirmed');
        const imageUrl=raw.url,savedImage=await prisma.$queryRawUnsafe<{id:string;imageUrl:string}[]>(`UPDATE social_posts SET "imageUrl"=$4 WHERE id=$1 AND platform=$2 AND content=$3 AND status='publishing' AND "publishedAt" IS NULL AND "bufferId" IS NULL AND "imageUrl" IS NULL AND "errorMsg" IS NULL RETURNING id,"imageUrl"`,id,platform,content,imageUrl);
        if(!Array.isArray(savedImage)||savedImage.length!==1||Object.keys(savedImage[0]).length!==2||savedImage[0].id!==id||savedImage[0].imageUrl!==imageUrl)throw Error('social_publish_unconfirmed');
        intent.imageUrl=imageUrl;await validate();config();
      }
      const message=content.replace(/\*\*(.*?)\*\*/g,'$1').replace(/\*(.*?)\*/g,'$1').replace(/__(.*?)__/g,'$1').replace(/_(.*?)_/g,'$1').replace(/`(.*?)`/g,'$1').replace(/#{1,6}\s/g,'');
      const proof=secret?createHmac('sha256',secret).update(token).digest('hex'):undefined;
      let postId:string;
      if(instagram){
        // Only this original's responses issue its container/status/publish.
        // Unfinished status remains uncertain;no poll/retry from stored IDs.
        const base=`https://graph.instagram.com/${version}`,caption=Array.from(message).slice(0,2200).join(''),credentials={access_token:token,...(proof?{appsecret_proof:proof}:{})};
        const json=async(response:Response):Promise<Record<string,unknown>>=>{const raw:unknown=await response.json();if(!response.ok||response.redirected||!raw||typeof raw!=='object'||Array.isArray(raw)||'error'in raw)throw Error('social_publish_unconfirmed');return raw as Record<string,unknown>;};
        await validate();config();
        const container=await json(await fetch(`${base}/${page}/media`,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({image_url:intent!.imageUrl,caption,...credentials}),signal:AbortSignal.timeout(own.remainingBeforeDispatch())}));
        if(typeof container.id!=='string'||!/^\d{1,32}$/.test(container.id))throw Error('social_publish_unconfirmed');const creationId=container.id;
        await validate();config();
        const status=await json(await fetch(`${base}/${creationId}?`+new URLSearchParams({fields:'status_code',...credentials}),{method:'GET',redirect:'error',signal:AbortSignal.timeout(own.remainingBeforeDispatch())}));
        if(status.id!==creationId||status.status_code!=='FINISHED')throw Error('social_publish_unconfirmed');
        await validate();config();
        const ack=await json(await fetch(`${base}/${page}/media_publish`,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({creation_id:creationId,...credentials}),signal:AbortSignal.timeout(own.remainingBeforeDispatch())}));
        if(typeof ack.id!=='string'||!/^\d{1,32}$/.test(ack.id))throw Error('social_publish_unconfirmed');postId=ack.id;
      }else{
      // One already-invoked publisher may settle only its own SQL completion.
      // Lost/rejected ACK leaves `publishing`; no retry, fallback or row recovery.
      const response=await fetch(`https://graph.facebook.com/v19.0/${page}/${image?'photos':'feed'}`,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({...image?{caption:message,url:intent.imageUrl}:{message},access_token:token,...(proof?{appsecret_proof:proof}:{})}),signal:AbortSignal.timeout(own.remainingBeforeDispatch())});
      const ack:unknown=await response.json();
      const remoteId=ack&&typeof ack==='object'&&!Array.isArray(ack)?image?('post_id'in ack?ack.post_id:undefined):('id'in ack?ack.id:undefined):undefined;
      if(!response.ok||response.redirected||!ack||typeof ack!=='object'||Array.isArray(ack)||typeof remoteId!=='string'||!/^\d{1,32}_\d{1,32}$/.test(remoteId)||!remoteId.startsWith(page+'_')||'error'in ack)throw Error('social_publish_unconfirmed');
        postId=remoteId;
      }
      const completed=await prisma.$queryRawUnsafe<{id:string;postId:string;historyId:number}[]>(`WITH updated AS(
        UPDATE social_posts SET status='published',"publishedAt"=timezone('UTC',clock_timestamp()),"bufferId"=$5
          WHERE id=$1 AND platform=$2 AND content=$3 AND status='publishing' AND "publishedAt" IS NULL AND "bufferId" IS NULL AND "imageUrl" IS NOT DISTINCT FROM $6::text AND "errorMsg" IS NULL RETURNING id),
        history AS(INSERT INTO social_pillar_history(channel,pillar) SELECT $2,$4 FROM updated RETURNING id)
        SELECT updated.id,$5::text AS "postId",history.id AS "historyId" FROM updated CROSS JOIN history`,id,platform,content,pillar.id,postId,intent.imageUrl);
      if(!Array.isArray(completed)||completed.length!==1||Object.keys(completed[0]).length!==3||completed[0].id!==id||completed[0].postId!==postId||!Number.isSafeInteger(completed[0].historyId))throw Error('social_publish_unconfirmed');
      published={postId,historyId:completed[0].historyId};await validate();config();
      return Object.freeze({platform,recordId:id,postId});
    };
    const cap=Object.freeze({})as AdminSocialDraftResult;preparedDrafts.set(cap,{id,commandRef:own.commandRef,userId:own.actorId,sessionRef:own.sessionRef,platform,type,content,pillar:pillar.id,validate,publish});return cap;
  });
}

// One live continuation can consume the exact completed result. This is not an
// external publication ACK, and no serialized draft or SQL lookup can recreate it.
export function consumeAdminSocialDraft<T>(receipt:AdminSocialDraftResult|undefined,run:(draft:Readonly<DraftDetails>&{validateBeforeDispatch:()=>Promise<void>})=>Promise<T>):Promise<T>{
  const own=receipt&&preparedDrafts.get(receipt);if(!own||own.purpose&&own.purpose!=='consume')return Promise.reject(Error('social_publish_unconfirmed'));own.purpose='consume';
  return (own.use??=Promise.resolve().then(async()=>{await own.validate();const result=await run(Object.freeze({id:own.id,commandRef:own.commandRef,userId:own.userId,sessionRef:own.sessionRef,platform:own.platform,type:own.type,content:own.content,pillar:own.pillar,validateBeforeDispatch:own.validate}));await own.validate();return result;}))as Promise<T>;
}

// Partial manual publication composition: text-only Facebook. The public route
// stays closed until images, Instagram and the native client/response are bound.
export function publishAdminFacebookDraft(receipt:AdminSocialDraftResult|undefined):Promise<FacebookPublication>{
  const own=receipt&&preparedDrafts.get(receipt);if(!own||own.platform!=='facebook'||own.purpose&&own.purpose!=='facebook-text')return Promise.reject(Error('social_publish_unconfirmed'));own.purpose='facebook-text';
  return (own.use??=Promise.resolve().then(()=>own.publish()))as Promise<FacebookPublication>;
}

export function publishAdminFacebookInfographic(receipt:AdminSocialDraftResult|undefined):Promise<FacebookPublication>{
  const own=receipt&&preparedDrafts.get(receipt);if(!own||own.platform!=='facebook'||own.purpose&&own.purpose!=='facebook-infographic')return Promise.reject(Error('social_publish_unconfirmed'));own.purpose='facebook-infographic';
  return (own.use??=Promise.resolve().then(()=>own.publish(true)))as Promise<FacebookPublication>;
}

export function publishAdminInstagramInfographic(receipt:AdminSocialDraftResult|undefined):Promise<InstagramPublication>{
  const own=receipt&&preparedDrafts.get(receipt);if(!own||own.platform!=='instagram'||own.purpose&&own.purpose!=='instagram-infographic')return Promise.reject(Error('social_publish_unconfirmed'));own.purpose='instagram-infographic';
  return (own.use??=Promise.resolve().then(()=>own.publish(true)))as Promise<InstagramPublication>;
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
