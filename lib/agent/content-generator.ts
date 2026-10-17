import { getMessagesTask } from '@/lib/ai/task-runtime';
import { prisma } from '@/lib/prisma';
import { randomUUID,createHmac } from 'node:crypto';
import { runCronSocialPost, validateCronImageReadSource, type NativeCronSocialPost, type NativeCronBrandImageRead } from '@/lib/cron-dispatch-original';
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
declare const cronSocialImagePrompt:unique symbol;
export type CronSocialImagePrompt={readonly[cronSocialImagePrompt]:true};
type CacheAck={date:string;url:string;source:string;stamp:string};
type CronImageSource={id:string;date:string;signal:AbortSignal;platform:string;slot:string;content:string;validate:()=>Promise<void>;remaining:()=>number;writeCache:(imageAttemptId:string,url:string,source:string)=>Promise<CacheAck[]>;writePublicationIntent:(url:string,admission:CronPublicationAdmission)=>Promise<void>;writePublication:(postId:string,admission:CronPublicationAdmission)=>Promise<void>;prompt?:Promise<CronSocialImagePrompt>;publication?:Promise<unknown>};
type CronPublicationAdmission={source:CronImageSource;id:string;stamp:string;accountId:string;validate:()=>Promise<void>};
const cronPublicationAdmissions=new WeakMap<object,CronPublicationAdmission>();
type PreparedCronPrompt={source:CronImageSource;prompt:string;imageAttemptId:string;validate:()=>Promise<void>;cache?:CacheAck;use?:Promise<unknown>};
const cronImageSources=new WeakMap<object,CronImageSource>(),cronImagePrompts=new WeakMap<object,PreparedCronPrompt>();

// Shared durable exclusion for EVERY native publisher, including direct manual
// draft publishers. It is private: rows and this negative checker cannot issue a
// source, resume an effect, or acknowledge a publication. A lost INSERT ACK
// leaves the day occupied. No expiry, deletion, reset or adoption is supported.
async function admitPublicationDay(platform:string,account:string,date:string,kind:'manual'|'cron',ownerId:string,validate:()=>Promise<void>){
  await validate();
  const id=randomUUID(),args=[id,platform,account,date,kind,ownerId];
  const rows=await prisma.$queryRawUnsafe<{id:string;stamp:string}[]>(`INSERT INTO social_publication_daily_attempts(id,platform,"accountId",date,"ownerKind","ownerId")
    SELECT $1,$2,$3,$4,$5,$6 WHERE
    (($5='manual' AND EXISTS(SELECT 1 FROM admin_social_draft_attempts WHERE id=$6 AND platform=$2 AND state='completed'))
      OR ($5='cron' AND EXISTS(SELECT 1 FROM social_post_generation_attempts WHERE id=$6 AND platform=$2 AND date=$4 AND state='completed')))
    AND NOT EXISTS(SELECT 1 FROM social_posts WHERE platform=$2 AND "createdAt">=($4::date)::timestamp AND "createdAt"<($4::date+1)::timestamp)
    AND NOT EXISTS(SELECT 1 FROM admin_social_publish_attempts a WHERE a.platform=$2 AND a."accountId"=$3 AND a.date=$4
      AND NOT($5='manual' AND EXISTS(SELECT 1 FROM admin_social_draft_attempts d WHERE d.id=$6 AND d."commandRef"=a."commandRef" AND d.platform=a.platform)))
    ON CONFLICT DO NOTHING RETURNING id,"createdAt"::text AS stamp`,...args);
  if(!Array.isArray(rows)||rows.length!==1||Object.keys(rows[0]).sort().join(',')!=='id,stamp'||rows[0].id!==id||typeof rows[0].stamp!=='string'||!rows[0].stamp)throw Error('social_publish_unconfirmed');
  const stamp=rows[0].stamp;
  const checkRow=async()=>{
    const current=await prisma.$queryRawUnsafe<{eligible:boolean}[]>(`SELECT EXISTS(SELECT 1 FROM social_publication_daily_attempts WHERE id=$1 AND platform=$2 AND "accountId"=$3 AND date=$4 AND "ownerKind"=$5 AND "ownerId"=$6 AND state='admitted' AND "createdAt"::text=$7) AS eligible`,...args,stamp);
    if(!Array.isArray(current)||current.length!==1||Object.keys(current[0]).length!==1||current[0].eligible!==true)throw Error('social_publish_unconfirmed');
  };
  const check=async()=>{await validate();await checkRow();await validate();};
  await check();return {check,checkRow,id,stamp};
}

// This new publication continuation requires this invocation's own completed
// social source/history ACK. It admits only the captured server account/day.
// Its callback is NOT a publication receipt: image binding, remote effect and
// SQL completion still belong to a separate publisher, currently unwired.
export function runCronSocialPublication<T>(original:NativeCronSocialPost|undefined,run:(context:Readonly<{date:string;platform:'facebook'|'instagram';accountId:string;content:string;validateBeforeDispatch:()=>Promise<void>;remainingBeforeDispatch:()=>number}>)=>Promise<T>):Promise<T>{
  const own=original&&cronImageSources.get(original);
  if(!own||!['facebook','instagram'].includes(own.platform))return Promise.reject(Error('social_publish_unconfirmed'));
  return (own.publication??=Promise.resolve().then(async()=>{
    const platform=own.platform as 'facebook'|'instagram',key=platform==='facebook'?'META_PAGE_ID':'INSTAGRAM_ACCOUNT_ID',account=process.env[key];
    if(!account||!/^\d{1,32}$/.test(account))throw Error('social_publish_unconfirmed');
    const validate=async()=>{if(process.env[key]!==account)throw Error('social_publish_unconfirmed');await own.validate();if(process.env[key]!==account)throw Error('social_publish_unconfirmed');};
    const {check,id,stamp}=await admitPublicationDay(platform,account,own.date,'cron',own.id,validate);
    cronPublicationAdmissions.set(original!,{source:own,id,stamp,accountId:account,validate:check});
    await check();const result=await run(Object.freeze({date:own.date,platform,accountId:account,content:own.content,validateBeforeDispatch:check,remainingBeforeDispatch:own.remaining}));await check();return result;
  })) as Promise<T>;
}

