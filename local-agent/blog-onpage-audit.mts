// Auditoría SEO on-page del blog (G1). Ejecutar desde youtube-gpt/:
//   npx tsx ../local-agent/blog-onpage-audit.mts
import { BLOG_POSTS, ARTICLE_BODIES } from '../youtube-gpt/lib/blog-data';

type Block = { type: string; t?: string; href?: string; items?: string[] };

function audit(slug: string) {
  const body = (ARTICLE_BODIES[slug]?.es || []) as Block[];
  const post = BLOG_POSTS.find((p) => p.slug === slug);
  const text = body.filter((b) => b.type === 'p').map((b) => b.t).join(' ');
  const words = text.split(/\s+/).length;
  const h2 = body.filter((b) => b.type === 'h2');
  const h3 = body.filter((b) => b.type === 'h3').length;
  const links = body.filter((b) => (b.type === 'callout-mid' || b.type === 'callout-final') && b.href).map((b) => b.href!);
  const kw = slug.replace(/-/g, ' ').replace(/\b(2026|guia|gratis|free|tool)\b/g, '').trim();
  const firstP = (body.find((b) => b.type === 'p')?.t || '').toLowerCase();
  return { slug, cat: post?.cat, words, h2: h2.length, h3, links: links.length, hrefs: [...new Set(links)], kwInFirstP: firstP.includes(kw.split(' ').slice(0, 2).join(' ')) };
}

const rows = BLOG_POSTS.map((p) => audit(p.slug));
console.log('SLUG'.padEnd(46), 'WORDS H2 H3 LINKS KW-P1');
for (const r of rows) console.log(r.slug.padEnd(46), String(r.words).padEnd(5), String(r.h2).padEnd(2), String(r.h3).padEnd(2), String(r.links).padEnd(5), r.kwInFirstP ? 'sí' : 'NO');
const allHrefs: Record<string, number> = {};
rows.forEach((r) => r.hrefs.forEach((h) => (allHrefs[h] = (allHrefs[h] || 0) + 1)));
console.log('\nhrefs internos:', JSON.stringify(allHrefs));
