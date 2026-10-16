// Editorial data validation only. No result, key or serialized object confers
// admission, publication, native-session or recovery authority.
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export function abEditorialTitle(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 100 && value === value.trim()
    && !/[<>\x00-\x1f\x7f]/.test(value) && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value);
}
const comparable = (v: string) => v.normalize('NFKC').replace(/\s+/gu, ' ').toLowerCase();
export function abSuggestionInput(value: unknown): Readonly<{ title: string; lang: 'es' | 'en' }> {
  if (!object(value) || Object.keys(value).sort().join(',') !== 'lang,title' || !abEditorialTitle(value.title)
    || value.lang !== 'es' && value.lang !== 'en') throw Error('Title required');
  return Object.freeze({ title: value.title, lang: value.lang });
}
export function abSuggestedVariants(value: unknown, originalTitle: string): Readonly<{ variantA: string; variantB: string }> {
  if (!abEditorialTitle(originalTitle) || !object(value) || Object.keys(value).sort().join(',') !== 'variantA,variantB'
    || !abEditorialTitle(value.variantA) || !abEditorialTitle(value.variantB)
    || comparable(value.variantA) === comparable(value.variantB)
    || [value.variantA, value.variantB].some(v => comparable(v) === comparable(originalTitle))) throw Error('ab_suggestions_unconfirmed');
  return Object.freeze({ variantA: value.variantA, variantB: value.variantB });
}
