// Learning Hub data — bilingual (es/en), static pattern matching blog-data.ts
// To add guide content: add a GUIDE_BODIES entry with LearnBlockType[] arrays

import type { BlockType, Lang } from './blog-data';

// Extended block types for learning content (adds video + image to blog blocks)
export type LearnBlockType =
  | BlockType
  | { type: 'video'; videoId: string }
  | { type: 'image'; src: string; alt: string; caption?: string };

export interface LearnGuide {
  slug: string;
  icon: string;               // path to /icons/*.webp
  title: Record<Lang, string>;
  description: Record<Lang, string>;
  level: 'beginner' | 'intermediate' | 'advanced';
  tool?: string;               // internal link to the tool
  coverImage?: string;         // /learn/covers/*.webp
  readMin: number;
  videoId?: string;            // YouTube unlisted ID (Pro only)
  relatedSlugs: string[];
  steps: Record<Lang, string[]>;
}

export const LEARN_GUIDES: LearnGuide[] = [
  {
    slug: 'seo-basics',
    icon: '/icons/magnifying-glass.webp',
    title: { es: 'SEO en YouTube: Guía completa', en: 'YouTube SEO: Complete Guide' },
    description: {
      es: 'Aprende a optimizar tus vídeos para que aparezcan en búsquedas y recomendaciones.',
      en: 'Learn to optimize your videos to appear in search and recommendations.',
    },
    level: 'beginner',
    tool: '/seo-score',
    readMin: 8,
    relatedSlugs: ['keyword-research', 'thumbnails', 'analytics-deep'],
    steps: {
      es: [
        'El título es lo más importante: incluye tu keyword principal en las primeras 5 palabras.',
        'Descripción: mínimo 150 palabras. Pon la keyword en el primer párrafo y añade timestamps.',
        'Tags: 5-15 tags relevantes. Mezcla broad (ej: "tutorial") con específicos (ej: "tutorial DaVinci Resolve color grading").',
        'Thumbnail personalizado: texto grande legible, colores contrastantes, rostros expresivos.',
        'Usa YTubViral SEO Score para analizar cada vídeo antes de publicar y llegar al 80+.',
        'Añade subtítulos (CC) y traducciones: YouTube los indexa como texto adicional para búsquedas.',
        'Playlists temáticas aumentan session time y señalan a YouTube que tu contenido está relacionado.',
      ],
      en: [
        'The title is king: include your main keyword in the first 5 words.',
        'Description: minimum 150 words. Put the keyword in the first paragraph and add timestamps.',
        'Tags: 5-15 relevant tags. Mix broad (eg: "tutorial") with specific (eg: "DaVinci Resolve color grading tutorial").',
        'Custom thumbnail: large readable text, contrasting colors, expressive faces.',
        'Use YTubViral SEO Score to analyze each video before publishing and aim for 80+.',
        'Add subtitles (CC) and translations: YouTube indexes them as additional searchable text.',
        'Thematic playlists increase session time and signal YouTube that your content is related.',
      ],
    },
  },
  {
    slug: 'keyword-research',
    icon: '/icons/bar-chart.webp',
    title: { es: 'Keyword Research para YouTube', en: 'Keyword Research for YouTube' },
    description: {
      es: 'Encuentra las palabras clave que tu audiencia está buscando y que tienen poca competencia.',
      en: 'Find keywords your audience is searching for with low competition.',
    },
    level: 'beginner',
    tool: '/research',
    readMin: 7,
    relatedSlugs: ['seo-basics', 'trend-explorer', 'competitor-analysis'],
    steps: {
      es: [
        'Empieza con el autocomplete de YouTube: escribe tu tema y mira qué sugiere.',
        'Usa YTubViral Research para ver volumen estimado y nivel de competencia de cada keyword.',
        'Busca keywords con oportunidad alta (>60) y competencia baja-media.',
        'Combina keywords: "cómo + [tema]", "[tema] + para principiantes", "mejor + [tema] + 2026".',
        'Crea un calendario de contenido basado en tus keywords ganadores.',
        'Analiza las keywords de tus competidores: mira qué términos rankean sus vídeos más exitosos.',
        'Revisa tus keywords cada mes: el volumen de búsqueda cambia con temporadas y tendencias.',
      ],
      en: [
        'Start with YouTube autocomplete: type your topic and see what it suggests.',
        'Use YTubViral Research to see estimated volume and competition level for each keyword.',
        'Look for keywords with high opportunity (>60) and low-medium competition.',
        'Combine keywords: "how to + [topic]", "[topic] + for beginners", "best + [topic] + 2026".',
        'Create a content calendar based on your winning keywords.',
        'Analyze your competitors\' keywords: see what terms their most successful videos rank for.',
        'Review your keywords monthly: search volume changes with seasons and trends.',
      ],
    },
  },
  {
    slug: 'retention',
    icon: '/icons/chart-up.webp',
    title: { es: 'Mejorar retención de audiencia', en: 'Improve Audience Retention' },
    description: {
      es: 'La retención es el factor #1 del algoritmo. Aprende a mantener a tu audiencia enganchada.',
      en: 'Retention is the #1 algorithm factor. Learn to keep your audience hooked.',
    },
    level: 'intermediate',
    tool: '/retention',
    readMin: 9,
    relatedSlugs: ['thumbnails', 'analytics-deep', 'video-predictor'],
    steps: {
      es: [
        'Hook en los primeros 30 segundos: promete el valor que vas a dar. "En este vídeo vas a aprender..."',
        'Usa pattern interrupts cada 2-3 minutos: cambios de cámara, gráficos, b-roll, preguntas al viewer.',
        'Elimina silencios y pausas largas. El ritmo es clave.',
        'Open loops: anticipa lo que viene después para que no se vayan. "Pero antes de eso..."',
        'Analiza tus drop-off points en YTubViral Retention y mejora esos momentos exactos.',
        'El final importa: cierra con un resumen + CTA claro. Un buen cierre aumenta la satisfacción y las recomendaciones.',
        'Duración ideal: que dure lo que necesite, pero ni un segundo más. 8-12 minutos es el sweet spot para la mayoría.',
      ],
      en: [
        'Hook in the first 30 seconds: promise the value you\'ll deliver. "In this video you\'ll learn..."',
        'Use pattern interrupts every 2-3 minutes: camera changes, graphics, b-roll, viewer questions.',
        'Eliminate dead air and long pauses. Pacing is key.',
        'Open loops: tease what\'s coming next so they stay. "But before that..."',
        'Analyze your drop-off points in YTubViral Retention and improve those exact moments.',
        'The ending matters: close with a summary + clear CTA. A strong ending boosts satisfaction and recommendations.',
        'Ideal duration: make it as long as it needs to be, but not a second longer. 8-12 minutes is the sweet spot for most.',
      ],
    },
  },
  {
    slug: 'thumbnails',
    icon: '/icons/thumbnail.webp',
    title: { es: 'Thumbnails que generan clics', en: 'Thumbnails That Get Clicks' },
    description: {
      es: 'El thumbnail decide si alguien hace clic. Aprende los principios de diseño que funcionan.',
      en: 'The thumbnail decides if someone clicks. Learn the design principles that work.',
    },
    level: 'beginner',
    readMin: 7,
    relatedSlugs: ['ab-testing', 'seo-basics', 'video-predictor'],
    steps: {
      es: [
        'Máximo 3-4 palabras en el thumbnail. Texto grande y legible incluso en móvil.',
        'Contraste de colores: fondo y texto deben diferenciarse claramente. Amarillo sobre oscuro funciona.',
        'Rostros con expresiones exageradas aumentan CTR un 30-40%.',
        'No repitas el título exacto — el thumbnail complementa, no duplica.',
        'Testea 2-3 versiones en tus primeras horas con YTubViral A/B Testing.',
        'Crea un estilo visual consistente: que tu audiencia reconozca tus vídeos al instante en el feed.',
        'Analiza los thumbnails de los top 5 resultados de tu keyword — ¿qué puedes hacer diferente para destacar?',
      ],
      en: [
        'Maximum 3-4 words on the thumbnail. Large text readable even on mobile.',
        'Color contrast: background and text must be clearly different. Yellow on dark works well.',
        'Faces with exaggerated expressions increase CTR by 30-40%.',
        'Don\'t repeat the exact title — the thumbnail complements, not duplicates.',
        'Test 2-3 versions in your first hours with YTubViral A/B Testing.',
        'Create a consistent visual style: make your audience recognize your videos instantly in the feed.',
        'Analyze the thumbnails of the top 5 results for your keyword — what can you do differently to stand out?',
      ],
    },
  },
  {
    slug: 'analytics-deep',
    icon: '/icons/flask.webp',
    title: { es: 'Análisis avanzado con YouTube Analytics', en: 'Advanced Analysis with YouTube Analytics' },
    description: {
      es: 'Aprende a leer tus datos privados de YouTube y tomar decisiones basadas en métricas reales.',
      en: 'Learn to read your private YouTube data and make decisions based on real metrics.',
    },
    level: 'advanced',
    tool: '/analytics',
    readMin: 10,
    relatedSlugs: ['retention', 'competitor-analysis', 'video-predictor'],
    steps: {
      es: [
        'Fuentes de tráfico: si la mayoría viene de "Búsqueda", tu SEO funciona. Si viene de "Sugeridos", el algoritmo te empuja.',
        'Watch time > Views: un vídeo con menos views pero más watch time es mejor señal para el algoritmo.',
        'Suscriptores ganados por vídeo: identifica qué tipo de contenido convierte viewers en suscriptores.',
        'Países: si tu audiencia está en otro país del que pensabas, adapta horarios y contenido.',
        'Compara tus métricas mes a mes en YTubViral Analytics para detectar tendencias.',
        'Impression click-through rate por vídeo: te dice si el packaging (título+thumbnail) funciona o no.',
        'Audience overlap: identifica qué otros canales mira tu audiencia para encontrar oportunidades de colaboración.',
      ],
      en: [
        'Traffic sources: if most comes from "Search", your SEO works. If from "Suggested", the algorithm is pushing you.',
        'Watch time > Views: a video with fewer views but more watch time is a better signal for the algorithm.',
        'Subscribers gained per video: identify what content type converts viewers into subscribers.',
        'Countries: if your audience is in a different country than expected, adapt schedule and content.',
        'Compare your metrics month over month in YTubViral Analytics to spot trends.',
        'Impression click-through rate per video: tells you whether the packaging (title+thumbnail) is working or not.',
        'Audience overlap: identify what other channels your audience watches to find collaboration opportunities.',
      ],
    },
  },
  {
    slug: 'growth-strategy',
    icon: '/icons/rocket.webp',
    title: { es: 'Estrategia de crecimiento 0 a 1K subs', en: 'Growth Strategy 0 to 1K Subs' },
    description: {
      es: 'Los primeros 1000 suscriptores son los más difíciles. Aquí tienes el plan paso a paso.',
      en: 'The first 1000 subscribers are the hardest. Here\'s the step-by-step plan.',
    },
    level: 'beginner',
    readMin: 8,
    relatedSlugs: ['seo-basics', 'content-calendar', 'ai-generator'],
    steps: {
      es: [
        'Define tu nicho claramente. "Tutoriales de DaVinci Resolve para principiantes" es mejor que "edición de vídeo".',
        'Publica de forma consistente: mínimo 1 vídeo/semana. El algoritmo premia la consistencia.',
        'Enfócate en contenido de búsqueda (how-to, tutorials, reviews) — no en contenido de trending.',
        'Colabora con canales de tu tamaño. Los collabs son el growth hack más infrautilizado.',
        'Usa todas las herramientas de YTubViral: SEO Score, Keywords, Best Time, y Daily Ideas para mantenerte enfocado.',
        'Responde a TODOS los comentarios en tus primeros meses. La comunidad temprana es tu asset más valioso.',
        'No mires los números diariamente — revisa métricas semanalmente. El progreso real se ve a largo plazo.',
      ],
      en: [
        'Define your niche clearly. "DaVinci Resolve tutorials for beginners" is better than "video editing".',
        'Publish consistently: minimum 1 video/week. The algorithm rewards consistency.',
        'Focus on search content (how-to, tutorials, reviews) — not trending content.',
        'Collaborate with channels your size. Collabs are the most underused growth hack.',
        'Use all YTubViral tools: SEO Score, Keywords, Best Time, and Daily Ideas to stay focused.',
        'Reply to ALL comments in your first months. Your early community is your most valuable asset.',
        'Don\'t check numbers daily — review metrics weekly. Real progress shows over time.',
      ],
    },
  },
  {
    slug: 'competitor-analysis',
    icon: '/icons/target.webp',
    title: { es: 'Análisis de competidores', en: 'Competitor Analysis' },
    description: {
      es: 'Aprende de los que ya lo están haciendo bien. Analiza su estrategia y encuentra tu ventaja.',
      en: 'Learn from those already doing well. Analyze their strategy and find your edge.',
    },
    level: 'intermediate',
    tool: '/competitors',
    readMin: 8,
    relatedSlugs: ['keyword-research', 'analytics-deep', 'trend-explorer'],
    steps: {
      es: [
        'Identifica 5-10 canales de tu nicho que tengan 2-10x más suscriptores que tú.',
        'Analiza sus vídeos más exitosos: ¿qué tienen en común los títulos, thumbnails y temas?',
        'Mira su frecuencia de subida y duración media — ¿qué funciona en tu nicho?',
        'Busca "content gaps": temas que tu audiencia busca pero tus competidores no cubren bien.',
        'Usa YTubViral Competitor Tracking para monitorizar su crecimiento en tiempo real.',
        'Analiza sus descripciones y tags — herramientas como YTubViral revelan las keywords que usan.',
        'No copies — inspírate. Encuentra el ángulo que ellos no cubren y hazlo tuyo.',
      ],
      en: [
        'Identify 5-10 channels in your niche with 2-10x more subscribers than you.',
        'Analyze their most successful videos: what do the titles, thumbnails and topics have in common?',
        'Look at their upload frequency and average duration — what works in your niche?',
        'Look for content gaps: topics your audience searches for but competitors don\'t cover well.',
        'Use YTubViral Competitor Tracking to monitor their growth in real time.',
        'Analyze their descriptions and tags — tools like YTubViral reveal the keywords they use.',
        'Don\'t copy — get inspired. Find the angle they don\'t cover and make it yours.',
      ],
    },
  },
  {
    slug: 'ab-testing',
    icon: '/icons/lightning.webp',
    title: { es: 'A/B Testing de títulos y thumbnails', en: 'A/B Testing Titles & Thumbnails' },
    description: {
      es: 'Deja de adivinar qué funciona. Testea variaciones y deja que los datos decidan.',
      en: 'Stop guessing what works. Test variations and let the data decide.',
    },
    level: 'intermediate',
    tool: '/ab-test',
    readMin: 7,
    relatedSlugs: ['thumbnails', 'seo-basics', 'video-predictor'],
    steps: {
      es: [
        'Prepara 2-3 variaciones de título antes de publicar. Cambia una variable a la vez (emoción, número, formato).',
        'Crea 2-3 thumbnails con diferencias claras: distinto texto, colores o expresión facial.',
        'Publica con tu mejor opción y cambia a la alternativa tras 24-48 horas si el CTR está bajo.',
        'El CTR mínimo saludable es 4-5%. Por debajo, el thumbnail o título necesitan trabajo.',
        'Usa YTubViral A/B Testing para rotar variaciones automáticamente y ver cuál gana.',
        'Registra los resultados: con el tiempo descubrirás patrones sobre qué estilo funciona en tu nicho.',
        'No testees en vídeos viejos con poco tráfico — necesitas volumen suficiente para que los datos sean significativos.',
      ],
      en: [
        'Prepare 2-3 title variations before publishing. Change one variable at a time (emotion, number, format).',
        'Create 2-3 thumbnails with clear differences: different text, colors, or facial expression.',
        'Publish with your best option and switch to the alternative after 24-48 hours if CTR is low.',
        'Healthy minimum CTR is 4-5%. Below that, the thumbnail or title needs work.',
        'Use YTubViral A/B Testing to automatically rotate variations and see which wins.',
        'Log results: over time you\'ll discover patterns about what style works in your niche.',
        'Don\'t test on old videos with low traffic — you need enough volume for data to be meaningful.',
      ],
    },
  },
  {
    slug: 'best-time',
    icon: '/icons/clock-fast.webp',
    title: { es: 'Mejor hora para publicar', en: 'Best Time to Publish' },
    description: {
      es: 'El timing importa. Publica cuando tu audiencia está activa para maximizar el impulso inicial.',
      en: 'Timing matters. Publish when your audience is active to maximize initial momentum.',
    },
    level: 'beginner',
    tool: '/best-time',
    readMin: 6,
    relatedSlugs: ['content-calendar', 'analytics-deep', 'growth-strategy'],
    steps: {
      es: [
        'YouTube Studio > Analytics > Audiencia muestra cuándo están conectados tus espectadores (gráfico de calor).',
        'Las mejores horas generales: martes a jueves, 14:00-17:00 hora local de tu audiencia principal.',
        'Publica 2-3 horas ANTES del pico de actividad para que el vídeo procese y acumule señales tempranas.',
        'Si tu audiencia es internacional, prioriza el timezone del grupo más grande.',
        'Evita publicar en horarios de alta competencia en tu nicho — si todos publican a las 15:00, prueba a las 12:00.',
        'Usa YTubViral Best Time para obtener recomendaciones personalizadas basadas en TU audiencia real.',
        'Sé consistente con tu horario: tu audiencia aprende cuándo esperar contenido nuevo.',
      ],
      en: [
        'YouTube Studio > Analytics > Audience shows when your viewers are online (heat map).',
        'Best general times: Tuesday to Thursday, 2-5 PM local time of your main audience.',
        'Publish 2-3 hours BEFORE peak activity so the video processes and gathers early signals.',
        'If your audience is international, prioritize the timezone of the largest group.',
        'Avoid publishing during high-competition hours in your niche — if everyone publishes at 3 PM, try noon.',
        'Use YTubViral Best Time for personalized recommendations based on YOUR actual audience.',
        'Be consistent with your schedule: your audience learns when to expect new content.',
      ],
    },
  },
  {
    slug: 'trend-explorer',
    icon: '/icons/flame.webp',
    title: { es: 'Cómo aprovechar las tendencias', en: 'How to Ride Trends' },
    description: {
      es: 'Detecta temas en auge antes que tu competencia y crea contenido que el algoritmo quiere recomendar.',
      en: 'Spot rising topics before your competition and create content the algorithm wants to recommend.',
    },
    level: 'intermediate',
    tool: '/trends',
    readMin: 8,
    relatedSlugs: ['keyword-research', 'content-calendar', 'ai-generator'],
    steps: {
      es: [
        'Distingue entre tendencias (duran semanas/meses) y virales efímeros (duran horas). Enfócate en tendencias.',
        'Fuentes de tendencias: Google Trends, X/Twitter trending, subreddits de tu nicho, YouTube "Tendencias".',
        'Reacciona rápido: el primer 20% de creadores que cubren una tendencia se llevan el 80% del tráfico.',
        'Adapta la tendencia a tu nicho: no hagas un vídeo genérico. "Tendencia X + tu ángulo único" funciona mejor.',
        'Usa YTubViral Trend Explorer para recibir alertas de temas en auge relevantes para tu canal.',
        'Combina trending con evergreen: "Review de [producto trending] — guía completa" sigue recibiendo tráfico después.',
        'No fuerces tendencias que no encajan con tu canal — tu audiencia nota cuando no es auténtico.',
      ],
      en: [
        'Distinguish between trends (last weeks/months) and viral flashes (last hours). Focus on trends.',
        'Trend sources: Google Trends, X/Twitter trending, niche subreddits, YouTube "Trending".',
        'React fast: the first 20% of creators covering a trend capture 80% of the traffic.',
        'Adapt the trend to your niche: don\'t make a generic video. "Trend X + your unique angle" works best.',
        'Use YTubViral Trend Explorer to get alerts on rising topics relevant to your channel.',
        'Combine trending with evergreen: "Review of [trending product] — complete guide" keeps getting traffic.',
        'Don\'t force trends that don\'t fit your channel — your audience notices when it\'s not authentic.',
      ],
    },
  },
  {
    slug: 'ai-generator',
    icon: '/icons/magic-wand.webp',
    title: { es: 'Generar contenido con IA', en: 'Generate Content with AI' },
    description: {
      es: 'Usa la IA como copiloto: genera ideas, títulos, descripciones y guiones optimizados en segundos.',
      en: 'Use AI as your copilot: generate ideas, titles, descriptions, and optimized scripts in seconds.',
    },
    level: 'beginner',
    tool: '/generate',
    readMin: 7,
    relatedSlugs: ['seo-basics', 'content-calendar', 'ai-coach'],
    steps: {
      es: [
        'La IA no reemplaza tu voz — es un acelerador. Siempre edita y personaliza el resultado.',
        'Para títulos: pide 10 variaciones y elige las 2-3 mejores. La IA es mejor generando opciones que eligiendo.',
        'Para descripciones: da contexto al generador (tema, keywords objetivo, CTA) y obtendrás resultados mucho mejores.',
        'Para guiones: usa la IA para crear el esqueleto (hook, puntos clave, CTA) y rellénalo con tu experiencia real.',
        'Genera ideas de vídeo basadas en tu nicho y keywords con alto potencial — rompe el bloqueo creativo.',
        'Usa YTubViral AI Generator para crear títulos, descripciones y tags optimizados para SEO automáticamente.',
        'Revisa siempre el contenido generado: elimina clichés, añade datos propios y asegúrate de que suena como tú.',
      ],
      en: [
        'AI doesn\'t replace your voice — it\'s an accelerator. Always edit and personalize the output.',
        'For titles: ask for 10 variations and pick the best 2-3. AI is better at generating options than choosing.',
        'For descriptions: give the generator context (topic, target keywords, CTA) and you\'ll get much better results.',
        'For scripts: use AI to create the skeleton (hook, key points, CTA) and fill it with your real experience.',
        'Generate video ideas based on your niche and high-potential keywords — break through creative blocks.',
        'Use YTubViral AI Generator to create titles, descriptions, and SEO-optimized tags automatically.',
        'Always review generated content: remove clichés, add your own data, and make sure it sounds like you.',
      ],
    },
  },
  {
    slug: 'content-calendar',
    icon: '/icons/clipboard.webp',
    title: { es: 'Planificar tu calendario de contenido', en: 'Plan Your Content Calendar' },
    description: {
      es: 'La consistencia es lo que separa a los canales que crecen de los que se estancan. Planifica con estrategia.',
      en: 'Consistency is what separates growing channels from stagnant ones. Plan strategically.',
    },
    level: 'intermediate',
    tool: '/calendar',
    readMin: 7,
    relatedSlugs: ['best-time', 'keyword-research', 'ai-generator'],
    steps: {
      es: [
        'Define tu frecuencia realista: 1 vídeo/semana es suficiente si eres consistente. No prometas 3 si vas a fallar.',
        'Mezcla tipos de contenido: 70% búsqueda (tutoriales, how-to), 20% tendencias, 10% experimental.',
        'Planifica con 2-4 semanas de anticipación. Tener un buffer evita el estrés y mejora la calidad.',
        'Agrupa la producción: graba 2-3 vídeos en un día y edita/publica a lo largo de la semana.',
        'Incluye fechas clave de tu nicho (lanzamientos, eventos, temporadas) para contenido planificado.',
        'Usa YTubViral Content Calendar para visualizar tu plan, asignar ideas a fechas y mantener el ritmo.',
        'Revisa resultados mensualmente: ¿qué tipo de contenido funcionó mejor? Ajusta el calendario del próximo mes.',
      ],
      en: [
        'Define your realistic frequency: 1 video/week is enough if you\'re consistent. Don\'t promise 3 if you\'ll fail.',
        'Mix content types: 70% search (tutorials, how-to), 20% trending, 10% experimental.',
        'Plan 2-4 weeks ahead. Having a buffer reduces stress and improves quality.',
        'Batch production: record 2-3 videos in one day and edit/publish throughout the week.',
        'Include key dates in your niche (launches, events, seasons) for planned content.',
        'Use YTubViral Content Calendar to visualize your plan, assign ideas to dates, and maintain rhythm.',
        'Review results monthly: what type of content performed best? Adjust next month\'s calendar.',
      ],
    },
  },
  {
    slug: 'video-predictor',
    icon: '/icons/diamond.webp',
    title: { es: 'Predecir el rendimiento antes de publicar', en: 'Predict Performance Before Publishing' },
    description: {
      es: 'Anticipa cómo rendirá tu vídeo y optimízalo antes de que sea demasiado tarde.',
      en: 'Anticipate how your video will perform and optimize it before it\'s too late.',
    },
    level: 'advanced',
    tool: '/predictor',
    readMin: 8,
    relatedSlugs: ['seo-basics', 'ab-testing', 'analytics-deep'],
    steps: {
      es: [
        'Los factores que más predicen el éxito: CTR del thumbnail (>5%), retención media (>50%), y relevancia del título para la keyword.',
        'Compara tu título con los top 10 resultados de esa keyword — ¿ofrece algo diferente o mejor?',
        'Verifica que la descripción tenga la keyword en las primeras 25 palabras y mínimo 150 palabras de contenido.',
        'Un vídeo con buen SEO Score (>80) pero mal thumbnail seguirá fallando — ambos son necesarios.',
        'Usa YTubViral Predictor para obtener una estimación de rendimiento antes de publicar.',
        'Si el predictor da puntuación baja, ajusta título/thumbnail/descripción antes de publicar — no después.',
        'Crea un checklist pre-publicación: SEO Score >80, thumbnail testeado, descripción completa, tags relevantes, mejor hora.',
      ],
      en: [
        'Key performance predictors: thumbnail CTR (>5%), average retention (>50%), and title relevance to keyword.',
        'Compare your title with the top 10 results for that keyword — does it offer something different or better?',
        'Verify your description has the keyword in the first 25 words and at least 150 words of content.',
        'A video with great SEO Score (>80) but bad thumbnail will still fail — both are necessary.',
        'Use YTubViral Predictor to get a performance estimate before publishing.',
        'If the predictor gives a low score, adjust title/thumbnail/description before publishing — not after.',
        'Create a pre-publish checklist: SEO Score >80, tested thumbnail, complete description, relevant tags, best time.',
      ],
    },
  },
  {
    slug: 'ai-coach',
    icon: '/icons/brain.webp',
    title: { es: 'Tu coach de YouTube con IA', en: 'Your AI YouTube Coach' },
    description: {
      es: 'Recibe análisis personalizado de tu canal y recomendaciones accionables basadas en tus datos reales.',
      en: 'Get personalized channel analysis and actionable recommendations based on your actual data.',
    },
    level: 'advanced',
    tool: '/coach',
    readMin: 8,
    relatedSlugs: ['analytics-deep', 'growth-strategy', 'ai-generator'],
    steps: {
      es: [
        'El AI Coach analiza los datos reales de tu canal: vídeos recientes, métricas de rendimiento, crecimiento de suscriptores.',
        'Las recomendaciones se basan en TU historial, no en consejos genéricos. Lo que funciona para un gaming channel no funciona para un canal de cocina.',
        'Pide análisis de un vídeo específico: el coach te dirá qué salió bien y qué mejorar en el siguiente.',
        'Usa el coach para revisar tus títulos y descripciones antes de publicar — es como tener un consultor 24/7.',
        'El coach detecta patrones en tu canal: si tus tutoriales rinden 3x más que tus vlogs, te lo dirá.',
        'Haz preguntas específicas: "¿por qué mis últimos 5 vídeos tienen retención baja?" da mejores respuestas que preguntas vagas.',
        'Usa YTubViral AI Coach semanalmente para mantener una visión clara de tu progreso y próximos pasos.',
      ],
      en: [
        'The AI Coach analyzes your actual channel data: recent videos, performance metrics, subscriber growth.',
        'Recommendations are based on YOUR history, not generic tips. What works for a gaming channel doesn\'t work for a cooking channel.',
        'Ask for analysis of a specific video: the coach will tell you what went well and what to improve next time.',
        'Use the coach to review your titles and descriptions before publishing — it\'s like having a 24/7 consultant.',
        'The coach detects patterns in your channel: if your tutorials get 3x more than your vlogs, it\'ll tell you.',
        'Ask specific questions: "why do my last 5 videos have low retention?" gives better answers than vague questions.',
        'Use YTubViral AI Coach weekly to maintain a clear view of your progress and next steps.',
      ],
    },
  },
];

