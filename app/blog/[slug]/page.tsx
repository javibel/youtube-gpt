import { getServerLang } from '@/lib/server-lang';
import { getArticleStaticParams, getArticleMetadata, renderArticle } from './article-view';

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return getArticleStaticParams(getServerLang());
}

export function generateMetadata(props: Props) {
  return getArticleMetadata({ ...props, lang: getServerLang() });
}

export default function ArticlePage(props: Props) {
  return renderArticle({ ...props, lang: getServerLang() });
}
