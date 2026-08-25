import Image from 'next/image';
import ArticleBlock from '@/components/ArticleBlock';
import ProVideoSection from '@/components/ProVideoSection';
import type { LearnBlockType } from '@/lib/learn-data';
import type { Lang, BlockType } from '@/lib/blog-data';
import type { PlanType } from '@/lib/plans';

interface Props {
  blocks: LearnBlockType[];
  lang: Lang;
  showVideo: boolean;
  plan?: PlanType;
}

export default function GuideArticleRenderer({ blocks, lang, showVideo, plan }: Props) {
  return (
    <div>
      {blocks.map((block, i) => {
        if (block.type === 'video') {
          if (!showVideo) return null;
          return <ProVideoSection key={i} videoId={block.videoId} plan={plan ?? 'free'} lang={lang} />;
        }
        if (block.type === 'image') {
          return (
            <figure key={i} className="my-8">
              <div className="yv-glass relative w-full overflow-hidden" style={{ aspectRatio: '16/9' }}>
                <Image
                  src={block.src}
                  alt={block.alt}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 768px"
                />
              </div>
              {block.caption && (
                <figcaption className="mt-2 text-center font-mono-jb text-[13px] text-zinc-500">
                  {block.caption}
                </figcaption>
              )}
            </figure>
          );
        }
        // Standard blog block types — delegate to ArticleBlock
        return <ArticleBlock key={i} block={block as BlockType} lang={lang} />;
      })}
    </div>
  );
}
