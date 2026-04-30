// Blog content — bilingual (es/en)
// To add a new article: add an entry to BLOG_POSTS and the full body to ARTICLE_BODIES

export type Lang = 'es' | 'en';

export interface BlogPost {
  slug: string;
  cat: 'ai' | 'youtube' | 'marketing' | 'tutorials';
  readMin: number;
  date: { es: string; en: string };
  author: { name: string; role: { es: string; en: string }; avatar: string };
  title: { es: string; en: string };
  excerpt: { es: string; en: string };
  image?: string;
}

export type BlockType =
  | { type: 'p'; t: string }
  | { type: 'h2'; t: string }
  | { type: 'h3'; t: string }
  | { type: 'list'; items: string[] }
  | { type: 'callout'; t: string }
  | { type: 'callout-mid'; t: string; sub: string; cta: string }
  | { type: 'callout-final'; t: string; sub: string; cta: string };

export const BLOG_CATEGORIES = {
  ai:        { color: '#00E5FF', name: { es: 'IA',          en: 'AI' } },
  youtube:   { color: '#FF0033', name: { es: 'YouTube',     en: 'YouTube' } },
  marketing: { color: '#FF00AA', name: { es: 'Marketing',   en: 'Marketing' } },
  tutorials: { color: '#7CFF00', name: { es: 'Tutoriales',  en: 'Tutorials' } },
} as const;

export const BLOG_POSTS: BlogPost[] = [
  // ── Real articles ──────────────────────────────────────────────────────────
  {
    slug: 'herramientas-ia-para-youtubers-2026',
    cat: 'ai',
    readMin: 8,
    date: { es: '15 Oct 2025', en: 'Oct 15, 2025' },
    author: { name: 'Javier Jimeno', role: { es: 'CEO y Fundador, YTubViral', en: 'CEO & Founder, YTubViral' }, avatar: 'JJ' },
    image: '/blog/herramientas-ia-youtubers.png',
    title: {
      es: '10 Herramientas de IA para YouTubers en 2026 (Gratis y de Pago)',
      en: '10 AI Tools for YouTubers in 2026 (Free and Paid)',
    },
    excerpt: {
      es: 'La IA ha revolucionado la forma en que los creadores trabajan. En 2026 existen herramientas increíbles que te permiten ahorrar horas cada semana — aquí están las 10 mejores, con precios y para qué sirve cada una.',
      en: 'AI has revolutionized how creators work. In 2026 there are incredible tools that save you hours every week — here are the top 10, with pricing and what each one does.',
    },
  },
  {
    slug: 'como-escribir-titulos-virales-youtube',
    cat: 'youtube',
    readMin: 7,
    date: { es: '22 Nov 2025', en: 'Nov 22, 2025' },
    author: { name: 'Javier Jimeno', role: { es: 'CEO y Fundador, YTubViral', en: 'CEO & Founder, YTubViral' }, avatar: 'JJ' },
    image: '/blog/titulos-virales-youtube.png',
    title: {
      es: 'Cómo Escribir Títulos Virales para YouTube en 2026 (Guía Completa)',
      en: 'How to Write Viral YouTube Titles in 2026 (Complete Guide)',
    },
    excerpt: {
      es: 'El título es la diferencia entre 100 y 100.000 visualizaciones. Aprende las 7 fórmulas probadas para escribir títulos que disparan el CTR, con ejemplos reales y el checklist del título perfecto.',
      en: 'The title is the difference between 100 and 100,000 views. Learn the 7 proven formulas for writing titles that skyrocket CTR, with real examples and a perfect-title checklist.',
    },
  },
  {
    slug: 'descripciones-seo-youtube-guia',
    cat: 'tutorials',
    readMin: 9,
    date: { es: '8 Ene 2026', en: 'Jan 8, 2026' },
    author: { name: 'Lucía Vega', role: { es: 'Especialista en contenido', en: 'Content specialist' }, avatar: 'LV' },
    image: '/blog/descripciones-seo-youtube.png',
    title: {
      es: 'Descripciones SEO para YouTube: La Guía Definitiva 2026',
      en: 'SEO Descriptions for YouTube: The Definitive Guide 2026',
    },
    excerpt: {
      es: 'La descripción de tu vídeo es el elemento más infravalorado del SEO en YouTube. Los vídeos con descripciones optimizadas tienen un 78% más de probabilidades de aparecer en la primera página. Aquí está todo lo que necesitas saber.',
      en: 'Your video description is the most underrated YouTube SEO element. Videos with optimized descriptions are 78% more likely to appear on the first page. Here is everything you need to know.',
    },
  },
  {
    slug: '7-frameworks-titulos-virales-youtube',
    cat: 'youtube',
    readMin: 9,
    date: { es: '14 Mar 2026', en: 'Mar 14, 2026' },
    author: { name: 'Javier Jimeno', role: { es: 'CEO y Fundador, YTubViral', en: 'CEO & Founder, YTubViral' }, avatar: 'JJ' },
    image: '/blog/frameworks-titulos-virales.png',
    title: {
      es: '7 frameworks para títulos virales que YouTube premia en 2026',
      en: '7 viral title frameworks YouTube rewards in 2026',
    },
    excerpt: {
      es: 'Analizamos 12.480 vídeos con más de 500K visualizaciones para destilar los patrones de titulación que el algoritmo prioriza este año. Spoiler: los números específicos siguen ganando.',
      en: 'We analyzed 12,480 videos with 500K+ views to distill the title patterns the algorithm prioritizes this year. Spoiler: specific numbers still win.',
    },
  },
  {
    slug: 'cuanto-gana-un-youtuber-en-espana',
    cat: 'marketing',
    readMin: 14,
    date: { es: '30 Abr 2026', en: 'Apr 30, 2026' },
    author: { name: 'Javier Jimeno', role: { es: 'CEO y Fundador, YTubViral', en: 'CEO & Founder, YTubViral' }, avatar: 'JJ' },
    image: '/blog/cuanto-gana-youtuber-espana.png',
    title: {
      es: 'Cuánto Gana Realmente un YouTuber en España (y Por Qué Nadie Te Cuenta la Verdad)',
      en: 'How Much Does a YouTuber Really Earn in Spain (And Why Nobody Tells the Truth)',
    },
    excerpt: {
      es: 'CPMs reales por nicho, impuestos de autónomos, el Valle de la Muerte entre los 100 y los 10.000 suscriptores, y por qué YouTube no es un billete de lotería sino un negocio de márgenes estrechos. Sin edulcorar.',
      en: 'Real CPMs by niche, freelancer taxes, the Valley of Death between 100 and 10,000 subscribers, and why YouTube isn\'t a lottery ticket but a thin-margin business. No sugar-coating.',
    },
  },
];

