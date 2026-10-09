'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { TextItem } from '@/lib/thumbnail-types';

const systemFonts = new Set(['Impact', 'Arial Black', 'Arial']);
const webFonts = new Set(['Bebas Neue', 'Anton', 'Oswald']);

// The signature includes the actual glyphs and style used by the canvas. A prior
// font acknowledgement cannot enable capture after an edit or account change.
export function thumbnailFontSignature(texts: TextItem[]): string {
  return JSON.stringify(texts.filter(t => t.text.trim()).map(t => [t.fontFamily, t.fontStyle, t.fontSize, t.text]));
}

export function useThumbnailFonts(texts: TextItem[], resourceScope: object): boolean {
  const signature = thumbnailFontSignature(texts);
  const request = useMemo(() => ({ active: true }), [signature, resourceScope]);
  const current = useRef(request); current.current = request;
  const [loaded, setLoaded] = useState<typeof request | null>(null);
  useEffect(() => {
    request.active = true;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let settled = false;
    const valid = () => request.active && current.current === request && !settled;
    const finish = (success: boolean) => {
      if (!valid()) return;
      settled = true; timers.forEach(clearTimeout); timers.clear();
      setLoaded(success ? request : null);
    };
    const requirements = texts.filter(t => t.text.trim());
    if (!requirements.length) return () => { request.active = false; };
    if (typeof document === 'undefined' || !document.fonts?.load) {
      finish(false); return () => { request.active = false; };
    }
    const deadline = setTimeout(() => finish(false), 30_000); timers.add(deadline);
    const load = (t: TextItem): Promise<boolean> => new Promise(resolve => {
      const attempt = async () => {
        if (!valid()) { resolve(false); return; }
        if ((!systemFonts.has(t.fontFamily) && !webFonts.has(t.fontFamily))
          || !Number.isFinite(t.fontSize) || t.fontSize <= 0 || t.fontSize > 1000
          || !['', 'normal', 'bold', 'italic', 'bold italic', 'italic bold'].includes(t.fontStyle || '')) {
          resolve(false); return;
        }
        const descriptor = (t.fontStyle?.includes('italic') ? 'italic' : 'normal') + ' '
          + (t.fontStyle?.includes('bold') ? '700' : '400') + ' ' + t.fontSize + 'px "' + t.fontFamily + '"';
        try {
          const faces = await document.fonts.load(descriptor, t.text);
          if (!valid()) { resolve(false); return; }
          // System fonts do not have FontFace entries. Named web fonts must
          // have a loaded face; an absent stylesheet also returns an empty list.
          if ((systemFonts.has(t.fontFamily) || faces.length > 0) && faces.every(face => face.status === 'loaded')) {
            resolve(true); return;
          }
          // The stylesheet can register the face after this effect starts. Keep
          // the existing resource policy and bound the wait, never accept fallback.
          const timer = setTimeout(() => { timers.delete(timer); void attempt(); }, 250); timers.add(timer);
        } catch { resolve(false); }
      };
      void attempt();
    });
    void Promise.all(requirements.map(load)).then(results => finish(results.every(Boolean)));
    return () => { request.active = false; settled = true; timers.forEach(clearTimeout); timers.clear(); };
  }, [request, signature]);
  return signature === '[]' || (loaded === request && request.active);
}
