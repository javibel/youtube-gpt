import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'YTubViral — Genera contenido viral para YouTube con IA';
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
          background: '#06060f',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Blob cyan */}
        <div
          style={{
            position: 'absolute',
            top: -80,
            left: -80,
            width: 500,
            height: 500,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(0,217,255,0.3) 0%, transparent 70%)',
            filter: 'blur(40px)',
          }}
        />
        {/* Blob magenta */}
        <div
          style={{
            position: 'absolute',
            bottom: -100,
            right: -100,
            width: 600,
            height: 600,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(204,0,255,0.25) 0%, transparent 70%)',
            filter: 'blur(40px)',
          }}
        />

        {/* Logo */}
        <div
          style={{
            fontSize: 72,
            fontWeight: 800,
            background: 'linear-gradient(90deg, #00D9FF, #CC00FF)',
            backgroundClip: 'text',
            color: 'transparent',
            marginBottom: 20,
            letterSpacing: '-2px',
          }}
        >
          YTubViral
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: 32,
            color: 'rgba(255,255,255,0.85)',
            textAlign: 'center',
            maxWidth: 800,
            lineHeight: 1.3,
            marginBottom: 40,
          }}
        >
          Genera contenido viral para YouTube con IA en segundos
        </div>

        {/* Pills */}
        <div style={{ display: 'flex', gap: 16 }}>
          {['Títulos', 'Descripciones', 'Scripts', 'Miniaturas', 'Captions'].map((label) => (
            <div
              key={label}
              style={{
                padding: '8px 20px',
                borderRadius: 999,
                background: 'rgba(0,217,255,0.1)',
                border: '1px solid rgba(0,217,255,0.3)',
                color: '#00D9FF',
                fontSize: 18,
                fontWeight: 600,
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
