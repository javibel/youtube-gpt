import { NextRequest, NextResponse } from 'next/server';

const CLIENT_ID = '844267778594-a3ie53vv2lf69djc3da2dlsgsk1rdq6f.apps.googleusercontent.com';
const REDIRECT_URI = 'https://ytubviral.com/api/admin/gmail-callback';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const error = req.nextUrl.searchParams.get('error');

  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  if (!code) {
    // Step 1: redirect to Google
    const clientSecret = process.env.GMAIL_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET!;
    const scopes = [
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.send',
    ].join(' ');
    const url =
      `https://accounts.google.com/o/oauth2/v2/auth` +
      `?client_id=${encodeURIComponent(CLIENT_ID)}` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&access_type=offline` +
      `&prompt=consent`;
    return NextResponse.redirect(url);
  }

  // Step 2: exchange code for tokens
  const clientSecret = process.env.GMAIL_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET!;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });

  const data = await res.json();

  if (data.refresh_token) {
    return new NextResponse(
      `<html><body style="font-family:monospace;padding:2rem">
        <h2>GMAIL_REFRESH_TOKEN</h2>
        <p>Copia este valor y ponlo en Vercel → Environment Variables → GMAIL_REFRESH_TOKEN:</p>
        <textarea rows="4" cols="80" onclick="this.select()">${data.refresh_token}</textarea>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  }

  return NextResponse.json({ error: 'No refresh_token', data }, { status: 400 });
}
