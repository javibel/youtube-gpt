import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/dashboard', '/generate', '/admin', '/api/'],
      },
    ],
    sitemap: 'https://ytubviral.com/sitemap.xml',
  };
}