// ── Article bodies ────────────────────────────────────────────────────────────
// Add full body for each slug. English version shares Spanish content until translated.

const ART_HERRAMIENTAS_IA: BlockType[] = [
  { type: 'p', t: '¿Eres YouTuber y sientes que pierdes demasiado tiempo en tareas repetitivas? La inteligencia artificial ha revolucionado la forma en que los creadores de contenido trabajan. En 2026, existen herramientas increíbles que te permiten ahorrar horas cada semana.' },
  { type: 'p', t: 'En este artículo te presentamos las 10 mejores herramientas de IA para YouTubers, tanto gratuitas como de pago.' },
  { type: 'h2', t: '¿Por Qué Usar IA en Tu Canal de YouTube?' },
  { type: 'p', t: 'Antes de entrar en materia, es importante entender por qué la IA se ha convertido en el mejor aliado de los creadores de contenido:' },
  { type: 'list', items: [
    'Ahorro de tiempo: Automatiza tareas que antes tomaban horas',
    'Consistencia: Mantiene la calidad del contenido siempre alta',
    'Escalabilidad: Produce más contenido en menos tiempo',
    'Optimización SEO: Mejora el posicionamiento de tus vídeos',
  ]},
  { type: 'h2', t: 'Las 10 Mejores Herramientas de IA para YouTubers' },
  { type: 'h3', t: '1. YTubViral — Generador de Contenido para YouTube' },
  { type: 'p', t: 'YTubViral es la herramienta más completa para creadores de contenido. Genera títulos virales, descripciones SEO, captions para redes sociales y scripts completos en segundos.' },
  { type: 'list', items: [
    'Títulos optimizados para el algoritmo de YouTube',
    'Descripciones con keywords integradas',
    'Captions para TikTok, Instagram y Reels',
    'Scripts completos para tus vídeos',
    'Ideas para thumbnails',
    'Hook para YouTube Shorts',
    'Plan de serie de vídeos',
    'Análisis de nicho y competidores',
    'Keyword research integrado',
  ]},
  { type: 'p', t: 'Precio: Gratis (10 generaciones/mes) | Pro desde $9.99/mes — Ideal para creadores que quieren escalar su producción sin perder horas escribiendo.' },
  { type: 'callout-mid', t: 'Prueba YTubViral gratis', sub: '10 generaciones gratis. Sin tarjeta de crédito.', cta: 'Empezar gratis en ytubviral.com' },
  { type: 'h3', t: '2. vidIQ — Análisis y SEO para YouTube' },
  { type: 'p', t: 'vidIQ es una de las herramientas más populares para optimizar tus vídeos en YouTube. Ofrece análisis de keywords, seguimiento de competidores, coaching con IA y sugerencias diarias de contenido.' },
  { type: 'list', items: [
    'Investigación de keywords con volumen de búsqueda',
    'Análisis de competidores en tiempo real',
    'Puntuación SEO de tus vídeos',
    'Coaching personalizado con IA',
    'Daily ideas: sugerencias de temas diarias',
  ]},
  { type: 'p', t: 'Precio: Desde $16.58/mes. Principalmente en inglés, con soporte parcial en español. Ideal para creadores que quieren datos analíticos detallados.' },
  { type: 'h3', t: '3. TubeBuddy — Optimización de Vídeos' },
  { type: 'p', t: 'TubeBuddy es una extensión de Chrome que se integra directamente con YouTube. Ayuda a optimizar títulos, descripciones y tags en tiempo real, con A/B testing de thumbnails y Keyword Explorer.' },
  { type: 'p', t: 'Precio: Desde $4.50/mes — Ideal para creadores que quieren optimizar su canal de forma sistemática.' },
  { type: 'h3', t: '4. Descript — Edición de Vídeo con IA' },
  { type: 'p', t: 'Descript revoluciona la edición de vídeo. Puedes editar tus vídeos editando el texto de la transcripción, como si fuera un documento de Word. Incluye eliminación automática de silencios y corrección de errores de voz.' },
  { type: 'p', t: 'Precio: Gratis | Pro desde $24/mes — Ideal para creadores que quieren acelerar su proceso de edición.' },
  { type: 'h3', t: '5. ElevenLabs — Voz en Off con IA' },
  { type: 'p', t: 'ElevenLabs genera voces en off increíblemente realistas en múltiples idiomas, incluyendo español. Perfecta para crear narraciones sin necesidad de grabar tu voz, con opción de clonar tu propia voz.' },
  { type: 'p', t: 'Precio: Gratis (10K caracteres/mes) | Pro desde $5/mes — Ideal para creadores que quieren narración profesional.' },
  { type: 'h3', t: '6. Canva — Diseño de Thumbnails' },
  { type: 'p', t: 'Canva es la herramienta más popular para diseñar thumbnails. Con sus plantillas de IA, puedes crear diseños profesionales en minutos. Incluye generación de imágenes con IA y plantillas específicas para YouTube.' },
  { type: 'p', t: 'Precio: Gratis | Pro desde $12.99/mes — Ideal para creadores que quieren thumbnails atractivos sin ser diseñadores.' },
  { type: 'h3', t: '7. Opus Clip — Clips Virales Automáticos' },
  { type: 'p', t: 'Opus Clip analiza tus vídeos largos y genera automáticamente clips cortos optimizados para TikTok, Reels y YouTube Shorts, con subtítulos animados y puntuación de viralidad por clip.' },
  { type: 'p', t: 'Precio: Gratis (60 min/mes) | Pro desde $9/mes — Ideal para creadores que quieren maximizar cada vídeo en múltiples plataformas.' },
  { type: 'h3', t: '8. ChatGPT — Generación de Ideas' },
  { type: 'p', t: 'ChatGPT es el asistente de IA más versátil. Úsalo para generar ideas de contenido, estructurar vídeos, investigar temas y redactar respuestas a comentarios.' },
  { type: 'p', t: 'Precio: Gratis | Plus desde $20/mes — Ideal para creadores que necesitan un asistente polivalente.' },
  { type: 'h3', t: '9. Midjourney — Imágenes para Thumbnails' },
  { type: 'p', t: 'Midjourney genera imágenes espectaculares con IA, perfectas para crear elementos visuales únicos para tus thumbnails: imágenes fotorrealistas, arte digital original y conceptos visuales creativos.' },
  { type: 'p', t: 'Precio: Desde $10/mes — Ideal para creadores que quieren thumbnails únicos y llamativos.' },
  { type: 'h3', t: '10. Riverside.fm — Grabación Profesional' },
  { type: 'p', t: 'Riverside.fm te permite grabar podcasts y entrevistas en calidad de estudio directamente desde el navegador, con grabación en 4K, separación de pistas de audio y transcripción automática.' },
  { type: 'p', t: 'Precio: Gratis | Pro desde $15/mes — Ideal para creadores de podcasts y entrevistas.' },
  { type: 'h2', t: 'Comparativa de Herramientas' },
  { type: 'list', items: [
    'YTubViral — Gratis | En español nativo | Contenido completo + analytics',
    'vidIQ — $16.58/mes | Soporte parcial español | SEO, analytics y coaching IA',
    'TubeBuddy — $4.50/mes | Soporte parcial español | Optimización del canal',
    'Descript — Gratis | Soporte parcial español | Edición de vídeo',
    'ElevenLabs — Gratis | Sí en español | Voz en off',
    'Canva — Gratis | Sí en español | Diseño de thumbnails',
    'Opus Clip — Gratis | Soporte parcial español | Clips automáticos',
  ]},
  { type: 'h2', t: '¿Cuál es la Mejor Herramienta para Creadores de Contenido?' },
  { type: 'p', t: 'La respuesta depende de tus necesidades:' },
  { type: 'list', items: [
    'Si quieres generar contenido completo (títulos, descripciones, scripts): YTubViral',
    'Si quieres analytics y datos detallados: vidIQ',
    'Si quieres optimizar tu canal sistemáticamente: TubeBuddy',
    'Si quieres editar vídeos más rápido: Descript',
    'Si quieres clips virales automáticos: Opus Clip',
  ]},
  { type: 'p', t: 'La mayoría de creadores profesionales combinan 2-3 herramientas. La combinación más efectiva es YTubViral + Canva + Opus Clip, que cubre todo el flujo desde la creación del contenido hasta la distribución en múltiples plataformas.' },
  { type: 'h2', t: 'Conclusión' },
  { type: 'p', t: 'Las herramientas de IA han transformado la forma en que los creadores de contenido trabajan. En 2026, no usar IA significa quedarse atrás de la competencia.' },
  { type: 'callout-final', t: 'Empieza hoy mismo con YTubViral gratis', sub: 'Multiplica tu productividad sin sacrificar la calidad. Sin tarjeta de crédito.', cta: 'Prueba gratis — Sin tarjeta' },
];

