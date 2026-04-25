import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const text = searchParams.get('text') ?? '';

  // Truncate to ~200 chars for display, keeping it readable
  const display = text.length > 220 ? text.slice(0, 217) + '…' : text;

  return new ImageResponse(
    (
      <div
        style={{
          width: '1080px',
          height: '1080px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0a0a0f 0%, #0d1b2a 50%, #0a0a0f 100%)',
          padding: '80px',
          fontFamily: 'sans-serif',
          position: 'relative',
        }}
      >
        {/* Top accent line */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '6px',
            background: 'linear-gradient(90deg, #00D9FF, #FF00FF)',
          }}
        />

        {/* Brand name top-left */}
        <div
          style={{
            position: 'absolute',
            top: '48px',
            left: '80px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <div
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: '#00D9FF',
            }}
          />
          <span
            style={{
              color: '#00D9FF',
              fontSize: '28px',
              fontWeight: 700,
              letterSpacing: '0.05em',
            }}
          >
            YTubViral
          </span>
        </div>

        {/* Main text */}
        <div
          style={{
            color: '#ffffff',
            fontSize: display.length > 120 ? '38px' : '46px',
            fontWeight: 600,
            lineHeight: 1.4,
            textAlign: 'center',
            maxWidth: '900px',
          }}
        >
          {display}
        </div>

        {/* Bottom accent */}
        <div
          style={{
            position: 'absolute',
            bottom: '60px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div
            style={{
              width: '40px',
              height: '2px',
              background: 'linear-gradient(90deg, #00D9FF, #FF00FF)',
            }}
          />
          <span style={{ color: '#666', fontSize: '22px' }}>ytubviral.com</span>
          <div
            style={{
              width: '40px',
              height: '2px',
              background: 'linear-gradient(90deg, #FF00FF, #00D9FF)',
            }}
          />
        </div>

        {/* Bottom accent line */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '6px',
            background: 'linear-gradient(90deg, #FF00FF, #00D9FF)',
          }}
        />
      </div>
    ),
    { width: 1080, height: 1080 }
  );
}