export function generateSocialPost(
  platform: Platform,
  type: PostType,
  original?: NativeCronSocialPost,
): Promise<string> {
  return runCronSocialPost(original,platform,type,async({date,at,signal,checkBeforeDispatch:check,remainingBeforeDispatch:remaining})=>{
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
    const saved=await prisma.$queryRawUnsafe<{id:string;historyId:number}[]>(`
      WITH own AS MATERIALIZED(SELECT id FROM social_post_generation_attempts WHERE id=$1 AND date=$2 AND platform=$3 AND slot=$4 AND state='pending'
        AND ${sourceSql}=$5::jsonb AND ${noPriorSocialPost} FOR UPDATE),
      history AS(INSERT INTO social_pillar_history(channel,pillar) SELECT $3,$8 FROM own RETURNING id),
      completed AS(UPDATE social_post_generation_attempts SET state='completed',content=$7,pillar=$8,"completedAt"=timezone('UTC',clock_timestamp())
        WHERE id=$1 AND date=$2 AND platform=$3 AND slot=$4 AND state='pending' AND EXISTS(SELECT 1 FROM history) RETURNING id)
      SELECT completed.id,history.id AS "historyId" FROM completed CROSS JOIN history`,...args,content,pillar.id);
    if(!Array.isArray(saved)||saved.length!==1||Object.keys(saved[0]).length!==2||saved[0].id!==id||!Number.isSafeInteger(saved[0].historyId))throw Error('social_post_unconfirmed');
    const historyId=saved[0].historyId,retainedSource=sourceSql.replace('WHERE channel=$3','WHERE channel=$3 AND id<>$9::integer');
    // These exceptions exist only after THIS invocation's own complete INSERT
    // or UPDATE ACK. A persisted row/URL/remote ID never initializes them.
    let publication:{imageUrl:string;createdStamp:string;postId?:string;publishedStamp?:string}|undefined;
    const ownPostExclusion=()=>publication?noPriorSocialPost.replace('WHERE platform=$3','WHERE id<>$1 AND platform=$3'):noPriorSocialPost;
    const narrative=()=>publication?.postId?retainedSource.replace("WHERE status='published'","WHERE status='published' AND id<>$1"):retainedSource;
    const validate=async()=>{
      check();const rows=await prisma.$queryRawUnsafe<{eligible:boolean}[]>(`SELECT EXISTS(SELECT 1 FROM social_post_generation_attempts WHERE id=$1 AND date=$2 AND platform=$3 AND slot=$4 AND state='completed'
        AND content=$7 AND pillar=$8 AND "completedAt" IS NOT NULL AND ${narrative()}=$5::jsonb AND ${ownPostExclusion()}
        AND EXISTS(SELECT 1 FROM social_pillar_history WHERE id=$9::integer AND channel=$3 AND pillar=$8)
        ${publication?`AND EXISTS(SELECT 1 FROM social_posts WHERE id=$1 AND platform=$3 AND content=$7 AND "imageUrl"=$10 AND "createdAt"::text=$11 AND "errorMsg" IS NULL AND ${publication.postId?`status='published' AND "bufferId"=$12 AND "publishedAt"::text=$13`:`status='publishing' AND "bufferId" IS NULL AND "publishedAt" IS NULL`})`:''}) AS eligible`,...args,content,pillar.id,historyId,...(publication?[publication.imageUrl,publication.createdStamp,...(publication.postId?[publication.postId,publication.publishedStamp]:[])]:[]));
      check();if(!Array.isArray(rows)||rows.length!==1||Object.keys(rows[0]).length!==1||rows[0].eligible!==true)throw Error('daily_brand_image_unconfirmed');
    };
    const sharedPredicate=(idAt:number,accountAt:number,stampAt:number)=>`EXISTS(SELECT 1 FROM social_publication_daily_attempts WHERE id=$${idAt} AND platform=$3 AND "accountId"=$${accountAt} AND date=$2 AND "ownerKind"='cron' AND "ownerId"=$1 AND state='admitted' AND "createdAt"::text=$${stampAt})`;
    const sourcePredicate=`EXISTS(SELECT 1 FROM social_post_generation_attempts WHERE id=$1 AND date=$2 AND platform=$3 AND slot=$4 AND state='completed' AND content=$7 AND pillar=$8 AND "completedAt" IS NOT NULL
      AND ${retainedSource}=$5::jsonb AND EXISTS(SELECT 1 FROM social_pillar_history WHERE id=$9::integer AND channel=$3 AND pillar=$8))`;
    const writePublicationIntent=async(url:string,shared:CronPublicationAdmission)=>{
      if(shared.source!==preparedSource||publication)throw Error('social_publish_unconfirmed');await shared.validate();
      const rows=await prisma.$queryRawUnsafe<{id:string;imageUrl:string;createdStamp:string}[]>(`INSERT INTO social_posts(id,platform,content,"imageUrl",status,"createdAt")
        SELECT $1,$3,$7,$10,'publishing',timezone('UTC',clock_timestamp()) WHERE ${sourcePredicate} AND ${noPriorSocialPost} AND ${sharedPredicate(11,12,13)}
        ON CONFLICT(id) DO NOTHING RETURNING id,"imageUrl","createdAt"::text AS "createdStamp"`,...args,content,pillar.id,historyId,url,shared.id,shared.accountId,shared.stamp);
      if(!Array.isArray(rows)||rows.length!==1||Object.keys(rows[0]).sort().join(',')!=='createdStamp,id,imageUrl'||rows[0].id!==id||rows[0].imageUrl!==url||typeof rows[0].createdStamp!=='string'||!rows[0].createdStamp)throw Error('social_publish_unconfirmed');
      publication={imageUrl:url,createdStamp:rows[0].createdStamp};await shared.validate();
    };
    const writePublication=async(postId:string,shared:CronPublicationAdmission)=>{
      if(shared.source!==preparedSource||!publication||publication.postId)throw Error('social_publish_unconfirmed');await shared.validate();
      const rows=await prisma.$queryRawUnsafe<{id:string;postId:string;imageUrl:string;publishedStamp:string}[]>(`UPDATE social_posts SET status='published',"bufferId"=$12,"publishedAt"=timezone('UTC',clock_timestamp())
        WHERE id=$1 AND platform=$3 AND content=$7 AND "imageUrl"=$10 AND "createdAt"::text=$11 AND status='publishing' AND "bufferId" IS NULL AND "publishedAt" IS NULL AND "errorMsg" IS NULL
        AND ${sourcePredicate} AND ${ownPostExclusion()} AND ${sharedPredicate(13,14,15)} RETURNING id,"bufferId" AS "postId","imageUrl","publishedAt"::text AS "publishedStamp"`,...args,content,pillar.id,historyId,publication.imageUrl,publication.createdStamp,postId,shared.id,shared.accountId,shared.stamp);
      if(!Array.isArray(rows)||rows.length!==1||Object.keys(rows[0]).sort().join(',')!=='id,imageUrl,postId,publishedStamp'||rows[0].id!==id||rows[0].postId!==postId||rows[0].imageUrl!==publication.imageUrl||typeof rows[0].publishedStamp!=='string'||!rows[0].publishedStamp)throw Error('social_publish_unconfirmed');
      publication={...publication,postId,publishedStamp:rows[0].publishedStamp};await shared.validate();
    };
    // Only this producer's own completed SQL/history ACK issues an image source.
    // Its private native lifetime remains captured;rows never recreate it.
    const writeCache=(imageAttemptId:string,url:string,cacheSource:string)=>prisma.$queryRawUnsafe<CacheAck[]>(`
      INSERT INTO daily_brand_image(image_date,url,source)
      SELECT $2::date,$10,$11 WHERE EXISTS(SELECT 1 FROM social_post_generation_attempts WHERE id=$1 AND date=$2 AND platform=$3 AND slot=$4 AND state='completed'
        AND content=$7 AND pillar=$8 AND "completedAt" IS NOT NULL AND ${retainedSource}=$5::jsonb AND ${noPriorSocialPost}
        AND EXISTS(SELECT 1 FROM social_pillar_history WHERE id=$9::integer AND channel=$3 AND pillar=$8))
      AND EXISTS(SELECT 1 FROM cron_daily_brand_image_attempts WHERE id=$12 AND date=$2 AND "sourceId"=$1 AND platform=$3 AND slot=$4 AND state='admitted')
      ON CONFLICT(image_date) DO NOTHING RETURNING image_date::text AS date,url,source,created_at::text AS stamp`,...args,content,pillar.id,historyId,url,cacheSource,imageAttemptId);
    const preparedSource:CronImageSource={id,date,signal,platform,slot:type,content,validate,remaining,writeCache,writePublicationIntent,writePublication};
    check();cronImageSources.set(original!,preparedSource);
    return content;
  });
}

