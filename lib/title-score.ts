/**
 * Title Analyzer rubric (0-100) — the scorer behind /title-analyzer.
 *
 * Extracted from TitleAnalyzerClient so the page and the daily-ideas email grade
 * titles with the same code. Do NOT copy these rules into a prompt or a second
 * scorer: the SEO-score rubric is already duplicated across six files, and the
 * daily-ideas prompt drifted out of sync precisely because it carried its own copy.
 *
 * Note this grades a BARE TITLE. Published videos are graded by the SEO score
 * (app/api/youtube/seo-score), which is a different rubric over 93 points and
 * includes checks that need a description.
 */

export type Lang = 'es' | 'en';

export interface TitleCheck {
  key: string;
  label: { es: string; en: string };
  earned: number;
  weight: number;
  tip: { es: string; en: string };
}

// Palabras gancho de alto CTR (ES + EN). Lista deliberadamente amplia y verificada
// con patrones reales de títulos virales — no inventada.
export const POWER_WORDS = [
  // EN
  'how', 'why', 'best', 'easy', 'fast', 'free', 'new', 'now', 'secret', 'secrets',
  'proven', 'ultimate', 'simple', 'stop', 'never', 'always', 'avoid', 'mistake',
  'mistakes', 'truth', 'finally', 'instantly', 'guide', 'tips', 'hacks', 'hack',
  'tutorial', 'review', 'vs', 'before', 'after', 'worst', 'top', 'real', 'honest',
  'beginner', 'beginners', 'pro', 'expert', 'crazy', 'insane', 'shocking', 'huge',
  // ES
  'cómo', 'como', 'por qué', 'porque', 'mejor', 'mejores', 'fácil', 'rápido',
  'gratis', 'nuevo', 'nueva', 'secreto', 'secretos', 'probado', 'definitivo',
  'sencillo', 'deja', 'nunca', 'siempre', 'evita', 'error', 'errores', 'verdad',
  'por fin', 'al instante', 'guía', 'trucos', 'truco', 'tutorial', 'reseña',
  'antes', 'después', 'peor', 'top', 'real', 'honesto', 'principiante',
  'principiantes', 'experto', 'increíble', 'brutal', 'rápida',
];

