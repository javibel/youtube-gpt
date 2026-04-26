import { NextResponse } from 'next/server';

export async function GET() {
  const clientId = process.env.GMAIL_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID ?? '(not set)';
  const clientSecret = process.env.GMAIL_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET ?? '(not set)';
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN ?? process.env.GOOGLE_REFRESH_TOKEN ?? '(not set)';

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const data = await res.json();

  return NextResponse.json({
    status: res.status,
    clientIdPrefix: clientId.slice(0, 30),
    clientSecretPrefix: clientSecret.slice(0, 10),
    refreshTokenPrefix: refreshToken.slice(0, 20),
    googleResponse: data,
  });
}
