import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/dashboard', '/generate', '/admin', '/api/', '/profile', '/feedback', '/stripe/', '/reset-password', '/verify-email'],
      },
      // Block AI training bots (search indexing bots like Googlebot are allowed)
      ...[
        'GPTBot', 'ChatGPT-User', 'Google-Extended', 'ClaudeBot',
        'Amazonbot', 'Applebot-Extended', 'Bytespider', 'CCBot',
        'meta-externalagent', 'PerplexityBot', 'Diffbot',
      ].map((bot) => ({
        userAgent: bot,
        disallow: ['/'],
      })),
    ],
    sitemap: 'https://ytubviral.com/sitemap.xml',
  };
}