const ART_TITULOS_VIRALES: BlockType[] = [
  { type: 'p', t: 'El título de tu vídeo es lo primero que ve el espectador. Es la diferencia entre 100 visualizaciones y 100.000. En esta guía te enseñamos exactamente cómo escribir títulos que disparen tu CTR y conquisten el algoritmo de YouTube.' },
  { type: 'h2', t: '¿Por Qué el Título es tan Importante en YouTube?' },
  { type: 'list', items: [
    'CTR (Click Through Rate): Un buen título puede multiplicar por 5 tus clics',
    'SEO: YouTube es el segundo buscador del mundo. Los títulos bien optimizados aparecen en Google',
    'Algoritmo: YouTube prioriza vídeos con alto CTR en sus recomendaciones',
    'Primera impresión: Tienes 2 segundos para convencer al espectador de que haga clic',
  ]},
  { type: 'p', t: 'Según datos internos de YouTube, la diferencia entre un título mediocre y uno optimizado puede significar hasta un 300% más de visualizaciones con el mismo contenido.' },
  { type: 'h2', t: 'Las 7 Fórmulas de Títulos Virales que Funcionan Siempre' },
  { type: 'h3', t: 'Fórmula 1: El Número Específico' },
  { type: 'p', t: 'Los números generan curiosidad y credibilidad. Nuestro cerebro procesa los números más rápido que las palabras. Estructura: [Número] + [Resultado] + [Timeframe]' },
  { type: 'list', items: [
    '"7 Errores que Arruinan tu Canal de YouTube (Evítalos)"',
    '"10 Herramientas de IA para YouTubers en 2026"',
    '"5 Técnicas para Doblar tus Vistas en 30 Días"',
  ]},
  { type: 'p', t: 'Por qué funciona: Los espectadores saben exactamente qué van a obtener y cuánto tiempo les tomará.' },
  { type: 'h3', t: 'Fórmula 2: El Secreto Revelado' },
  { type: 'p', t: 'A todos nos encanta sentir que accedemos a información exclusiva que otros no tienen. Estructura: [Lo que nadie te dice] + [Sobre el tema]' },
  { type: 'list', items: [
    '"El Secreto que Usan los YouTubers con Millones de Suscriptores"',
    '"Por Qué el 90% de los Canales de YouTube Fracasan (Y Cómo Evitarlo)"',
    '"Lo que YouTube NO Quiere que Sepas sobre el Algoritmo"',
  ]},
  { type: 'p', t: 'Por qué funciona: Activa el FOMO (miedo a perderse algo) y la curiosidad natural del ser humano.' },
  { type: 'h3', t: 'Fórmula 3: El Antes y Después' },
  { type: 'p', t: 'Muestra una transformación clara. Los espectadores quieren ver resultados tangibles. Estructura: [Situación actual] → [Situación deseada]' },
  { type: 'list', items: [
    '"De 0 a 10.000 Suscriptores en 6 Meses (Sin Experiencia)"',
    '"Cómo Pasé de 100 a 50.000 Vistas por Vídeo"',
    '"De YouTuber Aficionado a Vivir de YouTube en 1 Año"',
  ]},
  { type: 'h3', t: 'Fórmula 4: La Pregunta Directa' },
  { type: 'p', t: 'Las preguntas generan curiosidad inmediata y obligan al cerebro a buscar la respuesta. El cerebro humano no puede resistir una pregunta sin respuesta.' },
  { type: 'list', items: [
    '"¿Por Qué tu Canal de YouTube no Crece? (La Verdad)"',
    '"¿Cuánto Dinero Gana un YouTuber con 100.000 Suscriptores?"',
    '"¿Vale la Pena Empezar un Canal de YouTube en 2026?"',
  ]},
  { type: 'h3', t: 'Fórmula 5: El Clickbait Honesto' },
  { type: 'p', t: 'El clickbait tiene mala fama, pero cuando se usa con honestidad es muy efectivo. Genera sorpresa e intriga sin engañar al espectador. Estructura: [Afirmación sorprendente] + [Contexto que la justifica]' },
  { type: 'list', items: [
    '"Borré 50 Vídeos de mi Canal (y Fue la Mejor Decisión)"',
    '"Dejé de Publicar 3 Meses y mis Vistas Subieron"',
    '"YouTube me Suspendió el Canal (Lo que Aprendí)"',
  ]},
  { type: 'h3', t: 'Fórmula 6: El Tutorial con Resultado Garantizado' },
  { type: 'p', t: 'Los tutoriales son el formato más buscado en YouTube. Añadir un resultado específico los hace irresistibles. Estructura: Cómo [Acción] + [Resultado específico] + [Timeframe opcional]' },
  { type: 'list', items: [
    '"Cómo Escribir Títulos Virales para YouTube en 10 Minutos"',
    '"Cómo Monetizar tu Canal de YouTube desde el Primer Vídeo"',
    '"Cómo Grabar Vídeos Profesionales con tu Móvil"',
  ]},
  { type: 'h3', t: 'Fórmula 7: El Desafío o Reto' },
  { type: 'p', t: 'Los retos generan expectativa y entretenimiento simultáneamente. Estructura: [Reto extremo o inusual] + [Consecuencia]' },
  { type: 'list', items: [
    '"Publiqué un Vídeo al Día Durante 30 Días (Esto Pasó)"',
    '"Probé las Estrategias de los 10 Canales más Grandes de YouTube"',
    '"Viví Solo de YouTube Durante 1 Mes (Resultado Real)"',
  ]},
  { type: 'callout-mid', t: '¿Cansado de escribir títulos a mano?', sub: 'YTubViral genera 5 opciones optimizadas en segundos, con score de viralidad.', cta: 'Prueba YTubViral gratis' },
  { type: 'h2', t: 'Los 5 Errores que Arruinan tus Títulos' },
  { type: 'h3', t: 'Error 1: Ser Demasiado Genérico' },
  { type: 'p', t: 'Malo: "Tips para YouTube" — Bueno: "7 Tips que Triplicaron mis Vistas en YouTube en 2026". La especificidad convierte.' },
  { type: 'h3', t: 'Error 2: Títulos Demasiado Largos' },
  { type: 'p', t: 'YouTube muestra entre 60-70 caracteres en escritorio y menos en móvil. Regla: máximo 60 caracteres para el mensaje principal. El resto es bonus.' },
  { type: 'h3', t: 'Error 3: No Incluir Keywords' },
  { type: 'p', t: 'Tu título debe incluir las palabras que tu audiencia busca en YouTube y Google. Sin keywords, YouTube no sabe a quién recomendar tu vídeo.' },
  { type: 'h3', t: 'Error 4: Prometer lo que no Entregas' },
  { type: 'p', t: 'Si tu título promete "Ganar 10.000€ en 30 días" y tu vídeo no lo explica, perderás la confianza de tu audiencia y YouTube penalizará tu retención.' },
  { type: 'h3', t: 'Error 5: Ignorar las Emociones' },
  { type: 'p', t: 'Los mejores títulos activan una emoción: curiosidad, miedo, alegría, sorpresa, ambición. Sin emoción, sin clic.' },
  { type: 'h2', t: 'Checklist del Título Perfecto' },
  { type: 'p', t: 'Antes de publicar tu vídeo, verifica que tu título cumple estas condiciones:' },
  { type: 'list', items: [
    'Tiene entre 40-60 caracteres',
    'Incluye la keyword principal',
    'Activa una emoción (curiosidad, sorpresa, ambición)',
    'Es específico (número, resultado, timeframe)',
    'Cumple lo que promete',
    'Es diferente al resto de vídeos del tema',
    'Funciona sin ver el thumbnail',
  ]},
  { type: 'h2', t: 'Conclusión' },
  { type: 'p', t: 'Un buen título puede transformar completamente el rendimiento de tu canal. No subestimes el poder de las palabras correctas.' },
  { type: 'callout-final', t: 'Genera títulos virales con IA en segundos', sub: 'Prueba YTubViral gratis y deja de perder visualizaciones por un mal título.', cta: 'Generar títulos gratis →' },
];