// ── Guide Bodies ──
// Guides without an entry here render fallback steps[] content

const BODY_SEO_ES: LearnBlockType[] = [
  { type: 'h2', t: 'Por qué el SEO en YouTube importa más que nunca' },
  { type: 'p', t: 'YouTube es el segundo buscador más grande del mundo. Cada minuto se suben más de 500 horas de vídeo, y sin SEO tu contenido se pierde en el ruido. El SEO en YouTube no es opcional — es la diferencia entre que te descubran o que tu vídeo acumule polvo digital.' },
  { type: 'p', t: 'En 2026, el algoritmo de YouTube utiliza más de 200 señales para decidir qué vídeos mostrar. Las tres más importantes para el descubrimiento son: la relevancia del título para la búsqueda, la calidad del thumbnail (medida por CTR), y la retención de audiencia. El SEO afecta directamente a las dos primeras.' },

  { type: 'h2', t: 'Los 5 pilares del SEO en YouTube' },

  { type: 'h3', t: '1. El título: tu arma principal' },
  { type: 'p', t: 'El título es el factor SEO más importante. YouTube da mucho más peso a las primeras 5 palabras del título que al resto. Si tu keyword principal no está ahí, estás perdiendo posiciones.' },
  { type: 'list', items: [
    'Incluye la keyword principal en las primeras 5 palabras.',
    'Mantén el título entre 50-70 caracteres para evitar que se corte en móvil.',
    'Usa números cuando sea posible: "7 trucos..." convierte mejor que "Trucos para...".',
    'Evita clickbait vacío. El algoritmo mide si los viewers se quedan — si se van, tu ranking baja.',
    'Haz que el título genere curiosidad o prometa un beneficio claro.',
  ]},
  { type: 'p', t: 'Un buen título cumple dos funciones simultáneamente: contiene la keyword para el algoritmo y genera curiosidad para el humano. Si solo cumple una, pierde eficacia.' },

  { type: 'h3', t: '2. La descripción: tu texto SEO' },
  { type: 'p', t: 'YouTube lee tu descripción para entender de qué trata el vídeo. Es tu oportunidad de añadir contexto semántico que el título no puede contener.' },
  { type: 'list', items: [
    'Mínimo 150 palabras. Los vídeos con descripciones largas y relevantes rankean mejor.',
    'Pon la keyword principal en el primer párrafo (primeras 25 palabras idealmente).',
    'Incluye keywords secundarias de forma natural a lo largo del texto.',
    'Añade timestamps — YouTube los muestra en los resultados de búsqueda y mejoran el CTR.',
    'Incluye links a vídeos relacionados, tus redes sociales y tu web.',
    'No hagas keyword stuffing. YouTube penaliza las descripciones que parecen spam.',
  ]},

  { type: 'h3', t: '3. Tags: complemento, no protagonista' },
  { type: 'p', t: 'Los tags ya no tienen tanto peso como antes, pero siguen ayudando a YouTube a categorizar tu contenido, especialmente cuando tu tema puede ser ambiguo.' },
  { type: 'list', items: [
    'Usa entre 5 y 15 tags relevantes.',
    'Mezcla tags amplios ("tutorial", "YouTube") con específicos ("tutorial DaVinci Resolve color grading 2026").',
    'Tu primer tag debe ser tu keyword exacta.',
    'Incluye variaciones: si tu keyword es "editar vídeos", añade "edición de vídeo", "cómo editar vídeos".',
  ]},

  { type: 'callout', t: 'Analiza el SEO de tu próximo vídeo antes de publicar con YTubViral SEO Score — apunta al 80+.' },

  { type: 'h3', t: '4. Thumbnails: el CTR es SEO' },
  { type: 'p', t: 'El CTR (Click-Through Rate) es una de las señales más potentes para el algoritmo. Un vídeo con un CTR alto recibe más impresiones, lo que genera más clics, creando un ciclo positivo. Y el CTR depende casi exclusivamente del thumbnail.' },
  { type: 'list', items: [
    'Texto grande y legible incluso en móvil (máximo 3-4 palabras).',
    'Colores que contrasten con el fondo blanco/oscuro de YouTube.',
    'Rostros con expresiones exageradas aumentan el CTR entre un 30-40%.',
    'No dupliques el título — el thumbnail debe complementar, no repetir.',
  ]},

  { type: 'h3', t: '5. Subtítulos y traducciones' },
  { type: 'p', t: 'Los subtítulos (CC) son texto que YouTube puede indexar. Añadir subtítulos es como multiplicar tu contenido textual por 10x. YouTube los usa para entender mejor tu vídeo y mostrarlo en búsquedas relacionadas.' },
  { type: 'p', t: 'Si tu contenido puede funcionar en más de un idioma, añadir traducciones del título, descripción y subtítulos te abre mercados enteros sin crear contenido nuevo.' },

  { type: 'h2', t: 'Errores SEO que arruinan tu posicionamiento' },
  { type: 'list', items: [
    'Titular sin keyword: si tu keyword es "cómo editar en Premiere" y tu título es "Mi flujo de trabajo de edición", YouTube no sabe mostrarte.',
    'Descripción vacía o con solo links: pierdes toda la oportunidad de contexto semántico.',
    'Ignorar el CTR: un vídeo con buen SEO pero un thumbnail genérico seguirá sin recibir clics.',
    'No usar playlists: las playlists temáticas aumentan el session time y ayudan al ranking.',
    'Publicar y olvidar: el SEO no es solo pre-publicación. Optimiza títulos y thumbnails de vídeos que no están rindiendo.',
  ]},

  { type: 'callout-mid', t: 'Optimiza cada vídeo antes de publicar', sub: 'YTubViral SEO Score analiza título, descripción, tags y más para darte una puntuación y recomendaciones claras.', cta: 'Probar SEO Score gratis' },

  { type: 'h2', t: 'Checklist SEO pre-publicación' },
  { type: 'list', items: [
    'Keyword principal en las primeras 5 palabras del título.',
    'Título entre 50-70 caracteres.',
    'Descripción de 150+ palabras con keyword en el primer párrafo.',
    'Timestamps añadidos.',
    '5-15 tags relevantes (keyword exacta como primer tag).',
    'Thumbnail personalizado con texto legible y colores contrastantes.',
    'Subtítulos (CC) activados o subidos manualmente.',
    'Vídeo añadido a una playlist temática.',
    'SEO Score de YTubViral > 80.',
  ]},

  { type: 'callout-final', t: 'Empieza a optimizar tus vídeos hoy', sub: 'YTubViral analiza, puntúa y mejora el SEO de cada vídeo automáticamente. 10 análisis gratis.', cta: 'Empezar gratis' },
];

