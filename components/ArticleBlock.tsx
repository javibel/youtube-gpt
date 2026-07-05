import Link from 'next/link';
import type { BlockType, Lang } from '@/lib/blog-data';
import { BagIcon } from '@/components/icons';

export default function ArticleBlock({ block, lang }: { block: BlockType; lang: Lang }) {
  if (block.type === 'p') {
    return <p className="text-zinc-300 leading-relaxed text-[17px] mb-5">{block.t}</p>;
  }
  if (block.type === 'h2') {
    return (
      <h2
        id={block.t.toLowerCase().replace(/[^a-z0-9áéíóú\s]/gi, '').replace(/\s+/g, '-').slice(0, 60)}
        className="font-display font-bold text-2xl md:text-3xl mt-12 mb-5"
      >
        {block.t}
      </h2>
    );
  }
  if (block.type === 'h3') {
    return <h3 className="font-display font-bold text-xl mt-8 mb-4 text-zinc-200">{block.t}</h3>;
  }
  if (block.type === 'list') {
    return (
      <ul className="space-y-2.5 mb-6 pl-1">
        {block.items.map((item, i) => (
          <li key={i} className="flex items-start gap-3 text-zinc-300 text-[16px]">
            <span className="mt-1 shrink-0 w-5 h-5 flex items-center justify-center" style={{ color: 'var(--red)' }}>▸</span>
            {item}
          </li>
        ))}
      </ul>
    );
  }
  if (block.type === 'callout') {
    return (
      <div className="my-8 border-l-4 pl-6 py-4" style={{ borderColor: 'var(--red)', background: 'rgba(232,77,91,0.06)' }}>
        <p className="font-display font-bold text-lg" style={{ color: 'var(--red)' }}>{block.t}</p>
        <Link href="/signup" className="btn-offset inline-flex mt-4 px-5 py-2.5 text-sm font-display">
          {lang === 'en' ? 'Try free →' : 'Prueba gratis →'}
        </Link>
      </div>
    );
  }
  if (block.type === 'callout-mid') {
    return (
      <div className="my-10 border border-white/15 p-8 text-center relative overflow-hidden" style={{ background: '#0E0E10' }}>
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(232,77,91,0.12), transparent 70%)' }} />
        <div className="relative">
          <p className="font-display font-bold text-2xl mb-2">{block.t}</p>
          <p className="text-zinc-400 mb-6">{block.sub}</p>
          <Link href={block.href ?? '/signup'} className="btn-offset inline-flex px-8 py-3 text-sm font-display font-bold">
            {block.cta} →
          </Link>
        </div>
      </div>
    );
  }
  if (block.type === 'callout-gear') {
    return (
      <div className="my-10 border border-white/15 p-8 relative overflow-hidden" style={{ background: '#0E0E10' }}>
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(255,138,0,0.12), transparent 70%)' }} />
        <div className="relative flex flex-col md:flex-row items-center gap-6">
          <div style={{ color: '#FF8A00' }}><BagIcon size={40} /></div>
          <div className="flex-1 text-center md:text-left">
            <p className="font-display font-bold text-xl mb-1">{block.t}</p>
            <p className="text-zinc-400 text-sm">{block.sub}</p>
          </div>
          <Link href="/gear" className="shrink-0 inline-flex items-center gap-2 px-6 py-3 font-display font-bold text-sm rounded-lg transition-all hover:scale-[1.02]"
            style={{ background: 'rgba(255,138,0,0.15)', color: '#FF8A00', border: '1px solid rgba(255,138,0,0.3)' }}>
            {block.cta} →
          </Link>
        </div>
      </div>
    );
  }
  if (block.type === 'video') {
    return (
      <div className="my-10">
        <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
          <iframe
            src={`https://www.youtube.com/embed/${block.videoId}?rel=0`}
            title="YouTube video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            loading="lazy"
            className="absolute inset-0 w-full h-full border border-white/10"
            style={{ borderRadius: 8 }}
          />
        </div>
      </div>
    );
  }
  if (block.type === 'callout-final') {
    return (
      <div className="mt-14 border border-white/15 p-10 text-center relative overflow-hidden" style={{ background: '#0E0E10' }}>
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(232,77,91,0.18), transparent 70%)' }} />
        <div className="relative">
          <p className="font-mono-jb text-[13px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--red)' }}>YTubViral</p>
          <p className="font-display font-bold text-3xl mb-2">{block.t}</p>
          <p className="text-zinc-400 mb-8">{block.sub}</p>
          <Link href={block.href ?? '/signup'} className="btn-offset inline-flex px-10 py-4 text-base font-display font-bold">
            {block.cta} →
          </Link>
        </div>
      </div>
    );
  }
  return null;
}