const ART_DESCRIPCIONES_SEO: BlockType[] = [
  { type: 'p', t: 'La descripción de tu vídeo es uno de los elementos más infravalorados por los creadores de contenido. Mientras todos se obsesionan con el título y el thumbnail, la descripción trabaja silenciosamente para posicionar tu vídeo en YouTube y Google.' },
  { type: 'p', t: 'En esta guía te enseñamos cómo escribir descripciones que posicionen, conviertan y hagan crecer tu canal.' },
  { type: 'h2', t: '¿Por Qué es Importante la Descripción en YouTube?' },
  { type: 'p', t: 'La descripción cumple tres funciones críticas:' },
  { type: 'list', items: [
    'SEO: YouTube y Google la rastrean para entender de qué trata tu vídeo',
    'Conversión: Convierte espectadores en suscriptores, seguidores y clientes',
    'Contexto: Da información adicional que no cabe en el título',
  ]},
  { type: 'p', t: 'Un estudio de Backlinko analizó más de un millón de vídeos de YouTube y descubrió que los vídeos con descripciones optimizadas tienen un 78% más de probabilidades de aparecer en la primera página de resultados.' },
  { type: 'h2', t: 'La Anatomía de una Descripción Perfecta' },
  { type: 'p', t: 'Una descripción optimizada tiene 5 partes bien definidas: Hook (primeras líneas, visibles sin expandir) → Desarrollo del contenido → Timestamps → Links y recursos → Keywords y hashtags.' },
  { type: 'h3', t: 'Parte 1: El Hook (Primeras 2-3 Líneas)' },
  { type: 'p', t: 'Las primeras líneas son las únicas visibles sin hacer clic en "Ver más". Reglas del hook: incluye la keyword principal en las primeras 25 palabras, describe qué aprenderá el espectador, genera curiosidad o urgencia, máximo 150 caracteres.' },
  { type: 'p', t: 'Ejemplo malo: "Hola a todos, bienvenidos a mi canal. En este vídeo voy a hablar sobre YouTube y algunas cosas interesantes..."' },
  { type: 'p', t: 'Ejemplo bueno: "¿Quieres que tus vídeos aparezcan en la primera página de YouTube? En este vídeo te enseño exactamente cómo escribir descripciones SEO que posicionan en 2026."' },
  { type: 'h3', t: 'Parte 2: Desarrollo del Contenido' },
  { type: 'p', t: 'Estructura recomendada: "En este vídeo aprenderás:" seguido de 3-5 puntos con las keywords principales del vídeo. Esto ayuda al algoritmo y mejora la experiencia del espectador.' },
  { type: 'h3', t: 'Parte 3: Timestamps' },
  { type: 'p', t: 'Los timestamps mejoran la experiencia del usuario y el SEO. Aparecen en Google como rich snippets, mejoran la retención del vídeo y facilitan la navegación. Formato: "0:00 - Introducción / 1:30 - Por qué importa / 4:15 - Cómo escribir el hook..."' },
  { type: 'h3', t: 'Parte 4: Links y Recursos' },
  { type: 'p', t: 'Incluye los recursos mencionados en el vídeo, tus redes sociales y datos de contacto. La descripción es el único lugar donde YouTube permite links clickeables — aprovéchalo.' },
  { type: 'h3', t: 'Parte 5: Keywords y Hashtags' },
  { type: 'p', t: 'Al final añade keywords secundarias de forma natural y máximo 3 hashtags relevantes. Más de 3 hashtags puede penalizarte según las guías de YouTube.' },
  { type: 'h2', t: 'Las 10 Keywords más Buscadas en YouTube en Español' },
  { type: 'list', items: [
    'cómo monetizar youtube — 4.1K búsquedas/mes',
    'shorts de youtube — 3.8K búsquedas/mes',
    'cómo crecer en youtube — 3.2K búsquedas/mes',
    'cómo ganar suscriptores — 2.8K búsquedas/mes',
    'herramientas para youtubers — 2.4K búsquedas/mes',
    'algoritmo de youtube — 1.5K búsquedas/mes',
    'títulos para youtube — 1.2K búsquedas/mes',
    'seo para youtube — 1.8K búsquedas/mes',
    'descripciones para youtube — 800 búsquedas/mes',
    'herramientas ia youtubers — 600 búsquedas/mes',
  ]},
  { type: 'h2', t: 'Errores Comunes en las Descripciones de YouTube' },
  { type: 'h3', t: 'Error 1: Dejar la Descripción Vacía' },
  { type: 'p', t: 'El 40% de los YouTubers principiantes publican sin descripción. Es un error gravísimo para el SEO que deja dinero encima de la mesa desde el primer día.' },
  { type: 'h3', t: 'Error 2: Copiar y Pegar la Misma Descripción' },
  { type: 'p', t: 'Cada vídeo debe tener una descripción única. Las descripciones genéricas no posicionan y YouTube puede penalizarte por contenido duplicado.' },
  { type: 'h3', t: 'Error 3: No Incluir Keywords' },
  { type: 'p', t: 'Sin keywords, YouTube no sabe de qué trata tu vídeo y no puede recomendarlo a la audiencia correcta.' },
  { type: 'h3', t: 'Error 4: Ignorar los Timestamps' },
  { type: 'p', t: 'Los timestamps mejoran el SEO, la experiencia del usuario y aumentan el tiempo de visualización al facilitar la navegación.' },
  { type: 'h3', t: 'Error 5: No Añadir Links' },
  { type: 'p', t: 'La descripción es el único lugar donde YouTube permite links clickeables. No incluir links a tus recursos, redes o productos es una oportunidad perdida.' },
  { type: 'callout-mid', t: '¿Cansado de escribir descripciones desde cero?', sub: 'YTubViral genera descripciones SEO completas y optimizadas en segundos.', cta: 'Prueba YTubViral gratis' },
  { type: 'h2', t: 'Plantilla de Descripción Lista para Usar' },
  { type: 'p', t: 'Copia esta plantilla y adáptala a cada vídeo:' },
  { type: 'list', items: [
    '[HOOK] ¿Quieres [resultado deseado]? En este vídeo aprenderás exactamente cómo [promesa principal] en [timeframe].',
    '[CONTENIDO] En este vídeo verás: → Punto 1 → Punto 2 → Punto 3',
    '[TIMESTAMPS] ⏱️ 0:00 - Introducción / [añade tus timestamps]',
    '[RECURSOS] 🔗 YTubViral (genera descripciones automáticamente): ytubviral.com',
    '[HASHTAGS] #[Hashtag1] #[Hashtag2] #[Hashtag3]',
  ]},
  { type: 'h2', t: 'Conclusión' },
  { type: 'p', t: 'Una descripción bien optimizada puede marcar la diferencia entre un vídeo que nadie ve y uno que se posiciona en la primera página de YouTube y Google. Dedica tiempo a escribirlas o usa una herramienta para generarlas automáticamente.' },
  { type: 'callout-final', t: 'Genera descripciones SEO en segundos', sub: 'Optimizadas para YouTube y Google. Sin tarjeta de crédito.', cta: 'Prueba gratis en ytubviral.com' },
];

