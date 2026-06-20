'use strict';

const config = require('./config');

// Pricing per 1M tokens (USD) — May 2026
const MODEL_PRICING = {
  'claude-haiku-4-5-20251001': { input: 0.25, output: 1.25 },
  'claude-sonnet-4-6':         { input: 3.00, output: 15.00 },
  'claude-opus-4-6':           { input: 15.00, output: 75.00 },
};

// Deduct cost from stored balance after each call
function deductFromBalance(model, inputTokens, outputTokens, cacheReadTokens = 0, cacheCreationTokens = 0) {
  try {
    const pricing = MODEL_PRICING[model] || MODEL_PRICING['claude-haiku-4-5-20251001'];
    // Cache read tokens cost 10% of input price; cache creation costs 25% more than input
    const regularInput = inputTokens - cacheReadTokens - cacheCreationTokens;
    const cost = (
      Math.max(0, regularInput) * pricing.input +
      cacheReadTokens * pricing.input * 0.1 +
      cacheCreationTokens * pricing.input * 1.25 +
      outputTokens * pricing.output
    ) / 1_000_000;
    if (cost <= 0) return;

    const fs = require('fs');
    const path = require('path');
    const configFile = path.join(__dirname, 'agent-config.json');
    if (!fs.existsSync(configFile)) return;

    const cfg = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    if (!cfg._anthropicBalance || cfg._anthropicBalance.amount === null) return;

    cfg._anthropicBalance.amount = Math.max(0, cfg._anthropicBalance.amount - cost);
    cfg._anthropicBalance.lastDeduction = new Date().toISOString();
    cfg._anthropicBalance.totalSpentToday = (cfg._anthropicBalance.totalSpentToday || 0) + cost;

    // Reset daily spend at midnight
    const today = new Date().toISOString().slice(0, 10);
    if (cfg._anthropicBalance.spendDate !== today) {
      cfg._anthropicBalance.totalSpentToday = cost;
      cfg._anthropicBalance.spendDate = today;
    }

    fs.writeFileSync(configFile, JSON.stringify(cfg, null, 2), 'utf8');
  } catch {}
}

/**
 * @param {string} prompt
 * @param {number} maxTokens
 * @param {object} [opts]
 * @param {string} [opts.caller] - module name to read model override from config (e.g. 'guardian', 'persona-runner')
 * @param {string} [opts.model] - explicit model override (takes priority)
 * @param {string} [opts.system] - system prompt (cached via prompt caching for cost savings)
 */