const BODY_SEO_EN: LearnBlockType[] = [
  { type: 'h2', t: 'Why YouTube SEO Matters More Than Ever' },
  { type: 'p', t: 'YouTube is the second largest search engine in the world. Over 500 hours of video are uploaded every minute, and without SEO your content gets lost in the noise. YouTube SEO isn\'t optional — it\'s the difference between getting discovered and collecting digital dust.' },
  { type: 'p', t: 'In 2026, YouTube\'s algorithm uses over 200 signals to decide which videos to show. The three most important for discovery are: title relevance to the search query, thumbnail quality (measured by CTR), and audience retention. SEO directly affects the first two.' },

  { type: 'h2', t: 'The 5 Pillars of YouTube SEO' },

  { type: 'h3', t: '1. The Title: Your Main Weapon' },
  { type: 'p', t: 'The title is the most important SEO factor. YouTube gives significantly more weight to the first 5 words of your title than the rest. If your main keyword isn\'t there, you\'re losing positions.' },
  { type: 'list', items: [
    'Include your main keyword in the first 5 words.',
    'Keep the title between 50-70 characters to avoid truncation on mobile.',
    'Use numbers when possible: "7 tricks..." converts better than "Tricks for...".',
    'Avoid empty clickbait. The algorithm measures whether viewers stay — if they leave, your ranking drops.',
    'Make the title spark curiosity or promise a clear benefit.',
  ]},
  { type: 'p', t: 'A good title serves two functions simultaneously: it contains the keyword for the algorithm and generates curiosity for the human. If it only achieves one, it loses effectiveness.' },

  { type: 'h3', t: '2. The Description: Your SEO Copy' },
  { type: 'p', t: 'YouTube reads your description to understand what your video is about. It\'s your opportunity to add semantic context that the title can\'t contain.' },
  { type: 'list', items: [
    'Minimum 150 words. Videos with long, relevant descriptions rank better.',
    'Put the main keyword in the first paragraph (ideally first 25 words).',
    'Include secondary keywords naturally throughout the text.',
    'Add timestamps — YouTube shows them in search results and they improve CTR.',
    'Include links to related videos, your social media, and your website.',
    'Don\'t keyword stuff. YouTube penalizes descriptions that look like spam.',
  ]},

  { type: 'h3', t: '3. Tags: Supporting Cast, Not the Lead' },
  { type: 'p', t: 'Tags don\'t carry as much weight as they used to, but they still help YouTube categorize your content, especially when your topic could be ambiguous.' },
  { type: 'list', items: [
    'Use between 5 and 15 relevant tags.',
    'Mix broad tags ("tutorial", "YouTube") with specific ones ("DaVinci Resolve color grading tutorial 2026").',
    'Your first tag should be your exact keyword.',
    'Include variations: if your keyword is "edit videos", add "video editing", "how to edit videos".',
  ]},

  { type: 'callout', t: 'Analyze your next video\'s SEO before publishing with YTubViral SEO Score — aim for 80+.' },

  { type: 'h3', t: '4. Thumbnails: CTR Is SEO' },
  { type: 'p', t: 'CTR (Click-Through Rate) is one of the most powerful signals for the algorithm. A video with high CTR gets more impressions, which generates more clicks, creating a positive cycle. And CTR depends almost entirely on the thumbnail.' },
  { type: 'list', items: [
    'Large, readable text even on mobile (maximum 3-4 words).',
    'Colors that contrast with YouTube\'s white/dark background.',
    'Faces with exaggerated expressions increase CTR by 30-40%.',
    'Don\'t duplicate the title — the thumbnail should complement, not repeat.',
  ]},

  { type: 'h3', t: '5. Subtitles and Translations' },
  { type: 'p', t: 'Subtitles (CC) are text that YouTube can index. Adding subtitles is like multiplying your textual content by 10x. YouTube uses them to better understand your video and show it in related searches.' },
  { type: 'p', t: 'If your content can work in more than one language, adding title, description, and subtitle translations opens entire markets without creating new content.' },

  { type: 'h2', t: 'SEO Mistakes That Ruin Your Rankings' },
  { type: 'list', items: [
    'Title without keyword: if your keyword is "how to edit in Premiere" and your title is "My editing workflow", YouTube doesn\'t know to show you.',
    'Empty description or links only: you lose all the semantic context opportunity.',
    'Ignoring CTR: a video with great SEO but a generic thumbnail still won\'t get clicks.',
    'Not using playlists: thematic playlists increase session time and help ranking.',
    'Publish and forget: SEO isn\'t just pre-publish. Optimize titles and thumbnails of underperforming videos.',
  ]},

  { type: 'callout-mid', t: 'Optimize every video before publishing', sub: 'YTubViral SEO Score analyzes your title, description, tags and more to give you a clear score and recommendations.', cta: 'Try SEO Score free' },

  { type: 'h2', t: 'Pre-Publish SEO Checklist' },
  { type: 'list', items: [
    'Main keyword in the first 5 words of the title.',
    'Title between 50-70 characters.',
    '150+ word description with keyword in the first paragraph.',
    'Timestamps added.',
    '5-15 relevant tags (exact keyword as first tag).',
    'Custom thumbnail with readable text and contrasting colors.',
    'Subtitles (CC) enabled or manually uploaded.',
    'Video added to a thematic playlist.',
    'YTubViral SEO Score > 80.',
  ]},

  { type: 'callout-final', t: 'Start optimizing your videos today', sub: 'YTubViral analyzes, scores, and improves the SEO of every video automatically. 10 free analyses.', cta: 'Get started free' },
];

const BODY_KEYWORDS_ES: LearnBlockType[] = [
  { type: 'h2', t: 'Qué es el Keyword Research en YouTube (y por qué no es igual que en Google)' },
  { type: 'p', t: 'El keyword research es el proceso de encontrar las palabras y frases que tu audiencia potencial escribe en el buscador de YouTube. Es la base de todo el SEO: si no sabes qué buscan, no puedes crear contenido que les llegue.' },
  { type: 'p', t: 'YouTube tiene un comportamiento de búsqueda diferente al de Google. En Google, las búsquedas son informacionales ("qué es..."). En YouTube, son más intencionales y visuales ("cómo hacer...", "review de...", "tutorial de..."). Las keywords que funcionan en Google no siempre funcionan en YouTube.' },

  { type: 'h2', t: 'Paso 1: Genera ideas de keywords' },
  { type: 'p', t: 'Antes de usar herramientas, empieza con lo básico: el autocomplete de YouTube. Escribe tu tema principal en el buscador y mira qué sugiere YouTube. Estas sugerencias son keywords reales que la gente está buscando AHORA.' },
  { type: 'list', items: [
    'Escribe tu tema y anota las 10 primeras sugerencias.',
    'Añade letras al final ("tu tema a...", "tu tema b...") para descubrir más variaciones.',
    'Busca en YouTube los vídeos top de tu nicho y analiza sus títulos — esas son keywords que ya funcionan.',
    'Revisa la sección "búsquedas relacionadas" al final de los resultados.',
    'Mira los comentarios de tus vídeos y los de tu competencia: ¿qué preguntas hace la gente?',
  ]},

  { type: 'h2', t: 'Paso 2: Evalúa volumen y competencia' },
  { type: 'p', t: 'No todas las keywords valen la pena. Una keyword con mucho volumen pero competencia extrema (canales grandes dominan los resultados) es casi imposible de rankear si eres un canal pequeño. La clave es encontrar el equilibrio.' },
  { type: 'list', items: [
    'Volumen alto + competencia baja = OPORTUNIDAD. Estas son las keywords que debes atacar primero.',
    'Volumen bajo + competencia baja = nicho. Útil si estás empezando y quieres ganar tracción.',
    'Volumen alto + competencia alta = aspiracional. Guárdala para cuando tengas más autoridad.',
    'Volumen bajo + competencia alta = evitar. No merece el esfuerzo.',
  ]},

  { type: 'callout', t: 'Usa YTubViral Research para ver el volumen estimado y nivel de competencia de cada keyword al instante.' },

  { type: 'h2', t: 'Paso 3: Tipos de keywords que funcionan en YouTube' },

  { type: 'h3', t: 'Keywords "cómo hacer" (How-to)' },
  { type: 'p', t: 'Son las más buscadas en YouTube. "Cómo editar vídeos en Premiere", "cómo hacer pan casero", "cómo invertir en bolsa". Si tu nicho permite tutoriales, estas keywords son oro puro.' },

  { type: 'h3', t: 'Keywords de comparación y review' },
  { type: 'p', t: '"iPhone 16 vs Samsung S26", "mejor cámara para YouTube 2026", "review DJI Mini 5". Estas keywords tienen alta intención de compra y suelen atraer audiencia comprometida.' },

  { type: 'h3', t: 'Keywords de lista y ranking' },
  { type: 'p', t: '"Top 10 juegos de 2026", "5 errores de principiantes", "7 herramientas gratuitas". Los números en el título aumentan el CTR y estas keywords tienen un formato que YouTube adora recomendar.' },

  { type: 'h3', t: 'Keywords long-tail' },
  { type: 'p', t: 'Son frases más largas y específicas: "cómo hacer un time-lapse con iPhone de noche" en vez de "time-lapse iPhone". Tienen menos volumen pero mucha menos competencia, y la audiencia que llega está muy interesada.' },

  { type: 'h2', t: 'Paso 4: Organiza tu calendario de contenido' },
  { type: 'p', t: 'Una vez que tengas una lista de keywords ganadoras, organízalas en un calendario de contenido. No publiques todo a la vez — distribuye las keywords de forma estratégica.' },
  { type: 'list', items: [
    'Prioriza keywords de oportunidad alta para tus próximos 4-6 vídeos.',
    'Agrupa keywords relacionadas en series o playlists.',
    'Alterna entre keywords "fáciles" (baja competencia) y "ambiciosas" (alto volumen).',
    'Reserva keywords estacionales para el momento adecuado (ej: "regalos de Navidad" en noviembre).',
    'Revisa y actualiza tu lista de keywords cada mes — las tendencias cambian.',
  ]},

  { type: 'callout-mid', t: 'Encuentra tu próxima keyword ganadora', sub: 'YTubViral Research analiza volumen, competencia y oportunidad de cada keyword en segundos.', cta: 'Probar Research gratis' },

  { type: 'h2', t: 'Errores comunes en keyword research' },
  { type: 'list', items: [
    'Obsesionarte con keywords de alto volumen sin considerar la competencia.',
    'Crear contenido sin investigar primero qué busca la gente.',
    'Usar las mismas keywords que tu competencia directa sin aportar un ángulo diferente.',
    'No revisar keywords regularmente — el volumen de búsqueda cambia con el tiempo.',
    'Ignorar las keywords long-tail porque parecen "pequeñas" — 10 vídeos con 500 vistas cada uno = 5000 vistas totales.',
  ]},

  { type: 'callout-final', t: 'Deja de adivinar qué crear', sub: 'Con YTubViral Research, cada vídeo que publiques ataca una keyword con datos reales. 10 búsquedas gratis.', cta: 'Empezar gratis' },
];