// This produces only the textual image prompt. Binary image generation,
// daily cache completion,upload and publication require separate native ACKs.
export async function validateCronSocialImageSource(original?:NativeCronSocialPost):Promise<void>{
  const own=original&&cronImageSources.get(original);
  if(!own)throw Error('daily_brand_image_unconfirmed');
  await own.validate();
}
export function generateCronSocialImagePrompt(original?:NativeCronSocialPost):Promise<CronSocialImagePrompt>{
  const own=original&&cronImageSources.get(original);if(!own)return Promise.reject(Error('daily_brand_image_unconfirmed'));
  return own.prompt??=Promise.resolve().then(async()=>{
    await own.validate();const imageAttemptId=randomUUID();
    // The first native source to obtain this INSERT ACK owns the UTC day.
    // Existing claims/cache only veto;never return or adopt their prompt/URL.
    const imageArgs=[imageAttemptId,own.date,own.id,own.platform,own.slot];
    const admitted=await prisma.$queryRawUnsafe<{id:string;date:string;sourceId:string;platform:string;slot:string;state:string}[]>(`
      INSERT INTO cron_daily_brand_image_attempts(id,date,"sourceId",platform,slot)
      SELECT $1,$2,$3,$4,$5 WHERE NOT EXISTS(SELECT 1 FROM daily_brand_image WHERE image_date=$2::date)
      ON CONFLICT(date) DO NOTHING RETURNING id,date,"sourceId",platform,slot,state`,...imageArgs);
    await own.validate();
    if(!Array.isArray(admitted)||admitted.length!==1||Object.keys(admitted[0]).length!==6||admitted[0].id!==imageAttemptId
      ||admitted[0].date!==own.date||admitted[0].sourceId!==own.id||admitted[0].platform!==own.platform||admitted[0].slot!==own.slot||admitted[0].state!=='admitted')throw Error('daily_brand_image_unconfirmed');
    let prepared:PreparedCronPrompt|undefined;
    const validate=async()=>{
      const cache=prepared?.cache;await own.validate();const rows=await prisma.$queryRawUnsafe<{eligible:boolean}[]>(`SELECT EXISTS(SELECT 1 FROM cron_daily_brand_image_attempts
        WHERE id=$1 AND date=$2 AND "sourceId"=$3 AND platform=$4 AND slot=$5 AND state='admitted'
        AND ${cache?'EXISTS(SELECT 1 FROM daily_brand_image WHERE image_date=$2::date AND url=$6 AND source=$7 AND created_at::text=$8)':'NOT EXISTS(SELECT 1 FROM daily_brand_image WHERE image_date=$2::date)'}) AS eligible`,...imageArgs,...(cache?[cache.url,cache.source,cache.stamp]:[]));
      await own.validate();if(!Array.isArray(rows)||rows.length!==1||Object.keys(rows[0]).length!==1||rows[0].eligible!==true)throw Error('daily_brand_image_unconfirmed');
    };
    await validate();const signal=AbortSignal.timeout(own.remaining());
    const task=await getMessagesTask({operationKey:own.id+':image-prompt',serviceId:'brand-agent',taskType:'brand.image-prompt',language:'en',instructionsVersion:'brand-image-prompt-v1'},{signal});
    await validate();
    const result=await task.create({max_tokens:100,messages:[{role:'user',content:`Given this social media post about YouTube:\n"${own.content.slice(0,300)}"\n\nWrite a concise image generation prompt (max 200 chars) for a 1:1 social media visual.\nThe image should be eye-catching and related to the post's topic.\n\nRULES:\n- NO text, NO words, NO letters, NO numbers in the image\n- Focus on a strong visual scene/metaphor related to the topic\n- Modern, premium, editorial photography or 3D render style\n- Dramatic lighting, rich colors, professional composition\n- Think: what image would make someone stop scrolling?\n\nReturn ONLY the image prompt, nothing else.`}]},{signal});
    // The invoked common task owns its accounting/completion. Retirement or an
    // uncertain result cannot issue an image/download/upload continuation.
    if(result.incomplete===true||!Array.isArray(result.content)||result.content.length!==1||result.content[0]?.type!=='text'||typeof result.content[0].text!=='string')throw Error('daily_brand_image_unconfirmed');
    const prompt=result.content[0].text.trim();if(!prompt||Array.from(prompt).length>200)throw Error('daily_brand_image_unconfirmed');
    await validate();const cap=Object.freeze({})as CronSocialImagePrompt;prepared={source:own,prompt,imageAttemptId,validate};cronImagePrompts.set(cap,prepared);return cap;
  });
}
export function consumeCronSocialImagePrompt<T>(receipt:CronSocialImagePrompt|undefined,run:(prompt:Readonly<{id:string;date:string;platform:string;slot:string;content:string;prompt:string;imageAttemptId:string;validateBeforeDispatch:()=>Promise<void>;remainingBeforeDispatch:()=>number}>)=>Promise<T>):Promise<T>{
  const own=receipt&&cronImagePrompts.get(receipt);if(!own)return Promise.reject(Error('daily_brand_image_unconfirmed'));
  return (own.use??=Promise.resolve().then(async()=>{await own.validate();const result=await run(Object.freeze({id:own.source.id,date:own.source.date,platform:own.source.platform,slot:own.source.slot,content:own.source.content,prompt:own.prompt,imageAttemptId:own.imageAttemptId,validateBeforeDispatch:own.validate,remainingBeforeDispatch:own.source.remaining}));await own.validate();return result;}))as Promise<T>;
}

