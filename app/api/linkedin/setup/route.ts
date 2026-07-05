import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guards';

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

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