const BODY_KEYWORDS_EN: LearnBlockType[] = [
  { type: 'h2', t: 'What Is YouTube Keyword Research (And Why It\'s Different from Google)' },
  { type: 'p', t: 'Keyword research is the process of finding the words and phrases your potential audience types into YouTube\'s search bar. It\'s the foundation of all SEO: if you don\'t know what they\'re searching for, you can\'t create content that reaches them.' },
  { type: 'p', t: 'YouTube has different search behavior than Google. On Google, searches are informational ("what is..."). On YouTube, they\'re more intentional and visual ("how to...", "review of...", "tutorial for..."). Keywords that work on Google don\'t always work on YouTube.' },

  { type: 'h2', t: 'Step 1: Generate Keyword Ideas' },
  { type: 'p', t: 'Before using tools, start with the basics: YouTube\'s autocomplete. Type your main topic in the search bar and see what YouTube suggests. These suggestions are real keywords that people are searching for RIGHT NOW.' },
  { type: 'list', items: [
    'Type your topic and note the first 10 suggestions.',
    'Add letters at the end ("your topic a...", "your topic b...") to discover more variations.',
    'Search YouTube for the top videos in your niche and analyze their titles — those are keywords that already work.',
    'Check the "related searches" section at the bottom of results.',
    'Read the comments on your videos and your competitors\' — what questions do people ask?',
  ]},

  { type: 'h2', t: 'Step 2: Evaluate Volume and Competition' },
  { type: 'p', t: 'Not all keywords are worth pursuing. A keyword with high volume but extreme competition (big channels dominating the results) is nearly impossible to rank for if you\'re a small channel. The key is finding the balance.' },
  { type: 'list', items: [
    'High volume + low competition = OPPORTUNITY. These are the keywords you should target first.',
    'Low volume + low competition = niche. Useful when starting out to gain traction.',
    'High volume + high competition = aspirational. Save it for when you have more authority.',
    'Low volume + high competition = avoid. Not worth the effort.',
  ]},

  { type: 'callout', t: 'Use YTubViral Research to see estimated volume and competition level for each keyword instantly.' },

  { type: 'h2', t: 'Step 3: Types of Keywords That Work on YouTube' },

  { type: 'h3', t: 'How-to Keywords' },
  { type: 'p', t: 'The most searched type on YouTube. "How to edit videos in Premiere", "how to make sourdough bread", "how to invest in stocks". If your niche allows tutorials, these keywords are pure gold.' },

  { type: 'h3', t: 'Comparison and Review Keywords' },
  { type: 'p', t: '"iPhone 16 vs Samsung S26", "best camera for YouTube 2026", "DJI Mini 5 review". These keywords have high purchase intent and tend to attract engaged audiences.' },

  { type: 'h3', t: 'List and Ranking Keywords' },
  { type: 'p', t: '"Top 10 games of 2026", "5 beginner mistakes", "7 free tools". Numbers in the title increase CTR and these keywords have a format that YouTube loves to recommend.' },

  { type: 'h3', t: 'Long-tail Keywords' },
  { type: 'p', t: 'Longer, more specific phrases: "how to do a night time-lapse with iPhone" instead of "iPhone time-lapse". They have less volume but much less competition, and the audience that arrives is highly interested.' },

  { type: 'h2', t: 'Step 4: Organize Your Content Calendar' },
  { type: 'p', t: 'Once you have a list of winning keywords, organize them into a content calendar. Don\'t publish everything at once — distribute keywords strategically.' },
  { type: 'list', items: [
    'Prioritize high-opportunity keywords for your next 4-6 videos.',
    'Group related keywords into series or playlists.',
    'Alternate between "easy" keywords (low competition) and "ambitious" ones (high volume).',
    'Reserve seasonal keywords for the right moment (e.g., "Christmas gifts" in November).',
    'Review and update your keyword list monthly — trends change.',
  ]},

  { type: 'callout-mid', t: 'Find your next winning keyword', sub: 'YTubViral Research analyzes volume, competition, and opportunity for each keyword in seconds.', cta: 'Try Research free' },

  { type: 'h2', t: 'Common Keyword Research Mistakes' },
  { type: 'list', items: [
    'Obsessing over high-volume keywords without considering competition.',
    'Creating content without first researching what people are searching for.',
    'Using the same keywords as your direct competitors without offering a different angle.',
    'Not reviewing keywords regularly — search volume changes over time.',
    'Ignoring long-tail keywords because they seem "small" — 10 videos with 500 views each = 5000 total views.',
  ]},

  { type: 'callout-final', t: 'Stop guessing what to create', sub: 'With YTubViral Research, every video you publish targets a keyword backed by real data. 10 free searches.', cta: 'Get started free' },
];

const BODY_RETENTION_ES: LearnBlockType[] = [
  { type: 'h2', t: 'Por qué la retención es el factor #1 del algoritmo' },
  { type: 'p', t: 'YouTube quiere que la gente se quede en la plataforma el mayor tiempo posible. Un vídeo que mantiene a los viewers viendo hasta el final le dice a YouTube: "este contenido es valioso, muéstralo a más gente". La retención de audiencia es la métrica que más influye en si tu vídeo se recomienda o muere en el olvido.' },
  { type: 'p', t: 'La retención media de los vídeos de YouTube está entre el 40-50%. Si consigues mantener una retención por encima del 50%, estás en el top. Por encima del 60%, YouTube empezará a empujar tu vídeo de forma agresiva en las recomendaciones.' },

  { type: 'h2', t: 'El hook: los primeros 30 segundos deciden todo' },
  { type: 'p', t: 'Según datos internos de YouTube, el 20-30% de los viewers abandonan un vídeo en los primeros 30 segundos. Esos primeros segundos son tu oportunidad de demostrar que el vídeo vale la pena. Si los pierdes, ninguna cantidad de buen contenido posterior los traerá de vuelta.' },
  { type: 'list', items: [
    'Empieza con el valor, no con una intro genérica. "En este vídeo vas a aprender exactamente cómo..." es mejor que un logo animado de 10 segundos.',
    'Muestra un adelanto del resultado final. Si es un tutorial, enseña el antes/después en los primeros 5 segundos.',
    'Haz una pregunta que conecte con el dolor o deseo de tu audiencia.',
    'Usa un dato sorprendente o contraintuitivo para captar la atención.',
    'Nunca empieces con "Hola, bienvenidos a mi canal, no olviden suscribirse..." — eso puede ir después.',
  ]},

  { type: 'callout', t: 'Analiza tus drop-off points exactos con YTubViral Retention y descubre en qué segundo pierdes a tu audiencia.' },

  { type: 'h2', t: 'Pattern interrupts: el secreto de la retención alta' },
  { type: 'p', t: 'El cerebro humano se aburre con la monotonía. Si tu vídeo es una talking head ininterrumpida durante 15 minutos, la retención caerá sin importar lo bueno que sea tu contenido. Los pattern interrupts son cambios visuales o auditivos que "resetean" la atención del viewer.' },
  { type: 'list', items: [
    'Cambia de ángulo de cámara cada 2-3 minutos.',
    'Añade gráficos, texto en pantalla o animaciones para apoyar lo que dices.',
    'Usa B-roll relevante entre explicaciones.',
    'Haz preguntas retóricas al viewer: "¿Y sabes qué es lo peor?" — esto activa su cerebro.',
    'Varía el tono de voz: alterna entre explicar, enfatizar y ser conversacional.',
    'Inserta clips cortos o memes si encajan con tu estilo.',
  ]},

  { type: 'h2', t: 'Open loops: mantén la curiosidad activa' },
  { type: 'p', t: 'Un open loop es una promesa de información que aún no has cumplido. "Voy a enseñarte los 5 errores... pero el error número 3 es el que más daño hace, y llegamos a él en un momento." El viewer quiere saber cuál es ese error #3, así que se queda.' },
  { type: 'list', items: [
    '"Pero antes de llegar a eso..." — anticipa lo que viene para crear expectativa.',
    '"Al final del vídeo te voy a dar un consejo que cambia todo..." — da una razón para quedarse.',
    '"Esto es lo que la mayoría hace mal, pero hay algo que pocos saben..." — crea curiosidad.',
    'No abuses: si abres demasiados loops sin cerrar ninguno, el viewer se frustra y se va.',
  ]},

  { type: 'h2', t: 'El ritmo: elimina la grasa' },
  { type: 'p', t: 'Cada segundo cuenta. El ritmo de tu vídeo debe ser lo suficientemente rápido como para mantener la atención, pero no tan rápido que el viewer no pueda seguirte. La regla de oro: si puedes cortar un momento sin perder información, córtalo.' },
  { type: 'list', items: [
    'Elimina silencios y "ehms". El jump cut es tu amigo.',
    'Corta intros largas — ve al grano en los primeros 15 segundos.',
    'Si un punto se puede explicar en 30 segundos, no lo estires a 2 minutos.',
    'Usa capítulos para que el viewer sepa qué viene — esto reduce abandonos.',
    'La duración ideal es la que necesite tu contenido, ni más ni menos. 8-12 minutos funciona bien para la mayoría de nichos.',
  ]},

  { type: 'callout-mid', t: 'Identifica tus puntos de abandono exactos', sub: 'YTubViral Retention te muestra segundo a segundo dónde pierde interés tu audiencia.', cta: 'Analizar mi retención' },

  { type: 'h2', t: 'El cierre importa más de lo que crees' },
  { type: 'p', t: 'Un buen cierre no es solo "dale like y suscríbete". Un cierre fuerte refuerza la satisfacción del viewer, lo que mejora las señales de engagement y hace que YouTube recomiende tu vídeo más.' },
  { type: 'list', items: [
    'Resume los puntos clave en 15-20 segundos.',
    'Dale al viewer un paso de acción concreto: "Ahora ve y aplica el paso 3 en tu próximo vídeo".',
    'Sugiere un vídeo relacionado específico (no genérico) y explica por qué debería verlo.',
    'Evita despedidas largas — cuando el contenido termina, el vídeo termina.',
  ]},

  { type: 'h2', t: 'Métricas de retención: qué números mirar' },
  { type: 'list', items: [
    'Retención media >50%: estás por encima del promedio de YouTube.',
    'Retención media >60%: YouTube empezará a empujar tu vídeo de forma agresiva.',
    'Caída en los primeros 30 segundos >30%: tu hook necesita trabajo.',
    'Caídas bruscas en puntos específicos: revisa qué pasa en esos segundos exactos.',
    'Picos de re-watch: son momentos que la gente repite — hazlos más frecuentes.',
  ]},

  { type: 'callout-final', t: 'Mejora tu retención desde hoy', sub: 'Analiza cada vídeo, identifica puntos débiles y aplica las correcciones antes del siguiente. Gratis.', cta: 'Empezar gratis' },
];

