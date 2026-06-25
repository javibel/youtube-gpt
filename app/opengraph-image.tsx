import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'YTubViral — Free AI Tools to Grow Your YouTube Channel';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0a0a',
          position: 'relative',
          overflow: 'hidden',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {/* Subtle red glow top-right */}
        <div
          style={{
            position: 'absolute',
            top: -120,
            right: -80,
            width: 500,
            height: 500,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(238,77,94,0.15) 0%, transparent 70%)',
          }}
        />

        {/* Logo mark */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 32,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: '#ee4d5e',
              flexShrink: 0,
            }}
          />
          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: 'rgba(255,255,255,0.7)',
              letterSpacing: '2px',
              textTransform: 'uppercase' as const,
            }}
          >
            YTubViral.com
          </div>
        </div>

        {/* Main headline */}
        <div
          style={{
            fontSize: 64,
            fontWeight: 800,
            color: '#ffffff',
            textAlign: 'center',
            maxWidth: 900,
            lineHeight: 1.1,
            letterSpacing: '-2px',
            marginBottom: 8,
          }}
        >
          Grow on YouTube
        </div>
        <div
          style={{
            fontSize: 64,
            fontWeight: 800,
            textAlign: 'center',
            maxWidth: 900,
            lineHeight: 1.1,
            letterSpacing: '-2px',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <span style={{ color: '#ee4d5e', fontSize: 48 }}>→</span>
          <span style={{ color: '#ee4d5e' }}>free AI tools.</span>
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: 22,
            color: 'rgba(255,255,255,0.5)',
            textAlign: 'center',
            maxWidth: 700,
            marginTop: 28,
            lineHeight: 1.4,
          }}
        >
          SEO Score · Title Generator · Keywords · Thumbnails · AI Coach & more
        </div>

        {/* Bottom accent line */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            width: '100%',
            height: 4,
            background: 'linear-gradient(90deg, transparent, #ee4d5e, transparent)',
          }}
        />
      </div>
    ),
    { ...size }
  );
}
