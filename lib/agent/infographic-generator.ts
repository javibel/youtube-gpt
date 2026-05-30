/**
 * Builds infographic URLs from post content.
 * The actual rendering happens at /api/og/infographic (edge, ImageResponse).
 */

const BASE_URL = (process.env.NEXTAUTH_URL ?? 'https://ytubviral.com').trim().replace(/\/$/, '');

export type InfographicFormat = 'listicle' | 'micro-story' | 'hot-take' | 'framework';

// ── Content extraction ──────────────────────────────────────────────────────

function extractTitle(content: string): string {
  const firstLine = content.split('\n').find(l => l.trim().length > 10);
  if (!firstLine) return 'YouTube Tips';
  return firstLine
    .replace(/#\S+/g, '')
    .replace(/[^\w\sáéíóúñüÁÉÍÓÚÑÜ¿?¡!.,:\-–—%()'"]/g, '')
    .trim()
    .slice(0, 120);
}

function extractPoints(content: string): string[] {
  const lines = content.split('\n').filter(l => l.trim());
  const points: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^(\d+[./)]\s|[✅❌📊🔥💡🎯⚡]\s|[-•]\s)/.test(trimmed)) {
      const clean = trimmed.replace(/^(\d+[./)]\s|[✅❌📊🔥💡🎯⚡]\s|[-•]\s)/, '').trim();
      if (clean.length > 5 && clean.length < 200) {
        points.push(clean);
      }
    }
  }
  return points.slice(0, 6);
}

function extractQuote(content: string): string {
  const sentences = content
    .split(/[.!?]\s/)
    .map(s => s.trim())
    .filter(s => s.length > 20 && s.length < 150 && !s.startsWith('#'));

  const scored = sentences.map(s => ({
    text: s,
    score: (s.match(/\d+%?/g)?.length ?? 0) * 2 +
           (s.match(/nunca|siempre|error|secreto|nadie|todos|clave|brutal|never|always|secret|nobody|key/gi)?.length ?? 0),
  }));

  scored.sort((a, b) => b.score - a.score);
  return (scored[0]?.text ?? sentences[0] ?? 'YouTube Growth Tips').replace(/[.!?]$/, '');
}

// ── Format rotation (synced with content-generator.ts) ──────────────────────

const FORMATS: InfographicFormat[] = ['listicle', 'micro-story', 'hot-take', 'framework'];

export function getTodayInfographicFormat(): InfographicFormat {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  return FORMATS[dayOfYear % FORMATS.length];
}

// ── Day theme tags (mirror content-generator.ts themes) ─────────────────────

const DAY_TAGS: Record<number, string> = {
  0: 'Dato YouTube',
  1: 'Error Común',
  2: 'Tip Práctico',
  3: 'Tutorial',
  4: 'Herramienta',
  5: 'Debate',
  6: 'Comparativa',
};

// ── Public API ──────────────────────────────────────────────────────────────

export function buildInfographicUrl(content: string, format?: InfographicFormat): string {
  const fmt = format ?? getTodayInfographicFormat();
  const tag = DAY_TAGS[new Date().getDay()] ?? 'YouTube Tips';
  const params = new URLSearchParams();
  params.set('format', fmt === 'micro-story' ? 'story' : fmt);
  params.set('tag', tag);

  switch (fmt) {
    case 'listicle': {
      params.set('title', extractTitle(content));
      const points = extractPoints(content);
      points.forEach((p, i) => params.set(`p${i + 1}`, p.slice(0, 100)));
      // Fallback to story if not enough points
      if (points.length < 2) {
        params.set('format', 'story');
        params.set('quote', extractQuote(content));
      }
      break;
    }
    case 'micro-story':
      params.set('quote', extractQuote(content));
      break;
    case 'hot-take':
      params.set('quote', extractQuote(content));
      break;
    case 'framework': {
      params.set('title', extractTitle(content));
      const steps = extractPoints(content);
      if (steps.length >= 3) {
        steps.forEach((s, i) => params.set(`p${i + 1}`, s.slice(0, 80)));
      } else {
        params.set('format', 'story');
        params.set('quote', extractQuote(content));
      }
      break;
    }
  }

  return `${BASE_URL}/api/og/infographic?${params.toString()}`;
}
