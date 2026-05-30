import { ImageResponse } from 'next/og';

export const runtime = 'edge';

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
    case 'listicle': return renderListicle(title, points, tag);
    case 'story': return renderStory(quote, tag);
    case 'hot-take': return renderHotTake(quote);
    case 'framework': return renderFramework(title, points, tag);
    default: return renderStory(quote, tag);
  }
}

// ── LISTICLE ────────────────────────────────────────────────────────────────

function renderListicle(title: string, points: string[], tag: string) {
  const n = points.length;
  const badgeSize = n > 5 ? '36px' : '44px';
  const badgeFont = n > 5 ? '17px' : '21px';
  const textSize = n > 5 ? '21px' : '25px';
  const rowGap = n > 5 ? '20px' : '28px';

  return new ImageResponse(
    (
      <div style={{
        width: '1080px', height: '1080px', display: 'flex', flexDirection: 'column',
        background: BG, padding: '64px 76px', fontFamily: 'sans-serif', position: 'relative',
      }}>
        {/* Top accent bar */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '6px', background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT}66)`, display: 'flex' }} />
        {/* Subtle right glow */}
        <div style={{ position: 'absolute', top: '10%', right: 0, width: '350px', height: '80%', background: `radial-gradient(ellipse at 100% 50%, ${ACCENT_GLOW} 0%, transparent 70%)`, display: 'flex' }} />

        {/* ── Header zone ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{ display: 'flex' }}>
            <span style={{ background: ACCENT_GLOW_STRONG, color: ACCENT, fontSize: '14px', fontWeight: 700, padding: '7px 18px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '1.5px' }}>{tag}</span>
          </div>
          <div style={{ fontSize: title.length > 50 ? '40px' : '50px', fontWeight: 700, lineHeight: 1.1, color: TEXT, display: 'flex' }}>{title}</div>
          <div style={{ width: '56px', height: '3px', borderRadius: '2px', background: ACCENT, display: 'flex' }} />
        </div>

        {/* ── Content zone — centered in remaining space ── */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: rowGap }}>
          {points.map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div style={{
                minWidth: badgeSize, height: badgeSize, background: ACCENT,
                borderRadius: '10px', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontWeight: 700, fontSize: badgeFont, color: TEXT,
              }}>{i + 1}</div>
              <div style={{ fontSize: textSize, lineHeight: 1.55, color: `${TEXT}ee`, display: 'flex' }}>{p}</div>
            </div>
          ))}
        </div>

        {/* ── Footer zone ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: ACCENT, display: 'flex' }} />
            <span style={{ fontSize: '17px', fontWeight: 600, color: MUTED }}>ytubviral.com</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '14px', color: `${MUTED}99` }}>Guarda este post</span>
            <span style={{ fontSize: '18px', display: 'flex' }}>📌</span>
          </div>
        </div>
      </div>
    ),
    { width: 1080, height: 1080 },
  );
}

// ── STORY ───────────────────────────────────────────────────────────────────

function renderStory(quote: string, tag: string) {
  const sz = quote.length > 120 ? '36px' : quote.length > 80 ? '44px' : '52px';

  return new ImageResponse(
    (
      <div style={{
        width: '1080px', height: '1080px', display: 'flex', flexDirection: 'column',
        background: BG, padding: '64px 76px', fontFamily: 'sans-serif', position: 'relative',
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '6px', background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT}66)`, display: 'flex' }} />
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: '500px', height: '500px', background: `radial-gradient(circle at 100% 100%, ${ACCENT_GLOW} 0%, transparent 70%)`, display: 'flex' }} />

        {/* ── Header ── */}
        <div style={{ display: 'flex' }}>
          <span style={{ background: ACCENT_GLOW_STRONG, color: ACCENT, fontSize: '14px', fontWeight: 700, padding: '7px 18px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '1.5px' }}>{tag}</span>
        </div>

        {/* ── Center ── */}
        <div style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'center', paddingLeft: '40px', position: 'relative' }}>
          {/* Decorative quote mark */}
          <div style={{ position: 'absolute', top: '20px', left: '-8px', fontSize: '220px', fontWeight: 700, color: ACCENT, opacity: 0.1, lineHeight: 0.8, display: 'flex' }}>"</div>
          {/* Vertical bar */}
          <div style={{ position: 'absolute', left: 0, top: '15%', bottom: '25%', width: '4px', borderRadius: '2px', background: `linear-gradient(180deg, ${ACCENT}, ${ACCENT}44)`, display: 'flex' }} />

          <div style={{ fontSize: sz, fontWeight: 600, lineHeight: 1.4, color: TEXT, display: 'flex', marginBottom: '40px' }}>
            "{quote}"
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ width: '48px', height: '3px', background: ACCENT, borderRadius: '2px', display: 'flex' }} />
            <span style={{ fontSize: '19px', color: MUTED_LIGHT }}>Javier Jimeno, fundador de YTubViral</span>
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: ACCENT, display: 'flex' }} />
          <span style={{ fontSize: '17px', fontWeight: 600, color: MUTED }}>ytubviral.com</span>
        </div>
      </div>
    ),
    { width: 1080, height: 1080 },
  );
}