// Featured article from the prototype (kept as-is)
const ART_7_FRAMEWORKS_ES: BlockType[] = [
  { type: 'p', t: 'Analizamos 12.480 vídeos publicados entre julio y diciembre de 2025 que superaron las 500.000 visualizaciones. El objetivo: entender si los frameworks de titulación que funcionaban en 2024 siguen vigentes, o si el algoritmo ha movido la regla.' },
  { type: 'p', t: 'La respuesta corta: cinco frameworks siguen funcionando, dos están muriendo, y han aparecido dos nuevos que casi nadie está usando todavía. Este artículo es un mapa concreto, con ejemplos reales y plantillas que puedes pasar por nuestro motor.' },
  { type: 'h2', t: '1. El framework numérico específico' },
  { type: 'p', t: 'Sigue siendo el rey. Pero el truco está en la palabra "específico". "5 errores comunes" dejó de funcionar a finales de 2024. "23 errores" o "147 trucos" rinden un 36% más en CTR según nuestro dataset.' },
  { type: 'p', t: 'La razón es psicológica: un número redondo (5, 10, 100) suena editorial; uno extraño (7, 23, 147) suena a investigación real. El cerebro lo interpreta como una promesa concreta.' },
  { type: 'callout', t: '¿Cansado de escribir títulos a ciegas? Genera 8 variantes optimizadas en 6 segundos.' },
  { type: 'h2', t: '2. La promesa con tensión' },
  { type: 'p', t: 'Estructura: [Acción ambiciosa] + [Restricción incómoda]. Por ejemplo: "Monté mi setup completo de edición — gastando solo 487€". La restricción genera la curiosidad; la acción genera la promesa.' },
  { type: 'p', t: 'Funciona porque rompe el patrón "lo conseguí fácil" que el espectador ya descuenta automáticamente. Si hay restricción, hay esfuerzo, y eso eleva el percibido.' },
  { type: 'h3', t: 'Variantes que funcionan' },
  { type: 'list', items: ['Sin presupuesto, sin equipo, sin experiencia', 'En 30 días, en 7 horas, en un solo fin de semana', 'Con la cámara que ya tienes / con el móvil', 'Empezando desde 0 suscriptores'] },
  { type: 'h2', t: '3. La confesión post-experiencia' },
  { type: 'p', t: 'Empezar el título con primera persona y un verbo de aprendizaje: "Probé X durante Y. Esto NO te cuentan." Es uno de los frameworks con mayor crecimiento desde mediados de 2025.' },
  { type: 'callout-mid', t: '¿Cansado de escribir títulos a ciegas?', sub: 'Genera 8 variantes optimizadas, con score de viralidad, en 6 segundos.', cta: 'Prueba YTubViral gratis' },
  { type: 'h2', t: '4. La pregunta retórica con giro' },
  { type: 'p', t: 'No vale cualquier pregunta. La estructura ganadora: pregunta que el espectador YA se ha hecho, con una vuelta inesperada al final. "¿Vale la pena el MacBook Air M4 en 2026? Mi experiencia real" cumple las dos condiciones.' },
  { type: 'h2', t: '5. El framework de comparación directa' },
  { type: 'p', t: 'A vs. B sigue funcionando, pero ya no basta con dos opciones populares. Lo que rinde ahora es A vs. B vs. opción inesperada. Por ejemplo: "Sony A7IV vs. Canon R6 vs. mi móvil de hace 3 años".' },
  { type: 'h2', t: '6. El error con consecuencia' },
  { type: 'p', t: 'NUEVO en 2026. Estructura: "[acción común] está [destruyendo X]". Funciona porque combina urgencia con identificación. El watcher se reconoce en la acción común y necesita saber qué le pasa.' },
  { type: 'h2', t: '7. La revelación temporal' },
  { type: 'p', t: 'NUEVO. Mencionar el día concreto en que algo cambió. "Empecé un canal en enero de 2024. El día 47 todo cambió." Convierte un caso de estudio en una historia con fecha.' },
  { type: 'h3', t: 'Lo que ya NO funciona' },
  { type: 'list', items: ['Títulos con TODO EN MAYÚSCULAS (penalizados desde el cambio del algoritmo de septiembre 2025)', 'Clickbait abierto: "No CREERÁS lo que pasó..." cae 60% en CTR', 'Frases con "OMG", "INSANE", "WTF" en el primer 50% del título', 'Frameworks de "hilos" copiados de Twitter — el formato ya no traduce'] },
  { type: 'h2', t: 'Cómo aplicar esto' },
  { type: 'p', t: 'Un consejo: nunca te quedes con el primer título. La diferencia entre un 6% y un 12% de CTR es exactamente el segundo, tercer o quinto intento. Generar variantes es barato; perder visualizaciones por un mal título es caro.' },
  { type: 'callout-final', t: 'Genera títulos virales con IA', sub: 'Plantillas optimizadas, score de viralidad y análisis de framework. En 6 segundos.', cta: 'Prueba gratis — Sin tarjeta' },
];

