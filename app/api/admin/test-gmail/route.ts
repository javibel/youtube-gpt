import { NextResponse } from 'next/server';
import { runGmailAgent } from '@/lib/agent/gmail-agent';

export async function GET() {
  try {
    const result = await runGmailAgent();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