export function analyzeTitle(title: string): { score: number; checks: TitleCheck[] } {
  const t = title.trim();
  const chars = t.length;
  const words = t.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const lower = t.toLowerCase();

  const checks: TitleCheck[] = [];

  // 1. Longitud (25) — ideal 40-70 chars
  let lengthEarned = 5;
  let lengthTip = { es: '', en: '' };
  if (chars >= 40 && chars <= 70) {
    lengthEarned = 25;
  } else if ((chars >= 30 && chars < 40) || (chars > 70 && chars <= 85)) {
    lengthEarned = 15;
    lengthTip = chars < 40
      ? { es: 'Algo corto. Apunta a 40-70 caracteres para aprovechar el espacio.', en: 'A bit short. Aim for 40-70 characters to use the available space.' }
      : { es: 'Algo largo. YouTube corta el título a ~70 caracteres en búsqueda.', en: 'A bit long. YouTube truncates titles at ~70 characters in search.' };
  } else {
    lengthEarned = 5;
    lengthTip = chars < 30
      ? { es: 'Demasiado corto. Los títulos de 40-70 caracteres rinden mejor.', en: 'Too short. Titles of 40-70 characters perform best.' }
      : { es: 'Demasiado largo. Se cortará en resultados y sugeridos.', en: 'Too long. It will be cut off in search and suggested.' };
  }
  checks.push({ key: 'length', weight: 25, earned: lengthEarned, label: { es: `Longitud (${chars} car.)`, en: `Length (${chars} chars)` }, tip: lengthTip });

  // 2. Número (15)
  const hasNumber = /\d/.test(t);
  checks.push({
    key: 'number', weight: 15, earned: hasNumber ? 15 : 0,
    label: { es: 'Número en el título', en: 'Number in title' },
    tip: hasNumber ? { es: '', en: '' } : { es: 'Un número concreto ("7 errores") mejora el CTR.', en: 'A specific number ("7 mistakes") improves CTR.' },
  });

  // 3. Palabras gancho (20)
  const powerHits = POWER_WORDS.filter(w => lower.includes(w)).length;
  let powerEarned = 0;
  if (powerHits >= 2) powerEarned = 20; else if (powerHits === 1) powerEarned = 14;
  checks.push({
    key: 'power', weight: 20, earned: powerEarned,
    label: { es: 'Palabras gancho', en: 'Hook / power words' },
    tip: powerEarned === 20 ? { es: '', en: '' } : { es: 'Usa palabras de impacto: cómo, mejor, fácil, secreto, evita, gratis...', en: 'Use power words: how, best, easy, secret, avoid, proven, fast...' },
  });

  // 4. Corchetes / paréntesis (10)
  const hasBrackets = /[[(].+[\])]/.test(t);
  checks.push({
    key: 'brackets', weight: 10, earned: hasBrackets ? 10 : 0,
    label: { es: 'Corchetes o paréntesis', en: 'Brackets or parentheses' },
    tip: hasBrackets ? { es: '', en: '' } : { es: 'Añade contexto entre paréntesis, p. ej. "(Explicado)".', en: 'Add context in parentheses, e.g. "(Explained)".' },
  });

  // 5. Nº de palabras (10) — ideal 4-9
  let wcEarned = 0;
  if (wordCount >= 4 && wordCount <= 9) wcEarned = 10;
  else if (wordCount === 3 || (wordCount >= 10 && wordCount <= 12)) wcEarned = 5;
  checks.push({
    key: 'words', weight: 10, earned: wcEarned,
    label: { es: `Nº de palabras (${wordCount})`, en: `Word count (${wordCount})` },
    tip: wcEarned === 10 ? { es: '', en: '' } : { es: 'Lo ideal son 4-9 palabras: suficiente contexto sin saturar.', en: 'Aim for 4-9 words: enough context without clutter.' },
  });

  // 6. Sin abuso de MAYÚSCULAS (10)
  const capsWords = words.filter(w => w.length >= 3 && w === w.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(w)).length;
  let capsEarned = 10;
  if (capsWords === 1) capsEarned = 7; else if (capsWords >= 2) capsEarned = 0;
  checks.push({
    key: 'caps', weight: 10, earned: capsEarned,
    label: { es: 'Uso de mayúsculas', en: 'Capitalization' },
    tip: capsEarned === 10 ? { es: '', en: '' } : { es: 'Demasiadas palabras EN MAYÚSCULAS parecen spam. Resalta solo 1.', en: 'Too many ALL-CAPS words look spammy. Emphasize just one.' },
  });

  // 7. Intención de búsqueda / gancho de curiosidad (10)
  const intentRe = /(how to|how |why |what |cómo |como |por qué|qué |\?)/i;
  const hasIntent = intentRe.test(' ' + lower);
  checks.push({
    key: 'intent', weight: 10, earned: hasIntent ? 10 : 0,
    label: { es: 'Gancho de intención', en: 'Search-intent hook' },
    tip: hasIntent ? { es: '', en: '' } : { es: 'Empezar con "Cómo", "Por qué" o una pregunta conecta con lo que la gente busca.', en: 'Starting with "How", "Why" or a question matches what people search.' },
  });

  const score = checks.reduce((s, c) => s + c.earned, 0);
  return { score: Math.round(score), checks };
}

/**
 * Which language to write to a creator in.
 *
 * User.lang defaults to "es" in the schema, so it cannot distinguish "chose Spanish"
 * from "never touched the setting" — most accounts read as Spanish by default even
 * when the creator publishes in English. Their own video titles are the honest signal.
 * Falls back to the stored preference only when there is no content to judge.
 */
export function detectCreatorLang(recentTitles: string[], storedLang?: string | null): Lang {
  const corpus = recentTitles.join(' ').toLowerCase();
  if (!corpus.trim()) return storedLang === 'en' ? 'en' : 'es';

  const spanishMarks = (corpus.match(/[áéíóúñ¿¡]/g) || []).length;
  const spanishWords = (corpus.match(/\b(el|la|los|las|de|del|que|para|con|cómo|por qué|una|más|este|esta)\b/g) || []).length;
  const englishWords = (corpus.match(/\b(the|of|and|to|for|with|how|why|this|that|your|what|from)\b/g) || []).length;

  const spanishScore = spanishMarks * 2 + spanishWords;
  if (spanishScore === 0 && englishWords === 0) return storedLang === 'en' ? 'en' : 'es';
  return spanishScore >= englishWords ? 'es' : 'en';
}