// Only an already invoked native Blob PUT's private ACK may complete this cache.
// A cache row,URL,serialized claim or a fresh GET can never recreate that ACK.
declare const cronBrandImageCache:unique symbol;
export type NativeCronBrandImageCache={readonly[cronBrandImageCache]:true};
const cacheAttempts=new WeakMap<object,Promise<NativeCronBrandImageCache>>(),completedCaches=new WeakMap<object,{ack:CacheAck;validate:()=>Promise<void>;use?:Promise<unknown>}>();
export function completeCronBrandImageCache(upload?:import('./cron-brand-image').NativeUploadedCronBrandImage):Promise<NativeCronBrandImageCache>{
  if(!upload||typeof upload!=='object')return Promise.reject(Error('daily_brand_image_unconfirmed'));
  const previous=cacheAttempts.get(upload);if(previous)return previous;
  const pending=Promise.resolve().then(async()=>{
    const {consumeUploadedCronBrandImage}=await import('./cron-brand-image');
    return consumeUploadedCronBrandImage(upload,async image=>{
      const own=cronImagePrompts.get(image.promptReceipt);
      if(!own||own.imageAttemptId!==image.imageAttemptId||own.source.id!==image.id||own.source.date!==image.date)throw Error('daily_brand_image_unconfirmed');
      await image.validateBeforeDispatch();await own.validate();
      const source='cron-native-v1:'+own.imageAttemptId,rows=await own.source.writeCache(own.imageAttemptId,image.url,source);
      // Set the lexical exception only from this INSERT's own complete ACK.
      // Lost/ambiguous ACKs retain uncertainty and never adopt a row afterwards.
      if(!Array.isArray(rows)||rows.length!==1||Object.keys(rows[0]).length!==4||rows[0].date!==own.source.date||rows[0].url!==image.url||rows[0].source!==source||typeof rows[0].stamp!=='string'||!rows[0].stamp)throw Error('daily_brand_image_unconfirmed');
      own.cache=Object.freeze({...rows[0]});await image.validateBeforeDispatch();await own.validate();
      const cap=Object.freeze({})as NativeCronBrandImageCache;completedCaches.set(cap,{ack:own.cache,validate:image.validateBeforeDispatch});return cap;
    });
  }).then(cap=>{if(!cap||typeof cap!=='object'||!completedCaches.has(cap))throw Error('daily_brand_image_unconfirmed');return cap;});
  cacheAttempts.set(upload,pending);return pending;
}
export function consumeCronBrandImageCache<T>(receipt:NativeCronBrandImageCache|undefined,run:(image:Readonly<{date:string;url:string;source:string}>)=>Promise<T>):Promise<T>{
  const own=receipt&&completedCaches.get(receipt);if(!own)return Promise.reject(Error('daily_brand_image_unconfirmed'));
  return(own.use??=Promise.resolve().then(async()=>{await own.validate();const result=await run(Object.freeze({date:own.ack.date,url:own.ack.url,source:own.ack.source}));await own.validate();return result;}))as Promise<T>;
}
export async function validateCronBrandImageCache(receipt:NativeCronBrandImageCache|undefined):Promise<void>{
  const own=receipt&&completedCaches.get(receipt);if(!own)throw Error('daily_brand_image_unconfirmed');await own.validate();
}