const BODY_RETENTION_EN: LearnBlockType[] = [
  { type: 'h2', t: 'Why Retention Is the #1 Algorithm Factor' },
  { type: 'p', t: 'YouTube wants people to stay on the platform as long as possible. A video that keeps viewers watching until the end tells YouTube: "this content is valuable, show it to more people." Audience retention is the metric that most influences whether your video gets recommended or dies in obscurity.' },
  { type: 'p', t: 'The average retention on YouTube videos is between 40-50%. If you can maintain retention above 50%, you\'re in the top tier. Above 60%, YouTube will start aggressively pushing your video in recommendations.' },

  { type: 'h2', t: 'The Hook: The First 30 Seconds Decide Everything' },
  { type: 'p', t: 'According to YouTube\'s internal data, 20-30% of viewers abandon a video within the first 30 seconds. Those first seconds are your chance to prove the video is worth watching. If you lose them, no amount of great content later will bring them back.' },
  { type: 'list', items: [
    'Start with the value, not a generic intro. "In this video you\'ll learn exactly how to..." is better than a 10-second animated logo.',
    'Show a preview of the final result. If it\'s a tutorial, show the before/after in the first 5 seconds.',
    'Ask a question that connects with your audience\'s pain or desire.',
    'Use a surprising or counterintuitive data point to capture attention.',
    'Never start with "Hey guys, welcome to my channel, don\'t forget to subscribe..." — that can come later.',
  ]},

  { type: 'callout', t: 'Analyze your exact drop-off points with YTubViral Retention and discover at which second you lose your audience.' },

  { type: 'h2', t: 'Pattern Interrupts: The Secret to High Retention' },
  { type: 'p', t: 'The human brain gets bored with monotony. If your video is an uninterrupted talking head for 15 minutes, retention will drop no matter how good your content is. Pattern interrupts are visual or audio changes that "reset" the viewer\'s attention.' },
  { type: 'list', items: [
    'Change camera angles every 2-3 minutes.',
    'Add graphics, on-screen text, or animations to support what you\'re saying.',
    'Use relevant B-roll between explanations.',
    'Ask rhetorical questions to the viewer: "And you know what the worst part is?" — this activates their brain.',
    'Vary your tone of voice: alternate between explaining, emphasizing, and being conversational.',
    'Insert short clips or memes if they fit your style.',
  ]},

  { type: 'h2', t: 'Open Loops: Keep Curiosity Active' },
  { type: 'p', t: 'An open loop is a promise of information you haven\'t delivered yet. "I\'m going to show you the 5 mistakes... but mistake number 3 is the most damaging, and we\'ll get to it in a moment." The viewer wants to know what mistake #3 is, so they stay.' },
  { type: 'list', items: [
    '"But before we get to that..." — tease what\'s coming to create anticipation.',
    '"At the end of this video I\'m going to give you a tip that changes everything..." — give a reason to stay.',
    '"This is what most people get wrong, but there\'s something few people know..." — create curiosity.',
    'Don\'t overdo it: if you open too many loops without closing any, the viewer gets frustrated and leaves.',
  ]},

  { type: 'h2', t: 'Pacing: Cut the Fat' },
  { type: 'p', t: 'Every second counts. Your video\'s pacing should be fast enough to maintain attention, but not so fast the viewer can\'t follow. The golden rule: if you can cut a moment without losing information, cut it.' },
  { type: 'list', items: [
    'Eliminate dead air and "umms". Jump cuts are your friend.',
    'Cut long intros — get to the point in the first 15 seconds.',
    'If a point can be explained in 30 seconds, don\'t stretch it to 2 minutes.',
    'Use chapters so the viewer knows what\'s coming — this reduces abandonment.',
    'The ideal duration is whatever your content needs, no more and no less. 8-12 minutes works well for most niches.',
  ]},

  { type: 'callout-mid', t: 'Identify your exact drop-off points', sub: 'YTubViral Retention shows you second by second where your audience loses interest.', cta: 'Analyze my retention' },

  { type: 'h2', t: 'The Ending Matters More Than You Think' },
  { type: 'p', t: 'A good ending isn\'t just "like and subscribe". A strong ending reinforces viewer satisfaction, which improves engagement signals and makes YouTube recommend your video more.' },
  { type: 'list', items: [
    'Summarize the key points in 15-20 seconds.',
    'Give the viewer a concrete action step: "Now go and apply step 3 in your next video."',
    'Suggest a specific related video (not generic) and explain why they should watch it.',
    'Avoid long goodbyes — when the content is done, the video is done.',
  ]},

  { type: 'h2', t: 'Retention Metrics: What Numbers to Watch' },
  { type: 'list', items: [
    'Average retention >50%: you\'re above YouTube\'s average.',
    'Average retention >60%: YouTube will start aggressively pushing your video.',
    'Drop in the first 30 seconds >30%: your hook needs work.',
    'Sharp drops at specific points: review what happens at those exact seconds.',
    'Re-watch spikes: these are moments people replay — make them more frequent.',
  ]},

  { type: 'callout-final', t: 'Improve your retention starting today', sub: 'Analyze each video, identify weak points, and apply fixes before the next one. Free.', cta: 'Get started free' },
];

const BODY_THUMBNAILS_ES: LearnBlockType[] = [
  { type: 'h2', t: 'El thumbnail decide si tu vídeo vive o muere' },
  { type: 'p', t: 'Puedes tener el mejor contenido del mundo, pero si nadie hace clic, nadie lo verá. El thumbnail es responsable de hasta el 90% de la decisión de clic. YouTube lo sabe: los vídeos con alto CTR reciben exponencialmente más impresiones. Un buen thumbnail no es decoración — es tu herramienta de crecimiento más poderosa.' },
  { type: 'p', t: 'El CTR (Click-Through Rate) saludable en YouTube varía por nicho, pero como referencia: por debajo del 4% tu thumbnail necesita trabajo, entre 4-6% es aceptable, entre 6-10% es bueno, y por encima del 10% es excelente.' },

  { type: 'h2', t: 'Las 7 reglas de un thumbnail efectivo' },

  { type: 'h3', t: '1. Máximo 3-4 palabras de texto' },
  { type: 'p', t: 'El 70% del tráfico de YouTube viene de móviles. Tu thumbnail se ve en un espacio de 2-3 cm. Si el texto no se lee en una fracción de segundo, no funciona. Menos es más.' },
  { type: 'p', t: 'El texto del thumbnail NO debe repetir el título. Debe complementarlo: si el título dice "Cómo ganar tus primeros 1000 suscriptores", el thumbnail podría decir solo "0 → 1K" con una expresión de sorpresa.' },

  { type: 'h3', t: '2. Contraste de colores' },
  { type: 'p', t: 'Tu thumbnail compite por atención contra todos los demás en el feed. Los colores que más destacan en YouTube (que tiene fondo blanco en light mode y negro en dark mode) son: amarillo, rojo, verde brillante y naranja.' },
  { type: 'list', items: [
    'Fondo oscuro + texto amarillo/blanco = combinación probada.',
    'Evita azules y grises — se funden con la interfaz de YouTube.',
    'Usa bordes o outlines en el texto para que se lea sobre cualquier fondo.',
    'Mantén una paleta consistente en tu canal — los viewers reconocen tus vídeos.',
  ]},

  { type: 'h3', t: '3. Rostros con emoción' },
  { type: 'p', t: 'Los thumbnails con rostros humanos que muestran emociones claras tienen un CTR entre un 30-40% mayor que los que no tienen rostros. El cerebro humano está programado para leer caras — úsalo a tu favor.' },
  { type: 'list', items: [
    'Expresiones exageradas: sorpresa, felicidad extrema, shock. Las expresiones sutiles no funcionan en miniatura.',
    'Ojos abiertos y mirando a cámara (o al punto de interés del thumbnail).',
    'Evita fotos borrosas o con poca iluminación — la calidad importa.',
    'Si tu nicho no incluye rostros (ej: gaming, cocina), usa objetos grandes y reconocibles.',
  ]},

  { type: 'h3', t: '4. Composición clara y punto focal' },
  { type: 'p', t: 'Un thumbnail efectivo tiene UN punto focal claro. El ojo del viewer debe saber inmediatamente dónde mirar. Si hay demasiados elementos compitiendo por atención, ninguno gana.' },
  { type: 'list', items: [
    'Regla de los tercios: coloca el elemento principal en una intersección.',
    'Deja espacio para el texto — no pongas texto sobre la cara.',
    'Elimina el fondo si distrae. Un fondo sólido o degradado simple funciona mejor.',
    'El thumbnail debe "leerse" en menos de 1 segundo.',
  ]},

  { type: 'callout', t: 'Testea tus thumbnails con YTubViral A/B Testing y deja que los datos decidan cuál funciona mejor.' },

  { type: 'h3', t: '5. No dupliques el título' },
  { type: 'p', t: 'El título y el thumbnail se muestran juntos. Si ambos dicen lo mismo, estás desperdiciando la mitad de tu espacio de comunicación. El thumbnail debe despertar curiosidad; el título debe prometer valor.' },

  { type: 'h3', t: '6. Consistencia de marca' },
  { type: 'p', t: 'Los canales más exitosos tienen un estilo visual reconocible. Cuando un suscriptor ve tu thumbnail en el feed, debe saber que es tuyo ANTES de leer el título. Eso se consigue con colores, tipografías y composiciones consistentes.' },

  { type: 'h3', t: '7. Testea siempre' },
  { type: 'p', t: 'Nunca asumas que tu primer thumbnail es el mejor. Los mejores creadores crean 2-3 variaciones y cambian el thumbnail en las primeras 24-48 horas si el CTR no es satisfactorio.' },

  { type: 'h2', t: 'Errores comunes en thumbnails' },
  { type: 'list', items: [
    'Texto demasiado pequeño: si no se lee en móvil, no funciona.',
    'Demasiados elementos: simplicidad siempre gana.',
    'Usar frames del vídeo como thumbnail: casi nunca funcionan porque no están diseñados para verse en miniatura.',
    'Clickbait desconectado: si el thumbnail promete algo que el vídeo no cumple, la retención cae y YouTube te penaliza.',
    'No testear: publicar un thumbnail y nunca cambiarlo aunque el CTR sea bajo.',
  ]},

  { type: 'callout-mid', t: '¿Tu thumbnail funciona?', sub: 'Testea variaciones con A/B Testing automático y descubre cuál genera más clics.', cta: 'Probar A/B Testing' },

  { type: 'h2', t: 'Herramientas para crear thumbnails' },
  { type: 'list', items: [
    'Canva: la opción más popular. Plantillas gratuitas, fácil de usar, ideal para principiantes.',
    'Photoshop: más control, ideal si ya lo dominas. Permite composiciones avanzadas.',
    'Figma: perfecto si quieres consistencia de marca — crea templates reutilizables.',
    'Remove.bg: elimina fondos de fotos en segundos. Esencial para thumbnails con personas.',
    'YTubViral A/B Testing: no es un editor, pero te dice cuál de tus diseños funciona mejor.',
  ]},

  { type: 'h2', t: 'Checklist del thumbnail perfecto' },
  { type: 'list', items: [
    'Máximo 3-4 palabras de texto, legibles en móvil.',
    'Colores con alto contraste (amarillo, rojo, verde sobre oscuro).',
    'Rostro con expresión clara y exagerada (si aplica).',
    'Un solo punto focal — la composición se "lee" en menos de 1 segundo.',
    'Complementa el título, no lo duplica.',
    'Estilo visual consistente con tu canal.',
    'Resolución 1280x720 (mínimo) o 1920x1080.',
    'Testeado con al menos 1 variación alternativa.',
  ]},

  { type: 'callout-final', t: 'Deja de perder clics con thumbnails mediocres', sub: 'Crea, testea y optimiza tus thumbnails con datos reales. 10 tests gratis.', cta: 'Empezar gratis' },
];

const BODY_THUMBNAILS_EN: LearnBlockType[] = [
  { type: 'h2', t: 'The Thumbnail Decides If Your Video Lives or Dies' },
  { type: 'p', t: 'You can have the best content in the world, but if nobody clicks, nobody sees it. The thumbnail is responsible for up to 90% of the click decision. YouTube knows this: videos with high CTR receive exponentially more impressions. A good thumbnail isn\'t decoration — it\'s your most powerful growth tool.' },
  { type: 'p', t: 'Healthy CTR on YouTube varies by niche, but as a reference: below 4% your thumbnail needs work, 4-6% is acceptable, 6-10% is good, and above 10% is excellent.' },

  { type: 'h2', t: 'The 7 Rules of an Effective Thumbnail' },

  { type: 'h3', t: '1. Maximum 3-4 Words of Text' },
  { type: 'p', t: '70% of YouTube traffic comes from mobile. Your thumbnail is viewed in a 2-3 cm space. If the text can\'t be read in a split second, it doesn\'t work. Less is more.' },
  { type: 'p', t: 'The thumbnail text should NOT repeat the title. It should complement it: if the title says "How to Get Your First 1000 Subscribers", the thumbnail could just say "0 → 1K" with a surprised expression.' },

  { type: 'h3', t: '2. Color Contrast' },
  { type: 'p', t: 'Your thumbnail competes for attention against every other one in the feed. The colors that stand out most on YouTube (which has a white background in light mode and black in dark mode) are: yellow, red, bright green, and orange.' },
  { type: 'list', items: [
    'Dark background + yellow/white text = proven combination.',
    'Avoid blues and grays — they blend into YouTube\'s interface.',
    'Use text borders or outlines so it reads on any background.',
    'Maintain a consistent palette on your channel — viewers recognize your videos.',
  ]},

  { type: 'h3', t: '3. Faces with Emotion' },
  { type: 'p', t: 'Thumbnails with human faces showing clear emotions have a 30-40% higher CTR than those without faces. The human brain is wired to read faces — use it to your advantage.' },
  { type: 'list', items: [
    'Exaggerated expressions: surprise, extreme happiness, shock. Subtle expressions don\'t work at thumbnail size.',
    'Wide open eyes looking at the camera (or at the point of interest in the thumbnail).',
    'Avoid blurry or poorly lit photos — quality matters.',
    'If your niche doesn\'t include faces (e.g., gaming, cooking), use large, recognizable objects.',
  ]},

  { type: 'h3', t: '4. Clear Composition and Focal Point' },
  { type: 'p', t: 'An effective thumbnail has ONE clear focal point. The viewer\'s eye should immediately know where to look. If too many elements are competing for attention, none wins.' },
  { type: 'list', items: [
    'Rule of thirds: place the main element at an intersection.',
    'Leave space for text — don\'t put text over the face.',
    'Remove the background if it distracts. A solid or simple gradient background works better.',
    'The thumbnail should "read" in less than 1 second.',
  ]},

  { type: 'callout', t: 'Test your thumbnails with YTubViral A/B Testing and let the data decide which works best.' },

  { type: 'h3', t: '5. Don\'t Duplicate the Title' },
  { type: 'p', t: 'The title and thumbnail are shown together. If both say the same thing, you\'re wasting half your communication space. The thumbnail should spark curiosity; the title should promise value.' },

  { type: 'h3', t: '6. Brand Consistency' },
  { type: 'p', t: 'The most successful channels have a recognizable visual style. When a subscriber sees your thumbnail in the feed, they should know it\'s yours BEFORE reading the title. This is achieved through consistent colors, fonts, and compositions.' },

  { type: 'h3', t: '7. Always Test' },
  { type: 'p', t: 'Never assume your first thumbnail is the best. The best creators make 2-3 variations and swap the thumbnail in the first 24-48 hours if CTR isn\'t satisfactory.' },

  { type: 'h2', t: 'Common Thumbnail Mistakes' },
  { type: 'list', items: [
    'Text too small: if it can\'t be read on mobile, it doesn\'t work.',
    'Too many elements: simplicity always wins.',
    'Using video frames as thumbnails: they almost never work because they\'re not designed to be viewed at miniature size.',
    'Disconnected clickbait: if the thumbnail promises something the video doesn\'t deliver, retention drops and YouTube penalizes you.',
    'Not testing: publishing a thumbnail and never changing it even though CTR is low.',
  ]},

  { type: 'callout-mid', t: 'Is your thumbnail working?', sub: 'Test variations with automatic A/B Testing and discover which generates more clicks.', cta: 'Try A/B Testing' },

  { type: 'h2', t: 'Tools for Creating Thumbnails' },
  { type: 'list', items: [
    'Canva: the most popular option. Free templates, easy to use, ideal for beginners.',
    'Photoshop: more control, ideal if you already know it. Allows advanced compositions.',
    'Figma: perfect if you want brand consistency — create reusable templates.',
    'Remove.bg: removes photo backgrounds in seconds. Essential for thumbnails with people.',
    'YTubViral A/B Testing: not an editor, but tells you which of your designs works best.',
  ]},

  { type: 'h2', t: 'The Perfect Thumbnail Checklist' },
  { type: 'list', items: [
    'Maximum 3-4 words of text, readable on mobile.',
    'High contrast colors (yellow, red, green on dark).',
    'Face with clear, exaggerated expression (if applicable).',
    'Single focal point — composition "reads" in less than 1 second.',
    'Complements the title, doesn\'t duplicate it.',
    'Visual style consistent with your channel.',
    'Resolution 1280x720 (minimum) or 1920x1080.',
    'Tested with at least 1 alternative variation.',
  ]},

  { type: 'callout-final', t: 'Stop losing clicks with mediocre thumbnails', sub: 'Create, test, and optimize your thumbnails with real data. 10 free tests.', cta: 'Get started free' },
];

