import Image from 'next/image';
import Link from 'next/link';
import type { LearnGuide } from '@/lib/learn-data';
import type { Lang } from '@/lib/blog-data';

const LEVEL_COLORS = { beginner: '#22c55e', intermediate: '#eab308', advanced: '#ef4444' };
const LEVEL_LABELS: Record<string, Record<Lang, string>> = {
  beginner: { es: 'Principiante', en: 'Beginner' },
  intermediate: { es: 'Intermedio', en: 'Intermediate' },
  advanced: { es: 'Avanzado', en: 'Advanced' },
};

interface Props {
  guide: LearnGuide;
  lang: Lang;
  linkPrefix: string; // '/learn/' or '/features/learning-hub/'
}

export default function GuideCard({ guide, lang, linkPrefix }: Props) {
  return (
    <Link
      href={`${linkPrefix}${guide.slug}`}
      className="group block border border-white/10 p-6 bg-black hover:border-white/20 transition-colors"
    >
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 relative shrink-0">
          <Image
            src={guide.icon}
            alt=""
            width={40}
            height={40}
            className="object-contain"
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <h3 className="font-display font-bold text-base leading-tight group-hover:text-zinc-100 transition-colors">
              {guide.title[lang]}
            </h3>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <span
              className="font-mono-jb text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full"
              style={{ background: `${LEVEL_COLORS[guide.level]}22`, color: LEVEL_COLORS[guide.level] }}
            >
              {LEVEL_LABELS[guide.level][lang]}
            </span>
            <span className="font-mono-jb text-[11px] text-zinc-600">{guide.readMin} min</span>
            {guide.videoId && (
              <span className="font-mono-jb text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(232,77,91,0.15)', color: 'var(--red)' }}>
                Video
              </span>
            )}
          </div>
          <p className="text-zinc-500 text-sm line-clamp-2">{guide.description[lang]}</p>
        </div>
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className="shrink-0 mt-1 text-zinc-600 group-hover:text-zinc-400 transition-colors"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
      </div>
    </Link>
  );
}
