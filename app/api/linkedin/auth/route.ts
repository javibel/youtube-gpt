import { NextResponse } from 'next/server';
import { auth } from '@/auth';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? '';

export async function GET() {
  const session = await auth();
  if (session?.user?.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const clientId = process.env.LINKEDIN_CLIENT_ID;
  if (!clientId) return NextResponse.json({ error: 'LINKEDIN_CLIENT_ID not set' }, { status: 500 });

  const redirectUri = 'https://ytubviral.com/api/linkedin/callback';
  const scope = 'w_member_social r_liteprofile';
  const state = Math.random().toString(36).slice(2);

  const url = new URL('https://www.linkedin.com/oauth/v2/authorization');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', scope);
  url.searchParams.set('state', state);

  return NextResponse.redirect(url.toString());
}