declare const nativeCronFacebookPublication:unique symbol;
export type NativeCronFacebookPublication={readonly[nativeCronFacebookPublication]:true};
type CronFacebookPublicationDetails=Readonly<{platform:'facebook';date:string;recordId:string;photoId:string;postId:string}>;
const facebookPublicationAttempts=new WeakMap<object,{read:NativeCronBrandImageRead|undefined;promise:Promise<NativeCronFacebookPublication>}>();
const facebookPublications=new WeakMap<object,{original:NativeCronSocialPost;details:CronFacebookPublicationDetails;validate:()=>Promise<void>;use?:Promise<unknown>}>();

// Native component only. GET integration and Instagram remain separate work.
// Source/image/target/day/HTTP/SQL each retain their original continuation;no
// serialized URL,remote ID or persisted post can construct this final receipt.
export function publishCronFacebookPhoto(original:NativeCronSocialPost|undefined,read?:NativeCronBrandImageRead):Promise<NativeCronFacebookPublication>{
  const own=original&&cronImageSources.get(original);
  if(!original||!own||own.platform!=='facebook'||own.slot!=='morning')return Promise.reject(Error('social_publish_unconfirmed'));
  const previous=facebookPublicationAttempts.get(original);if(previous)return previous.read===read?previous.promise:Promise.reject(Error('social_publish_unconfirmed'));
  const pending=Promise.resolve().then(async()=>{
    const helper=await import('./ideogram-image'),{prepareCronFacebookPhotoTransport}=await import('./cron-facebook-photo-transport');
    await own.validate();if(read!==undefined)validateCronImageReadSource(original,read);
    let shared:CronPublicationAdmission|undefined,image:import('./ideogram-image').NativeDailyBrandImage|undefined;
    const validate=async()=>{
      if(!shared||shared.source!==own)throw Error('social_publish_unconfirmed');
      target.check();await shared.validate();if(image)await helper.validateDailyBrandImageSource(original,image);target.check();await shared.validate();
    };
    const target=prepareCronFacebookPhotoTransport({signal:own.signal,remaining:own.remaining,validate});target.check();
    return runCronSocialPublication(original,async context=>{
      shared=cronPublicationAdmissions.get(original);
      if(!shared||shared.source!==own||target.accountId!==context.accountId)throw Error('social_publish_unconfirmed');
      // Occupy the common day before any image prompt/model/download/PUT.
      await validate();image=await helper.getOrCreateDailyBrandImage(original,read);await validate();
      const outcome=Object.freeze({});let acknowledged:CronFacebookPublicationDetails|undefined;
      const result=await helper.consumeDailyBrandImage(image,async resource=>{
        if(resource.date!==own.date)throw Error('social_publish_unconfirmed');await validate();
        await own.writePublicationIntent(resource.url,shared!);await validate();
        const ack=await target.publish({date:own.date,caption:own.content,imageUrl:resource.url});await validate();
        await own.writePublication(ack.postId,shared!);await validate();
        acknowledged=Object.freeze({platform:'facebook',date:own.date,recordId:own.id,photoId:ack.photoId,postId:ack.postId});return outcome;
      });
      // A previously consumed image cannot substitute a different callback's
      // result;only THIS callback's exact awaited outcome may issue a receipt.
      if(result!==outcome||!acknowledged)throw Error('social_publish_unconfirmed');await validate();
      const cap=Object.freeze({})as NativeCronFacebookPublication;facebookPublications.set(cap,{original,details:acknowledged,validate});return cap;
    });
  }).then(cap=>{if(!cap||typeof cap!=='object'||facebookPublications.get(cap)?.original!==original)throw Error('social_publish_unconfirmed');return cap;});
  facebookPublicationAttempts.set(original,{read,promise:pending});return pending;
}
export function consumeCronFacebookPublication<T>(receipt:NativeCronFacebookPublication|undefined,run:(publication:CronFacebookPublicationDetails&{validateBeforeResponse:()=>Promise<void>})=>Promise<T>):Promise<T>{
  const own=receipt&&facebookPublications.get(receipt);if(!own)return Promise.reject(Error('social_publish_unconfirmed'));
  return(own.use??=Promise.resolve().then(async()=>{await own.validate();const result=await run(Object.freeze({...own.details,validateBeforeResponse:own.validate}));await own.validate();return result;}))as Promise<T>;
}

