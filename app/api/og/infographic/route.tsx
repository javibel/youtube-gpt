import { ImageResponse } from 'next/og';

export const runtime = 'edge';

// Brand
const BG = '#0B0B0D';
const ACCENT = '#ee4d5e';
const ACCENT_GLOW = 'rgba(232,77,91,0.15)';
const ACCENT_GLOW_STRONG = 'rgba(232,77,91,0.25)';
const TEXT = '#ffffff';
const MUTED = '#71717a';
const MUTED_LIGHT = '#a1a1aa';

type Format = 'listicle' | 'story' | 'hot-take' | 'framework';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const format = (searchParams.get('format') ?? 'story') as Format;
  const title = searchParams.get('title') ?? 'YouTube Tips';
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

// ── LISTICLE ────────────────────────────────────────────────────────────────

function renderListicle(title: string, points: string[], tag: string) {
  const badgeSize = points.length > 5 ? '34px' : '42px';
  const badgeFont = points.length > 5 ? '16px' : '20px';
  const textSize = points.length > 5 ? '20px' : '24px';
  const gap = points.length > 5 ? '24px' : '32px';

  return new ImageResponse(
    (
      <div style={{
        width: '1080px', height: '1080px', display: 'flex',
        flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center',
        background: BG, padding: '90px 80px', position: 'relative', fontFamily: 'sans-serif',
      }}>
        {/* Accent bar top */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '6px', background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT}88)`, display: 'flex' }} />

        {/* Tag — absolute top-left */}
        <div style={{ position: 'absolute', top: '60px', left: '80px', display: 'flex' }}>
          <span style={{ background: ACCENT_GLOW_STRONG, color: ACCENT, fontSize: '15px', fontWeight: 700, padding: '8px 20px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '1.5px' }}>{tag}</span>
        </div>

        {/* Logo — absolute bottom-left */}
        <div style={{ position: 'absolute', bottom: '60px', left: '80px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: ACCENT, display: 'flex' }} />
          <span style={{ fontSize: '17px', fontWeight: 600, color: MUTED }}>ytubviral.com</span>
        </div>

        {/* Title */}
        <div style={{
          fontSize: title.length > 50 ? '40px' : '48px',
          fontWeight: 700, lineHeight: 1.15, color: TEXT, display: 'flex',
          marginBottom: '16px',
        }}>{title}</div>

        {/* Decorative line */}
        <div style={{ width: '60px', height: '3px', borderRadius: '2px', background: `linear-gradient(90deg, ${ACCENT}, transparent)`, display: 'flex', marginBottom: `${gap}` }} />

        {/* Points */}
        {points.map((p, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '18px', marginBottom: i < points.length - 1 ? gap : '0' }}>
            <div style={{
              minWidth: badgeSize, height: badgeSize, background: ACCENT,
              borderRadius: '10px', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontWeight: 700, fontSize: badgeFont, color: TEXT,
            }}>{i + 1}</div>
            <div style={{ fontSize: textSize, lineHeight: 1.5, color: `${TEXT}ee`, display: 'flex' }}>{p}</div>
          </div>
        ))}
      </div>
    ),
    { width: 1080, height: 1080 },
  );
}

// ── STORY ───────────────────────────────────────────────────────────────────

function renderStory(quote: string, tag: string) {
  const quoteSize = quote.length > 120 ? '36px' : quote.length > 80 ? '42px' : '50px';

  return new ImageResponse(
    (
      <div style={{
        width: '1080px', height: '1080px', display: 'flex',
        flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center',
        background: BG, padding: '90px 80px', position: 'relative', fontFamily: 'sans-serif',
      }}>
        {/* Accent bar */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '6px', background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT}88)`, display: 'flex' }} />
        {/* Corner glow */}
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: '500px', height: '500px', background: `radial-gradient(circle at 100% 100%, ${ACCENT_GLOW} 0%, transparent 70%)`, display: 'flex' }} />

        {/* Tag — absolute */}
        <div style={{ position: 'absolute', top: '60px', left: '80px', display: 'flex' }}>
          <span style={{ background: ACCENT_GLOW_STRONG, color: ACCENT, fontSize: '15px', fontWeight: 700, padding: '8px 20px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '1.5px' }}>{tag}</span>
        </div>

        {/* Logo — absolute */}
        <div style={{ position: 'absolute', bottom: '60px', left: '80px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: ACCENT, display: 'flex' }} />
          <span style={{ fontSize: '17px', fontWeight: 600, color: MUTED }}>ytubviral.com</span>
        </div>

        {/* Decorative big quote mark */}
        <div style={{ position: 'absolute', top: '140px', left: '50px', fontSize: '200px', fontWeight: 700, color: ACCENT, opacity: 0.12, lineHeight: 1, display: 'flex' }}>"</div>

        {/* Quote bar + content */}
        <div style={{ display: 'flex', paddingLeft: '36px', position: 'relative' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', background: ACCENT, borderRadius: '2px', display: 'flex' }} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: quoteSize, fontWeight: 600, lineHeight: 1.4, color: TEXT, display: 'flex', marginBottom: '36px' }}>"{quote}"</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ width: '44px', height: '3px', background: ACCENT, borderRadius: '2px', display: 'flex' }} />
              <div style={{ fontSize: '19px', color: MUTED_LIGHT, display: 'flex' }}>Javier Jimeno, fundador de YTubViral</div>
            </div>
          </div>
        </div>
      </div>
    ),
    { width: 1080, height: 1080 },
  );
}

// ── HOT TAKE ────────────────────────────────────────────────────────────────

function renderHotTake(quote: string) {
  const quoteSize = quote.length > 100 ? '44px' : quote.length > 60 ? '54px' : '62px';

  return new ImageResponse(
    (
      <div style={{
        width: '1080px', height: '1080px', display: 'flex',
        flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center',
        background: BG, padding: '90px 80px', position: 'relative', fontFamily: 'sans-serif',
      }}>
        {/* Multi-layer glow */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: `radial-gradient(ellipse at 20% 40%, rgba(232,77,91,0.12) 0%, transparent 50%)`, display: 'flex' }} />
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: `radial-gradient(ellipse at 80% 70%, rgba(232,77,91,0.08) 0%, transparent 50%)`, display: 'flex' }} />
        {/* Top + bottom bars */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '6px', background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT}88)`, display: 'flex' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '4px', background: `linear-gradient(90deg, ${ACCENT}44, ${ACCENT}22)`, display: 'flex' }} />

        {/* Tag — absolute */}
        <div style={{ position: 'absolute', top: '60px', left: '80px', display: 'flex' }}>
          <span style={{ background: ACCENT_GLOW_STRONG, color: ACCENT, fontSize: '15px', fontWeight: 700, padding: '8px 20px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Opinión</span>
        </div>

        {/* Footer — absolute */}
        <div style={{ position: 'absolute', bottom: '60px', left: '80px', right: '80px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '28px', display: 'flex' }}>💬</span>
            <span style={{ fontSize: '18px', color: MUTED_LIGHT, display: 'flex' }}>¿Estás de acuerdo? Comenta abajo</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: ACCENT, display: 'flex' }} />
            <span style={{ fontSize: '17px', fontWeight: 600, color: MUTED }}>ytubviral.com</span>
          </div>
        </div>

        {/* Main quote — true center */}
        <div style={{
          fontSize: quoteSize, fontWeight: 700, lineHeight: 1.2,
          color: TEXT, display: 'flex',
        }}>{quote}</div>
      </div>
    ),
    { width: 1080, height: 1080 },
  );
}

// ── FRAMEWORK ───────────────────────────────────────────────────────────────

function renderFramework(title: string, steps: string[], tag: string) {
  const stepFont = steps.length > 4 ? '21px' : '24px';
  const circleSize = steps.length > 4 ? '44px' : '50px';
  const circleFont = steps.length > 4 ? '18px' : '22px';
  const connH = steps.length > 4 ? '20px' : '28px';
  const stepGap = steps.length > 4 ? '6px' : '10px';

  return new ImageResponse(
    (
      <div style={{
        width: '1080px', height: '1080px', display: 'flex',
        flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center',
        background: BG, padding: '90px 80px', position: 'relative', fontFamily: 'sans-serif',
      }}>
        {/* Accent bar */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '6px', background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT}88)`, display: 'flex' }} />
        {/* Side glow */}
        <div style={{ position: 'absolute', top: '20%', left: 0, width: '300px', height: '60%', background: `linear-gradient(90deg, ${ACCENT_GLOW} 0%, transparent 100%)`, display: 'flex' }} />

        {/* Tag — absolute */}
        <div style={{ position: 'absolute', top: '60px', left: '80px', display: 'flex' }}>
          <span style={{ background: ACCENT_GLOW_STRONG, color: ACCENT, fontSize: '15px', fontWeight: 700, padding: '8px 20px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '1.5px' }}>{tag}</span>
        </div>

        {/* Logo — absolute */}
        <div style={{ position: 'absolute', bottom: '60px', left: '80px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: ACCENT, display: 'flex' }} />
          <span style={{ fontSize: '17px', fontWeight: 600, color: MUTED }}>ytubviral.com</span>
        </div>

        {/* Title */}
        <div style={{
          fontSize: title.length > 40 ? '38px' : '46px',
          fontWeight: 700, lineHeight: 1.15, color: TEXT, display: 'flex',
          marginBottom: '16px',
        }}>{title}</div>

        {/* Decorative line */}
        <div style={{ width: '60px', height: '3px', borderRadius: '2px', background: `linear-gradient(90deg, ${ACCENT}, transparent)`, display: 'flex', marginBottom: '40px' }} />

        {/* Steps */}
        {steps.map((s, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', marginBottom: i < steps.length - 1 ? stepGap : '0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
              <div style={{
                width: circleSize, height: circleSize,
                border: `3px solid ${ACCENT}`, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: circleFont, color: ACCENT,
                background: ACCENT_GLOW,
              }}>{i + 1}</div>
              <div style={{ fontSize: stepFont, lineHeight: 1.5, color: `${TEXT}ee`, display: 'flex' }}>{s}</div>
            </div>
            {i < steps.length - 1 && (
              <div style={{ display: 'flex', paddingLeft: `${parseInt(circleSize) / 2 - 1}px` }}>
                <div style={{ width: '3px', height: connH, background: `linear-gradient(180deg, ${ACCENT}66, ${ACCENT}22)`, borderRadius: '2px', display: 'flex' }} />
              </div>
            )}
          </div>
        ))}
      </div>
    ),
    { width: 1080, height: 1080 },
  );
}
