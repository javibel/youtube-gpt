// SEO programático — Fase 1 del roadmap SEO.
// Genera páginas "ideas de títulos para canales de [nicho]" a escala desde una plantilla + datos.
// Cada página es única (ideas específicas del nicho) para no caer en contenido fino/duplicado.

export type Lang = 'es' | 'en';

export interface Niche {
  slug: string;
  name: { es: string; en: string };
  topics: { es: string; en: string }[];
}

export const NICHES: Niche[] = [
  { slug: 'gaming', name: { es: 'gaming', en: 'gaming' }, topics: [
    { es: 'speedruns', en: 'speedruns' }, { es: 'jefes finales', en: 'boss fights' }, { es: 'juegos indie', en: 'indie games' }, { es: 'builds y trucos', en: 'builds and tricks' }, { es: 'tier lists', en: 'tier lists' } ] },
  { slug: 'cocina', name: { es: 'cocina', en: 'cooking' }, topics: [
    { es: 'recetas rápidas', en: 'quick recipes' }, { es: 'postres', en: 'desserts' }, { es: 'meal prep', en: 'meal prep' }, { es: 'recetas baratas', en: 'cheap recipes' }, { es: 'cocina sin horno', en: 'no-oven cooking' } ] },
  { slug: 'fitness', name: { es: 'fitness', en: 'fitness' }, topics: [
    { es: 'rutinas en casa', en: 'home workouts' }, { es: 'perder grasa', en: 'losing fat' }, { es: 'ganar músculo', en: 'building muscle' }, { es: 'abdominales', en: 'abs' }, { es: 'movilidad', en: 'mobility' } ] },
  { slug: 'finanzas', name: { es: 'finanzas personales', en: 'personal finance' }, topics: [
    { es: 'ahorrar dinero', en: 'saving money' }, { es: 'invertir', en: 'investing' }, { es: 'fondos indexados', en: 'index funds' }, { es: 'hacer un presupuesto', en: 'budgeting' }, { es: 'salir de deudas', en: 'getting out of debt' } ] },
  { slug: 'tecnologia', name: { es: 'tecnología', en: 'tech' }, topics: [
    { es: 'reviews de móviles', en: 'phone reviews' }, { es: 'montar un PC', en: 'building a PC' }, { es: 'gadgets baratos', en: 'cheap gadgets' }, { es: 'trucos de Android', en: 'Android tricks' }, { es: 'inteligencia artificial', en: 'artificial intelligence' } ] },
  { slug: 'belleza', name: { es: 'belleza y maquillaje', en: 'beauty and makeup' }, topics: [
    { es: 'maquillaje de día', en: 'everyday makeup' }, { es: 'skincare', en: 'skincare' }, { es: 'rutina coreana', en: 'Korean routine' }, { es: 'pieles grasas', en: 'oily skin' }, { es: 'trucos de maquillaje', en: 'makeup hacks' } ] },
  { slug: 'viajes', name: { es: 'viajes', en: 'travel' }, topics: [
    { es: 'viajar barato', en: 'budget travel' }, { es: 'viajar de mochilero', en: 'backpacking' }, { es: 'viajar solo', en: 'solo travel' }, { es: 'errores al viajar', en: 'travel mistakes' }, { es: 'destinos baratos', en: 'cheap destinations' } ] },
  { slug: 'moda', name: { es: 'moda', en: 'fashion' }, topics: [
    { es: 'cómo combinar ropa', en: 'matching outfits' }, { es: 'fondo de armario', en: 'capsule wardrobe' }, { es: 'comprar ropa barata', en: 'cheap clothing hauls' }, { es: 'tendencias', en: 'trends' }, { es: 'estilo minimalista', en: 'minimalist style' } ] },
  { slug: 'desarrollo-personal', name: { es: 'desarrollo personal', en: 'self-improvement' }, topics: [
    { es: 'productividad', en: 'productivity' }, { es: 'crear hábitos', en: 'building habits' }, { es: 'motivación', en: 'motivation' }, { es: 'despertarse temprano', en: 'waking up early' }, { es: 'dejar de procrastinar', en: 'stop procrastinating' } ] },
  { slug: 'estudio', name: { es: 'educación y estudio', en: 'studying' }, topics: [
    { es: 'técnicas de estudio', en: 'study techniques' }, { es: 'aprobar exámenes', en: 'passing exams' }, { es: 'memorizar', en: 'memorizing' }, { es: 'tomar apuntes', en: 'taking notes' }, { es: 'concentración', en: 'focus' } ] },
  { slug: 'musica', name: { es: 'música', en: 'music' }, topics: [
    { es: 'aprender guitarra', en: 'learning guitar' }, { es: 'producción musical', en: 'music production' }, { es: 'cantar mejor', en: 'singing better' }, { es: 'teoría musical', en: 'music theory' }, { es: 'montar un home studio', en: 'building a home studio' } ] },
  { slug: 'vlogs', name: { es: 'vlogs y estilo de vida', en: 'vlogs and lifestyle' }, topics: [
    { es: 'un día en mi vida', en: 'a day in my life' }, { es: 'rutina de mañana', en: 'morning routine' }, { es: 'minimalismo', en: 'minimalism' }, { es: 'organización', en: 'getting organized' }, { es: 'mudanza', en: 'moving house' } ] },
  { slug: 'negocios', name: { es: 'negocios y emprendimiento', en: 'business and entrepreneurship' }, topics: [
    { es: 'montar un negocio', en: 'starting a business' }, { es: 'ganar dinero online', en: 'making money online' }, { es: 'marca personal', en: 'personal branding' }, { es: 'ventas', en: 'sales' }, { es: 'ser freelance', en: 'going freelance' } ] },
  { slug: 'marketing', name: { es: 'marketing digital', en: 'digital marketing' }, topics: [
    { es: 'redes sociales', en: 'social media' }, { es: 'SEO', en: 'SEO' }, { es: 'email marketing', en: 'email marketing' }, { es: 'anuncios', en: 'paid ads' }, { es: 'contenido viral', en: 'viral content' } ] },
  { slug: 'criptomonedas', name: { es: 'criptomonedas', en: 'crypto' }, topics: [
    { es: 'Bitcoin', en: 'Bitcoin' }, { es: 'invertir en cripto', en: 'investing in crypto' }, { es: 'errores con cripto', en: 'crypto mistakes' }, { es: 'altcoins', en: 'altcoins' }, { es: 'seguridad en cripto', en: 'crypto security' } ] },
  { slug: 'fotografia', name: { es: 'fotografía', en: 'photography' }, topics: [
    { es: 'fotografía con el móvil', en: 'phone photography' }, { es: 'retrato', en: 'portraits' }, { es: 'edición en Lightroom', en: 'editing in Lightroom' }, { es: 'composición', en: 'composition' }, { es: 'fotografía nocturna', en: 'night photography' } ] },
  { slug: 'dibujo', name: { es: 'dibujo e ilustración', en: 'drawing and illustration' }, topics: [
    { es: 'aprender a dibujar', en: 'learning to draw' }, { es: 'dibujo digital', en: 'digital art' }, { es: 'anatomía', en: 'anatomy' }, { es: 'colorear', en: 'coloring' }, { es: 'dibujar manga', en: 'drawing manga' } ] },
  { slug: 'programacion', name: { es: 'programación', en: 'coding' }, topics: [
    { es: 'aprender a programar', en: 'learning to code' }, { es: 'tu primer proyecto', en: 'your first project' }, { es: 'errores de principiante', en: 'beginner mistakes' }, { es: 'qué lenguaje elegir', en: 'which language to pick' }, { es: 'montar un portfolio', en: 'building a portfolio' } ] },
  { slug: 'idiomas', name: { es: 'aprender idiomas', en: 'language learning' }, topics: [
    { es: 'aprender inglés', en: 'learning English' }, { es: 'vocabulario', en: 'vocabulary' }, { es: 'hablar con fluidez', en: 'speaking fluently' }, { es: 'errores comunes', en: 'common mistakes' }, { es: 'apps para aprender', en: 'learning apps' } ] },
  { slug: 'jardineria', name: { es: 'jardinería', en: 'gardening' }, topics: [
    { es: 'huerto en casa', en: 'home vegetable garden' }, { es: 'plantas de interior', en: 'houseplants' }, { es: 'suculentas', en: 'succulents' }, { es: 'compost', en: 'composting' }, { es: 'plagas', en: 'pests' } ] },
  { slug: 'crianza', name: { es: 'crianza y familia', en: 'parenting' }, topics: [
    { es: 'recién nacidos', en: 'newborns' }, { es: 'el sueño del bebé', en: 'baby sleep' }, { es: 'alimentación infantil', en: 'feeding kids' }, { es: 'rabietas', en: 'tantrums' }, { es: 'rutinas en familia', en: 'family routines' } ] },
  { slug: 'salud', name: { es: 'salud y bienestar', en: 'health and wellness' }, topics: [
    { es: 'dormir mejor', en: 'sleeping better' }, { es: 'reducir la ansiedad', en: 'reducing anxiety' }, { es: 'comer sano', en: 'eating healthy' }, { es: 'tener más energía', en: 'getting more energy' }, { es: 'hábitos saludables', en: 'healthy habits' } ] },
  { slug: 'coches', name: { es: 'coches y motor', en: 'cars and motoring' }, topics: [
    { es: 'comprar coche', en: 'buying a car' }, { es: 'mantenimiento', en: 'maintenance' }, { es: 'coches eléctricos', en: 'electric cars' }, { es: 'trucos al volante', en: 'driving tips' }, { es: 'reviews de coches', en: 'car reviews' } ] },
  { slug: 'manualidades', name: { es: 'manualidades y DIY', en: 'crafts and DIY' }, topics: [
    { es: 'decoración', en: 'home decor' }, { es: 'reciclaje creativo', en: 'upcycling' }, { es: 'regalos hechos a mano', en: 'handmade gifts' }, { es: 'organización', en: 'organizing' }, { es: 'ideas baratas', en: 'cheap ideas' } ] },
];

