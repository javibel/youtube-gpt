import { BLOG_POSTS, ARTICLE_BODIES, type BlockType } from '@/lib/blog-data';

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function blocksToHtml(blocks: BlockType[]): string {
  return blocks.map(b => {
    switch (b.type) {
      case 'p': return `<p>${escapeXml(b.t)}</p>`;
      case 'h2': return `<h2>${escapeXml(b.t)}</h2>`;
      case 'h3': return `<h3>${escapeXml(b.t)}</h3>`;
      case 'list': return `<ul>${b.items.map(i => `<li>${escapeXml(i)}</li>`).join('')}</ul>`;
      case 'callout': return `<blockquote>${escapeXml(b.t)}</blockquote>`;
      case 'callout-mid':
      case 'callout-final':
        return `<blockquote><strong>${escapeXml(b.t)}</strong><br/>${escapeXml(b.sub)}${b.href ? `<br/><a href="https://ytubviral.com${b.href}">${escapeXml(b.cta)}</a>` : ''}</blockquote>`;
      case 'video': return `<p><a href="https://www.youtube.com/watch?v=${b.videoId}">Watch on YouTube</a></p>`;
      default: return '';
    }
  }).join('\n');
}

export async function GET() {
  const items = BLOG_POSTS
    .slice(0, 20)
    .map(post => {
      const body = ARTICLE_BODIES[post.slug]?.en;
      const contentHtml = body ? blocksToHtml(body) : `<p>${escapeXml(post.excerpt.en)}</p>`;
      const dateStr = post.date.en;
      const pubDate = new Date(dateStr).toUTCString();
      const link = `https://ytubviral.com/blog/${post.slug}`;

      return `    <item>
      <title>${escapeXml(post.title.en)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <description>${escapeXml(post.excerpt.en)}</description>
      <content:encoded><![CDATA[${contentHtml}]]></content:encoded>
      <pubDate>${pubDate}</pubDate>
      <author>hello@ytubviral.com (${escapeXml(post.author.name)})</author>
    </item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>YTubViral Blog</title>
    <link>https://ytubviral.com/blog</link>
    <description>AI-powered YouTube growth tools — SEO tips, tutorials, and strategies for creators.</description>
    <language>en</language>
    <atom:link href="https://ytubviral.com/blog/rss.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
