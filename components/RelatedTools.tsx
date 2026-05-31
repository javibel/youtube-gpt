import Link from 'next/link';
import type { Lang } from '@/lib/server-lang';
import { getRelatedFeatures } from '@/lib/features-data';

export default function RelatedTools({ slug, lang }: { slug: string; lang: Lang }) {
  const related = getRelatedFeatures(slug, 4);
  if (related.length === 0) return null;

  return (
    <section className="max-w-5xl mx-auto px-6 py-16">
      <h2 className="font-display font-bold text-2xl md:text-3xl text-center mb-10">
        {lang === 'en' ? 'Related tools' : 'Herramientas relacionadas'}
      </h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {related.map(f => (
          <Link
            key={f.slug}
            href={`/features/${f.slug}`}
            className="soft-card p-5 hover:border-white/20 transition group"
          >
            <p className="font-display font-semibold text-white group-hover:text-red-400 transition mb-1">
              {lang === 'en' ? f.title.en : f.title.es}
            </p>
            <p className="text-zinc-500 text-sm leading-relaxed">
              {lang === 'en' ? f.short.en : f.short.es}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
