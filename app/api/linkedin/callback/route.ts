import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const state = searchParams.get('state') ?? '';

  if (error || !code) {
    return NextResponse.json({ error: error ?? 'No code received' }, { status: 400 });
  }

  // Validate OAuth state to prevent CSRF
  const expectedState = request.cookies.get('li_oauth_state')?.value ?? '';
  if (!state || !expectedState || state !== expectedState) {
    return NextResponse.json({ error: 'Invalid OAuth state' }, { status: 403 });
  }

  const clientId = process.env.LINKEDIN_CLIENT_ID!;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET!;
  const redirectUri = 'https://ytubviral.com/api/linkedin/callback';

  const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  const data = await res.json();

  if (!data.access_token) {
    return NextResponse.json({ error: 'Token exchange failed', detail: data }, { status: 500 });
  }

  // Fetch member ID via OpenID userinfo
  let memberId: string | null = null;
  try {
    const userinfo = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    if (userinfo.ok) {
      const ui = await userinfo.json();
      memberId = ui.sub ?? null;
    }
  } catch {}

  return NextResponse.json({
    ok: true,
    access_token: data.access_token,
    expires_in: data.expires_in,
    expires_days: Math.floor((data.expires_in ?? 0) / 86400),
    member_id: memberId,
    instructions: [
      '1. Añade access_token a Vercel como LINKEDIN_ACCESS_TOKEN',
      memberId
        ? `2. Añade "${memberId}" a Vercel como LINKEDIN_MEMBER_ID`
        : '2. member_id es null — el token no tiene scope openid',
    ],
  });
}
