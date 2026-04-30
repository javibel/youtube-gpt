/**
 * Estimated search volume for YouTube keywords.
 *
 * Combines 4 free signals:
 *   1. Average views of top 5 videos (35%)
 *   2. Google Trends interest (30%) — with fallback
 *   3. YouTube totalResults (20%)
 *   4. Autocomplete position (15%)
 */

export interface VolumeEstimate {
  score: number;       // 0-100
  label: string;       // ES label
  labelEn: string;     // EN label
  range: string;       // "10K-100K busq/mes"
  rangeEn: string;     // "10K-100K searches/mo"
}

// ── Normalisation helpers ────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

/** Log-10 scale normalised to 0-100 (10M = 100). */
function logNorm(value: number): number {
  if (value <= 0) return 0;
  return clamp((Math.log10(value) / 7) * 100, 0, 100);
}

// ── Google Trends ────────────────────────────────────────────────────────────

export async function fetchGoogleTrends(keyword: string): Promise<number | null> {
  try {
    const req = JSON.stringify({
      comparisonItem: [{ keyword, geo: 'ES', time: 'today 12-m' }],
      category: 0,
      property: 'youtube',
    });

    const exploreRes = await fetch(
      `https://trends.google.com/trends/api/explore?hl=es&tz=-60&req=${encodeURIComponent(req)}`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(5000),
      },
    );

    if (!exploreRes.ok) return null;

    const exploreText = (await exploreRes.text()).replace(/^\)\]\}'/, '');
    const exploreData = JSON.parse(exploreText);

    const timelineWidget = exploreData.widgets?.find(
      (w: { id: string }) => w.id === 'TIMESERIES',
    );
    if (!timelineWidget) return null;

    const token = timelineWidget.token;
    const widgetReq = encodeURIComponent(JSON.stringify(timelineWidget.request));

    const tlRes = await fetch(
      `https://trends.google.com/trends/api/widgetdata/multiline?hl=es&tz=-60&req=${widgetReq}&token=${token}`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(5000),
      },
    );

    if (!tlRes.ok) return null;

    const tlText = (await tlRes.text()).replace(/^\)\]\}'/, '');
    const tlData = JSON.parse(tlText);

    const points: { value: number[] }[] = tlData?.default?.timelineData ?? [];
    if (points.length === 0) return null;

    const avg = points.reduce((s, p) => s + (p.value?.[0] ?? 0), 0) / points.length;
    return Math.round(avg);
  } catch {
    return null;
  }
}

// ── Autocomplete position score ──────────────────────────────────────────────

export async function autocompleteScore(
  keyword: string,
  existingSuggestions: string[],
): Promise<number> {
  // Base score from number of suggestions the keyword generates
  const base = clamp((existingSuggestions.length / 8) * 40, 0, 40);

  // Bonus: check if full keyword appears when searching a shorter prefix
  const words = keyword.trim().split(/\s+/);
  const prefix = words.length > 2 ? words.slice(0, 2).join(' ') : words[0];

  try {
    const url = `https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(prefix)}&hl=es`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    const text = await res.text();
    const match = text.match(/\["[^"]*",\s*\[([\s\S]*?)\]\s*\]/);
    if (!match) return base;

    const suggestions: string[] = [];
    const itemPattern = /\["([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = itemPattern.exec(match[1])) !== null) {
      suggestions.push(m[1].toLowerCase());
    }

    const kw = keyword.toLowerCase();
    const idx = suggestions.findIndex((s) => s.includes(kw) || kw.includes(s));
    if (idx >= 0) {
      // Found in prefix autocomplete — strong popularity signal
      return clamp(base + 60 * ((8 - idx) / 8), 0, 100);
    }
  } catch {
    // ignore
  }

  return base;
}

// ── Main estimator ───────────────────────────────────────────────────────────

interface VolumeInput {
  keyword: string;
  totalResults: number;
  avgViews: number;
  relatedKeywords: string[];
  trendsScore: number | null;
}

const BUCKETS: {
  min: number;
  label: string;
  labelEn: string;
  range: string;
  rangeEn: string;
}[] = [
  { min: 80, label: 'Muy Alto', labelEn: 'Very High', range: '100K+ busq/mes', rangeEn: '100K+ searches/mo' },
  { min: 60, label: 'Alto', labelEn: 'High', range: '10K-100K busq/mes', rangeEn: '10K-100K searches/mo' },
  { min: 40, label: 'Medio', labelEn: 'Medium', range: '1K-10K busq/mes', rangeEn: '1K-10K searches/mo' },
  { min: 20, label: 'Bajo', labelEn: 'Low', range: '100-1K busq/mes', rangeEn: '100-1K searches/mo' },
  { min: 0, label: 'Muy Bajo', labelEn: 'Very Low', range: '<100 busq/mes', rangeEn: '<100 searches/mo' },
];

export async function estimateSearchVolume(input: VolumeInput): Promise<VolumeEstimate> {
  const normTotal = logNorm(input.totalResults);
  const normViews = logNorm(input.avgViews);
  const acScore = await autocompleteScore(input.keyword, input.relatedKeywords);

  let rawScore: number;

  if (input.trendsScore !== null) {
    rawScore =
      0.35 * normViews +
      0.30 * input.trendsScore +
      0.20 * normTotal +
      0.15 * acScore;
  } else {
    // Fallback: redistribute Trends weight
    rawScore =
      0.50 * normViews +
      0.28 * normTotal +
      0.22 * acScore;
  }

  const score = Math.round(clamp(rawScore, 0, 100));
  const bucket = BUCKETS.find((b) => score >= b.min) ?? BUCKETS[BUCKETS.length - 1];

  return {
    score,
    label: bucket.label,
    labelEn: bucket.labelEn,
    range: bucket.range,
    rangeEn: bucket.rangeEn,
  };
}
