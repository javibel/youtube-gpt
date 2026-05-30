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

// ── Shared layout wrapper ───────────────────────────────────────────────────
// All templates use the same 3-zone layout:
//   [header: tag]  [content: centered, flex-1]  [footer: logo]

function TagBadge({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex' }}>
      <span style={{
        background: ACCENT_GLOW_STRONG,
        color: ACCENT,
        fontSize: '15px',
        fontWeight: 700,
        padding: '8px 20px',
        borderRadius: '20px',
        textTransform: 'uppercase',
        letterSpacing: '1.5px',
      }}>{label}</span>
    </div>
  );
}

function LogoBar() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: ACCENT, display: 'flex' }} />
      <span style={{ fontSize: '17px', fontWeight: 600, color: MUTED }}>ytubviral.com</span>
    </div>
  );
}

function AccentBar() {
  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, height: '6px',
      background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT}88)`,
      display: 'flex',
    }} />
  );
}

function DecorLine() {
  return (
    <div style={{
      width: '60px', height: '3px', borderRadius: '2px',
      background: `linear-gradient(90deg, ${ACCENT}, transparent)`,
      display: 'flex',
    }} />
  );
}

// ── LISTICLE ────────────────────────────────────────────────────────────────

function renderListicle(title: string, points: string[], tag: string) {
  const fontSize = points.length > 5 ? '20px' : '24px';
  const gap = points.length > 5 ? '22px' : '30px';
  const badgeSize = points.length > 5 ? '34px' : '42px';
  const badgeFont = points.length > 5 ? '16px' : '20px';

  return new ImageResponse(
    (
      <div style={{
        width: '1080px', height: '1080px', display: 'flex', flexDirection: 'column',
        background: BG, padding: '70px', position: 'relative', fontFamily: 'sans-serif',
      }}>
        <AccentBar />

        {/* Header */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginBottom: '10px' }}>
          <TagBadge label={tag} />
          <div style={{
            fontSize: title.length > 50 ? '38px' : '46px',
            fontWeight: 700, lineHeight: 1.15, color: TEXT, display: 'flex',
          }}>{title}</div>
          <DecorLine />
        </div>

        {/* Content — centered vertically */}
        <div style={{
          display: 'flex', flexDirection: 'column', flex: 1,
          justifyContent: 'center', gap,
        }}>
          {points.map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
              <div style={{
                minWidth: badgeSize, height: badgeSize, background: ACCENT,
                borderRadius: '10px', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontWeight: 700, fontSize: badgeFont, color: TEXT,
              }}>{i + 1}</div>
              <div style={{ fontSize, lineHeight: 1.5, color: `${TEXT}ee`, display: 'flex' }}>{p}</div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <LogoBar />
      </div>
    ),
    { width: 1080, height: 1080 },
  );
}

// ── STORY ───────────────────────────────────────────────────────────────────

function renderStory(quote: string, tag: string) {
  const quoteSize = quote.length > 120 ? '34px' : quote.length > 80 ? '40px' : '46px';

  return new ImageResponse(
    (
      <div style={{
        width: '1080px', height: '1080px', display: 'flex', flexDirection: 'column',
        background: BG, padding: '70px', position: 'relative', fontFamily: 'sans-serif',
      }}>
        <AccentBar />
        {/* Subtle corner glow */}
        <div style={{
          position: 'absolute', bottom: 0, right: 0, width: '500px', height: '500px',
          background: `radial-gradient(circle at 100% 100%, ${ACCENT_GLOW} 0%, transparent 70%)`,
          display: 'flex',
        }} />

        {/* Header */}
        <TagBadge label={tag} />

        {/* Content — centered */}
        <div style={{
          display: 'flex', flexDirection: 'column', flex: 1,
          justifyContent: 'center', paddingLeft: '36px', paddingRight: '20px',
          position: 'relative',
        }}>
          {/* Decorative large quote mark */}
          <div style={{
            position: 'absolute', top: '60px', left: '-10px',
            fontSize: '180px', fontWeight: 700, color: ACCENT,
            opacity: 0.15, lineHeight: 1, display: 'flex',
          }}>"</div>

          {/* Quote bar */}
          <div style={{
            position: 'absolute', left: 0, top: '30%', bottom: '20%',
            width: '4px', background: ACCENT, borderRadius: '2px', display: 'flex',
          }} />

          <div style={{
            fontSize: quoteSize, fontWeight: 600, lineHeight: 1.4,
            color: TEXT, display: 'flex', marginBottom: '36px',
          }}>"{quote}"</div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '44px', height: '3px', background: ACCENT,
              borderRadius: '2px', display: 'flex',
            }} />
            <div style={{ fontSize: '19px', color: MUTED_LIGHT, display: 'flex' }}>
              Javier Jimeno, fundador de YTubViral
            </div>
          </div>
        </div>

        {/* Footer */}
        <LogoBar />
      </div>
    ),
    { width: 1080, height: 1080 },
  );
}

// ── HOT TAKE ────────────────────────────────────────────────────────────────

function renderHotTake(quote: string) {
  const quoteSize = quote.length > 100 ? '42px' : quote.length > 60 ? '52px' : '58px';

  return new ImageResponse(
    (
      <div style={{
        width: '1080px', height: '1080px', display: 'flex', flexDirection: 'column',
        background: BG, padding: '70px', position: 'relative', fontFamily: 'sans-serif',
      }}>
        {/* Multi-layer glow */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          background: `radial-gradient(ellipse at 20% 40%, rgba(232,77,91,0.12) 0%, transparent 50%)`,
          display: 'flex',
        }} />
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          background: `radial-gradient(ellipse at 80% 70%, rgba(232,77,91,0.08) 0%, transparent 50%)`,
          display: 'flex',
        }} />
        {/* Top + bottom accent bars */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '6px',
          background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT}88)`,
          display: 'flex',
        }} />
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: '4px',
          background: `linear-gradient(90deg, ${ACCENT}44, ${ACCENT}22)`,
          display: 'flex',
        }} />

        {/* Header */}
        <div style={{ display: 'flex', position: 'relative' }}>
          <TagBadge label="Opinión" />
        </div>

        {/* Content — centered, big and bold */}
        <div style={{
          display: 'flex', flexDirection: 'column', flex: 1,
          justifyContent: 'center', position: 'relative', padding: '0 10px',
        }}>
          <div style={{
            fontSize: quoteSize, fontWeight: 700, lineHeight: 1.2,
            color: TEXT, display: 'flex',
          }}>{quote}</div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ fontSize: '28px', display: 'flex' }}>💬</div>
            <span style={{ fontSize: '18px', color: MUTED_LIGHT, display: 'flex' }}>¿Estás de acuerdo? Comenta abajo</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: ACCENT, display: 'flex' }} />
            <span style={{ fontSize: '17px', fontWeight: 600, color: MUTED }}>ytubviral.com</span>
          </div>
        </div>
      </div>
    ),
    { width: 1080, height: 1080 },
  );
}

