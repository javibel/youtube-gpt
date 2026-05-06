import { MetadataRoute } from 'next';
import { BLOG_POSTS } from '@/lib/blog-data';

const BASE_URL = 'https://ytubviral.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const blogEntries: MetadataRoute.Sitemap = BLOG_POSTS.map((p) => ({
    url: `${BASE_URL}/blog/${p.slug}`,
    lastModified: new Date(p.date.en),
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));

  const featurePages: MetadataRoute.Sitemap = [
    { slug: 'keyword-research', date: '2026-05-05' },
    { slug: 'seo-score', date: '2026-05-05' },
    { slug: 'competitor-analysis', date: '2026-05-05' },
    { slug: 'revenue-estimator', date: '2026-05-05' },
    { slug: 'ab-testing', date: '2026-05-05' },
  ].map((f) => ({
    url: `${BASE_URL}/features/${f.slug}`,
    lastModified: new Date(f.date),
    changeFrequency: 'monthly' as const,
    priority: 0.9,
  }));

  // Only include publicly accessible pages (200 OK, no auth redirect).
  // Excluded: /seo-score, /ab-test (307→/login), /login (no SEO value),
  // and internal tool pages that require auth.
  return [
    {
      url: BASE_URL,
      lastModified: new Date('2026-05-05'),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${BASE_URL}/blog`,
      lastModified: new Date(BLOG_POSTS[BLOG_POSTS.length - 1]?.date.en ?? '2026-01-01'),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    ...blogEntries,
    ...featurePages,
    {
      url: `${BASE_URL}/learn`,
      lastModified: new Date('2026-05-01'),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/trends`,
      lastModified: new Date('2026-05-01'),
      changeFrequency: 'daily',
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/extension`,
      lastModified: new Date('2026-03-01'),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/gear`,
      lastModified: new Date('2026-05-01'),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/signup`,
      lastModified: new Date('2026-04-01'),
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/terms`,
      lastModified: new Date('2025-10-01'),
      changeFrequency: 'yearly',
      priority: 0.2,
    },
    {
      url: `${BASE_URL}/privacy`,
      lastModified: new Date('2026-05-06'),
      changeFrequency: 'yearly',
      priority: 0.2,
    },
    {
      url: `${BASE_URL}/legal`,
      lastModified: new Date('2025-10-01'),
      changeFrequency: 'yearly',
      priority: 0.2,
    },
  ];
}
