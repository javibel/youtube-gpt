import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error || !code) {
    return NextResponse.json({ error: error ?? 'No code received' }, { status: 400 });
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

  // Return token info so admin can copy it
  return NextResponse.json({
    ok: true,
    access_token: data.access_token,
    expires_in: data.expires_in,
    expires_days: Math.floor((data.expires_in ?? 0) / 86400),
    instructions: 'Copia el access_token y añádelo a Vercel como LINKEDIN_ACCESS_TOKEN',
  });
}
