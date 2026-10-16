import { NextResponse } from 'next/server';
import { runGmailAgent } from '@/lib/agent/gmail-agent';
import { runYoutubeAgent } from '@/lib/agent/youtube-agent';
import { requireAdmin } from '@/lib/auth-guards';

export async function POST(request: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { action } = await request.json();
  // action: 'publish' | 'messages' | 'test'
  // type: 'morning' | 'evening' (for publish/test)

  try {
    if (action === 'publish' || action === 'test') {
      return NextResponse.json({ok:false,error:'social_post_cron_invocation_required'},{status:503});
    }

    if (action === 'messages') {
      const [gmail, youtube] = await Promise.allSettled([
        runGmailAgent(),
        runYoutubeAgent(),
      ]);
      return NextResponse.json({
        ok: true,
        gmail: gmail.status === 'fulfilled' ? gmail.value : { error: String(gmail.reason) },
        youtube: youtube.status === 'fulfilled' ? youtube.value : { error: String(youtube.reason) },
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[agent/run]', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