const BODY_ANALYTICS_ES: LearnBlockType[] = [
  { type: 'h2', t: 'YouTube Analytics: tu centro de control' },
  { type: 'p', t: 'YouTube te da acceso a datos que la mayoría de creadores ignora. YouTube Studio Analytics es la herramienta más poderosa que tienes — y es gratis. El problema no es la falta de datos, sino saber cuáles importan y cómo interpretarlos.' },
  { type: 'p', t: 'En esta guía vas a aprender a leer tus métricas como un profesional: qué números vigilar, cuáles ignorar, y cómo tomar decisiones basadas en datos reales en lugar de intuiciones.' },

  { type: 'h2', t: 'Las 5 métricas que realmente importan' },

  { type: 'h3', t: '1. Watch time (tiempo de visualización)' },
  { type: 'p', t: 'El watch time es más importante que las views. Un vídeo con 1000 views y 8 minutos de watch time medio es mejor señal para el algoritmo que un vídeo con 5000 views y 1 minuto de media. YouTube quiere que la gente se quede — premia el contenido que lo consigue.' },
  { type: 'list', items: [
    'Watch time total: indica cuánto contenido tuyo consume la audiencia en total.',
    'Watch time medio por vídeo: te dice si tu contenido engancha o la gente se va.',
    'Compara el watch time de vídeos similares para identificar qué formato funciona mejor.',
  ]},

  { type: 'h3', t: '2. CTR (Click-Through Rate)' },
  { type: 'p', t: 'El CTR mide qué porcentaje de personas que ven tu thumbnail hacen clic. Es la métrica que te dice si tu "packaging" (título + thumbnail) funciona. Un CTR bajo con muchas impresiones significa que YouTube te está mostrando, pero la gente no hace clic — tu thumbnail o título necesitan trabajo.' },
  { type: 'list', items: [
    'CTR < 4%: tu thumbnail o título necesitan mejora urgente.',
    'CTR 4-6%: aceptable, pero hay margen de mejora.',
    'CTR 6-10%: buen rendimiento.',
    'CTR > 10%: excelente — tu packaging funciona muy bien.',
  ]},

  { type: 'h3', t: '3. Fuentes de tráfico' },
  { type: 'p', t: 'De dónde viene tu audiencia te dice qué estrategia está funcionando. Si la mayoría viene de "Búsqueda de YouTube", tu SEO funciona. Si viene de "Vídeos sugeridos", el algoritmo te está recomendando. Si viene de "Externo", tus redes sociales están haciendo su trabajo.' },
  { type: 'list', items: [
    'Búsqueda: indica buen SEO. Son views evergreen que seguirán llegando.',
    'Vídeos sugeridos: el algoritmo te empuja. Señal de que tu contenido retiene bien.',
    'Externo: tráfico de redes sociales, web, etc. Útil pero no sostenible a largo plazo.',
    'Notificaciones: mide el engagement de tus suscriptores actuales.',
  ]},

  { type: 'callout', t: 'Conecta tu canal a YTubViral Analytics para ver todas tus métricas en un dashboard unificado con recomendaciones automáticas.' },

  { type: 'h3', t: '4. Suscriptores ganados por vídeo' },
  { type: 'p', t: 'No todos los vídeos convierten igual. Algunos traen muchas views pero pocos suscriptores; otros traen menos views pero convierten mejor. Identificar qué tipo de contenido convierte viewers en suscriptores te permite duplicar esa estrategia.' },

  { type: 'h3', t: '5. Audience demographics' },
  { type: 'p', t: 'Saber quién te mira cambia todo. Si descubres que el 40% de tu audiencia está en México pero tú publicas a las 15:00 hora española, estás perdiendo el pico de actividad de tu audiencia más grande. Los datos demográficos informan decisiones de horario, idioma y contenido.' },

  { type: 'h2', t: 'Métricas que NO deberías obsesionarte' },
  { type: 'list', items: [
    'Views totales del canal: vanity metric. No dice nada sobre la salud actual del canal.',
    'Suscriptores totales: un canal con 100K subs y 500 views por vídeo está peor que uno con 5K subs y 5000 views.',
    'Likes/Dislikes: no correlacionan con rendimiento algorítmico.',
    'Views en las primeras 24 horas: importante solo si tu contenido es trending, no para evergreen.',
  ]},

  { type: 'h2', t: 'Cómo hacer un análisis mensual' },
  { type: 'list', items: [
    'Compara las métricas de este mes con el anterior: ¿el watch time subió o bajó?',
    'Identifica tus 3 mejores y 3 peores vídeos del mes: ¿qué tienen en común cada grupo?',
    'Revisa las fuentes de tráfico: ¿están cambiando? ¿Estás dependiendo demasiado de una sola?',
    'Analiza los suscriptores ganados/perdidos: ¿qué contenido causó pérdidas?',
    'Revisa el CTR de cada vídeo: ¿alguno tiene un CTR inusualmente bajo que puedas mejorar cambiando el thumbnail?',
  ]},

  { type: 'callout-mid', t: 'Análisis avanzado sin complicaciones', sub: 'YTubViral Analytics te da un dashboard unificado con métricas, tendencias y recomendaciones accionables.', cta: 'Probar Analytics gratis' },

  { type: 'h2', t: 'Audience overlap: la métrica escondida' },
  { type: 'p', t: 'YouTube Studio tiene una función poco conocida: te muestra qué otros canales mira tu audiencia. Esto es oro para encontrar oportunidades de colaboración, identificar competidores directos, y descubrir qué tipo de contenido le interesa a tu audiencia más allá de tu nicho.' },

  { type: 'callout-final', t: 'Toma decisiones basadas en datos, no en intuiciones', sub: 'Conecta tu canal a YTubViral y recibe análisis automatizado con recomendaciones personalizadas.', cta: 'Empezar gratis' },
];

const BODY_ANALYTICS_EN: LearnBlockType[] = [
  { type: 'h2', t: 'YouTube Analytics: Your Control Center' },
  { type: 'p', t: 'YouTube gives you access to data that most creators ignore. YouTube Studio Analytics is the most powerful tool you have — and it\'s free. The problem isn\'t lack of data, but knowing which metrics matter and how to interpret them.' },
  { type: 'p', t: 'In this guide you\'ll learn to read your metrics like a professional: which numbers to watch, which to ignore, and how to make decisions based on real data instead of gut feelings.' },

  { type: 'h2', t: 'The 5 Metrics That Actually Matter' },

  { type: 'h3', t: '1. Watch Time' },
  { type: 'p', t: 'Watch time is more important than views. A video with 1000 views and 8 minutes average watch time is a better signal for the algorithm than a video with 5000 views and 1 minute average. YouTube wants people to stay — it rewards content that achieves this.' },
  { type: 'list', items: [
    'Total watch time: indicates how much of your content the audience consumes overall.',
    'Average watch time per video: tells you if your content hooks people or they leave.',
    'Compare watch time across similar videos to identify which format works best.',
  ]},

  { type: 'h3', t: '2. CTR (Click-Through Rate)' },
  { type: 'p', t: 'CTR measures what percentage of people who see your thumbnail actually click. It\'s the metric that tells you if your "packaging" (title + thumbnail) works. Low CTR with many impressions means YouTube is showing you, but people aren\'t clicking — your thumbnail or title needs work.' },
  { type: 'list', items: [
    'CTR < 4%: your thumbnail or title needs urgent improvement.',
    'CTR 4-6%: acceptable, but room for improvement.',
    'CTR 6-10%: good performance.',
    'CTR > 10%: excellent — your packaging is working great.',
  ]},

  { type: 'h3', t: '3. Traffic Sources' },
  { type: 'p', t: 'Where your audience comes from tells you which strategy is working. If most comes from "YouTube Search", your SEO works. If from "Suggested Videos", the algorithm is recommending you. If from "External", your social media is doing its job.' },
  { type: 'list', items: [
    'Search: indicates good SEO. These are evergreen views that will keep coming.',
    'Suggested Videos: the algorithm is pushing you. A sign that your content retains well.',
    'External: traffic from social media, web, etc. Useful but not sustainable long-term.',
    'Notifications: measures engagement of your current subscribers.',
  ]},

  { type: 'callout', t: 'Connect your channel to YTubViral Analytics to see all your metrics in a unified dashboard with automatic recommendations.' },

  { type: 'h3', t: '4. Subscribers Gained Per Video' },
  { type: 'p', t: 'Not all videos convert equally. Some bring lots of views but few subscribers; others bring fewer views but convert better. Identifying which content type converts viewers into subscribers lets you double down on that strategy.' },

  { type: 'h3', t: '5. Audience Demographics' },
  { type: 'p', t: 'Knowing who watches you changes everything. If you discover 40% of your audience is in Mexico but you publish at 3 PM Spanish time, you\'re missing the peak activity window of your largest audience. Demographics inform scheduling, language, and content decisions.' },

  { type: 'h2', t: 'Metrics You Should NOT Obsess Over' },
  { type: 'list', items: [
    'Total channel views: vanity metric. Says nothing about current channel health.',
    'Total subscribers: a channel with 100K subs and 500 views per video is worse off than one with 5K subs and 5000 views.',
    'Likes/Dislikes: don\'t correlate with algorithmic performance.',
    'Views in the first 24 hours: only important for trending content, not evergreen.',
  ]},

  { type: 'h2', t: 'How to Do a Monthly Analysis' },
  { type: 'list', items: [
    'Compare this month\'s metrics with last month: did watch time go up or down?',
    'Identify your 3 best and 3 worst videos of the month: what does each group have in common?',
    'Review traffic sources: are they changing? Are you depending too much on one?',
    'Analyze subscribers gained/lost: what content caused losses?',
    'Check CTR per video: does any have an unusually low CTR you could improve by changing the thumbnail?',
  ]},

  { type: 'callout-mid', t: 'Advanced analysis without complexity', sub: 'YTubViral Analytics gives you a unified dashboard with metrics, trends, and actionable recommendations.', cta: 'Try Analytics free' },

  { type: 'h2', t: 'Audience Overlap: The Hidden Metric' },
  { type: 'p', t: 'YouTube Studio has a little-known feature: it shows you what other channels your audience watches. This is gold for finding collaboration opportunities, identifying direct competitors, and discovering what type of content interests your audience beyond your niche.' },

  { type: 'callout-final', t: 'Make decisions based on data, not intuition', sub: 'Connect your channel to YTubViral and receive automated analysis with personalized recommendations.', cta: 'Get started free' },
];

