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
};

export function getPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}

export function getRelated(slug: string, cat: string, count = 3): BlogPost[] {
  return BLOG_POSTS.filter((p) => p.slug !== slug && p.cat === cat).slice(0, count);
}
