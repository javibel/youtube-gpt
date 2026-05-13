'use client';

import { useState, useEffect } from 'react';
import { getLangClient } from '@/lib/get-lang-client';
import DashboardShell from '@/components/DashboardShell';

type Lang = 'es' | 'en';

interface Guide {
  id: string;
  icon: string;
  title: Record<Lang, string>;
  description: Record<Lang, string>;
  level: 'beginner' | 'intermediate' | 'advanced';
  tool?: string; // link to YTubViral tool
  steps: Record<Lang, string[]>;
}

const LEVEL_COLORS = { beginner: '#22c55e', intermediate: '#eab308', advanced: '#ef4444' };
const LEVEL_LABELS: Record<string, Record<Lang, string>> = {
  beginner: { es: 'Principiante', en: 'Beginner' },
  intermediate: { es: 'Intermedio', en: 'Intermediate' },
  advanced: { es: 'Avanzado', en: 'Advanced' },
};

const GUIDES: Guide[] = [
  {
    id: 'seo-basics',
    icon: '🔍',
    title: { es: 'SEO en YouTube: Guía completa', en: 'YouTube SEO: Complete Guide' },
    description: {
      es: 'Aprende a optimizar tus vídeos para que aparezcan en búsquedas y recomendaciones.',
      en: 'Learn to optimize your videos to appear in search and recommendations.',
    },
    level: 'beginner',
    tool: '/seo-score',
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
    id: 'keyword-research',
    icon: '📊',
    title: { es: 'Keyword Research para YouTube', en: 'Keyword Research for YouTube' },
    description: {
      es: 'Encuentra las palabras clave que tu audiencia está buscando y que tienen poca competencia.',
      en: 'Find keywords your audience is searching for with low competition.',
    },
    level: 'beginner',
    tool: '/research',
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
    id: 'retention',
    icon: '📈',
    title: { es: 'Mejorar retención de audiencia', en: 'Improve Audience Retention' },
    description: {
      es: 'La retención es el factor #1 del algoritmo. Aprende a mantener a tu audiencia enganchada.',
      en: 'Retention is the #1 algorithm factor. Learn to keep your audience hooked.',
    },
    level: 'intermediate',
    tool: '/retention',
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
    id: 'thumbnails',
    icon: '🎨',
    title: { es: 'Thumbnails que generan clics', en: 'Thumbnails That Get Clicks' },
    description: {
      es: 'El thumbnail decide si alguien hace clic. Aprende los principios de diseño que funcionan.',
      en: 'The thumbnail decides if someone clicks. Learn the design principles that work.',
    },
    level: 'beginner',
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
    id: 'analytics-deep',
    icon: '🔬',
    title: { es: 'Análisis avanzado con YouTube Analytics', en: 'Advanced Analysis with YouTube Analytics' },
    description: {
      es: 'Aprende a leer tus datos privados de YouTube y tomar decisiones basadas en métricas reales.',
      en: 'Learn to read your private YouTube data and make decisions based on real metrics.',
    },
    level: 'advanced',
    tool: '/analytics',
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
    id: 'growth-strategy',
    icon: '🚀',
    title: { es: 'Estrategia de crecimiento 0 a 1K subs', en: 'Growth Strategy 0 to 1K Subs' },
    description: {
      es: 'Los primeros 1000 suscriptores son los más difíciles. Aquí tienes el plan paso a paso.',
      en: 'The first 1000 subscribers are the hardest. Here\'s the step-by-step plan.',
    },
    level: 'beginner',
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
    id: 'competitor-analysis',
    icon: '🎯',
    title: { es: 'Análisis de competidores', en: 'Competitor Analysis' },
    description: {
      es: 'Aprende de los que ya lo están haciendo bien. Analiza su estrategia y encuentra tu ventaja.',
      en: 'Learn from those already doing well. Analyze their strategy and find your edge.',
    },
    level: 'intermediate',
    tool: '/competitors',
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
    id: 'ab-testing',
    icon: '⚡',
    title: { es: 'A/B Testing de títulos y thumbnails', en: 'A/B Testing Titles & Thumbnails' },
    description: {
      es: 'Deja de adivinar qué funciona. Testea variaciones y deja que los datos decidan.',
      en: 'Stop guessing what works. Test variations and let the data decide.',
    },
    level: 'intermediate',
    tool: '/ab-test',
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
    id: 'best-time',
    icon: '⏰',
    title: { es: 'Mejor hora para publicar', en: 'Best Time to Publish' },
    description: {
      es: 'El timing importa. Publica cuando tu audiencia está activa para maximizar el impulso inicial.',
      en: 'Timing matters. Publish when your audience is active to maximize initial momentum.',
    },
    level: 'beginner',
    tool: '/best-time',
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
    id: 'trend-explorer',
    icon: '🔥',
    title: { es: 'Cómo aprovechar las tendencias', en: 'How to Ride Trends' },
    description: {
      es: 'Detecta temas en auge antes que tu competencia y crea contenido que el algoritmo quiere recomendar.',
      en: 'Spot rising topics before your competition and create content the algorithm wants to recommend.',
    },
    level: 'intermediate',
    tool: '/trends',
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
    id: 'ai-generator',
    icon: '🤖',
    title: { es: 'Generar contenido con IA', en: 'Generate Content with AI' },
    description: {
      es: 'Usa la IA como copiloto: genera ideas, títulos, descripciones y guiones optimizados en segundos.',
      en: 'Use AI as your copilot: generate ideas, titles, descriptions, and optimized scripts in seconds.',
    },
    level: 'beginner',
    tool: '/generate',
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
    id: 'content-calendar',
    icon: '📅',
    title: { es: 'Planificar tu calendario de contenido', en: 'Plan Your Content Calendar' },
    description: {
      es: 'La consistencia es lo que separa a los canales que crecen de los que se estancan. Planifica con estrategia.',
      en: 'Consistency is what separates growing channels from stagnant ones. Plan strategically.',
    },
    level: 'intermediate',
    tool: '/calendar',
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
    id: 'video-predictor',
    icon: '🎱',
    title: { es: 'Predecir el rendimiento antes de publicar', en: 'Predict Performance Before Publishing' },
    description: {
      es: 'Anticipa cómo rendirá tu vídeo y optimízalo antes de que sea demasiado tarde.',
      en: 'Anticipate how your video will perform and optimize it before it\'s too late.',
    },
    level: 'advanced',
    tool: '/predictor',
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
    id: 'ai-coach',
    icon: '🧠',
    title: { es: 'Tu coach de YouTube con IA', en: 'Your AI YouTube Coach' },
    description: {
      es: 'Recibe análisis personalizado de tu canal y recomendaciones accionables basadas en tus datos reales.',
      en: 'Get personalized channel analysis and actionable recommendations based on your actual data.',
    },
    level: 'advanced',
    tool: '/coach',
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

export default function LearnPage() {
  const [lang, setLang] = useState<Lang>('es');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => { setLang(getLangClient()); }, []);
  const t = (es: string, en: string) => lang === 'en' ? en : es;

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <DashboardShell>
      {/* Header */}
      <div className="yv-page">
        <header className="yv-page-header">
          <div className="yv-page-header__left">
            <span className="yv-page-header__eyebrow">
              {t('CENTRO DE APRENDIZAJE', 'LEARNING HUB')}
            </span>
            <h1 className="yv-page-header__title">
              {t('Aprende a crecer en YouTube', 'Learn to Grow on YouTube')}
            </h1>
            <p className="yv-page-header__desc">
              {t('Guías prácticas basadas en datos reales. Cada guía incluye pasos concretos que puedes aplicar hoy.', 'Practical data-driven guides. Each guide includes concrete steps you can apply today.')}
            </p>
          </div>
        </header>
      </div>

      <div className="yv-page space-y-4">
        {GUIDES.map(guide => {
          const isExpanded = expanded.has(guide.id);
          return (
            <div
              key={guide.id}
              className="yv-card overflow-hidden transition hover:border-white/15"
            >
              <div
                className="flex items-start gap-4 p-5 cursor-pointer"
                onClick={() => toggle(guide.id)}
              >
                <span className="text-2xl flex-shrink-0">{guide.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h2 className="font-display font-bold text-base" style={{ color: 'var(--yv-text-1)' }}>{guide.title[lang]}</h2>
                    <span
                      className="font-mono-jb text-[13px] uppercase tracking-wider px-2 py-0.5 rounded-full"
                      style={{ background: `${LEVEL_COLORS[guide.level]}22`, color: LEVEL_COLORS[guide.level] }}
                    >
                      {LEVEL_LABELS[guide.level][lang]}
                    </span>
                  </div>
                  <p className="text-[13px] font-mono-jb" style={{ color: 'var(--yv-text-2)' }}>{guide.description[lang]}</p>
                </div>
                <svg
                  width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  className={`flex-shrink-0 mt-1 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  style={{ color: 'var(--yv-text-4)' }}
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </div>

              {isExpanded && (
                <div className="border-t border-white/5 px-5 pb-5 pt-4">
                  <ol className="space-y-3">
                    {guide.steps[lang].map((step, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <span className="font-mono-jb font-bold text-sm mt-0.5 flex-shrink-0" style={{ color: 'var(--yv-brand)' }}>
                          {i + 1}
                        </span>
                        <span className="text-sm font-mono-jb leading-relaxed" style={{ color: 'var(--yv-text-2)' }}>{step}</span>
                      </li>
                    ))}
                  </ol>
                  {guide.tool && (
                    <a
                      href={guide.tool}
                      className="yv-btn yv-btn--ghost inline-flex items-center gap-2 mt-4"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                      {t('Usar herramienta', 'Use tool')} →
                    </a>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </DashboardShell>
  );
}
