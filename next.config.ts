import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  async redirects() {
    return [
      // www → non-www permanent redirect (SEO canonical)
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.ytubviral.com' }],
        destination: 'https://ytubviral.com/:path*',
        permanent: true,
      },
    ];
  },
  async headers() {
    // A5 (2026-07-05): hardened CSP candidate ships as Report-Only alongside the current
    // enforced policy for 1-2 weeks before promotion — see docs/security-phase2-spec-2026-07-05.md.
    // Drops 'unsafe-eval' and blob: from script-src (kept 'wasm-unsafe-eval' for onnxruntime/imgly)
    // and http: from img-src; adds form-action/manifest-src. Report-only in dev too is noisy
    // (React Refresh needs eval) so it's production-only.
    const cspReportOnly = "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://js.stripe.com https://vercel.live https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' blob: https://api.stripe.com https://*.vercel.live https://*.anthropic.com https://staticimgly.com https://*.staticimgly.com https://*.huggingface.co https://huggingface.co https://*.hf.space wss:; media-src 'self' blob:; worker-src 'self' blob:; frame-src https://js.stripe.com https://vercel.live https://www.youtube.com https://www.youtube-nocookie.com https://challenges.cloudflare.com; form-action 'self' https://checkout.stripe.com; manifest-src 'self'; object-src 'none'; base-uri 'self'; report-uri /api/csp-report";

    return [
      // Security headers — all routes
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob: https://js.stripe.com https://vercel.live https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https: http:; connect-src 'self' blob: https://api.stripe.com https://*.vercel.live https://*.anthropic.com https://staticimgly.com https://*.staticimgly.com https://*.huggingface.co https://huggingface.co https://*.hf.space wss:; media-src 'self' blob:; worker-src 'self' blob:; frame-src https://js.stripe.com https://vercel.live https://www.youtube.com https://www.youtube-nocookie.com https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; report-uri /api/csp-report" },
          ...(process.env.NODE_ENV === 'production'
            ? [{ key: 'Content-Security-Policy-Report-Only', value: cspReportOnly }]
            : []),
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(self)' },
        ],
      },
      // Public pages — allow CDN/browser caching (critical for SEO indexation)
      {
        source: '/',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400' },
        ],
      },
      {
        source: '/blog/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400' },
        ],
      },
      {
        source: '/features/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400' },
        ],
      },
      {
        source: '/gear/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400' },
        ],
      },
      {
        source: '/:path(pricing|gear|learn|about|legal|privacy|terms|login|signup|seo-score|title-analyzer|ctr-calculator|youtube-money-calculator|engagement-rate-calculator|youtube-title-ideas|youtube-title-study|trends|tools|extension|launch|embed)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400' },
        ],
      },
      {
        source: '/youtube-title-ideas/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400' },
        ],
      },
      {
        source: '/youtube-title-study/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400' },
        ],
      },
      // Embed routes — allow iframing
      {
        source: '/embed/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self'; frame-src 'self'; frame-ancestors *" },
        ],
      },
      // API routes — never cache by default
      {
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
      // OG image routes — override no-store with CDN cache (Meta fetches these for social posts)
      {
        source: '/api/og/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=86400, stale-while-revalidate=3600' },
        ],
      },
      // Public reviews — la landing lo consulta en cada visita; cache CDN evita golpear la DB (B5)
      {
        source: '/api/reviews/public',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=3600, stale-while-revalidate=86400' },
        ],
      },
    ];
  },
};

export default nextConfig;
