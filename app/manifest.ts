import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'YTubViral — AI for YouTubers',
    short_name: 'YTubViral',
    description: 'AI-powered tools for YouTube creators: SEO Score, Analytics, Predictor, Content Calendar, Trend Alerts, and more.',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#ee4d5e',
    orientation: 'portrait-primary',
    categories: ['productivity', 'utilities', 'social'],
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