declare const nativeCronInstagramPublication:unique symbol;
export type NativeCronInstagramPublication={readonly[nativeCronInstagramPublication]:true};
type CronInstagramPublicationDetails=Readonly<{platform:'instagram';date:string;recordId:string;containerId:string;postId:string;brandImage:Readonly<{date:string;cacheCompleted:true}|{date:string;cacheResourceRead:true;producerAcknowledged:false}>}>;
const instagramPublicationAttempts=new WeakMap<object,{read:NativeCronBrandImageRead|undefined;promise:Promise<NativeCronInstagramPublication>}>();
const instagramPublications=new WeakMap<object,{original:NativeCronSocialPost;details:CronInstagramPublicationDetails;validate:()=>Promise<void>;use?:Promise<unknown>}>();

// Native component consumed by the evening GET;morning batch integration remains.
// Source/image/target/day/HTTP/SQL each retain their original continuation;no
// serialized URL,remote ID or persisted post can construct this final receipt.
export function publishCronInstagramPhoto(original:NativeCronSocialPost|undefined,read?:NativeCronBrandImageRead):Promise<NativeCronInstagramPublication>{
  const own=original&&cronImageSources.get(original);
  if(!original||!own||own.platform!=='instagram'||!['morning','evening'].includes(own.slot))return Promise.reject(Error('social_publish_unconfirmed'));
  const previous=instagramPublicationAttempts.get(original);if(previous)return previous.read===read?previous.promise:Promise.reject(Error('social_publish_unconfirmed'));
  const pending=Promise.resolve().then(async()=>{
    const helper=await import('./ideogram-image'),{prepareCronInstagramPhotoTransport}=await import('./cron-instagram-photo-transport');
    await own.validate();if(read!==undefined)validateCronImageReadSource(original,read);
    let shared:CronPublicationAdmission|undefined,image:import('./ideogram-image').NativeDailyBrandImage|undefined;
    const validate=async()=>{
      if(!shared||shared.source!==own)throw Error('social_publish_unconfirmed');
      target.check();await shared.validate();if(image)await helper.validateDailyBrandImageSource(original,image);target.check();await shared.validate();
    };
    const target=prepareCronInstagramPhotoTransport({signal:own.signal,remaining:own.remaining,validate});target.check();
    return runCronSocialPublication(original,async context=>{
      shared=cronPublicationAdmissions.get(original);
      if(!shared||shared.source!==own||target.accountId!==context.accountId)throw Error('social_publish_unconfirmed');
      // Occupy the common day before any image prompt/model/download/PUT.
      await validate();try{image=await helper.getOrCreateDailyBrandImage(original,read);}catch{throw Error('daily_brand_image_unconfirmed');}await validate();
      const outcome=Object.freeze({});let acknowledged:CronInstagramPublicationDetails|undefined;
      const result=await helper.consumeDailyBrandImage(image,async resource=>{
        if(resource.date!==own.date)throw Error('social_publish_unconfirmed');await validate();
        await own.writePublicationIntent(resource.url,shared!);await validate();
        const ack=await target.publish({date:own.date,caption:own.content,imageUrl:resource.url});await validate();
        await own.writePublication(ack.postId,shared!);await validate();
        acknowledged=Object.freeze({platform:'instagram',date:own.date,recordId:own.id,containerId:ack.containerId,postId:ack.postId,brandImage:Object.freeze(resource.producerAcknowledged?{date:own.date,cacheCompleted:true as const}:{date:own.date,cacheResourceRead:true as const,producerAcknowledged:false as const})});return outcome;
      });
      // A previously consumed image cannot substitute a different callback's
      // result;only THIS callback's exact awaited outcome may issue a receipt.
      if(result!==outcome||!acknowledged)throw Error('social_publish_unconfirmed');await validate();
      const cap=Object.freeze({})as NativeCronInstagramPublication;instagramPublications.set(cap,{original,details:acknowledged,validate});return cap;
    });
  }).then(cap=>{if(!cap||typeof cap!=='object'||instagramPublications.get(cap)?.original!==original)throw Error('social_publish_unconfirmed');return cap;});
  instagramPublicationAttempts.set(original,{read,promise:pending});return pending;
}
export function consumeCronInstagramPublication<T>(receipt:NativeCronInstagramPublication|undefined,run:(publication:CronInstagramPublicationDetails&{validateBeforeResponse:()=>Promise<void>})=>Promise<T>):Promise<T>{
  const own=receipt&&instagramPublications.get(receipt);if(!own)return Promise.reject(Error('social_publish_unconfirmed'));
  return(own.use??=Promise.resolve().then(async()=>{await own.validate();const result=await run(Object.freeze({...own.details,validateBeforeResponse:own.validate}));await own.validate();return result;}))as Promise<T>;
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
type PreparedDraft=DraftDetails&{validate:()=>Promise<void>;validatePublished:(source:boolean)=>Promise<void>;publish:(image?:boolean)=>Promise<FacebookPublication|InstagramPublication>;purpose?:'consume'|'facebook-text'|'facebook-infographic'|'instagram-infographic';use?:Promise<unknown>};
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
    let published:{postId:string;historyId:number}|undefined,intent:{imageUrl:string|null}|undefined,publicationDayCheck:(()=>Promise<void>)|undefined,publicationDayRowCheck:(()=>Promise<void>)|undefined;
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
      const date=new Date(own.at).toISOString().slice(0,10);
      const admission=await admitPublicationDay(platform,page,date,'manual',id,async()=>{await validate();config();});
      publicationDayCheck=admission.check;publicationDayRowCheck=admission.checkRow;
      // Both controller-driven and direct native draft publishers pass the same
      // daily unique gate before intent/image/remote dispatch. Controller claims
      // from earlier code are vetoes, never shared-day recovery authority.
      const dispatchCheck=async()=>{await publicationDayCheck!();config();};
      await dispatchCheck();
      // The draft's UUID is also this one publication's record ID. INSERT ACK
      // never authorizes adoption of an existing pending/failed/published row.
      const admitted=await prisma.$queryRawUnsafe<{id:string}[]>(`INSERT INTO social_posts(id,platform,content,status,"createdAt")
        SELECT $1,$3,$11,'publishing',timezone('UTC',clock_timestamp()) WHERE EXISTS(SELECT 1 FROM admin_social_draft_attempts WHERE ${ownRow} AND state='completed' AND content=$11 AND pillar=$12)
          AND ${sourceSql}=$5::jsonb AND ${actor}
        ON CONFLICT(id) DO NOTHING RETURNING id`,...args,content,pillar.id);
      config();if(!Array.isArray(admitted)||admitted.length!==1||Object.keys(admitted[0]).length!==1||admitted[0].id!==id)throw Error('social_publish_unconfirmed');
      intent={imageUrl:null};
      await dispatchCheck();const eligible=await prisma.$queryRawUnsafe<{eligible:boolean}[]>(`SELECT EXISTS(SELECT 1 FROM social_posts WHERE id=$1 AND platform=$2 AND content=$3 AND status='publishing' AND "publishedAt" IS NULL AND "bufferId" IS NULL AND "imageUrl" IS NULL AND "errorMsg" IS NULL) AS eligible`,id,platform,content);
      config();if(!Array.isArray(eligible)||eligible.length!==1||Object.keys(eligible[0]).length!==1||eligible[0].eligible!==true)throw Error('social_publish_unconfirmed');
      await dispatchCheck();
      if(image){
        const {renderManualSocialInfographic}=await import('@/lib/agent/manual-social-infographic');await dispatchCheck();
        const rendered=renderManualSocialInfographic(content),png=await readManualSocialBody(rendered,5*1024*1024,own.remainingBeforeDispatch);config();
        if(!rendered.ok||rendered.headers.get('content-type')!=='image/png'||png.length<33||!png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||png.readUInt32BE(16)!==1080||png.readUInt32BE(20)!==1080)throw Error('social_publish_unconfirmed');
        let bytes=png;
        if(instagram){const {encodeManualSocialJpeg}=await import('@/lib/agent/manual-social-jpeg');await dispatchCheck();bytes=await encodeManualSocialJpeg(png);await dispatchCheck();if(bytes.length<4||bytes.length>5*1024*1024||bytes.readUInt16BE(0)!==0xffd8||bytes.readUInt16BE(bytes.length-2)!==0xffd9)throw Error('social_publish_unconfirmed');}
        await dispatchCheck();const pathname=`social-manual/${id}.${instagram?'jpg':'png'}`,contentType=instagram?'image/jpeg':'image/png';
        // Installed Blob protocol12,but one native PUT only:no SDK retry,
        // ambient API/OIDC override,overwrite,lookup or URL-based adoption.
        const uploaded=await fetch('https://vercel.com/api/blob/?'+new URLSearchParams({pathname}),{method:'PUT',redirect:'error',headers:{authorization:'Bearer '+blobToken,'x-vercel-blob-store-id':store!,'x-api-version':'12','x-api-blob-request-id':`${store}:${own.at}:${id}`,'x-api-blob-request-attempt':'0','x-vercel-blob-access':'public','x-add-random-suffix':'0','x-allow-overwrite':'0','x-content-type':contentType,'x-content-length':String(bytes.length)},body:Uint8Array.from(bytes),signal:AbortSignal.timeout(own.remainingBeforeDispatch())});
        // This same invoked upload may record only its own URL after retirement.
        const raw:unknown=await uploaded.json();
        if(!uploaded.ok||uploaded.redirected||!raw||typeof raw!=='object'||Array.isArray(raw)||!('url'in raw)||typeof raw.url!=='string'||raw.url!==`https://${store!.toLowerCase()}.public.blob.vercel-storage.com/${pathname}`||!('pathname'in raw)||raw.pathname!==pathname||!('contentType'in raw)||raw.contentType!==contentType)throw Error('social_publish_unconfirmed');
        const imageUrl=raw.url,savedImage=await prisma.$queryRawUnsafe<{id:string;imageUrl:string}[]>(`UPDATE social_posts SET "imageUrl"=$4 WHERE id=$1 AND platform=$2 AND content=$3 AND status='publishing' AND "publishedAt" IS NULL AND "bufferId" IS NULL AND "imageUrl" IS NULL AND "errorMsg" IS NULL RETURNING id,"imageUrl"`,id,platform,content,imageUrl);
        if(!Array.isArray(savedImage)||savedImage.length!==1||Object.keys(savedImage[0]).length!==2||savedImage[0].id!==id||savedImage[0].imageUrl!==imageUrl)throw Error('social_publish_unconfirmed');
        intent.imageUrl=imageUrl;await dispatchCheck();
      }
      const message=content.replace(/\*\*(.*?)\*\*/g,'$1').replace(/\*(.*?)\*/g,'$1').replace(/__(.*?)__/g,'$1').replace(/_(.*?)_/g,'$1').replace(/`(.*?)`/g,'$1').replace(/#{1,6}\s/g,'');
      const proof=secret?createHmac('sha256',secret).update(token).digest('hex'):undefined;
      let postId:string;
      if(instagram){
        // Only this original's responses issue its container/status/publish.
        // Only IN_PROGRESS may continue in this live call. No new container,
        // recovered ID, deadline extension or retry of an uncertain request.
        const base=`https://graph.instagram.com/${version}`,caption=Array.from(message).slice(0,2200).join(''),credentials={access_token:token,...(proof?{appsecret_proof:proof}:{})};
        const json=async(response:Response):Promise<Record<string,unknown>>=>{const raw:unknown=await response.json();if(!response.ok||response.redirected||!raw||typeof raw!=='object'||Array.isArray(raw)||'error'in raw)throw Error('social_publish_unconfirmed');return raw as Record<string,unknown>;};
        await dispatchCheck();
        const container=await json(await fetch(`${base}/${page}/media`,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({image_url:intent!.imageUrl,caption,...credentials}),signal:AbortSignal.timeout(own.remainingBeforeDispatch())}));
        if(typeof container.id!=='string'||!/^\d{1,32}$/.test(container.id))throw Error('social_publish_unconfirmed');const creationId=container.id;
        // Local bounded cadence,not a provider guarantee:up to ten reads with
        // five seconds between acknowledged IN_PROGRESS responses. A full wait
        // must fit the remaining original lifetime;never shorten/restart it.
        for(let read=0;read<10;read++){
          await dispatchCheck();
          const status=await json(await fetch(`${base}/${creationId}?`+new URLSearchParams({fields:'status_code',...credentials}),{method:'GET',redirect:'error',signal:AbortSignal.timeout(own.remainingBeforeDispatch())}));
          config();if(status.id!==creationId)throw Error('social_publish_unconfirmed');
          if(status.status_code==='FINISHED')break;
          if(status.status_code!=='IN_PROGRESS'||read===9)throw Error('social_publish_unconfirmed');
          await dispatchCheck();
          if(own.remainingBeforeDispatch()<=5000)throw Error('social_publish_unconfirmed');
          await new Promise<void>(resolve=>setTimeout(resolve,5000));
          await dispatchCheck();
        }
        await dispatchCheck();
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
      published={postId,historyId:completed[0].historyId};await dispatchCheck();
      return Object.freeze({platform,recordId:id,postId});
    };
    // Final batch checks may inspect this exact publisher's own artifacts after
    // its sibling completes. They cannot replay publication or adopt a row.
    // The last sibling also retains the complete narrative source veto; its
    // source already includes the first sibling's acknowledged publication.
    const validatePublished=async(withSource:boolean)=>{
      if(!published||!intent)throw Error('social_publish_unconfirmed');
      await own.validateBeforeDispatch();
      if(!publicationDayRowCheck)throw Error('social_publish_unconfirmed');await publicationDayRowCheck();
      const rows=await prisma.$queryRawUnsafe<{eligible:boolean}[]>(`SELECT EXISTS(SELECT 1 FROM admin_social_draft_attempts WHERE id=$1 AND "commandRef"=$2 AND platform=$3 AND type=$4 AND "userId"=$5 AND email=$6 AND "sessionRef"=$8 AND state='completed' AND content=$9 AND pillar=$10 AND "completedAt" IS NOT NULL
        AND EXISTS(SELECT 1 FROM users WHERE id=$5 AND email=$6 AND "emailVerified"=timezone('UTC',$7::timestamptz))
        AND EXISTS(SELECT 1 FROM social_posts WHERE id=$11 AND platform=$3 AND content=$9 AND status='published' AND "bufferId"=$13 AND "publishedAt" IS NOT NULL AND "imageUrl" IS NOT DISTINCT FROM $14::text AND "errorMsg" IS NULL)
        AND EXISTS(SELECT 1 FROM social_pillar_history WHERE id=$12::integer AND channel=$3 AND pillar=$10)) AS eligible`,id,own.commandRef,platform,type,own.actorId,own.email,own.verifiedAt,own.sessionRef,content,pillar.id,id,published.historyId,published.postId,intent.imageUrl);
      check();if(!Array.isArray(rows)||rows.length!==1||Object.keys(rows[0]).length!==1||rows[0].eligible!==true)throw Error('social_publish_unconfirmed');
      await own.validateBeforeDispatch();if(withSource)await validate();
    };
    const cap=Object.freeze({})as AdminSocialDraftResult;preparedDrafts.set(cap,{id,commandRef:own.commandRef,userId:own.actorId,sessionRef:own.sessionRef,platform,type,content,pillar:pillar.id,validate,validatePublished,publish});return cap;
  });
}