const ART_CUANTO_GANA_YOUTUBER: BlockType[] = [
  { type: 'p', t: 'Voy a ser directo: si estás leyendo esto esperando que te diga que puedes hacerte rico subiendo vídeos a YouTube, este artículo te va a decepcionar. Pero si quieres entender de verdad cómo funciona el dinero en YouTube España en 2026 — con números reales, no los de los vídeos de "gané 50.000€ en un mes" — entonces quédate.' },
  { type: 'p', t: 'Llevo años trabajando con creadores de contenido y hay una cosa que me frustra profundamente: la cantidad de desinformación que circula sobre cuánto se gana en YouTube. Se habla de facturación bruta como si fuera beneficio neto. Se omiten los impuestos. Se ignora que el 90% de los canales abandonan antes de cobrar su primer cheque de 100€. Y sobre todo, nadie te cuenta lo que pasa entre el mes 1 y el mes 18.' },

  { type: 'h2', t: 'Lo primero: CPM y RPM no son lo mismo (y la diferencia importa mucho)' },
  { type: 'p', t: 'Cuando alguien dice "YouTube paga X por cada mil visitas", casi siempre está mezclando dos métricas que significan cosas muy distintas.' },
  { type: 'p', t: 'El CPM (Coste por Mil impresiones) es lo que paga el anunciante. El RPM (Ingreso por Mil reproducciones) es lo que te llega a ti después de que YouTube se quede su parte y se descuenten las visualizaciones que no mostraron anuncios. La diferencia es brutal.' },
  { type: 'p', t: 'YouTube retiene el 45% de los ingresos publicitarios en vídeos largos. En Shorts, el reparto es todavía peor para el creador. Si tu estrategia es vivir solo de Shorts, los números no cuadran en España.' },

  { type: 'h2', t: 'No todas las visitas valen lo mismo: el mapa de RPMs en España' },
  { type: 'p', t: 'Esto es algo que descubres cuando empiezas a mirar tus analytics de verdad: un vídeo de finanzas con 50.000 visitas puede generar más dinero que un vídeo de gaming con 2 millones. ¿Por qué? Porque los anunciantes pagan según el valor del espectador, no según la cantidad.' },
  { type: 'p', t: 'Un banco que quiere captar un cliente con 50.000€ para invertir pagará mucho más por aparecer en un vídeo de inversiones que una marca de snacks por aparecer en un canal de reacciones. Así de simple.' },
  { type: 'p', t: 'Estos son los RPMs reales que se manejan en el mercado español en 2025-2026:' },
  { type: 'list', items: [
    'Finanzas e inversiones: 6€ – 30€ RPM — los bancos, brókers y fintechs pagan primas altísimas',
    'Negocios y emprendimiento: 5€ – 15€ RPM — SaaS, marketing digital, e-commerce',
    'Tecnología y software: 4€ – 12€ RPM — hardware, IA, gadgets',
    'Salud y fitness: 2,50€ – 8€ RPM — suplementación, equipamiento',
    'Educación y tutoriales: 2€ – 6€ RPM — formación online, idiomas',
    'Motor y estilo de vida: 1,50€ – 4€ RPM — automoción, moda',
    'Gaming y reacciones: 0,50€ – 2,50€ RPM — videojuegos, bebidas energéticas',
    'Entretenimiento general: 0,30€ – 1,80€ RPM — consumo masivo, cine',
  ]},
  { type: 'p', t: 'Lee esa lista otra vez. Un creador de finanzas puede ganar lo mismo con 100.000 visitas que un creador de gaming con 2.000.000. Esto subvierte completamente la idea de que el éxito en YouTube se mide por suscriptores o visualizaciones. En términos contables, lo que importa es quién te ve, no cuántos te ven.' },

  { type: 'h2', t: 'La trampa de la audiencia latinoamericana' },
  { type: 'p', t: 'Hay algo que muy pocos creadores españoles entienden hasta que les pasa: si tu contenido se vuelve viral en Latinoamérica, tus ingresos por publicidad caen por un precipicio.' },
  { type: 'p', t: 'No es discriminación ni conspiración. Es economía básica. Los presupuestos publicitarios en México, Argentina o Colombia son una fracción de los españoles, que a su vez son una fracción de los estadounidenses. El mismo vídeo, con las mismas visitas, genera ingresos radicalmente distintos según desde dónde se ve:' },
  { type: 'list', items: [
    'Estados Unidos: 15€ – 20€ CPM bruto',
    'Australia / Suiza: 13€ – 16€',
    'España: 6€ – 14€',
    'México: 1€ – 2,50€',
    'Argentina / Colombia: 0,40€ – 1,20€',
  ]},
  { type: 'p', t: 'Conozco creadores españoles con millones de suscriptores que facturan menos por AdSense que profesionales con audiencias de 50.000 personas pero 100% españolas. Si tu contenido es en español, tienes que asumir que una parte significativa de tu audiencia vendrá de países con CPMs bajos. Tu estrategia de crecimiento debe equilibrar alcance masivo con retención de audiencia de alto valor.' },

  { type: 'h2', t: 'AdSense no da para vivir (a menos que seas enorme)' },
  { type: 'p', t: 'Vamos a hacer cuentas reales. Supongamos que eres un creador de tecnología en España con un RPM de 6€ (que es bastante decente). Para ganar 2.000€ brutos al mes por AdSense necesitarías unas 333.000 visualizaciones mensuales. Cada mes. Sin fallar.' },
  { type: 'p', t: 'Y esos 2.000€ son brutos. Después vienen los impuestos, la cuota de autónomos, el software, la gestoría... Pero llegaremos a eso.' },
  { type: 'p', t: 'La realidad contable de 2025-2026 es clara: los ingresos de AdSense solos son insuficientes para sostener una actividad profesional en España, a menos que muevas volúmenes de tráfico extraordinarios. Los creadores que realmente viven de esto han convertido sus canales en plataformas de marketing multicanal donde la publicidad es solo una fracción del total.' },

  { type: 'h2', t: 'Donde está el dinero de verdad: patrocinios' },
  { type: 'p', t: 'Los patrocinios representan entre el 60% y el 80% de los ingresos netos de un creador consolidado en España. Las marcas han profesionalizado sus departamentos de marketing de influencers: ya no pagan por seguidores, pagan por resultados medibles.' },
  { type: 'p', t: 'Estas son las tarifas que se mueven en el mercado español en 2026:' },
  { type: 'list', items: [
    'Nano-creador (1K – 10K subs): 50€ – 300€ por integración — suele ser intercambio de producto o pago simbólico',
    'Micro-influencer (10K – 100K): 500€ – 4.000€ — tarifa plana + comisión por ventas',
    'Nivel medio (100K – 500K): 4.000€ – 15.000€ — CPM pactado o fee fijo',
    'Macro-influencer (500K – 1M): 15.000€ – 30.000€ — campañas integrales',
    'Mega-influencer (>1M): >30.000€ — contratos de embajador anuales',
  ]},
  { type: 'p', t: 'Los creadores en nichos premium (finanzas, tecnología profesional) pueden pedir entre un 20% y un 50% más porque su audiencia convierte mejor. Una mención en un canal de inversiones puede generar cientos de clientes de alto valor para una fintech. Eso se paga.' },

  { type: 'h2', t: 'Afiliación y productos propios: el pilar que nadie menciona' },
  { type: 'p', t: 'El marketing de afiliación — links de Amazon, plataformas de software, servicios financieros — genera ingresos que no dependen de publicar vídeos constantemente. Para muchos canales de tecnología o cocina, es el colchón que amortigua los meses malos.' },
  { type: 'p', t: 'Pero la tendencia real en 2026 es la creación de productos propios. Eliminar al intermediario:' },
  { type: 'list', items: [
    'Cursos y membresías: especialmente comunes en educación y fitness',
    'Software y herramientas: extensiones, apps de productividad, recursos descargables',
    'Comunidades de pago: grupos de Telegram o Discord con acceso exclusivo',
  ]},
  { type: 'p', t: 'Un curso de 49€ vendido a 200 alumnos son 9.800€ en una semana. Sin intermediarios, sin algoritmo, sin que YouTube se quede nada. Por eso los creadores más listos construyen productos, no solo contenido.' },

  { type: 'callout-mid', t: 'YTubViral te ayuda a crecer más rápido', sub: 'Genera títulos, descripciones SEO y scripts para tus vídeos con IA. Gratis.', cta: 'Prueba YTubViral gratis' },

  { type: 'h2', t: 'El Valle de la Muerte: de 0 a 10.000 suscriptores' },
  { type: 'p', t: 'Y aquí viene la parte que la industria del "yo lo logré y tú también puedes" se esfuerza en esconder.' },
  { type: 'p', t: 'Existe una etapa donde trabajas a tiempo completo con ingresos literalmente de cero. En España, alcanzar los requisitos de monetización — 1.000 suscriptores y 4.000 horas de visualización — requiere una media de 6 a 18 meses de actividad ininterrumpida. Durante ese tiempo, tú pagas todo: equipo, software, cuota de autónomos (si ya te has dado de alta) y tu propia vida. YouTube no te da nada.' },
  { type: 'p', t: 'Y lo peor no es eso. Lo peor es el estancamiento algorítmico.' },
  { type: 'p', t: 'Muchos canales captan suscriptores a través de un vídeo viral o de Shorts que nunca más interactúan con el contenido regular. Estos "suscriptores fantasma" dañan tu CTR y tu retención, enviando señales negativas al algoritmo. Es una espiral descendente: menos alcance → menos motivación → menos constancia → abandono.' },
  { type: 'p', t: 'El 90% de los canales abandonan antes de cobrar su primer pago de 100€. No es una estadística inventada para dramatizar. Es la realidad del Valle de la Muerte.' },

  { type: 'h2', t: 'La bofetada fiscal: autónomos, IRPF y lo que Hacienda se lleva' },
  { type: 'p', t: 'Ser YouTuber en España no es solo una actividad creativa. Es una actividad empresarial sujeta a uno de los marcos fiscales más estrictos de la Unión Europea. Y la falta de planificación aquí es la principal causa de ruina de creadores emergentes.' },

  { type: 'h3', t: 'Cuota de autónomos: ya no hay cuota mínima fija' },
  { type: 'p', t: 'Desde 2025, la cuota de autónomos se calcula en función de tus beneficios netos reales. Se acabó lo de pagar 80€/mes de tarifa plana mientras facturas 5.000€:' },
  { type: 'list', items: [
    'Beneficio neto < 670€/mes: 200€/mes de cuota',
    '1.166€ – 1.300€/mes: ~292€/mes',
    '1.850€ – 2.030€/mes: ~373€/mes',
    '3.621€ – 4.050€/mes: ~496€/mes',
    '> 6.000€/mes: ~597€/mes',
  ]},

  { type: 'h3', t: 'IRPF: el impuesto que más duele' },
  { type: 'p', t: 'El IRPF es progresivo. Suena justo hasta que ves los tramos. Con un beneficio anual de 50.000€ (que parece mucho pero no lo es tanto cuando eres autónomo), la liquidación se estructura así: los primeros 12.450€ al 19%, los siguientes 7.750€ al 24%, los siguientes 15.000€ al 30%, y el resto al 37%.' },
  { type: 'p', t: 'Resultado: unos 14.200€ de IRPF. Tipo efectivo del 28-30%. Y eso antes de variaciones autonómicas — en algunas comunidades como Cataluña o Andalucía, los tramos autonómicos elevan la cifra para rentas altas.' },

  { type: 'h3', t: 'Lo que Hacienda te deja deducir (y lo que no)' },
  { type: 'list', items: [
    'Deducible al 100%: equipo de grabación, software de edición, gestoría, licencias de música, publicidad',
    'Deducible con limitaciones: suministros del hogar (hasta 30% de la parte proporcional si trabajas desde casa), seguros de salud (hasta 500€/año)',
    'Prácticamente no deducible: vehículo (a menos que demuestres uso 100% profesional), viajes que mezclen ocio y trabajo',
  ]},

  { type: 'h2', t: 'El coste real de la profesionalidad' },
  { type: 'p', t: 'La calidad técnica mínima para competir en 2026 ha subido exponencialmente. Un canal que quiera captar marcas premium necesita una inversión base:' },
  { type: 'list', items: [
    'Cámara y ópticas (Sony ZV-E10, Canon R7 o similar): 700€ – 1.800€',
    'Audio (micro de condensador e interfaz): 150€ – 400€',
    'Iluminación (LED + softboxes): 200€ – 600€',
    'Adobe Creative Cloud: 25€ – 50€/mes',
    'Música y SFX (Epidemic Sound, Artlist): 10€ – 35€/mes',
    'Gestoría: 60€ – 150€/mes',
    'Cuota de autónomos: 200€ – 400€/mes',
  ]},
  { type: 'p', t: 'Suma esas cifras. Un creador medio en España necesita facturar al menos 1.500€ mensuales solo para cubrir gastos operativos, seguridad social e impuestos básicos. Antes de tener un solo euro de sueldo.' },

  { type: 'h2', t: 'La opción Andorra: ya no es lo que era' },
  { type: 'p', t: 'Muchos creadores que superan los 100.000€ de facturación anual consideran mudarse a Andorra para pagar menos impuestos. Pero desde abril de 2025, el principado ha endurecido radicalmente los requisitos:' },
  { type: 'list', items: [
    'Inversión en vivienda: el depósito mínimo ha alcanzado en algunos supuestos el millón de euros',
    'Depósitos no reembolsables: 50.000€ en la Autoridad Financiera Andorrana como garantía',
    'Control de presencia: España ha intensificado la vigilancia sobre residencias simuladas — tienes que vivir allí de verdad más de 183 días al año',
  ]},
  { type: 'p', t: 'Andorra ha dejado de ser una solución accesible. Es una opción para los que facturan cifras muy altas y están dispuestos a mudarse de verdad, no para el creador medio que busca ahorrarse unos miles de euros al año.' },

  { type: 'h2', t: 'La "Cuesta de Enero" y la estacionalidad del dinero' },
  { type: 'p', t: 'Algo que nadie te avisa cuando empiezas: los ingresos de YouTube son brutalmente estacionales.' },
  { type: 'p', t: 'Diciembre suele ser el mejor mes del año. Las marcas gastan los presupuestos de Q4, el Black Friday dispara los CPMs, y todo el mundo compra. Pero el 1 de enero se cae todo. Los presupuestos se resetean, el consumo baja, y las subastas de anuncios se vacían.' },
  { type: 'p', t: 'Es perfectamente normal ganar en enero un 50% menos que en diciembre con las mismas visualizaciones. Si no tienes contratos de patrocinio anuales que garanticen flujo constante, enero y febrero pueden ser meses de auténtica sequía.' },

  { type: 'h2', t: 'Entonces, ¿cuánto gana realmente un YouTuber en España?' },
  { type: 'p', t: 'La respuesta honesta es: depende de si actúas como creador o como empresario.' },
  { type: 'p', t: 'Un creador que solo confía en las visitas de YouTube está jugando a una lotería con muy pocas papeletas ganadoras. Un creador que profesionaliza su gestión, entiende sus métricas por nicho, diversifica con productos propios y optimiza sus impuestos puede construir algo realmente rentable.' },
  { type: 'p', t: 'La industria española en 2026 va hacia una polarización clara: canales de alta calidad técnica y especialización económica, frente a una masa de creadores de entretenimiento que luchan por sobrevivir con CPMs decrecientes y costes operativos crecientes.' },
  { type: 'p', t: 'La verdad que nadie te cuenta es que YouTube no es un billete de lotería. Es un negocio de márgenes estrechos donde la creatividad es el 20% del éxito. El otro 80% es contabilidad, estrategia fiscal y gestión comercial.' },
  { type: 'p', t: 'Y no hay nada de malo en eso. De hecho, es una buena noticia: significa que si haces las cosas bien, el éxito no depende de la suerte ni del algoritmo. Depende de ti.' },

  { type: 'callout-final', t: 'Optimiza tu canal con datos, no con suerte', sub: 'YTubViral analiza tu nicho, genera contenido optimizado y te ayuda a crecer con estrategia. Gratis para empezar.', cta: 'Empieza gratis — Sin tarjeta' },
];

export const ARTICLE_BODIES: Record<string, { es: BlockType[]; en: BlockType[] }> = {
  'herramientas-ia-para-youtubers-2026': {
    es: ART_HERRAMIENTAS_IA,
    en: ART_HERRAMIENTAS_IA, // English translation pending
  },
  'como-escribir-titulos-virales-youtube': {
    es: ART_TITULOS_VIRALES,
    en: ART_TITULOS_VIRALES, // English translation pending
  },
  'descripciones-seo-youtube-guia': {
    es: ART_DESCRIPCIONES_SEO,
    en: ART_DESCRIPCIONES_SEO, // English translation pending
  },
  '7-frameworks-titulos-virales-youtube': {
    es: ART_7_FRAMEWORKS_ES,
    en: ART_7_FRAMEWORKS_ES,
  },
  'cuanto-gana-un-youtuber-en-espana': {
    es: ART_CUANTO_GANA_YOUTUBER,
    en: ART_CUANTO_GANA_YOUTUBER,
  },
};

export function getPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}

export function getRelated(slug: string, cat: string, count = 3): BlogPost[] {
  return BLOG_POSTS.filter((p) => p.slug !== slug && p.cat === cat).slice(0, count);
}