async function callClaude(prompt, maxTokens = 200, opts = {}) {
  // Determine model: explicit > per-agent config > global config > hardcoded default
  const model = opts.model
    || (opts.caller && config.get(opts.caller, 'model', null))
    || config.get('claude', 'model', 'claude-haiku-4-5-20251001');

  // Route through guardedCall for unified protections:
  // daily budget, rate limiting, circuit breaker, timeout, input truncation
  // Lazy require to avoid circular dependency (api-guard requires claude for deductFromBalance)
  const { guardedCall } = require('./api-guard');
  const { text } = await guardedCall(prompt, {
    maxTokens,
    model,
    agentId: opts.caller || 'claude',
    system: opts.system,
  });

  // ── Hard reject: meta-comments, AI refusals, generic bot phrases ──

  // Structural checks first (catch ANY meta-commentary regardless of wording)

  // 1. Newline handling per platform length
  //    Short-form (twitter ≤120 tokens): take first paragraph only (Claude often over-generates)
  //    Longer-form (bluesky ≤200 tokens): allow multiple paragraphs
  let processed = text;
  if (maxTokens <= 150 && text.includes('\n')) {
    processed = text.split(/\n/)[0].trim();
    if (!processed || processed.length < 20) { console.log(`[claude] Reply REJECTED: first paragraph too short (${processed?.length || 0} chars)`); return ''; }
  }

  // 2. Starts with meta markers
  if (/^\s*[\(\[\{"']/.test(processed)) { console.log(`[claude] Reply REJECTED: starts with meta marker — "${processed.slice(0, 80)}"`); return ''; }
  // Sentinel skip-words, even when wrapped in markdown/punctuation (e.g. *empty*, _vacío_, "skip", `empty`, [empty])
  const core = processed.replace(/^[\s*_`~"'\[\(\{>#.-]+/, '').replace(/[\s*_`~"'\]\)\}.!]+$/, '');
  if (/^(empty|vac[ií]o|n\/?a|none|null|nil|ninguno|nada|pass|skip|omitir)$/i.test(core)) {
    console.log(`[claude] Reply REJECTED: empty/skip sentinel — "${processed.slice(0, 40)}"`);
    return '';
  }
  if (/^empty/i.test(processed)) { console.log(`[claude] Reply REJECTED: starts with "empty"`); return ''; }
  if (/^vac[ií]o/i.test(processed)) { console.log(`[claude] Reply REJECTED: starts with "vacío"`); return ''; }
  if (/^(N\/A|n\/a|none|ninguno|pass|skip)/i.test(processed)) { console.log(`[claude] Reply REJECTED: starts with N/A/skip marker`); return ''; }

  // 3. Too long for platform (twitter: 300, bluesky: 800)
  const maxLen = maxTokens <= 150 ? 300 : 800;
  if (processed.length > maxLen) { console.log(`[claude] Reply REJECTED: too long (${processed.length}>${maxLen})`); return ''; }

  // 4. Contains em-dash (—) followed by explanation = meta-commentary pattern
  if (/\s—\s.{20,}/i.test(processed) && /\b(post|comment|engage|spam|ad|promo|sales|comercial|regla|rule|skip|empty|vac[ií]o)\b/i.test(processed)) { console.log(`[claude] Reply REJECTED: em-dash meta-commentary — "${processed.slice(0, 120)}"`); return ''; }

  // 5. Long response starting with "No" + contains meta words = refusal explanation
  //    Only reject if clearly a meta-refusal, not a normal disagreement
  if (/^No\b/i.test(processed) && processed.length > 80 && /\b(devuelvo|return empty|skip this|not commenting|no comento)\b/i.test(processed)) { console.log(`[claude] Reply REJECTED: "No" + meta refusal`); return ''; }

  // 6. Structural meta-commentary: the model ANALYZING or REFUSING the post instead of
  //    replying to it. These leak past the exact-phrase blacklist below (e.g. a comment
  //    opening "I can see this is promotional content…" slipped through and got posted
  //    live, because only "promotional post" was listed). Require a meta opener AND a
  //    negative concept nearby → high precision, won't fire on genuine replies like
  //    "this post is gold" or "this looks like exactly what I needed".
  const metaOpener = /^\s*((this|that) (post|comment|thread|tweet|reads|looks|sounds)|this is (a |an )|i can see (this|that) is|i think this (is|post)|i'?m (not (going to|gonna|engaging|commenting)|returning empty|not seeing)|i (have|'?ve got) nothing|(este|esta) (post|publicaci[oó]n|tweet|comentario|hilo)|esto (parece|es)|no voy a comentar)/i;
  const metaConcept = /\b(promo|promotion|promotional|sales pitch|spam|advert|conversation starter|genuine discussion|real substance|hot take|off.?topic|not (really )?my (lane|area|niche)|returning empty|nothing (to add|here)|self.?promo|publicidad|comercial|anuncio|fuera de (lugar|tema)|no aporta|vac[ií]o)\b/i;
  if (metaOpener.test(processed) && metaConcept.test(processed.slice(0, 220))) {
    console.log(`[claude] Reply REJECTED: structural meta-commentary — "${processed.slice(0, 120)}"`);
    return '';
  }

  // Pattern-based reject (specific phrases)
  const rejectPatterns = [
    // Meta-commentary about not commenting
    /returning empty/i, /return empty/i, /devuelvo vac[ií]o/i,
    /devuelvo comentario/i, /no devuelvo/i,
    /not commenting/i, /no comento/i, /skip this/i, /I('ll| will) pass/i,
    /I got nothing/i, /not (really )?my (lane|area|niche|expertise)/i, /not gonna comment/i,
    /nothing to add/i, /nada que aportar/i, /nada que añadir/i,
    /passing on this/i, /I('m| am) passing on/i, /paso de (comentar|responder|este|esto)/i,
    /out of place/i, /fuera de lugar/i,
    /not my area/i, /no es mi área/i, /no es mi tema/i,
    /looks like a (service |casting )?pitch/i, /parece (un )?pitch/i,
    /looks like a casting call/i,
    /doesn't spark/i, /no genera conversación/i,
    // Promotional/sales detection
    /promotional post/i, /promotional content/i, /post promocional/i, /sales pitch/i,
    /conversation starter/i, /genuine discussion/i, /real substance/i,
    /direct sales/i, /venta directa/i, /commercial post/i,
    /post comercial/i, /this is (a |an )?ad\b/i, /esto es (un )?anuncio/i,
    /venta de cursos/i,
    // Claude refusing
    /I('m| am) not going to (comment|engage|reply|respond|weigh in)/i, /no voy a (comentar|responder|participar|opinar|entrar)/i,
    /doesn'?t (deserve|warrant|merit|need|call for) (a )?(comment|reply|response)/i, /no merece (un |una |la pena )?(comentario|respuesta|que (comente|responda))/i,
    /per the (core )?rules/i, /según las reglas/i,
    /not engaging/i, /no interactúo/i,
    /I('m| am) not comfortable/i, /no me siento cómodo/i,
    /motivacional vac[ií]o/i, /generic hype/i, /motivational air/i,
    /nada que ver con/i, /nothing to .* engage/i,
    /autoayuda genérica/i,
    /no puedo generar/i, /no tengo suficiente/i,
    /basándome solo/i, /sin (el |más |suficiente )?contexto,? (no|para sab|es dif|me falta)/i, /cannot write/i, /can't write/i,
    /I would need (more |to see )?(the |the full )?(post|context|content|info)/i, /not enough context/i, /can'?t (really )?(comment|engage|reply)\b/i,
    /(necesito|tendr[ií]a que|habr[ií]a que|hay que) ver el contenido/i, /ver el contenido (del post|completo|real|antes)/i,
    /I('m| am) not clicking/i, /no voy a hacer clic/i,
    // Meta-commentary about post being spam/commercial
    /this is a spam/i, /esto es spam/i,
    /commercial service pitch/i, /service pitch/i,
    // AI-sounding generic phrases (only reject if the ENTIRE comment is just this)
    /^gran post\.?$/i, /^great post\.?$/i,
    /^totalmente de acuerdo\.?$/i, /^couldn't agree more\.?$/i,
    /^esto es oro\.?$/i, /^this is gold\.?$/i,
    /^amazing post\.?$/i,
    // Commercial / self-promo sounding
    /check out my/i, /mira mi/i, /visita mi/i,
    /link in bio/i, /enlace en bio/i,
    /use code/i, /usa el c[oó]digo/i,
    /DM me/i, /escr[ií]beme/i,
    // Meta-reasoning exposed as reply (model thinking out loud instead of replying)
    /I don.t see a clear/i, /no veo una pregunta/i,
    /doesn.t contain a (clear |specific )?technical/i,
    /no contiene.*pregunta t[eé]cnica/i,
    /this post (doesn.t|isn.t|does not)/i,
  ];
  // Merge additional reject patterns from overrides (hot-patchable by Claude)
  const overrides = loadOverrides();
  const extraPatterns = (overrides.additionalRejectPatterns || []).map(p => new RegExp(p, 'i'));
  const allPatterns = [...rejectPatterns, ...extraPatterns];
  const matchedPattern = allPatterns.find(p => p.test(processed));
  if (matchedPattern) {
    console.log(`[claude] Reply REJECTED by pattern: ${matchedPattern} — text: "${processed.slice(0, 120)}..."`);
    return '';
  }

  // For longer-form comments (bluesky): trim to max 3 paragraphs, remove markdown formatting
  if (maxTokens > 150 && processed.includes('\n')) {
    const paragraphs = processed.split(/\n{1,}/).filter(p => p.trim());
    if (paragraphs.length > 5) { console.log(`[claude] Reply REJECTED: too many paragraphs (${paragraphs.length})`); return ''; }
    const cleaned = paragraphs.slice(0, 3).join('\n\n')
      .replace(/\*\*/g, '')
      .replace(/^#+\s/gm, '')
      .replace(/^\d+\.\s/gm, '- ');
    return cleaned;
  }

  return processed;
}

// Simple language detection based on common words
function detectPostLang(text) {
  const lower = text.toLowerCase();
  const es = (lower.match(/\b(que|para|con|los|las|del|una|por|como|más|pero|también|sobre|este|esta|tiene|puede|todo|hacer|está|hay|muy|sin|cada|ser|entre)\b/g) || []).length;
  const en = (lower.match(/\b(the|and|for|that|with|this|from|have|are|but|not|you|all|can|was|one|our|has|will|each|how|been|more|when|very|your|about|into)\b/g) || []).length;
  const de = (lower.match(/\b(und|der|die|das|ist|ein|eine|nicht|den|auf|mit|sich|dem|dass|auch|als|von|für|ich|werden|noch|nach|bei|wie|über)\b/g) || []).length;
  const pt = (lower.match(/\b(que|para|com|uma|por|como|mais|mas|também|sobre|este|esta|tem|pode|todo|fazer|está|são|muito|sem|cada|ser|entre|não|nos)\b/g) || []).length;
  const fr = (lower.match(/\b(les|des|une|pour|avec|dans|qui|est|pas|sur|sont|mais|plus|tout|bien|aussi|cette|leur|même|très|encore|fait|alors)\b/g) || []).length;

  const scores = { es, en, de, pt, fr };
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  if (best[1] < 3) return 'en'; // default to English if unclear
  return best[0];
}

const PERSONA = {
  es: 'Imagina que eres un tío de 30 años que trabaja en tech y ha montado una startup que ayuda a YouTubers con datos y herramientas. Llevas años metido en el mundo de los creadores, has visto cientos de canales crecer y caer, y tienes opiniones formadas sobre el sector.',
  en: 'You\'re a 30-year-old tech guy who built a startup helping YouTubers with data and tools. You\'ve been deep in the creator world for years, seen hundreds of channels grow and fail, and have strong opinions about the space.',
  de: 'Du bist ein 30-jähriger Tech-Typ, der ein Startup aufgebaut hat, das YouTubern mit Daten und Tools hilft. Du bist seit Jahren tief in der Creator-Welt und hast starke Meinungen.',
  pt: 'Você é um cara de 30 anos que trabalha em tech e montou uma startup que ajuda YouTubers com dados e ferramentas. Está no mundo dos criadores há anos e tem opiniões fortes sobre o setor.',
  fr: 'Tu es un mec de 30 ans qui bosse dans la tech et qui a monté une startup aidant les YouTubers avec des données et des outils. Tu es dans le monde des créateurs depuis des années.',
};

const RULES = {
  es: `CÓMO ESCRIBES TÚ:
- Frases cortas, directas, sin florituras
- A veces empiezas con minúscula
- Puedes discrepar o matizar algo
- Compartes algo concreto que has visto trabajando con creadores
- NUNCA suenas como bot — NUNCA: "gran post", "totalmente de acuerdo", "muy interesante"
- NUNCA mencionas tu empresa
- NO eres creador de contenido — no digas "me pasa igual" sobre crear videos
- Máximo 2 frases. 1 emoji como mucho o ninguno
- ESCRIBE EN ESPAÑOL

Devuelve SOLO el comentario.`,
  en: `HOW YOU WRITE:
- Short, direct sentences. No fluff
- Sometimes start lowercase
- You can disagree or nuance something
- Share something concrete you've seen working with creators
- NEVER sound like a bot — NEVER: "great post", "totally agree", "love this"
- NEVER mention your company
- You're NOT a content creator — don't say "same here" about making videos
- Max 2 sentences. 1 emoji max or none
- WRITE IN ENGLISH

Return ONLY the comment.`,
  de: `WIE DU SCHREIBST:
- Kurze, direkte Sätze. Kein Blabla
- Du kannst widersprechen oder nuancieren
- Teile etwas Konkretes, das du bei der Arbeit mit Creatorn gesehen hast
- NIEMALS wie ein Bot klingen — NIEMALS: "toller Post", "stimme voll zu"
- NIEMALS dein Unternehmen erwähnen
- Du bist KEIN Content Creator
- Max 2 Sätze. 1 Emoji höchstens oder keins
- SCHREIBE AUF DEUTSCH

Nur den Kommentar zurückgeben.`,
  pt: `COMO VOCÊ ESCREVE:
- Frases curtas, diretas, sem enrolação
- Pode discordar ou matizar algo
- Compartilha algo concreto que viu trabalhando com criadores
- NUNCA soe como bot — NUNCA: "ótimo post", "concordo totalmente"
- NUNCA mencione sua empresa
- Você NÃO é criador de conteúdo
- Máximo 2 frases. 1 emoji no máximo ou nenhum
- ESCREVA EM PORTUGUÊS

Retorne APENAS o comentário.`,
  fr: `COMMENT TU ÉCRIS:
- Phrases courtes, directes, sans fioritures
- Tu peux nuancer ou contredire
- Partage quelque chose de concret vu en travaillant avec des créateurs
- JAMAIS sonner comme un bot — JAMAIS: "super post", "totalement d'accord"
- JAMAIS mentionner ton entreprise
- Tu n'es PAS créateur de contenu
- Max 2 phrases. 1 emoji max ou aucun
- ÉCRIS EN FRANÇAIS

Renvoie UNIQUEMENT le commentaire.`,
};


// Genera una respuesta genuina para un tweet de X/Twitter
async function generateTweetReply(authorName, tweetContent) {
  const systemPrompt = `Eres un tío de 30 años en tech que ha montado una herramienta para YouTubers. Conoces bien el mundo de los creadores porque trabajas con sus datos a diario, pero tú no creas contenido — construyes herramientas.

CÓMO ESCRIBES EN TWITTER:
- Ultra corto — 1 frase, máximo 2. Menos de 200 caracteres
- Informal, como un mensaje rápido. Puedes tutear
- Puedes hacer una pregunta corta, o compartir un dato que has visto
- A veces solo una reacción honesta con algo específico que añada valor
- NUNCA: "gran tweet", "totalmente", "me encanta esto", "esto es oro"
- NUNCA te presentas ni mencionas tu empresa
- NO finjas ser creador de contenido — no dices "me pasa igual" sobre crear videos
- 1 emoji como mucho, o ninguno
- Idioma del tweet original

Solo el reply. Nada más.`;

  return callClaude(`Acabas de ver este tweet de ${authorName}. Responde como lo harías de verdad — rápido, informal, como si le contestaras a un colega.

Tweet: "${tweetContent}"
`, 100, { caller: 'persona-runner', system: systemPrompt });
}

// Genera un comentario genuino para un post de Instagram
async function generateInstagramComment(authorName, caption) {
  const systemPrompt = `Eres un tío de 30 años que trabaja en tech ayudando a creadores de YouTube con herramientas y datos. Estás en Instagram scrolleando.

Escribe un comentario como lo haría una persona real en Instagram:
- 1 frase corta y natural, como si hablaras
- Puede ser una observación, una pregunta, o algo concreto que te llame la atención del post
- Suena como un humano, no como una marca ni un bot
- NUNCA: "increíble", "gran contenido", "me encanta", "crack", "máquina"
- NUNCA mencionas tu empresa ni haces promo
- NO eres creador de contenido — no digas cosas como "me pasa igual" sobre grabar o editar
- 1 emoji como mucho, natural, no forzado
- Idioma del caption

Solo el comentario.`;

  return callClaude(`Ves este post de ${authorName}.

Caption: "${caption}"
`, 100, { caller: 'persona-runner', system: systemPrompt });
}

// Genera un comentario genuino para un post de Facebook (grupo)
async function generateFacebookComment(authorName, postContent) {
  const lang = detectPostLang(postContent);
  const persona = PERSONA[lang] || PERSONA.en;

  const fbRules = {
    es: `Escribe un comentario como miembro real del grupo:
- Máximo 2 frases, como desde el móvil
- Tono de comunidad — como si hablaras con alguien que conoces de vista
- Algo concreto que has visto con creadores, una pregunta, o un matiz
- NUNCA: "gran post", "totalmente de acuerdo", "qué buena onda", "excelente aporte"
- NUNCA mencionas tu empresa
- NO eres creador de contenido
- 1 emoji como mucho o ninguno
- ESCRIBE EN ESPAÑOL
Solo el comentario.`,
    en: `Write a comment like a real group member:
- Max 2 sentences, like from your phone
- Community tone — like talking to someone you vaguely know
- Something concrete you've seen with creators, a question, or a nuance
- NEVER: "great post", "totally agree", "love this"
- NEVER mention your company
- You're NOT a content creator
- 1 emoji max or none
- WRITE IN ENGLISH
Only the comment.`,
    de: `Schreibe einen Kommentar wie ein echtes Gruppenmitglied:
- Max 2 Sätze, wie vom Handy
- Community-Ton. Etwas Konkretes oder eine Frage.
- NIEMALS: "toller Post", "stimme zu"
- NIEMALS dein Unternehmen erwähnen. Du bist KEIN Creator.
- SCHREIBE AUF DEUTSCH
Nur den Kommentar.`,
    pt: `Escreva um comentário como membro real do grupo:
- Máximo 2 frases, como do celular
- Tom de comunidade. Algo concreto ou uma pergunta.
- NUNCA: "ótimo post", "concordo". NUNCA mencione sua empresa. NÃO é criador.
- ESCREVA EM PORTUGUÊS
Apenas o comentário.`,
    fr: `Écris un commentaire comme un vrai membre du groupe:
- Max 2 phrases, comme depuis ton tel
- Ton communautaire. Quelque chose de concret ou une question.
- JAMAIS: "super post", "d'accord". JAMAIS mentionner ton entreprise. Tu n'es PAS créateur.
- ÉCRIS EN FRANÇAIS
Uniquement le commentaire.`,
  };

  const systemPrompt = `${persona}\n\n${fbRules[lang] || fbRules.en}`;
  return callClaude(`You see this post by ${authorName} in a Facebook group for creators.

Post: "${postContent}"
`, 150, { caller: 'persona-runner', system: systemPrompt });
}

// ── Persona comment generation (multi-account) ──

const PERSONA_CORE_RULES = {
  es: `REGLAS FUNDAMENTALES (aplican SIEMPRE):
- Eres una persona REAL con vida, opiniones y experiencias. Escribe como hablarías de verdad.
- NUNCA comentes en posts que sean publicidad, spam, venta directa, o promoción de cursos/servicios. Si el post huele a comercial, devuelve vacío.
- NUNCA faltes al respeto a nadie. Puedes discrepar con educación, pero jamás insultar ni ser agresivo.
- Tu objetivo es CONECTAR con la gente — crear vínculos genuinos con otros creadores y profesionales del sector.
- Intenta encontrar algo que aportar: una experiencia, un dato, una pregunta honesta, un matiz, una opinión, o incluso un desacuerdo educado. Las preguntas genuinas y las opiniones cortas también valen.
- Solo devuelve vacío si el post es spam, publicidad, o completamente irrelevante para tu perfil. En caso de duda, comenta.
- NUNCA suenes como bot, marca, o IA. Nada de frases genéricas, halagos vacíos, ni fórmulas repetitivas.
- NUNCA te presentes ni digas quién eres o a qué te dedicas (a menos que encaje de forma 100% natural).
- Escribe con errores menores ocasionales (una tilde que falta, una abreviatura) — como una persona real desde el móvil.`,
  en: `CORE RULES (always apply):
- You are a REAL person with a life, opinions, and experiences. Write like you'd actually talk.
- NEVER comment on posts that are ads, spam, direct sales pitches, or course/service promotions. If the post smells commercial, return empty.
- NEVER disrespect anyone. You can disagree politely, but never insult or be aggressive.
- Your goal is to CONNECT with people — build genuine relationships with other creators and professionals.
- Try to find something to contribute: an experience, a data point, an honest question, a nuance, an opinion, or even a polite disagreement. Genuine questions and short opinions count too.
- Only return empty if the post is spam, advertising, or completely irrelevant to your profile. When in doubt, comment.
- NEVER sound like a bot, brand, or AI. No generic phrases, empty compliments, or repetitive formulas.
- NEVER introduce yourself or say what you do (unless it fits 100% naturally).
- Write with occasional minor mistakes (a missing accent, an abbreviation) — like a real person on their phone.`,
};

const PLATFORM_RULES = {
  twitter: {
    es: `REGLAS TWITTER:
- Ultra corto — 1 frase, máximo 2. Menos de 200 caracteres
- Informal, como un mensaje rápido a un colega
- Puedes hacer una pregunta corta, compartir un dato, o reaccionar con algo específico
- Puedes usar jerga de internet o abreviaciones naturales
- 1 emoji como mucho, o ninguno
- ESCRIBE EN ESPAÑOL
Solo el reply.`,
    en: `TWITTER RULES:
- Ultra short — 1 sentence, max 2. Under 200 chars
- Informal, like a quick text to a friend
- Can ask a short question, share a data point, or react with something specific
- Internet slang and natural abbreviations are fine
- 1 emoji max or none
- WRITE IN ENGLISH
Only the reply.`,
  },
  facebook: {
    es: `REGLAS FACEBOOK:
- Máximo 2 frases, como escribiendo desde el móvil
- Tono de comunidad — como si hablaras con alguien que conoces de un grupo
- Algo concreto: tu experiencia, una pregunta, un matiz, algo que te ha pasado similar
- 1 emoji como mucho o ninguno
- ESCRIBE EN ESPAÑOL
Solo el comentario.`,
    en: `FACEBOOK RULES:
- Max 2 sentences, like typing from your phone
- Community tone — like talking to someone you know from a group
- Something concrete: your experience, a question, a nuance, something similar that happened to you
- 1 emoji max or none
- WRITE IN ENGLISH
Only the comment.`,
  },
  bluesky: {
    es: `REGLAS BLUESKY:
- Corto — 1 o 2 frases, menos de 250 caracteres
- Tono conversacional y relajado — Bluesky es menos agresivo que Twitter
- Aporta algo concreto: una observación, un dato, una pregunta genuina
- Texto plano, sin hashtags (en Bluesky no se estilan), sin sonar a marca
- 1 emoji como mucho o ninguno
- ESCRIBE EN ESPAÑOL
Solo el reply.`,
    en: `BLUESKY RULES:
- Short — 1 or 2 sentences, under 250 chars
- Conversational, laid-back tone — Bluesky is less combative than Twitter
- Add something concrete: an observation, a data point, a genuine question
- Plain text, no hashtags (uncommon on Bluesky), don't sound like a brand
- 1 emoji max or none
- WRITE IN ENGLISH
Only the reply.`,
  },
};

/**
 * Generate a comment as a persona (multi-account system).
 * @param {object} persona - persona config from personas.json
 * @param {string} platform - 'twitter' | 'facebook' | 'bluesky'
 * @param {string} authorName - post author
 * @param {string} postContent - post text
 */
// ── Social overrides (hot-patchable by Claude via social-optimizer) ──
const OVERRIDES_PATH = require('path').join(__dirname, 'social-overrides.json');

function loadOverrides() {
  try { return JSON.parse(require('fs').readFileSync(OVERRIDES_PATH, 'utf8')); }
  catch { return {}; }
}


// ── YouTube-only topic filter (reads patterns from overrides) ──
function isOffTopicPost(postContent) {
  const overrides = loadOverrides();
  const patterns = (overrides.offTopicPatterns || []).map(p => new RegExp(p, 'i'));
  return patterns.some(p => p.test(postContent));
}

// Keywords that indicate someone has a problem YTubViral solves
const YTUBVIRAL_RELEVANT_KEYWORDS = [
  // EN
  'youtube seo', 'video ideas', 'what to upload', 'title ideas', 'thumbnail',
  'keyword research', 'youtube tool', 'grow my channel', 'stuck on ideas',
  'youtube analytics', 'video topic', 'content ideas', 'youtube growth',
  'seo tool', 'youtube strategy', 'optimize video', 'video performance',
  'how to grow', 'need help youtube', 'recommend.*tool', 'what tool',
  'best tool for youtube', 'ai for youtube', 'youtube ai',
  // ES
  'ideas para video', 'qué grabar', 'no sé qué subir', 'seo youtube',
  'herramienta youtube', 'crecer en youtube', 'palabras clave youtube',
  'miniatura', 'título para youtube', 'ideas de contenido', 'estoy estancado',
  'herramienta.*youtube', 'recomendación.*herramienta', 'ia para youtube',
  'optimizar video', 'analítica youtube',
];

function isYtubviralRelevantPost(postContent) {
  const lower = postContent.toLowerCase();
  // Direct match first
  const directMatch = YTUBVIRAL_RELEVANT_KEYWORDS.some(kw => {
    if (kw.includes('.*')) return new RegExp(kw, 'i').test(lower);
    return lower.includes(kw);
  });
  if (directMatch) return true;

  // Proximity match: if post contains YouTube/canal + problem-word within same text
  const hasYoutube = /youtube|canal|channel|video/i.test(lower);
  const hasProblem = /\b(tool|herramienta|recommend|ayud|help|seo|keyword|título|title|tag|grow|crec|stuck|estancad|optimiz|analiz|ideas?)\b/i.test(lower);
  return hasYoutube && hasProblem;
}

async function generatePersonaComment(persona, platform, authorName, postContent) {
  // Each persona replies ONLY in its own language (Javier 2026-06-17), never matching the
  // post's language. All current personas are from Spain → default español de España.
  const lang = persona.lang || 'es';

  // ── YouTube-only gate: skip posts about TikTok, podcasts, etc. ──
  if (isOffTopicPost(postContent)) return '';

  const personality = persona.personality[lang] || persona.personality.en;
  const rules = PLATFORM_RULES[platform]?.[lang] || PLATFORM_RULES[platform]?.en || PLATFORM_RULES.twitter.en;

  // Smart mention logic: ALWAYS mention when post is about a problem YTubViral solves
  // Otherwise use probability-based mention
  const isRelevant = isYtubviralRelevantPost(postContent);
  let mentionInSystem = ''; // Mention goes in system prompt for authority

  // Read mention formulas and rates from overrides (Claude can edit these)
  const ov = loadOverrides();
  const mentionRate = ov.personaMentionRates?.[persona.id] ?? persona.mentionRate ?? 0.2;

  if (isRelevant && persona.mentionYtubviral !== false) {
    // Post matches YTubViral-solvable problems → UNCONDITIONAL mention.
    // EXCEPT founder/brand accounts (mentionYtubviral:false): they NEVER shill — they comment
    // pure value to build karma/trust (I5 Fase 0). The flag now genuinely gates the forced path.
    const personaName = persona.name?.toLowerCase() || persona.id;
    mentionInSystem = lang === 'es'
      ? `\n\nINSTRUCCIÓN DE MENCIÓN (NO OPCIONAL): Este post trata un tema que resuelve ytubviral.com. Tu respuesta DEBE incluir una referencia natural a ytubviral.com como herramienta que usas. Estructura: (1) responde con valor genuino desde tu expertise, (2) menciona ytubviral.com en primera persona ("yo uso ytubviral para eso", "lo analizo con ytubviral.com"). NO escribas meta-comentarios sobre si debes o no mencionar. NO analices si hay "pregunta técnica". Simplemente responde al post e incluye la mención de forma natural.`
      : `\n\nMENTION INSTRUCTION (NOT OPTIONAL): This post is about a topic ytubviral.com solves. Your reply MUST include a natural reference to ytubviral.com as a tool you use. Structure: (1) reply with genuine value from your expertise, (2) mention ytubviral.com in first person ("I use ytubviral for that", "I check it with ytubviral.com"). Do NOT write meta-commentary about whether to mention. Do NOT analyze if there's a "technical question". Just reply to the post and include the mention naturally.`;
  } else if (persona.mentionYtubviral && Math.random() < mentionRate) {
    mentionInSystem = lang === 'es'
      ? `\n\nINSTRUCCIÓN DE MENCIÓN: Si tu respuesta toca el tema de herramientas, SEO, o análisis de YouTube, incluye una referencia natural a ytubviral.com como algo que usas. En primera persona, sin sonar a anuncio.`
      : `\n\nMENTION INSTRUCTION: If your reply touches on tools, SEO, or YouTube analytics, include a natural reference to ytubviral.com as something you use. First person, don't sound like an ad.`;
  }

  // Beta offer: when mentioning ytubviral, sometimes add free Pro tester line
  if (mentionInSystem && ov.betaOffer?.enabled && Math.random() < (ov.betaOffer.probability || 0.3)) {
    const offerLine = ov.betaOffer[lang] || ov.betaOffer.en || '';
    if (offerLine) mentionInSystem += ` Añade casualmente al final algo como: "${offerLine}"`;
  }

  let coreRules = PERSONA_CORE_RULES[lang] || PERSONA_CORE_RULES.en;
  // Append dynamic rules from overrides (Claude can add/modify these)
  const extraRules = ov.coreRulesExtra?.[lang] || ov.coreRulesExtra?.en || '';
  if (extraRules) coreRules += '\n' + extraRules;

  // Inject the persona's concrete value signals — the raw material that turns a generic
  // reaction ("totally agree") into a real contribution. Tell the model to weave in ONE
  // specific fact/number/example when it fits, never to dump the list.
  const valueSignals = persona.valueSignals?.[lang] || persona.valueSignals?.en || '';
  if (valueSignals) {
    coreRules += lang === 'es'
      ? `\n\nTU VALOR DIFERENCIAL (aporta algo CONCRETO, no opiniones genéricas): ${valueSignals}\nUsa UNO de estos puntos solo si encaja con el post — un número, un antes/después, algo que viste. Nunca sueltes la lista entera ni suenes a manual.`
      : `\n\nYOUR EDGE (contribute something CONCRETE, not generic opinions): ${valueSignals}\nUse ONE of these points only if it fits the post — a number, a before/after, something you saw. Never dump the whole list or sound like a manual.`;
  }

  // Authenticity + language lock (Javier 2026-06-17). The valueSignals above ask for a
  // concrete number/example — make sure it's REAL, never fabricated, and always reply in
  // the persona's own language.
  coreRules += lang === 'es'
    ? `\n\nAUTENTICIDAD (innegociable): NO te inventes datos, cifras ni casos. PROHIBIDO el patrón "analicé N canales" / "lo vi en 30 canales que analicé" — es falso y se nota. Si das un número o ejemplo, que sea REAL de tu experiencia; si no lo tienes, habla del principio sin inventar cifras.\nIDIOMA: entiendes el post en cualquier idioma, pero TÚ contestas SIEMPRE en español de España (vosotros, léxico peninsular), con naturalidad y al grano. NO expliques ni menciones que respondes en otro idioma, NO escribas meta-comentarios sobre el idioma: simplemente responde en español como si nada.`
    : `\n\nAUTHENTICITY (non-negotiable): do NOT invent data, numbers or cases. The "I analyzed N channels" pattern is banned — it's fake and obvious. Any number or example must be REAL from your experience; if you don't have one, speak to the principle without inventing figures.\nLANGUAGE: you understand posts in any language, but you ALWAYS reply in your own language, naturally. Do NOT explain or mention that you're replying in a different language; just answer.`;

  const maxTokens = platform === 'twitter' ? 150 : 200;

  if (isRelevant) {
    coreRules = coreRules
      .replace(/.*huele a comercial.*devuelve vac[ií]o.*/gi, '')
      .replace(/.*smells commercial.*return empty.*/gi, '')
      .replace(/.*no tienes nada interesante.*devuelve vac[ií]o.*/gi, '')
      .replace(/.*nothing interesting.*return empty.*/gi, '');
  }

  let effectiveRules = rules;
  if (isRelevant && platform === 'twitter') {
    effectiveRules = lang === 'es'
      ? 'REGLAS: Reply de Twitter. Máximo 280 caracteres. 1-2 frases. Informal. Sin hashtags. Sin markdown. ESCRIBE EN ESPAÑOL.\nSolo el reply.'
      : 'RULES: Twitter reply. Max 280 chars. 1-2 sentences. Informal. No hashtags. No markdown. WRITE IN ENGLISH.\nOnly the reply.';
  }

  // PROMPT CACHING: personality + core rules are static per persona/platform combo → cache them
  // Mention instruction goes in SYSTEM prompt so Claude treats it as authoritative
  const systemPrompt = `${personality}\n\n${coreRules}\n\n${effectiveRules}${mentionInSystem}`;

  const result = await callClaude(`You just read this ${platform} post by ${authorName}. Write the comment you'd naturally leave.

Post: "${postContent}"
`, maxTokens, { caller: 'persona-runner', system: systemPrompt });

  if (!result) return result;

  // NOTE: UTM tagging of ytubviral.com links was REMOVED (2026-06-13, Javier's call).
  // A "?utm_source=twitter&utm_campaign=persona-alex" link in a supposedly organic
  // comment screams "automated bot" and kills credibility — the social-optimizer flagged
  // it as spam-looking. Links now stay clean; attribution comes from other signals.

  // Second-line defense: if the model broke character and wrote a meta-comment
  // (asking for more info, referencing "post content", etc.) return empty to skip
  const metaPhrases = [
    /i.{0,10}d need to see/i,
    /post content/i,
    /write something real/i,
    /drop the (post|text)/i,
    /give you a genuine comment/i,
    /need more (context|info|detail)/i,
    // Spanish meta-refusals (e.g. narrating the language rule instead of replying)
    /devolver[ée]? vac[ií]o/i,
    /mis instrucciones/i,
    /regla de idioma/i,
    /responder[ée]? en espa[nñ]ol/i,
  ];
  if (metaPhrases.some(p => p.test(result))) {
    console.log(`[persona-runner] ⚠️ Meta-phrase detected in output — discarding comment`);
    return '';
  }

  return result;
}

// ── Follow-up reply generation ──

const FOLLOWUP_RULES = {
  es: `REGLAS PARA CONTINUAR LA CONVERSACIÓN:
- Responde de forma natural, como si fuera un chat entre conocidos
- Si te hacen una pregunta, responde directamente con algo útil
- Si comparten una experiencia, conecta con algo propio o un dato concreto
- Puedes hacer preguntas de seguimiento para profundizar la relación
- El tono debe sentirse como el de alguien que de verdad se interesa
- NUNCA suenes como bot, marca, o IA
- NUNCA fuerces temas ni vendas nada
- NUNCA te inventes datos, cifras ni casos ("analicé N canales" está prohibido)
- SIEMPRE responde algo — esta persona se tomó el tiempo de responderte
- Máximo 2-3 frases cortas
- 1 emoji como mucho o ninguno
- ESCRIBE SIEMPRE EN ESPAÑOL DE ESPAÑA (vosotros), nunca en otro idioma aunque te escriban en otro
Solo la respuesta.`,
  en: `RULES FOR CONTINUING THE CONVERSATION:
- Reply naturally, like a casual chat between people who recognize each other
- If they ask a question, answer directly with something useful
- If they share an experience, connect with your own or a concrete data point
- You can ask follow-up questions to deepen the relationship
- The tone should feel like someone who genuinely cares
- NEVER sound like a bot, brand, or AI
- NEVER force topics or sell anything
- NEVER invent data, numbers or cases (the "I analyzed N channels" pattern is banned)
- ALWAYS reply something — this person took time to respond to you
- Max 2-3 short sentences
- 1 emoji max or none
- ALWAYS write in your own language, never switch to mirror the message
Only the reply.`,
};

/**
 * Generate a follow-up reply to someone who replied to our comment.
 * @param {string} platform - 'twitter' | 'bluesky' | 'facebook'
 * @param {string} ourOriginalComment - what we originally said
 * @param {string} theirReply - what they replied to us
 * @param {string} theirName - who replied
 * @param {object} [persona] - persona config (null = brand)
 * @param {boolean} [shouldMentionYtubviral] - whether to organically mention ytubviral
 */
async function generateFollowupReply(platform, ourOriginalComment, theirReply, theirName, persona = null, shouldMentionYtubviral = false) {
  // A persona always replies in its own language (default español de España), not the message's.
  const lang = persona ? (persona.lang || 'es') : detectPostLang(theirReply);
  const personaDesc = persona
    ? (persona.personality[lang] || persona.personality.en)
    : (PERSONA[lang] || PERSONA.en);
  const rules = FOLLOWUP_RULES[lang] || FOLLOWUP_RULES.en;

  let mentionInstruction = '';
  if (shouldMentionYtubviral) {
    mentionInstruction = lang === 'es'
      ? '\n\nIMPORTANTE: Si encaja de forma 100% natural en la conversación, menciona casualmente ytubviral.com como algo que usas o que te ha funcionado. Solo si viene al caso — si no encaja, NO lo menciones.'
      : '\n\nIMPORTANT: If it fits 100% naturally in the conversation, casually mention ytubviral.com as something you use or that has worked for you. Only if relevant — if it doesn\'t fit, do NOT mention it.';
  }

  const maxTokens = platform === 'twitter' ? 120 : 200;

  // PROMPT CACHING: persona + rules are static per persona → cached
  const fullRules = rules;
  const systemPrompt = `${personaDesc}\n\n${fullRules}`;

  return callClaude(`You previously left this comment on ${platform}: "${ourOriginalComment}"

${theirName} replied to you: "${theirReply}"

Continue the conversation naturally.${mentionInstruction}
`, maxTokens, { caller: 'followup', system: systemPrompt });
}

// ── Email reply generation ──

async function generateEmailReply(senderEmail, subject, body) {
  const lang = detectPostLang(body);
  const rules = lang === 'es' ? {
    persona: 'Eres el equipo de soporte de YTubViral (ytubviral.com), una herramienta de IA para YouTubers. Respondes como un equipo pequeño, profesional pero cercano.',
    format: `REGLAS:
- Responde de forma profesional, amable y útil
- Si la persona pregunta por funcionalidades, explica brevemente lo que hace YTubViral
- Si es una queja o problema técnico, muestra empatía y ofrece ayuda concreta
- Si es una propuesta de colaboración o negocio, muestra interés y di que lo revisarás
- Si no puedes resolver algo, di que lo escalarás internamente
- Firma como "Equipo YTubViral"
- Máximo 5-6 frases. Directo y útil
- ESCRIBE EN ESPAÑOL
Solo el email de respuesta.`,
  } : {
    persona: 'You are the YTubViral (ytubviral.com) support team, an AI tool for YouTubers. You reply as a small team — professional but approachable.',
    format: `RULES:
- Reply professionally, warmly, and helpfully
- If they ask about features, briefly explain what YTubViral does
- If it's a complaint or technical issue, show empathy and offer concrete help
- If it's a collaboration or business proposal, show interest and say you'll review it
- If you can't resolve something, say you'll escalate internally
- Sign as "YTubViral Team"
- Max 5-6 sentences. Direct and useful
- WRITE IN ENGLISH
Only the reply email.`,
  };

  const systemPrompt = `${rules.persona}\n\n${rules.format}`;
  return callClaude(`You received this email:
From: ${senderEmail}
Subject: ${subject}
Body: "${body.slice(0, 800)}"

Write a reply.
`, 300, { caller: 'gmail', system: systemPrompt });
}

module.exports = {
  // Brand (existing)
  generateTweetReply, generateInstagramComment, generateFacebookComment,
  // Personas (new)
  generatePersonaComment,
  // Follow-up
  generateFollowupReply,
  // Email
  generateEmailReply,
  // Utilities
  callClaude,
  detectPostLang,
  deductFromBalance,
};