// One live continuation can consume the exact completed result. This is not an
// external publication ACK, and no serialized draft or SQL lookup can recreate it.
export function consumeAdminSocialDraft<T>(receipt:AdminSocialDraftResult|undefined,run:(draft:Readonly<DraftDetails>&{validateBeforeDispatch:()=>Promise<void>})=>Promise<T>):Promise<T>{
  const own=receipt&&preparedDrafts.get(receipt);if(!own||own.purpose&&own.purpose!=='consume')return Promise.reject(Error('social_publish_unconfirmed'));own.purpose='consume';
  return (own.use??=Promise.resolve().then(async()=>{await own.validate();const result=await run(Object.freeze({id:own.id,commandRef:own.commandRef,userId:own.userId,sessionRef:own.sessionRef,platform:own.platform,type:own.type,content:own.content,pillar:own.pillar,validateBeforeDispatch:own.validate}));await own.validate();return result;}))as Promise<T>;
}

// Text-only Facebook component. The manual route composes the infographic
// publishers below, with its own daily admission and native HTTP continuation.
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

// Negative only: the private draft and its original publisher completion are
// mandatory. Neither an HTTP DTO nor a SQL post/claim ID can recreate them.
export async function validateAdminSocialPublishedDraft(receipt:AdminSocialDraftResult|undefined,withSource=false):Promise<void>{
  const own=receipt&&preparedDrafts.get(receipt);if(!own||!own.use||!own.purpose||own.purpose==='consume')throw Error('social_publish_unconfirmed');
  await own.validatePublished(withSource);
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
