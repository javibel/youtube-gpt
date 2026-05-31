import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const score = parseInt(searchParams.get('score') || '0', 10);
  const title = searchParams.get('title') || 'YouTube Video';

  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#eab308' : score >= 40 ? '#f97316' : '#ef4444';
  const label = score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Needs work' : 'Critical';

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
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 40 }}>
          <div style={{ width: 24, height: 24, borderRadius: 4, background: '#e84d5b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#fff', fontSize: 12, fontWeight: 900 }}>▶</span>
          </div>
          <span style={{ fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: -0.5 }}>
            YTubViral<span style={{ color: '#e84d5b' }}>.</span>com
          </span>
        </div>

        {/* Score circle */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 180,
            height: 180,
            borderRadius: '50%',
            border: `6px solid ${color}`,
            background: `${color}11`,
            marginBottom: 24,
          }}
        >
          <span style={{ fontSize: 72, fontWeight: 900, color }}>
            {score}
          </span>
        </div>

        {/* Label */}
        <span style={{ fontSize: 20, fontWeight: 600, color, marginBottom: 12 }}>
          {label}
        </span>

        {/* Video title */}
        <span
          style={{
            fontSize: 16,
            color: '#a1a1aa',
            maxWidth: 500,
            textAlign: 'center',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title.slice(0, 60)}{title.length > 60 ? '...' : ''}
        </span>

        {/* CTA */}
        <div
          style={{
            marginTop: 32,
            padding: '10px 24px',
            borderRadius: 8,
            background: '#e84d5b',
            color: '#fff',
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          Check your score free → ytubviral.com/seo-score
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
