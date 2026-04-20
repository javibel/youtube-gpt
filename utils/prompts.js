export const TEMPLATES = {
  title: {
    name: '📌 Título de Video',
    description: 'Genera títulos virales y clickbait',
    inputs: ['tema', 'tono', 'duracion'],
    prompt: (data) => `Eres un experto en títulos virales para YouTube que generan millones de vistas.

TEMA: ${data.tema}
TONO: ${data.tono}
DURACIÓN: ${data.duracion} minutos

Genera EXACTAMENTE 5 opciones de títulos únicos:
- Cada título debe tener 40-60 caracteres
- Usa números cuando sea relevante
- Usa verbos fuertes (Descubre, Aprende, Gana, etc)
- Hazlos clickbait pero honestos
- Optimizados para YouTube

Formato: Solo devuelve los 5 títulos, uno por línea:
1. [título]
2. [título]
3. [título]
4. [título]
5. [título]`
  },

  description: {
    name: '📝 Descripción YouTube',
    description: 'Genera descripciones optimizadas con SEO',
    inputs: ['tema', 'duracion', 'keywords'],
    prompt: (data) => `Eres un experto en SEO para YouTube. Tu trabajo es crear descripciones que rankeen en búsqueda y generen clics.

TEMA: ${data.tema}
DURACIÓN: ${data.duracion} minutos
KEYWORDS: ${data.keywords || 'auto-generadas'}

Crea una descripción YouTube que:
- Tenga 200-300 palabras
- Incluya keywords naturalmente
- Tenga timestamps cada 2-3 minutos
- Call to action para suscribirse
- Links section al final

FORMATO:
[Párrafo intro 50-100 palabras]

⏱️ TIMESTAMPS:
00:00 - Intro
02:30 - [Sección 1]
05:15 - [Sección 2]
...

[CTA para suscribirse]

📱 Links:
[Si aplica, agrega links]`
  },

  caption: {
    name: '💬 Caption + Hashtags',
    description: 'Captions virales para TikTok, Shorts, Instagram',
    inputs: ['tema', 'tono', 'plataforma'],
    prompt: (data) => `Eres un experto en viral content para redes sociales.

TEMA: ${data.tema}
TONO: ${data.tono}
PLATAFORMA: ${data.plataforma}

Genera:
1. Un caption principal (50-100 caracteres)
2. Emojis estratégicos
3. Call to action
4. 15 hashtags relevantes

FORMATO:
CAPTION:
[Tu caption aquí con emojis]

HASHTAGS:
#tag1 #tag2 #tag3...

El caption debe ser:
- Viral y engaging
- Emocionalmente resonante
- Call to action claro
- Adaptado al tono del canal`
  },

  thumbnail: {
    name: '🎨 Idea para Thumbnail',
    description: 'Textos cortos para el thumbnail del video',
    inputs: ['tema', 'estilo'],
    prompt: (data) => `Eres un experto en thumbnails virales. Creas textos que generan clics.

TEMA: ${data.tema}
ESTILO: ${data.estilo}

Genera 3 opciones de TEXT para el thumbnail:
- Máximo 5-8 palabras
- Alto contraste y legible
- Emocionales (miedo, curiosidad, sorpresa, rabia)
- Bold y cortos

Formato: Solo devuelve los 3 textos:
1. [texto]
2. [texto]
3. [texto]`
  },

  shorts_hook: {
    name: '⚡ Hook para Shorts',
    description: 'Primeras palabras que enganchen en 3 segundos',
    proOnly: true,
    inputs: ['tema', 'nicho'],
    prompt: (data) => `Eres un experto en YouTube Shorts y contenido viral de formato corto. Tu especialidad son los hooks que retienen al espectador en los primeros 3 segundos.

TEMA: ${data.tema}
NICHO: ${data.nicho}

Genera 5 hooks diferentes para los primeros 3 segundos de un Short:
- Máximo 15 palabras cada uno
- Deben generar curiosidad o sorpresa instantánea
- Usar patrones probados: pregunta directa, afirmación polémica, dato sorprendente, promesa de valor, historia incompleta
- Adaptados al nicho indicado
- En español, tono directo y energético

Formato:
1. [Hook] — Patrón: [tipo de patrón usado]
2. [Hook] — Patrón: [tipo]
3. [Hook] — Patrón: [tipo]
4. [Hook] — Patrón: [tipo]
5. [Hook] — Patrón: [tipo]`
  },

  series: {
    name: '📚 Plan de Serie',
    description: 'Genera un plan completo de serie de vídeos',
    proOnly: true,
    inputs: ['tema', 'num_videos', 'tono'],
    prompt: (data) => `Eres un estratega de contenido para YouTube especializado en crear series que fidelizan audiencias y maximizan el watch time y retorno de suscriptores.

TEMA DE LA SERIE: ${data.tema}
NÚMERO DE VÍDEOS: ${data.num_videos || '5'}
TONO: ${data.tono}

Crea un plan completo para esta serie:
- Título de la serie (con subtítulo)
- Lógica de progresión (por qué este orden engancha)
- Para cada episodio: número, título, gancho principal, qué aprende el espectador, cómo conecta con el siguiente

FORMATO:

🎬 NOMBRE DE LA SERIE: [título]
📌 CONCEPTO: [1-2 frases sobre la serie]
🔗 LÓGICA DE PROGRESIÓN: [por qué este orden]

EPISODIOS:
${Array.from({length: parseInt(data.num_videos) || 5}, (_, i) => `Ep ${i+1}: [título] | Gancho: [hook] | Aprendizaje: [qué aprende] | Conexión: [cómo engancha al siguiente]`).join('\n')}`
  },

  niche_analysis: {
    name: '🔍 Análisis de Nicho',
    description: 'Ideas y oportunidades basadas en tu nicho',
    proOnly: true,
    inputs: ['nicho', 'tema'],
    prompt: (data) => `Eres un analista de contenido de YouTube con profundo conocimiento de tendencias, nichos y estrategias de crecimiento. Ayudas a creadores a encontrar oportunidades de contenido con alta demanda y baja competencia.

NICHO: ${data.nicho}
ÁREA TEMÁTICA: ${data.tema}

Genera un análisis completo con:

1. **OPORTUNIDADES DE CONTENIDO** — 5 tipos de vídeos con alta demanda en este nicho que están infrautilizados
2. **ÁNGULOS ÚNICOS** — 3 enfoques originales que diferenciarían al canal de la competencia
3. **IDEAS DE VÍDEOS CONCRETOS** — 8 ideas de vídeos con título sugerido, por qué funcionaría y qué busca el espectador
4. **PALABRAS CLAVE** — 10 términos de búsqueda relevantes con potencial de posicionamiento
5. **FORMATO RECOMENDADO** — qué duración, estilo y frecuencia funcionan mejor en este nicho

Sé específico, práctico y orientado a resultados. Basa el análisis en patrones conocidos del nicho.`
  },

  script: {
    name: '🎬 Script Video',
    description: 'Estructura completa del script',
    inputs: ['tema', 'duracion', 'tono'],
    prompt: (data) => `Eres un experto en scripts para YouTube. Creas contenido que engancha.

TEMA: ${data.tema}
DURACIÓN: ${data.duracion} minutos
TONO: ${data.tono}

Crea estructura de script que:
- Engancha en primeros 5 segundos
- Es natural y conversacional
- Tiene flow lógico
- Mantiene engagement

FORMATO:

🎯 HOOK (0-5 segundos):
[Hook que engancha]

📌 INTRO (5-15 segundos):
[Introduce qué verá el viewer]

📍 BODY:

Punto 1: [Título]
  - [Detalle]
  - [Detalle]

Punto 2: [Título]
  - [Detalle]

🔴 OUTRO:
[Cierre + CTA para suscribirse]`
  }
};