const COUNTS = [3, 5, 7, 10];

// Frameworks de títulos probados. Cada uno recibe el topic y un número.
// Construidos para leer natural tanto con sustantivos ("speedruns") como con
// infinitivos ("ahorrar dinero") — el topic va tras dos puntos o preposición.
const FRAMEWORKS: { es: (t: string, n: number) => string; en: (t: string, n: number) => string }[] = [
  { es: (t) => `${cap(t)}: guía para principiantes en 2026`, en: (t) => `${cap(t)}: a beginner's guide for 2026` },
  { es: (t, n) => `${n} errores de ${t} que frenan tu canal`, en: (t, n) => `${n} ${t} mistakes that hold your channel back` },
  { es: (t) => `La verdad sobre ${t} que nadie te cuenta`, en: (t) => `The truth about ${t} nobody tells you` },
  { es: (t, n) => `${n} trucos de ${t} que sí funcionan`, en: (t, n) => `${n} ${t} tricks that actually work` },
  { es: (t) => `${cap(t)} para principiantes: por dónde empezar`, en: (t) => `${cap(t)} for beginners: where to start` },
  { es: (t) => `Todo lo que necesitas saber sobre ${t}`, en: (t) => `Everything you need to know about ${t}` },
  { es: (t, n) => `${n} consejos de ${t} que ojalá supiera antes`, en: (t, n) => `${n} ${t} tips I wish I knew sooner` },
  { es: (t) => `Cómo mejorar en ${t} (guía rápida)`, en: (t) => `How to get better at ${t} (quick guide)` },
  { es: (t, n) => `${n} ideas de ${t} para tu próximo vídeo`, en: (t, n) => `${n} ${t} ideas for your next video` },
  { es: (t) => `${cap(t)}: lo que de verdad funciona`, en: (t) => `${cap(t)}: what actually works` },
];

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Genera ideas de títulos únicas y variadas para un nicho (determinista, sin azar).
export function generateTitleIdeas(niche: Niche, lang: Lang, max = 24): string[] {
  const out: string[] = [];
  const topics = niche.topics;
  // Recorrer topic × framework para máxima variedad antes de repetir.
  for (let ti = 0; ti < topics.length && out.length < max; ti++) {
    for (let fi = 0; fi < FRAMEWORKS.length && out.length < max; fi++) {
      const topic = lang === 'en' ? topics[ti].en : topics[ti].es;
      const n = COUNTS[(ti + fi) % COUNTS.length];
      const title = lang === 'en' ? FRAMEWORKS[fi].en(topic, n) : FRAMEWORKS[fi].es(topic, n);
      if (!out.includes(title)) out.push(title);
    }
  }
  return out.slice(0, max);
}

export function getNiche(slug: string): Niche | undefined {
  return NICHES.find(n => n.slug === slug);
}
