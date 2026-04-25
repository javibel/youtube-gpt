import { NextResponse } from 'next/server';
import { auth } from '@/auth';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? '';

export async function GET() {
  const session = await auth();
  if (session?.user?.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  if (!token) return NextResponse.json({ error: 'LINKEDIN_ACCESS_TOKEN not set' }, { status: 500 });

  // Try several LinkedIn endpoints to find the member ID
  const endpoints = [
    { url: 'https://api.linkedin.com/v2/me', label: '/v2/me' },
    { url: 'https://api.linkedin.com/v2/userinfo', label: '/v2/userinfo' },
    { url: 'https://api.linkedin.com/v2/people/~', label: '/v2/people/~' },
  ];

  const results: Record<string, unknown> = {};

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep.url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Restli-Protocol-Version': '2.0.0',
        },
      });
      const data = await res.json();
      results[ep.label] = { status: res.status, data };
    } catch (err) {
      results[ep.label] = { error: String(err) };
    }
  }

  return NextResponse.json({
    instructions: 'Busca en los resultados el campo "id" o "sub" — ese es tu LinkedIn Member ID',
    results,
  });
}