const BODY_GROWTH_ES: LearnBlockType[] = [
  { type: 'h2', t: 'La verdad sobre los primeros 1000 suscriptores' },
  { type: 'p', t: 'Los primeros 1000 suscriptores son los más difíciles de conseguir. La mayoría de canales los consiguen en 6-18 meses. Algunos en 3. Muchos nunca los alcanzan. La diferencia no es el talento — es la estrategia y la consistencia.' },
  { type: 'p', t: 'Esta guía es el plan paso a paso que hubiera querido tener cuando empecé. Sin trucos, sin atajos — solo las tácticas que realmente funcionan para canales nuevos en 2026.' },

  { type: 'h2', t: 'Paso 1: Define tu nicho con precisión' },
  { type: 'p', t: 'El error #1 de los canales nuevos es ser demasiado amplios. "Tecnología" no es un nicho. "Reviews de portátiles para estudiantes" sí lo es. Cuanto más específico seas, más fácil es rankear y más rápido encuentras tu audiencia.' },
  { type: 'list', items: [
    'Combina tu experiencia + un tema específico + una audiencia clara.',
    '"Tutoriales de DaVinci Resolve para principiantes" es mejor que "edición de vídeo".',
    '"Recetas keto en 15 minutos" es mejor que "cocina saludable".',
    'Puedes expandir después. Primero domina un nicho pequeño.',
  ]},

  { type: 'h2', t: 'Paso 2: Publica de forma consistente' },
  { type: 'p', t: 'La consistencia es más importante que la frecuencia. 1 vídeo a la semana durante 6 meses es infinitamente mejor que 5 vídeos la primera semana y luego desaparecer. El algoritmo premia la consistencia porque predice comportamiento futuro.' },
  { type: 'list', items: [
    'Mínimo 1 vídeo/semana. Si puedes 2, mejor, pero solo si mantienes la calidad.',
    'Elige un día y hora fijos. Tu audiencia aprende cuándo esperar contenido nuevo.',
    'Graba en lotes: 2-3 vídeos en un día, edita y publica a lo largo de la semana.',
    'Ten siempre 1-2 vídeos de "buffer" grabados — reduce el estrés.',
  ]},

  { type: 'callout', t: 'Planifica tu calendario de contenido con YTubViral Content Calendar — asigna ideas a fechas y mantén el ritmo.' },

  { type: 'h2', t: 'Paso 3: Enfócate en contenido de búsqueda' },
  { type: 'p', t: 'Cuando no tienes suscriptores, nadie te va a encontrar por notificaciones o por la página de inicio. Tu única vía de descubrimiento es la búsqueda. Por eso, tus primeros 20-30 vídeos deben ser contenido que la gente busca activamente.' },
  { type: 'list', items: [
    'Tutoriales y how-to: "Cómo hacer X" es el formato rey para canales nuevos.',
    'Reviews y comparativas: "Mejor X para Y en 2026" atrae búsquedas de alta intención.',
    'Preguntas frecuentes de tu nicho: responde lo que la gente pregunta en comentarios y foros.',
    'Evita vlogs, challenges y contenido trending al principio — no tienes audiencia que los busque.',
  ]},

  { type: 'h2', t: 'Paso 4: Colabora con canales de tu tamaño' },
  { type: 'p', t: 'Las colaboraciones son el growth hack más infrautilizado. No necesitas colaborar con canales grandes — los canales de tu mismo tamaño están igual de motivados que tú y la audiencia se cruza.' },
  { type: 'list', items: [
    'Busca canales de tu nicho con 0.5x a 2x tus suscriptores.',
    'Propón un formato win-win: cada uno hace un vídeo y menciona al otro.',
    'Comenta genuinamente en sus vídeos antes de proponer la colaboración.',
    'Un collab al mes puede duplicar tu tasa de crecimiento.',
  ]},

  { type: 'h2', t: 'Paso 5: Optimiza cada vídeo antes de publicar' },
  { type: 'list', items: [
    'Investiga la keyword antes de grabar — no después.',
    'Crea el título y thumbnail ANTES de grabar. Esto enfoca tu contenido.',
    'Descripción completa con keyword en el primer párrafo y timestamps.',
    'Tags relevantes y thumbnail personalizado con texto legible.',
    'Usa YTubViral SEO Score y apunta al 80+.',
  ]},

  { type: 'callout-mid', t: '¿Empezando de cero?', sub: 'YTubViral te da todas las herramientas que necesitas: SEO Score, Keywords, Best Time, AI Generator. 10 usos gratis.', cta: 'Empezar gratis' },

  { type: 'h2', t: 'Paso 6: Construye comunidad desde el día 1' },
  { type: 'p', t: 'Los primeros 50-100 suscriptores son los más valiosos. Son las personas que creyeron en ti cuando no tenías nada. Trátalos como oro.' },
  { type: 'list', items: [
    'Responde a TODOS los comentarios en tus primeros meses.',
    'Haz preguntas al final de cada vídeo para generar engagement.',
    'Fija un comentario con un dato extra o un link útil.',
    'Usa las Community Posts para mantener a tu audiencia entre vídeos.',
  ]},

  { type: 'h2', t: 'Errores que matan canales nuevos' },
  { type: 'list', items: [
    'Compararte con canales grandes: tienen años de ventaja. Compárate con tu yo de hace un mes.',
    'Revisar métricas diariamente: genera ansiedad. Revisa semanalmente.',
    'Comprar suscriptores o views: YouTube lo detecta y penaliza. No funciona.',
    'Cambiar de nicho cada mes: el algoritmo necesita tiempo para entender tu canal.',
    'Perfeccionismo: un vídeo publicado supera a un vídeo perfecto que nunca se sube.',
  ]},

  { type: 'callout-final', t: 'Tu canal empieza hoy', sub: 'Las herramientas de YTubViral te dan la ventaja que los canales grandes no tenían cuando empezaron. 10 usos gratis.', cta: 'Empezar gratis' },
];

const BODY_GROWTH_EN: LearnBlockType[] = [
  { type: 'h2', t: 'The Truth About the First 1000 Subscribers' },
  { type: 'p', t: 'The first 1000 subscribers are the hardest to get. Most channels reach them in 6-18 months. Some in 3. Many never do. The difference isn\'t talent — it\'s strategy and consistency.' },
  { type: 'p', t: 'This guide is the step-by-step plan I wish I\'d had when I started. No tricks, no shortcuts — just the tactics that actually work for new channels in 2026.' },

  { type: 'h2', t: 'Step 1: Define Your Niche with Precision' },
  { type: 'p', t: 'The #1 mistake new channels make is being too broad. "Technology" isn\'t a niche. "Laptop reviews for students" is. The more specific you are, the easier it is to rank and the faster you find your audience.' },
  { type: 'list', items: [
    'Combine your expertise + a specific topic + a clear audience.',
    '"DaVinci Resolve tutorials for beginners" is better than "video editing".',
    '"15-minute keto recipes" is better than "healthy cooking".',
    'You can expand later. First dominate a small niche.',
  ]},

  { type: 'h2', t: 'Step 2: Publish Consistently' },
  { type: 'p', t: 'Consistency is more important than frequency. 1 video per week for 6 months is infinitely better than 5 videos the first week then disappearing. The algorithm rewards consistency because it predicts future behavior.' },
  { type: 'list', items: [
    'Minimum 1 video/week. If you can do 2, great, but only if you maintain quality.',
    'Choose a fixed day and time. Your audience learns when to expect new content.',
    'Batch record: 2-3 videos in one day, edit and publish throughout the week.',
    'Always have 1-2 "buffer" videos recorded — reduces stress.',
  ]},

  { type: 'callout', t: 'Plan your content calendar with YTubViral Content Calendar — assign ideas to dates and maintain your rhythm.' },

  { type: 'h2', t: 'Step 3: Focus on Search Content' },
  { type: 'p', t: 'When you have no subscribers, nobody will find you through notifications or the home page. Your only discovery path is search. That\'s why your first 20-30 videos should be content people actively search for.' },
  { type: 'list', items: [
    'Tutorials and how-to: "How to do X" is the king format for new channels.',
    'Reviews and comparisons: "Best X for Y in 2026" attracts high-intent searches.',
    'Frequently asked questions in your niche: answer what people ask in comments and forums.',
    'Avoid vlogs, challenges, and trending content at first — you don\'t have an audience searching for it.',
  ]},

  { type: 'h2', t: 'Step 4: Collaborate with Same-Size Channels' },
  { type: 'p', t: 'Collaborations are the most underused growth hack. You don\'t need to collaborate with big channels — channels your same size are equally motivated and the audiences cross-pollinate.' },
  { type: 'list', items: [
    'Look for channels in your niche with 0.5x to 2x your subscribers.',
    'Propose a win-win format: each person makes a video and mentions the other.',
    'Genuinely comment on their videos before proposing the collaboration.',
    'One collab per month can double your growth rate.',
  ]},

  { type: 'h2', t: 'Step 5: Optimize Every Video Before Publishing' },
  { type: 'list', items: [
    'Research the keyword before recording — not after.',
    'Create the title and thumbnail BEFORE recording. This focuses your content.',
    'Complete description with keyword in the first paragraph and timestamps.',
    'Relevant tags and custom thumbnail with readable text.',
    'Use YTubViral SEO Score and aim for 80+.',
  ]},

  { type: 'callout-mid', t: 'Starting from zero?', sub: 'YTubViral gives you all the tools you need: SEO Score, Keywords, Best Time, AI Generator. 10 free uses.', cta: 'Get started free' },

  { type: 'h2', t: 'Step 6: Build Community from Day 1' },
  { type: 'p', t: 'The first 50-100 subscribers are the most valuable. They\'re the people who believed in you when you had nothing. Treat them like gold.' },
  { type: 'list', items: [
    'Reply to ALL comments in your first months.',
    'Ask questions at the end of each video to generate engagement.',
    'Pin a comment with extra data or a useful link.',
    'Use Community Posts to keep your audience engaged between videos.',
  ]},

  { type: 'h2', t: 'Mistakes That Kill New Channels' },
  { type: 'list', items: [
    'Comparing yourself to big channels: they have years of head start. Compare yourself to your one-month-ago self.',
    'Checking metrics daily: creates anxiety. Review weekly.',
    'Buying subscribers or views: YouTube detects it and penalizes. It doesn\'t work.',
    'Changing niche every month: the algorithm needs time to understand your channel.',
    'Perfectionism: a published video beats a perfect video that never gets uploaded.',
  ]},

  { type: 'callout-final', t: 'Your channel starts today', sub: 'YTubViral tools give you the edge that big channels didn\'t have when they started. 10 free uses.', cta: 'Get started free' },
];

const BODY_COMPETITOR_ES: LearnBlockType[] = [
  { type: 'h2', t: 'Por qué analizar a tu competencia (no es lo que crees)' },
  { type: 'p', t: 'Analizar a tus competidores no es copiar lo que hacen. Es entender qué funciona en tu nicho, encontrar huecos que nadie está cubriendo, y descubrir tu ventaja competitiva. Los mejores creadores estudian a su competencia constantemente — no por inseguridad, sino por estrategia.' },

  { type: 'h2', t: 'Paso 1: Identifica a tus competidores reales' },
  { type: 'p', t: 'Tus competidores no son los canales con millones de suscriptores. Son los canales que compiten por las mismas keywords y la misma audiencia que tú. Idealmente, busca canales con 2-10x tus suscriptores — son tu referencia más realista.' },
  { type: 'list', items: [
    'Busca tus keywords principales en YouTube y anota los canales que aparecen repetidamente.',
    'Identifica 5-10 canales "competidores directos" en tu nicho y tamaño.',
    'Añade 2-3 canales "aspiracionales" (mucho más grandes) para ver hacia dónde ir.',
    'No incluyas canales que no comparten tu idioma/audiencia — no son competencia real.',
  ]},

  { type: 'h2', t: 'Paso 2: Analiza sus vídeos más exitosos' },
  { type: 'p', t: 'Ordena los vídeos de cada competidor por "Más populares" en su canal. Los primeros 10-20 resultados te dicen exactamente qué tipo de contenido resonó más con su audiencia — que es similar a la tuya.' },
  { type: 'list', items: [
    '¿Qué formato usan? (tutorial, review, lista, documental, etc.)',
    '¿Qué títulos usan? ¿Hay patrones? (números, preguntas, promesas)',
    '¿Qué thumbnails funcionan? ¿Rostros, texto, colores?',
    '¿Cuál es la duración media de sus vídeos top?',
    '¿Qué keywords atacan? Analiza sus títulos y descripciones.',
  ]},

  { type: 'callout', t: 'Usa YTubViral Competitor Tracking para monitorizar el crecimiento y estrategia de tus competidores en tiempo real.' },

  { type: 'h2', t: 'Paso 3: Encuentra content gaps' },
  { type: 'p', t: 'Un content gap es un tema que tu audiencia busca pero que tus competidores no cubren bien (o no cubren en absoluto). Estos huecos son tus oportunidades de oro — menos competencia, misma demanda.' },
  { type: 'list', items: [
    'Lee los comentarios en los vídeos de tus competidores: ¿qué preguntas hacen los viewers que no se responden?',
    'Busca keywords relacionadas que tus competidores no han cubierto.',
    'Mira las sugerencias de YouTube al final de sus vídeos — ¿hay temas que no aparecen?',
    'Revisa foros, Reddit y grupos de Facebook de tu nicho — ¿qué preguntas se repiten?',
  ]},

  { type: 'h2', t: 'Paso 4: Analiza su frecuencia y crecimiento' },
  { type: 'list', items: [
    '¿Cada cuánto publican? ¿Diario, semanal, quincenal?',
    '¿Su crecimiento de suscriptores es constante o tiene picos?',
    '¿Qué tipo de contenido provocó los picos de crecimiento?',
    '¿Han hecho cambios de formato o estilo recientemente? ¿Les funcionó?',
    '¿Tienen patrones estacionales? (más vídeos en cierta época del año)',
  ]},

  { type: 'h2', t: 'Paso 5: Encuentra tu ángulo diferencial' },
  { type: 'p', t: 'El objetivo del análisis no es hacer lo mismo que tu competencia. Es encontrar lo que puedes hacer DIFERENTE. Tu ángulo diferencial es lo que hace que un viewer te elija a ti sobre los demás.' },
  { type: 'list', items: [
    'Perspectiva única: ¿tienes experiencia profesional que otros no tienen?',
    'Formato diferente: si todos hacen tutoriales largos, haz tutoriales de 5 minutos.',
    'Audiencia desatendida: si todos hablan para avanzados, enfócate en principiantes.',
    'Personalidad: tu forma de comunicar es un diferencial que nadie puede copiar.',
  ]},

  { type: 'callout-mid', t: 'Monitoriza a tu competencia automáticamente', sub: 'YTubViral Competitor Tracking analiza las métricas de hasta 10 canales y te alerta de cambios importantes.', cta: 'Probar gratis' },

  { type: 'h2', t: 'Errores en el análisis competitivo' },
  { type: 'list', items: [
    'Copiar en lugar de inspirarte: tu audiencia lo nota y pierdes autenticidad.',
    'Obsesionarte con canales mucho más grandes: no son tu referencia realista.',
    'Analizar solo una vez: el análisis competitivo debe ser continuo (mensual mínimo).',
    'Ignorar canales pequeños que están creciendo rápido — son tu verdadera amenaza.',
    'No actuar sobre lo que descubres — el análisis sin acción es tiempo perdido.',
  ]},

  { type: 'callout-final', t: 'Conoce a tu competencia, supérala', sub: 'Monitoriza, analiza y encuentra tu ventaja con datos reales. Gratis para empezar.', cta: 'Empezar gratis' },
];