// ── FRAMEWORK ───────────────────────────────────────────────────────────────

function renderFramework(title: string, steps: string[], tag: string) {
  const stepFontSize = steps.length > 4 ? '21px' : '24px';
  const circleSize = steps.length > 4 ? '44px' : '50px';
  const circleFont = steps.length > 4 ? '18px' : '22px';
  const connectorH = steps.length > 4 ? '20px' : '28px';

  return new ImageResponse(
    (
      <div style={{
        width: '1080px', height: '1080px', display: 'flex', flexDirection: 'column',
        background: BG, padding: '70px', position: 'relative', fontFamily: 'sans-serif',
      }}>
        <AccentBar />
        {/* Subtle side glow */}
        <div style={{
          position: 'absolute', top: '20%', left: 0, width: '300px', height: '60%',
          background: `linear-gradient(90deg, ${ACCENT_GLOW} 0%, transparent 100%)`,
          display: 'flex',
        }} />

        {/* Header */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', position: 'relative' }}>
          <TagBadge label={tag} />
          <div style={{
            fontSize: title.length > 40 ? '38px' : '44px',
            fontWeight: 700, lineHeight: 1.15, color: TEXT, display: 'flex',
          }}>{title}</div>
          <DecorLine />
        </div>

        {/* Steps — centered vertically */}
        <div style={{
          display: 'flex', flexDirection: 'column', flex: 1,
          justifyContent: 'center', position: 'relative',
          paddingLeft: '10px',
        }}>
          {steps.map((s, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                <div style={{
                  width: circleSize, height: circleSize,
                  border: `3px solid ${ACCENT}`, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: circleFont, color: ACCENT,
                  background: ACCENT_GLOW,
                }}>{i + 1}</div>
                <div style={{
                  fontSize: stepFontSize, lineHeight: 1.5, color: `${TEXT}ee`,
                  display: 'flex', flex: 1,
                }}>{s}</div>
              </div>
              {i < steps.length - 1 && (
                <div style={{
                  display: 'flex', justifyContent: 'flex-start',
                  paddingLeft: `${parseInt(circleSize) / 2 - 1}px`,
                }}>
                  <div style={{
                    width: '3px', height: connectorH,
                    background: `linear-gradient(180deg, ${ACCENT}66, ${ACCENT}22)`,
                    borderRadius: '2px', display: 'flex',
                  }} />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <LogoBar />
      </div>
    ),
    { width: 1080, height: 1080 },
  );
}
