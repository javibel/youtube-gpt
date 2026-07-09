// Datos del data study de títulos, por tema — alimenta /youtube-title-study/[topic].
// Fuente: data/title-study-2026-07.json (recogido 2026-07-09 vía YouTube Data API v3,
// scripts en local-agent/title-study-{collect,niches}.js). Slugs alineados con
// lib/niches-data.ts (mismo "gaming"/"cocina"/... que /youtube-title-ideas) para
// poder cruzar enlaces entre ambas herramientas SEO.
import studyData from '@/data/title-study-2026-07.json';

export type Lang = 'es' | 'en';

interface TopicStats {
  id: string;
  label: { es: string; en: string };
  sampleSize: number;
  titleLength: { avgChars: number; medianChars: number; avgWords: number; medianWords: number };
  features: {
    withNumber: number; withBrackets: number; withQuestion: number; withColon: number;
    withAllCapsWord: number; howTo: number; listicle: number; withHookWord: number;
  };
}

const TOPIC_NAMES: Record<string, { es: string; en: string }> = {
  gaming: { es: 'gaming', en: 'gaming' },
  cocina: { es: 'cocina', en: 'cooking' },
  fitness: { es: 'fitness', en: 'fitness' },
  tecnologia: { es: 'tecnología', en: 'tech' },
  belleza: { es: 'belleza y maquillaje', en: 'beauty and makeup' },
  viajes: { es: 'viajes', en: 'travel' },
  finanzas: { es: 'finanzas personales', en: 'personal finance' },
  estudio: { es: 'educación y estudio', en: 'studying' },
};

export const STUDY_META = {
  date: studyData.date as string,
  trending: studyData.trending,
  nicheGlobal: studyData.nicheGlobal,
};

export const TOPIC_SLUGS: string[] = (studyData.topics as TopicStats[]).map(t => t.id);

export function getTopicStudy(slug: string) {
  const topic = (studyData.topics as TopicStats[]).find(t => t.id === slug);
  if (!topic) return undefined;
  const name = TOPIC_NAMES[slug] || topic.label;
  return { ...topic, name, smallSample: topic.sampleSize < 30 };
}

export interface Finding {
  es: string;
  en: string;
}

type FeatureKey = keyof TopicStats['features'];
export type Metric = { key: FeatureKey; rowLabel: { es: string; en: string }; es: string; en: string; higherIsNotable: boolean };

// Config compartida entre la tabla comparativa y la generación de hallazgos.
export const METRIC_DEFS: Metric[] = [
  { key: 'withNumber', rowLabel: { es: 'Incluyen un número', en: 'Include a number' }, es: 'incluyen un número en el título', en: 'include a number in the title', higherIsNotable: true },
  { key: 'listicle', rowLabel: { es: 'Formato listicle', en: 'Listicle format' }, es: 'usan formato listicle ("7 trucos para...")', en: 'use a listicle format ("7 tips to...")', higherIsNotable: true },
  { key: 'withHookWord', rowLabel: { es: 'Palabra gancho', en: 'Hook word' }, es: 'incluyen una palabra gancho', en: 'include a hook word', higherIsNotable: true },
  { key: 'withQuestion', rowLabel: { es: 'Signo de interrogación', en: 'Question mark' }, es: 'usan signo de interrogación', en: 'use a question mark', higherIsNotable: true },
  { key: 'howTo', rowLabel: { es: 'Formato "cómo hacer"', en: '"How to" format' }, es: 'son formato "cómo hacer"', en: 'are "how to" format', higherIsNotable: true },
  { key: 'withBrackets', rowLabel: { es: 'Corchetes o paréntesis', en: 'Brackets or parentheses' }, es: 'llevan corchetes o paréntesis', en: 'have brackets or parentheses', higherIsNotable: false },
  { key: 'withAllCapsWord', rowLabel: { es: 'Palabra en MAYÚSCULAS', en: 'ALL-CAPS word' }, es: 'tienen una palabra en MAYÚSCULAS', en: 'have an ALL-CAPS word', higherIsNotable: false },
];

function fmtPct(v: number): string {
  return `${String(v).replace('.', ',')}%`;
}

// Genera los hallazgos comparando el tema contra el baseline de trending global —
// no hay copy inventado por nicho: son las 2-3 mayores diferencias reales calculadas.
export function computeFindings(slug: string): Finding[] {
  const topic = getTopicStudy(slug);
  if (!topic) return [];
  const t = studyData.trending;
  const metrics = METRIC_DEFS;

  const deltas = metrics.map(m => ({
    m,
    topicVal: topic.features[m.key],
    trendVal: t.features[m.key],
    delta: topic.features[m.key] - t.features[m.key],
  })).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const top2 = deltas.slice(0, 2).filter(d => Math.abs(d.delta) >= 3);
  const findings: Finding[] = top2.map(d => {
    const more = d.delta > 0;
    return {
      es: `El ${fmtPct(d.topicVal)} de los títulos top de ${topic.name.es} ${d.m.es} — frente al ${fmtPct(d.trendVal)} del trending global (${more ? 'notablemente más' : 'notablemente menos'} frecuente).`,
      en: `${fmtPct(d.topicVal)} of top ${topic.name.en} titles ${d.m.en} — vs. ${fmtPct(d.trendVal)} in global trending (${more ? 'notably more' : 'notably less'} common).`,
    };
  });

  // Longitud, siempre presente si la diferencia es apreciable (≥5 caracteres).
  const lenDelta = topic.titleLength.medianChars - t.titleLength.medianChars;
  if (Math.abs(lenDelta) >= 5) {
    findings.push({
      es: `La mediana de longitud en ${topic.name.es} es de ${topic.titleLength.medianChars} caracteres, frente a los ${t.titleLength.medianChars} del trending global.`,
      en: `The median length in ${topic.name.en} is ${topic.titleLength.medianChars} characters, vs. ${t.titleLength.medianChars} in global trending.`,
    });
  }

  return findings;
}