const BODY_COMPETITOR_EN: LearnBlockType[] = [
  { type: 'h2', t: 'Why Analyze Your Competition (It\'s Not What You Think)' },
  { type: 'p', t: 'Analyzing your competitors isn\'t about copying what they do. It\'s about understanding what works in your niche, finding gaps nobody is covering, and discovering your competitive advantage. The best creators study their competition constantly — not out of insecurity, but out of strategy.' },

  { type: 'h2', t: 'Step 1: Identify Your Real Competitors' },
  { type: 'p', t: 'Your competitors aren\'t channels with millions of subscribers. They\'re channels competing for the same keywords and the same audience as you. Ideally, look for channels with 2-10x your subscribers — they\'re your most realistic reference.' },
  { type: 'list', items: [
    'Search your main keywords on YouTube and note the channels that appear repeatedly.',
    'Identify 5-10 "direct competitor" channels in your niche and size range.',
    'Add 2-3 "aspirational" channels (much larger) to see where to aim.',
    'Don\'t include channels that don\'t share your language/audience — they\'re not real competition.',
  ]},

  { type: 'h2', t: 'Step 2: Analyze Their Most Successful Videos' },
  { type: 'p', t: 'Sort each competitor\'s videos by "Most Popular" on their channel. The top 10-20 results tell you exactly what type of content resonated most with their audience — which is similar to yours.' },
  { type: 'list', items: [
    'What format do they use? (tutorial, review, list, documentary, etc.)',
    'What titles do they use? Any patterns? (numbers, questions, promises)',
    'What thumbnails work? Faces, text, colors?',
    'What\'s the average duration of their top videos?',
    'What keywords do they target? Analyze their titles and descriptions.',
  ]},

  { type: 'callout', t: 'Use YTubViral Competitor Tracking to monitor your competitors\' growth and strategy in real time.' },

  { type: 'h2', t: 'Step 3: Find Content Gaps' },
  { type: 'p', t: 'A content gap is a topic your audience searches for but your competitors don\'t cover well (or don\'t cover at all). These gaps are your golden opportunities — less competition, same demand.' },
  { type: 'list', items: [
    'Read comments on your competitors\' videos: what questions do viewers ask that go unanswered?',
    'Look for related keywords your competitors haven\'t covered.',
    'Check YouTube\'s suggestions at the end of their videos — are there topics that don\'t appear?',
    'Browse forums, Reddit, and Facebook groups in your niche — what questions keep coming up?',
  ]},

  { type: 'h2', t: 'Step 4: Analyze Their Frequency and Growth' },
  { type: 'list', items: [
    'How often do they publish? Daily, weekly, biweekly?',
    'Is their subscriber growth steady or does it have spikes?',
    'What type of content caused the growth spikes?',
    'Have they changed format or style recently? Did it work?',
    'Do they have seasonal patterns? (more videos at certain times of year)',
  ]},

  { type: 'h2', t: 'Step 5: Find Your Differentiating Angle' },
  { type: 'p', t: 'The goal of analysis isn\'t to do the same as your competition. It\'s to find what you can do DIFFERENTLY. Your differentiating angle is what makes a viewer choose you over everyone else.' },
  { type: 'list', items: [
    'Unique perspective: do you have professional experience others don\'t?',
    'Different format: if everyone makes long tutorials, make 5-minute ones.',
    'Underserved audience: if everyone talks to advanced users, focus on beginners.',
    'Personality: your communication style is a differentiator nobody can copy.',
  ]},

  { type: 'callout-mid', t: 'Monitor your competition automatically', sub: 'YTubViral Competitor Tracking analyzes metrics of up to 10 channels and alerts you to important changes.', cta: 'Try free' },

  { type: 'h2', t: 'Competitive Analysis Mistakes' },
  { type: 'list', items: [
    'Copying instead of getting inspired: your audience notices and you lose authenticity.',
    'Obsessing over much larger channels: they\'re not your realistic reference.',
    'Analyzing only once: competitive analysis should be continuous (monthly minimum).',
    'Ignoring small channels that are growing fast — they\'re your real threat.',
    'Not acting on what you discover — analysis without action is wasted time.',
  ]},

  { type: 'callout-final', t: 'Know your competition, surpass them', sub: 'Monitor, analyze, and find your edge with real data. Free to start.', cta: 'Get started free' },
];

const BODY_ABTESTING_ES: LearnBlockType[] = [
  { type: 'h2', t: 'Deja de adivinar: testea con datos' },
  { type: 'p', t: 'La mayoría de creadores publican un vídeo con un título y un thumbnail y esperan lo mejor. Los creadores que crecen rápido testean variaciones y dejan que los datos decidan. El A/B testing es la diferencia entre "creo que funciona" y "sé que funciona".' },
  { type: 'p', t: 'YouTube mismo usa A/B testing internamente para todo — desde el color de un botón hasta el algoritmo de recomendaciones. Si YouTube testea, tú también deberías.' },

  { type: 'h2', t: 'Qué testear (y qué no)' },

  { type: 'h3', t: 'Testea: Thumbnails' },
  { type: 'p', t: 'El thumbnail es el candidato perfecto para A/B testing porque tiene el mayor impacto en el CTR y es fácil de cambiar sin afectar al contenido del vídeo.' },
  { type: 'list', items: [
    'Variación de colores: fondo azul vs fondo amarillo.',
    'Con rostro vs sin rostro.',
    'Con texto vs sin texto.',
    'Expresión facial diferente.',
    'Composición: primer plano vs plano general.',
  ]},

  { type: 'h3', t: 'Testea: Títulos' },
  { type: 'p', t: 'Cambiar el título puede transformar un vídeo que no funciona en uno que despega. Pero cambia una variable a la vez para saber qué causó la diferencia.' },
  { type: 'list', items: [
    'Con número vs sin número: "7 trucos..." vs "Los mejores trucos..."',
    'Pregunta vs afirmación: "¿Por qué...?" vs "La razón por la que..."',
    'Corto vs largo: "SEO YouTube" vs "SEO en YouTube: Guía completa paso a paso para 2026"',
    'Emoción diferente: "Lo que nadie te dice..." vs "La guía definitiva de..."',
  ]},

  { type: 'h3', t: 'NO testees: Contenido del vídeo' },
  { type: 'p', t: 'El contenido del vídeo no se puede cambiar después de publicar. Por eso los tests de packaging (título + thumbnail) son tan valiosos — son los únicos que puedes iterar después del lanzamiento.' },

  { type: 'callout', t: 'Usa YTubViral A/B Testing para rotar thumbnails y títulos automáticamente y ver cuál gana.' },

  { type: 'h2', t: 'Cómo hacer A/B testing paso a paso' },

  { type: 'h3', t: 'Método manual (sin herramientas)' },
  { type: 'list', items: [
    'Publica con tu mejor opción de título + thumbnail (versión A).',
    'Después de 24-48 horas, anota el CTR y las impresiones.',
    'Cambia a la versión B (nuevo thumbnail o nuevo título).',
    'Espera otras 24-48 horas y compara.',
    'Quédate con la versión ganadora.',
  ]},
  { type: 'p', t: 'El problema del método manual: las condiciones no son iguales. Las primeras 48 horas tienen más impresiones que las segundas, por lo que la comparación no es perfecta.' },

  { type: 'h3', t: 'Método automático (con YTubViral)' },
  { type: 'list', items: [
    'Sube 2-3 variaciones de thumbnail y/o título.',
    'YTubViral rota las variaciones cada pocas horas de forma automática.',
    'Después de suficientes impresiones, te muestra cuál tiene mejor CTR.',
    'Activa la versión ganadora con un clic.',
    'Resultado: datos comparables en condiciones similares.',
  ]},

  { type: 'h2', t: 'Cuándo hacer A/B testing' },
  { type: 'list', items: [
    'SIEMPRE en tus vídeos nuevos (primeras 48-72 horas son críticas).',
    'En vídeos publicados con CTR bajo (<4%) — un cambio de thumbnail puede revivir un vídeo.',
    'Cuando un vídeo tiene muchas impresiones pero pocas views — YouTube lo muestra pero nadie hace clic.',
    'NO en vídeos con muy pocas impresiones (<500) — no hay datos suficientes para decidir.',
  ]},

  { type: 'callout-mid', t: 'A/B Testing automático', sub: 'Deja de adivinar. Rota variaciones y deja que los datos elijan al ganador.', cta: 'Probar A/B Testing' },

  { type: 'h2', t: 'Cómo interpretar los resultados' },
  { type: 'list', items: [
    'Necesitas mínimo 1000 impresiones por variación para que el resultado sea significativo.',
    'Una diferencia de CTR menor al 0.5% probablemente no es significativa — es ruido.',
    'Si una versión tiene un CTR 1%+ superior, es una mejora real.',
    'Mira también la retención: a veces un thumbnail más "clickbait" sube el CTR pero baja la retención.',
    'Registra los resultados en un documento — con el tiempo descubrirás patrones de tu nicho.',
  ]},

  { type: 'h2', t: 'Patrones que suelen ganar' },
  { type: 'list', items: [
    'Thumbnails con rostros > sin rostros (en la mayoría de nichos).',
    'Títulos con números > sin números.',
    'Colores cálidos (amarillo, rojo, naranja) > fríos (azul, gris).',
    'Texto grande y legible > texto pequeño o decorativo.',
    'Expresiones de sorpresa/shock > expresiones neutras.',
  ]},
  { type: 'p', t: 'Pero cada nicho es diferente. Lo que funciona en gaming puede no funcionar en finanzas. Por eso testear es más valioso que seguir reglas genéricas.' },

  { type: 'callout-final', t: 'Cada vídeo es una oportunidad de aprender', sub: 'Testea, aprende, mejora. El A/B testing convierte cada publicación en un experimento que te hace mejor. Gratis.', cta: 'Empezar gratis' },
];

const BODY_ABTESTING_EN: LearnBlockType[] = [
  { type: 'h2', t: 'Stop Guessing: Test with Data' },
  { type: 'p', t: 'Most creators publish a video with one title and one thumbnail and hope for the best. Creators who grow fast test variations and let the data decide. A/B testing is the difference between "I think it works" and "I know it works."' },
  { type: 'p', t: 'YouTube itself uses A/B testing internally for everything — from button colors to the recommendation algorithm. If YouTube tests, you should too.' },

  { type: 'h2', t: 'What to Test (and What Not To)' },

  { type: 'h3', t: 'Test: Thumbnails' },
  { type: 'p', t: 'The thumbnail is the perfect A/B testing candidate because it has the biggest impact on CTR and is easy to change without affecting the video content.' },
  { type: 'list', items: [
    'Color variation: blue background vs yellow background.',
    'With face vs without face.',
    'With text vs without text.',
    'Different facial expression.',
    'Composition: close-up vs wide shot.',
  ]},

  { type: 'h3', t: 'Test: Titles' },
  { type: 'p', t: 'Changing the title can transform a failing video into one that takes off. But change one variable at a time to know what caused the difference.' },
  { type: 'list', items: [
    'With number vs without: "7 tricks..." vs "The best tricks..."',
    'Question vs statement: "Why do...?" vs "The reason why..."',
    'Short vs long: "YouTube SEO" vs "YouTube SEO: Complete Step-by-Step Guide for 2026"',
    'Different emotion: "What nobody tells you..." vs "The ultimate guide to..."',
  ]},

  { type: 'h3', t: 'DON\'T Test: Video Content' },
  { type: 'p', t: 'Video content can\'t be changed after publishing. That\'s why packaging tests (title + thumbnail) are so valuable — they\'re the only things you can iterate after launch.' },

  { type: 'callout', t: 'Use YTubViral A/B Testing to automatically rotate thumbnails and titles and see which wins.' },

  { type: 'h2', t: 'How to A/B Test Step by Step' },

  { type: 'h3', t: 'Manual Method (No Tools)' },
  { type: 'list', items: [
    'Publish with your best title + thumbnail option (version A).',
    'After 24-48 hours, note the CTR and impressions.',
    'Switch to version B (new thumbnail or new title).',
    'Wait another 24-48 hours and compare.',
    'Keep the winning version.',
  ]},
  { type: 'p', t: 'The problem with the manual method: conditions aren\'t equal. The first 48 hours have more impressions than the second, so the comparison isn\'t perfect.' },

  { type: 'h3', t: 'Automatic Method (with YTubViral)' },
  { type: 'list', items: [
    'Upload 2-3 thumbnail and/or title variations.',
    'YTubViral rotates variations every few hours automatically.',
    'After enough impressions, it shows you which has the best CTR.',
    'Activate the winning version with one click.',
    'Result: comparable data under similar conditions.',
  ]},

  { type: 'h2', t: 'When to A/B Test' },
  { type: 'list', items: [
    'ALWAYS on your new videos (first 48-72 hours are critical).',
    'On published videos with low CTR (<4%) — a thumbnail change can revive a video.',
    'When a video has many impressions but few views — YouTube is showing it but nobody clicks.',
    'NOT on videos with very few impressions (<500) — not enough data to decide.',
  ]},

  { type: 'callout-mid', t: 'Automatic A/B Testing', sub: 'Stop guessing. Rotate variations and let the data pick the winner.', cta: 'Try A/B Testing' },

  { type: 'h2', t: 'How to Interpret Results' },
  { type: 'list', items: [
    'You need at least 1000 impressions per variation for the result to be significant.',
    'A CTR difference under 0.5% is probably not significant — it\'s noise.',
    'If one version has 1%+ higher CTR, it\'s a real improvement.',
    'Also check retention: sometimes a more "clickbait" thumbnail increases CTR but drops retention.',
    'Log results in a document — over time you\'ll discover patterns for your niche.',
  ]},

  { type: 'h2', t: 'Patterns That Usually Win' },
  { type: 'list', items: [
    'Thumbnails with faces > without faces (in most niches).',
    'Titles with numbers > without numbers.',
    'Warm colors (yellow, red, orange) > cool (blue, gray).',
    'Large readable text > small or decorative text.',
    'Surprise/shock expressions > neutral expressions.',
  ]},
  { type: 'p', t: 'But every niche is different. What works in gaming may not work in finance. That\'s why testing is more valuable than following generic rules.' },

  { type: 'callout-final', t: 'Every video is a learning opportunity', sub: 'Test, learn, improve. A/B testing turns every upload into an experiment that makes you better. Free.', cta: 'Get started free' },
];

export const GUIDE_BODIES: Record<string, { es: LearnBlockType[]; en: LearnBlockType[] }> = {
  'seo-basics': { es: BODY_SEO_ES, en: BODY_SEO_EN },
  'keyword-research': { es: BODY_KEYWORDS_ES, en: BODY_KEYWORDS_EN },
  'retention': { es: BODY_RETENTION_ES, en: BODY_RETENTION_EN },
  'thumbnails': { es: BODY_THUMBNAILS_ES, en: BODY_THUMBNAILS_EN },
  'analytics-deep': { es: BODY_ANALYTICS_ES, en: BODY_ANALYTICS_EN },
  'growth-strategy': { es: BODY_GROWTH_ES, en: BODY_GROWTH_EN },
  'competitor-analysis': { es: BODY_COMPETITOR_ES, en: BODY_COMPETITOR_EN },
  'ab-testing': { es: BODY_ABTESTING_ES, en: BODY_ABTESTING_EN },
};

// ── Helpers ──

export function getGuide(slug: string): LearnGuide | undefined {
  return LEARN_GUIDES.find((g) => g.slug === slug);
}

export function getRelatedGuides(slug: string, count = 3): LearnGuide[] {
  const guide = getGuide(slug);
  if (!guide) return [];
  return guide.relatedSlugs
    .map((s) => getGuide(s))
    .filter((g): g is LearnGuide => !!g)
    .slice(0, count);
}

export function getAllGuideSlugs(): string[] {
  return LEARN_GUIDES.map((g) => g.slug);
}
