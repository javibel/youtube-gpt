import { NextRequest, NextResponse } from 'next/server';
import { rateLimitRequest } from '@/lib/rate-limit-db';

export const runtime = 'nodejs';

// A5 (2026-07-05): collects Content-Security-Policy-Report-Only violations while the
// hardened CSP candidate (next.config.ts) runs in observation mode. Logs only — no DB
// write, Vercel's own log retention is enough for a 1-2 week window. Rate-limited so a
// noisy/malicious client can't use this as a free log-spam vector.
export async function POST(req: NextRequest) {
  const allowed = await rateLimitRequest(req, 'csp-report', 10, 1);
  if (!allowed) return NextResponse.json({ ok: true });

  try {
    const body = await req.json();
    const report = body['csp-report'] ?? body;
    console.warn('[csp-report]', JSON.stringify({
      blockedUri: report['blocked-uri'],
      violatedDirective: report['violated-directive'],
      documentUri: report['document-uri'],
    }));
  } catch {
    // Malformed report body — ignore, nothing to log.
  }

  return NextResponse.json({ ok: true });
}
