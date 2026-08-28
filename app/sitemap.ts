import { MetadataRoute } from 'next';
import { BLOG_POSTS } from '@/lib/blog-data';
import { LEARN_GUIDES } from '@/lib/learn-data';
import { ALL_GEAR_SLUGS } from '@/lib/gear-data';
import { NICHES } from '@/lib/niches-data';
import { TOPIC_SLUGS } from '@/lib/title-study-data';

const BASE_URL = 'https://ytubviral.com';

// lastmod = fecha real del último cambio de contenido de la página.
// Google IGNORA el campo lastmod si detecta que miente (p.ej. "hoy" en todas las
// URLs). Mantenerlo honesto: al tocar el contenido de una ruta, actualizar SU fecha.
//   REDESIGN_2026_08 = rediseño Cristal (25/08): cambió layout y copy de todas las
//                      páginas públicas → lastmod legítimo para las que no han
//                      cambiado desde entonces.
const REDESIGN_2026_08 = '2026-08-25';
// Páginas con cambios de contenido propios POSTERIORES al rediseño:
const LASTMOD: Record<string, string> = {
  '/': '2026-08-26',            // hero + grid 2x5 + copy (25-26/08)
  '/pricing': '2026-08-26',     // 1 competidor monitorizado gratis
  '/signup': '2026-08-26',      // atribución / copy
  '/title-analyzer': '2026-08-26',
  '/youtube-title-ideas': '2026-07-05',
  '/embed': '2026-07-05',
};
const lastmod = (route: string) => new Date(LASTMOD[route] ?? REDESIGN_2026_08);

export default function sitemap(): MetadataRoute.Sitemap {
  const blogEntries: MetadataRoute.Sitemap = BLOG_POSTS.map((p) => ({
    url: `${BASE_URL}/blog/${p.slug}`,
    lastModified: new Date(p.date.en),
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));

  // El índice del blog cambia cada vez que se publica un post → lastmod = post más reciente.
  const newestPost = BLOG_POSTS.reduce(
    (max, p) => (new Date(p.date.en) > max ? new Date(p.date.en) : max),
    new Date('2026-01-01'),
  );

  const gearEntries: MetadataRoute.Sitemap = ALL_GEAR_SLUGS.map((slug) => ({
    url: `${BASE_URL}/gear/${slug}`,
    lastModified: lastmod(`/gear/${slug}`),
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }));

  const featurePages: MetadataRoute.Sitemap = [
    'keyword-research', 'seo-score', 'competitor-analysis', 'revenue-estimator',
    'ab-testing', 'learning-hub', 'trend-explorer', 'ai-generator', 'best-time',
    'retention-analyzer', 'video-predictor', 'content-calendar', 'channel-analytics',
    'ai-coach',
  ].map((slug) => ({
    url: `${BASE_URL}/features/${slug}`,
    lastModified: lastmod(`/features/${slug}`),
    changeFrequency: 'weekly' as const,
    priority: 0.9,
  }));

  // Only include publicly accessible pages (200 OK, no auth redirect).
  // Excluded: /ab-test y /team (307→/login), /login (no SEO value), /learn
  // (versión interna del learning hub, vive en DashboardShell),
  // and internal tool pages that require auth.
  return [
    { url: BASE_URL, lastModified: lastmod('/'), changeFrequency: 'weekly', priority: 1 },
    {
      url: `${BASE_URL}/blog`,
      lastModified: newestPost,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    ...blogEntries,
    ...featurePages,
    ...gearEntries,
    ...LEARN_GUIDES.map((g) => ({
      url: `${BASE_URL}/features/learning-hub/${g.slug}`,
      lastModified: lastmod(`/features/learning-hub/${g.slug}`),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    { url: `${BASE_URL}/extension`, lastModified: lastmod('/extension'), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/gear`, lastModified: lastmod('/gear'), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/launch`, lastModified: lastmod('/launch'), changeFrequency: 'weekly', priority: 0.9 },
    { url: `${BASE_URL}/trends`, lastModified: lastmod('/trends'), changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE_URL}/seo-score`, lastModified: lastmod('/seo-score'), changeFrequency: 'weekly', priority: 0.9 },
    { url: `${BASE_URL}/title-analyzer`, lastModified: lastmod('/title-analyzer'), changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE_URL}/youtube-title-study`, lastModified: lastmod('/youtube-title-study'), changeFrequency: 'yearly', priority: 0.8 },
    ...TOPIC_SLUGS.map((slug) => ({
      url: `${BASE_URL}/youtube-title-study/${slug}`,
      lastModified: lastmod(`/youtube-title-study/${slug}`),
      changeFrequency: 'yearly' as const,
      priority: 0.7,
    })),
    { url: `${BASE_URL}/ctr-calculator`, lastModified: lastmod('/ctr-calculator'), changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE_URL}/youtube-money-calculator`, lastModified: lastmod('/youtube-money-calculator'), changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE_URL}/engagement-rate-calculator`, lastModified: lastmod('/engagement-rate-calculator'), changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE_URL}/youtube-title-ideas`, lastModified: lastmod('/youtube-title-ideas'), changeFrequency: 'weekly', priority: 0.8 },
    ...NICHES.map((n) => ({
      url: `${BASE_URL}/youtube-title-ideas/${n.slug}`,
      lastModified: lastmod(`/youtube-title-ideas/${n.slug}`),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    { url: `${BASE_URL}/embed`, lastModified: lastmod('/embed'), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/tools`, lastModified: lastmod('/tools'), changeFrequency: 'weekly', priority: 0.9 },
    { url: `${BASE_URL}/pricing`, lastModified: lastmod('/pricing'), changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE_URL}/signup`, lastModified: lastmod('/signup'), changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE_URL}/terms`, lastModified: lastmod('/terms'), changeFrequency: 'yearly', priority: 0.2 },
    { url: `${BASE_URL}/privacy`, lastModified: lastmod('/privacy'), changeFrequency: 'yearly', priority: 0.2 },
    { url: `${BASE_URL}/legal`, lastModified: lastmod('/legal'), changeFrequency: 'yearly', priority: 0.2 },
  ];
}