// ── HOT TAKE ────────────────────────────────────────────────────────────────

function renderHotTake(quote: string) {
  const sz = quote.length > 100 ? '46px' : quote.length > 60 ? '56px' : '64px';

  return new ImageResponse(
    (
      <div style={{
        width: '1080px', height: '1080px', display: 'flex', flexDirection: 'column',
        background: BG, padding: '64px 76px', fontFamily: 'sans-serif', position: 'relative',
      }}>
        {/* Atmosphere */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: `radial-gradient(ellipse at 15% 35%, rgba(232,77,91,0.14) 0%, transparent 55%)`, display: 'flex' }} />
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: `radial-gradient(ellipse at 85% 75%, rgba(232,77,91,0.09) 0%, transparent 55%)`, display: 'flex' }} />
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '6px', background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT}66)`, display: 'flex' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '4px', background: `linear-gradient(90deg, ${ACCENT}44, ${ACCENT}11)`, display: 'flex' }} />

        {/* ── Header ── */}
        <div style={{ display: 'flex' }}>
          <span style={{ background: ACCENT_GLOW_STRONG, color: ACCENT, fontSize: '14px', fontWeight: 700, padding: '7px 18px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Opinión</span>
        </div>

        {/* ── Center — hero text ── */}
        <div style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: sz, fontWeight: 700, lineHeight: 1.2, color: TEXT, display: 'flex' }}>{quote}</div>
        </div>

        {/* ── Footer ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '26px', display: 'flex' }}>💬</span>
            <span style={{ fontSize: '17px', color: MUTED_LIGHT }}>¿De acuerdo? Comenta abajo</span>
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
  const n = steps.length;
  const stepFont = n > 4 ? '22px' : '25px';
  const circleSize = n > 4 ? '46px' : '52px';
  const circleFont = n > 4 ? '19px' : '22px';
  const connH = n > 4 ? '18px' : '26px';

  return new ImageResponse(
    (
      <div style={{
        width: '1080px', height: '1080px', display: 'flex', flexDirection: 'column',
        background: BG, padding: '64px 76px', fontFamily: 'sans-serif', position: 'relative',
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '6px', background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT}66)`, display: 'flex' }} />
        {/* Left edge glow */}
        <div style={{ position: 'absolute', top: '15%', left: 0, width: '280px', height: '70%', background: `linear-gradient(90deg, ${ACCENT_GLOW} 0%, transparent 100%)`, display: 'flex' }} />

        {/* ── Header ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{ display: 'flex' }}>
            <span style={{ background: ACCENT_GLOW_STRONG, color: ACCENT, fontSize: '14px', fontWeight: 700, padding: '7px 18px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '1.5px' }}>{tag}</span>
          </div>
          <div style={{ fontSize: title.length > 40 ? '40px' : '48px', fontWeight: 700, lineHeight: 1.1, color: TEXT, display: 'flex' }}>{title}</div>
          <div style={{ width: '56px', height: '3px', borderRadius: '2px', background: ACCENT, display: 'flex' }} />
        </div>

        {/* ── Steps — centered in remaining space ── */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', paddingLeft: '4px' }}>
          {steps.map((s, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '22px' }}>
                <div style={{
                  minWidth: circleSize, height: circleSize,
                  border: `3px solid ${ACCENT}`, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: circleFont, color: ACCENT,
                  background: ACCENT_GLOW,
                }}>{i + 1}</div>
                <div style={{ fontSize: stepFont, lineHeight: 1.55, color: `${TEXT}ee`, display: 'flex' }}>{s}</div>
              </div>
              {i < n - 1 && (
                <div style={{ display: 'flex', paddingLeft: `${parseInt(circleSize) / 2 - 1}px` }}>
                  <div style={{ width: '3px', height: connH, background: `linear-gradient(180deg, ${ACCENT}77, ${ACCENT}22)`, borderRadius: '2px', display: 'flex' }} />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Footer ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: ACCENT, display: 'flex' }} />
          <span style={{ fontSize: '17px', fontWeight: 600, color: MUTED }}>ytubviral.com</span>
        </div>
      </div>
    ),
    { width: 1080, height: 1080 },
  );
}
