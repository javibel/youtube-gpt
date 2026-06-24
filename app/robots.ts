import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/dashboard', '/generate', '/admin', '/api/', '/profile', '/feedback', '/stripe/', '/reset-password', '/verify-email', '/ab-test', '/research', '/competitors', '/best-time', '/retention', '/predictor', '/calendar', '/analytics', '/coach'],
      },
      // Allow AI *search* bots — they read pages to answer a live user query (ChatGPT search,
      // Perplexity, Claude search). This is discovery, not training: blocking them only removed
      // us from AI answers without protecting anything. (2026-06-24)
      ...[
        'OAI-SearchBot', 'ChatGPT-User',
        'PerplexityBot', 'Perplexity-User',
        'Claude-User', 'Claude-SearchBot',
      ].map((bot) => ({
        userAgent: bot,
        allow: '/',
      })),
      // Block AI *training* bots — they scrape to train models. No SEO upside, so keep them out.
      ...[
        'GPTBot', 'Google-Extended', 'ClaudeBot',
        'Amazonbot', 'Applebot-Extended', 'Bytespider', 'CCBot',
        'meta-externalagent', 'Diffbot',
      ].map((bot) => ({
        userAgent: bot,
        disallow: ['/'],
      })),
    ],
    sitemap: 'https://ytubviral.com/sitemap.xml',
  };
}
