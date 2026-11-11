import { getArticleStaticParams, getArticleMetadata, renderArticle } from '@/app/blog/[slug]/article-view';

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return getArticleStaticParams('en');
}

export function generateMetadata(props: Props) {
  return getArticleMetadata({ ...props, lang: 'en' });
}

export default function EnglishArticlePage(props: Props) {
  return renderArticle({ ...props, lang: 'en' });
}
