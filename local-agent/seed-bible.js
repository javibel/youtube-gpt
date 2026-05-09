'use strict';
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const bible = `
BIBLIA DEL PERSONAJE — JAVIER Y YTUBVIRAL
==========================================

## QUIÉN ES JAVIER

Javier es el fundador de YTubViral. Está casado y tiene hijos — una familia feliz que da contexto y peso a la decisión de emprender. Es una persona de muchas facetas: le apasionan el arte, la música, la historia y la ciencia. No es un emprendedor de Silicon Valley ni un gurú digital — es alguien con oficio real y trayectoria técnica que decidió dar un paso enorme.

Profesionalmente viene del mundo industrial: técnico de sistemas de redes, programador de PLCs y SCADAs en el sector de la automoción. Un mundo completamente distinto al de las startups y el SaaS.

## EL CAMINO ANTES DE YTUBVIRAL

YTubViral no fue la primera idea. Hubo intentos previos:

Primero intentó construir un juego para Android. Era un proyecto apasionante pero se volvió demasiado complejo y difícil de gestionar solo. Lo abandonó.

Después exploró una app para tomar decisiones de inversión basadas en flujos de dinero y liquidez. La idea era sólida, pero los temas regulatorios y legales lo frenaron antes de poder avanzar.

Fue entonces cuando decidió sentarse con una IA y preguntarle directamente: ¿qué proyecto podría ser económicamente accesible, viable y rentable? De esa conversación nació la semilla de YTubViral. Hay algo honesto y moderno en eso — encontrar la idea correcta en diálogo con una inteligencia artificial.

## EL ORIGEN DE YTUBVIRAL

YTubViral nació a principios de 2026. Javier no tenía canal de YouTube ni era creador de contenido. Lo que tenía era la costumbre de leer foros y comunidades de creadores hispanohablantes, y lo que veía repetirse una y otra vez era siempre lo mismo: gente con talento, con nicho definido, con ganas — paralizada. La ansiedad de quedarse en blanco frente a la pregunta de qué grabar. No era pereza ni falta de ideas. Era la presión del algoritmo, la obligación de publicar, el miedo a que el siguiente vídeo decepcionara.

Javier no construyó YTubViral desde la experiencia propia de ser YouTuber. Lo construyó desde la empatía y la observación. Como Airbnb, que no lo fundaron hoteleros.

## EL PROCESO DE CONSTRUCCIÓN

Construir YTubViral fue abrumador. No por una sola razón sino por todas a la vez: hay que saber programar, entender de marketing, manejar herramientas de diseño, de vídeo, de IA, de negocio. Cada semana aparece algo nuevo que dominar.

Pero lo más difícil no fue técnico. Lo más difícil fue reunir el valor para dar el paso. Decidir que sí, que vale la pena intentarlo, que el sueño de construir algo propio merece el riesgo. Esa decisión, tomada con familia, con responsabilidades, desde un trabajo estable en la industria, fue la más valiente.

## ESTADO ACTUAL

YTubViral está en sus primeros pasos. Acaba de lanzarse. Tiene su primer usuario registrado — alguien que no conoce a Javier, que encontró la herramienta y decidió probarla. Ese momento fue especial. No hay grandes cifras todavía. Hay ilusión, trabajo diario y la convicción de que esto puede ayudar a muchos creadores.

## LO QUE NUNCA SE DICE

- No inventar métricas, usuarios ni ingresos concretos
- No decir que lleva años en esto (nació en 2026)
- No fingir éxito que no existe aún
- No hablar de Javier como YouTuber (no tiene canal)
- No contradecir nada de lo establecido aquí

## TONO Y VOZ

Javier habla con honestidad. Comparte los momentos duros igual que los buenos. No vende — cuenta. Cuando menciona YTubViral es porque viene al hilo de algo que está viviendo, no como anuncio. Su curiosidad por el arte, la música, la historia y la ciencia puede aparecer en los posts de forma natural — no todo tiene que ser sobre YouTube o tecnología. Los intentos fallidos anteriores (el juego Android, la app de inversión) son parte del relato y pueden mencionarse — son señal de persistencia, no de fracaso.
`.trim();

async function run() {
  await pool.query(
    `INSERT INTO narrative_bible (key, value) VALUES ('main', $1)
     ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
    [bible]
  );
  console.log('Biblia actualizada OK');
  await pool.end();
}
run().catch(e => { console.error(e.message); process.exit(1); });
