'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Filtro de categorías del blog.
 *
 * Renderiza NULL a propósito. `useSearchParams` saca del prerender todo el árbol
 * cliente hasta el <Suspense> más cercano (docs de Next: use-search-params.md),
 * así que este componente no debe contener nada que Google necesite ver — antes
 * el boundary envolvía la página entera y el HTML de /blog salía SIN un solo
 * enlace a artículos. La lista la pinta el servidor; esto solo oculta lo que no
 * casa con ?cat= una vez hidratado. Sin JS se ven todos los posts, que es el
 * comportamiento correcto para un índice.
 */
export default function BlogFilter() {
  const cat = useSearchParams().get('cat') ?? '';

  useEffect(() => {
    const root = document.getElementById('blog-root');
    if (!root) return;

    let visible = 0;
    root.querySelectorAll<HTMLElement>('[data-cat]').forEach((el) => {
      const match = !cat || el.dataset.cat === cat;
      el.hidden = !match;
      if (match) visible += 1;
    });

    root.querySelectorAll<HTMLElement>('[data-chip]').forEach((el) => {
      const active = (el.dataset.chip ?? '') === cat;
      el.classList.toggle('soft-chip-active', active);
      el.classList.toggle('text-zinc-400', !active);
    });

    root.querySelectorAll<HTMLElement>('[data-catlink]').forEach((el) => {
      el.classList.toggle('bg-white/[0.04]', (el.dataset.catlink ?? '') === cat);
    });

    const empty = root.querySelector<HTMLElement>('[data-blog-empty]');
    if (empty) empty.hidden = visible > 0;
  }, [cat]);

  return null;
}
