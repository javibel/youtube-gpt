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