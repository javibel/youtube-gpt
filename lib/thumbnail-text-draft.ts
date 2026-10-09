import type { TextItem } from './thumbnail-types';
// Untrusted editable text only: no pixels, receipt keys, timestamps or authority.
export type TextDraft = { version: 1; texts: TextItem[]; selectedId: string | null };
export type StoredTextDraft = { record: TextDraft; serialized: string };
const maximum = 100_000;
const name = (userId: string, email: string, lang: string) => 'ytv:thumbnail-text-draft:v1:' + JSON.stringify([userId,email,lang]);
const scoped = (userId: unknown, email: unknown, status: string, lang: string) => status === 'authenticated' && typeof userId === 'string' && userId.length > 0 && userId.length <= 2000 && typeof email === 'string' && email.length > 0 && email.length <= 2000 && ['es','en'].includes(lang);
export function parseTextDraft(value: string | null): StoredTextDraft | null {
  if (!value || value.length > maximum) return null;
  try {
    const v = JSON.parse(value);
    if (!v || Array.isArray(v) || v.version !== 1 || Object.keys(v).sort().join(',') !== 'selectedId,texts,version' || !Array.isArray(v.texts) || v.texts.length > 32) return null;
    const ids = new Set<string>();
    for (const t of v.texts) {
      if (!t || Array.isArray(t) || Object.keys(t).sort().join(',') !== 'fill,fontFamily,fontSize,fontStyle,id,rotation,stroke,strokeWidth,text,width,x,y'
        || typeof t.id !== 'string' || !/^text-[0-9]{1,12}$/.test(t.id) || ids.has(t.id)
        || typeof t.text !== 'string' || t.text.length > 5000
        || !['Impact','Arial Black','Bebas Neue','Anton','Oswald','Arial'].includes(t.fontFamily)
        || typeof t.fill !== 'string' || !/^#[a-fA-F0-9]{6}$/.test(t.fill)
        || typeof t.stroke !== 'string' || !/^#[a-fA-F0-9]{6}$/.test(t.stroke)
        || !['','bold','italic','bold italic','italic bold'].includes(t.fontStyle)) return null;
      for (const key of ['x','y','width','fontSize','strokeWidth','rotation']) if (typeof t[key] !== 'number' || !Number.isFinite(t[key])) return null;
      if (Math.abs(t.x) > 10000 || Math.abs(t.y) > 10000 || t.width < 1 || t.width > 10000 || t.fontSize < 8 || t.fontSize > 1000 || t.strokeWidth < 0 || t.strokeWidth > 100 || Math.abs(t.rotation) > 36000) return null;
      ids.add(t.id);
    }
    if (v.selectedId !== null && (typeof v.selectedId !== 'string' || !ids.has(v.selectedId))) return null;
    return { record: v, serialized: value };
  } catch { return null; }
}
export function readTextDraft(userId: string | undefined, email: string | null | undefined, status: string, lang: string): StoredTextDraft | null {
  if (!scoped(userId,email,status,lang)) return null;
  try { return parseTextDraft(sessionStorage.getItem(name(userId!,email!,lang))); } catch { return null; }
}
export function storeTextDraft(userId: string, email: string, lang: string, record: TextDraft): boolean {
  if (!scoped(userId,email,'authenticated',lang)) return false;
  try {
    const value = JSON.stringify(record); if (!parseTextDraft(value)) return false;
    const slot = name(userId,email,lang); sessionStorage.setItem(slot,value); return sessionStorage.getItem(slot) === value;
  } catch { return false; }
}
export function discardTextDraft(userId: string, email: string, lang: string, expected: string): boolean {
  if (!scoped(userId,email,'authenticated',lang) || !parseTextDraft(expected)) return false;
  try { const slot = name(userId,email,lang); if (sessionStorage.getItem(slot) !== expected) return false; sessionStorage.removeItem(slot); return sessionStorage.getItem(slot) === null; } catch { return false; }
}
