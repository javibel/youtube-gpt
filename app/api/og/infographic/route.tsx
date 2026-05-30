import { ImageResponse } from 'next/og';

export const runtime = 'edge';

// Brand
const BG = '#0B0B0D';
const ACCENT = '#ee4d5e';
const ACCENT_GLOW = 'rgba(232,77,91,0.15)';
const TEXT = '#ffffff';
const MUTED = '#71717a';

type Format = 'listicle' | 'story' | 'hot-take' | 'framework';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const format = (searchParams.get('format') ?? 'story') as Format;
  const title = searchParams.get('title') ?? 'YouTube Tips';
  // Points/steps as p1, p2, p3... params
  const points: string[] = [];
  for (let i = 1; i <= 8; i++) {
    const p = searchParams.get(`p${i}`);
    if (p) points.push(p);
  }
  const quote = searchParams.get('quote') ?? title;
  const tag = searchParams.get('tag') ?? 'YouTube Tips';

  switch (format) {
    case 'listicle':
      return renderListicle(title, points, tag);
    case 'story':
      return renderStory(quote, tag);
    case 'hot-take':
      return renderHotTake(quote);
    case 'framework':
      return renderFramework(title, points, tag);
    default:
      return renderStory(quote, tag);
  }
}

function renderListicle(title: string, points: string[], tag: string) {
  return new ImageResponse(
    (
      <div style={{ width: '1080px', height: '1080px', display: 'flex', flexDirection: 'column', background: BG, padding: '60px', position: 'relative', fontFamily: 'sans-serif' }}>
        {/* Accent bar */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '6px', background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT}88)`, display: 'flex' }} />

        {/* Tag */}
        <div style={{ display: 'flex', marginBottom: '20px' }}>
          <span style={{ background: ACCENT_GLOW, color: ACCENT, fontSize: '14px', fontWeight: 700, padding: '6px 16px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '1px' }}>{tag}</span>
        </div>

        {/* Title */}
        <div style={{ fontSize: title.length > 60 ? '36px' : '42px', fontWeight: 700, lineHeight: 1.2, color: TEXT, marginBottom: '40px', display: 'flex' }}>{title}</div>

        {/* Points */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1 }}>
          {points.map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
              <div style={{ minWidth: '36px', height: '36px', background: ACCENT, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '18px', color: TEXT }}>{i + 1}</div>
              <div style={{ fontSize: '22px', lineHeight: 1.4, color: `${TEXT}dd`, paddingTop: '4px', display: 'flex' }}>{p}</div>
            </div>
          ))}
        </div>

        {/* Logo bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: ACCENT, display: 'flex' }} />
          <span style={{ fontSize: '16px', fontWeight: 600, color: MUTED }}>ytubviral.com</span>
        </div>
      </div>
    ),
    { width: 1080, height: 1080 }
  );
}

function renderStory(quote: string, tag: string) {
  return new ImageResponse(
    (
      <div style={{ width: '1080px', height: '1080px', display: 'flex', flexDirection: 'column', background: BG, padding: '60px', position: 'relative', fontFamily: 'sans-serif', justifyContent: 'space-between' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '6px', background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT}88)`, display: 'flex' }} />

        <div style={{ display: 'flex' }}>
          <span style={{ background: ACCENT_GLOW, color: ACCENT, fontSize: '14px', fontWeight: 700, padding: '6px 16px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '1px' }}>{tag}</span>
        </div>

        <div style={{ display: 'flex', paddingLeft: '30px', paddingRight: '20px', position: 'relative' }}>
          {/* Quote bar */}
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', background: ACCENT, display: 'flex' }} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: quote.length > 100 ? '34px' : '40px', fontWeight: 600, lineHeight: 1.35, color: TEXT, display: 'flex' }}>"{quote}"</div>
            <div style={{ fontSize: '20px', color: MUTED, marginTop: '30px', display: 'flex' }}>— Javier Jimeno, fundador de YTubViral</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: ACCENT, display: 'flex' }} />
          <span style={{ fontSize: '16px', fontWeight: 600, color: MUTED }}>ytubviral.com</span>
        </div>
      </div>
    ),
    { width: 1080, height: 1080 }
  );
}

function renderHotTake(quote: string) {
  return new ImageResponse(
    (
      <div style={{ width: '1080px', height: '1080px', display: 'flex', flexDirection: 'column', background: BG, padding: '60px', position: 'relative', fontFamily: 'sans-serif', justifyContent: 'space-between' }}>
        {/* Glow */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: `radial-gradient(ellipse at 30% 50%, ${ACCENT_GLOW} 0%, transparent 60%)`, display: 'flex' }} />
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '6px', background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT}88)`, display: 'flex' }} />

        <div style={{ display: 'flex' }}>
          <span style={{ background: ACCENT_GLOW, color: ACCENT, fontSize: '14px', fontWeight: 700, padding: '6px 16px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '1px' }}>Opinión</span>
        </div>

        <div style={{ fontSize: quote.length > 80 ? '40px' : '48px', fontWeight: 700, lineHeight: 1.25, color: TEXT, padding: '0 10px', display: 'flex' }}>{quote}</div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '18px', color: MUTED, display: 'flex' }}>¿Estás de acuerdo? Comenta abajo</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: ACCENT, display: 'flex' }} />
            <span style={{ fontSize: '16px', fontWeight: 600, color: MUTED }}>ytubviral.com</span>
          </div>
        </div>
      </div>
    ),
    { width: 1080, height: 1080 }
  );
}

function renderFramework(title: string, steps: string[], tag: string) {
  return new ImageResponse(
    (
      <div style={{ width: '1080px', height: '1080px', display: 'flex', flexDirection: 'column', background: BG, padding: '60px', position: 'relative', fontFamily: 'sans-serif', justifyContent: 'space-between' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '6px', background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT}88)`, display: 'flex' }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex' }}>
            <span style={{ background: ACCENT_GLOW, color: ACCENT, fontSize: '14px', fontWeight: 700, padding: '6px 16px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '1px' }}>{tag}</span>
          </div>
          <div style={{ fontSize: title.length > 50 ? '36px' : '40px', fontWeight: 700, lineHeight: 1.2, color: TEXT, display: 'flex' }}>{title}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {steps.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: '40px', height: '40px', border: `3px solid ${ACCENT}`, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '18px', color: ACCENT }}>{i + 1}</div>
                {i < steps.length - 1 && <div style={{ width: '2px', height: '24px', background: `${ACCENT}44`, marginTop: '4px', display: 'flex' }} />}
              </div>
              <div style={{ fontSize: '22px', lineHeight: 1.4, paddingTop: '6px', color: `${TEXT}dd`, display: 'flex' }}>{s}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: ACCENT, display: 'flex' }} />
          <span style={{ fontSize: '16px', fontWeight: 600, color: MUTED }}>ytubviral.com</span>
        </div>
      </div>
    ),
    { width: 1080, height: 1080 }
  );
}
