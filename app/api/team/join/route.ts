import { NextRequest, NextResponse } from 'next/server';
import { authorizeNativeTeam, runNativeTeam } from '@/lib/team-native-authorization';
import { joinTeamOriginal, validTeamJoin } from '@/lib/team-join';

export const maxDuration = 60;
export async function POST(req: NextRequest) {
  const deadline = performance.now() + 55_000;
  let retired = false, rejectWait!: (error: Error) => void;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; });
  void stopped.catch(() => {});
  const retire = () => { if (!retired) { retired = true; rejectWait(Error('Join unconfirmed')); } };
  const timer = setTimeout(retire, 55_000);
  req.signal.addEventListener('abort', retire, { once: true });
  const checkWait = () => { if (req.signal.aborted || performance.now() >= deadline) retire(); if (retired) throw Error('Join unconfirmed'); };
  const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  const authentication: { check?: () => void } = {};
  const check = () => { checkWait(); authentication.check?.(); };
  try {
    const original = Promise.resolve().then(async () => {
      checkWait(); const authorization = await authorizeNativeTeam('join'); checkWait();
      if (!authorization) return reply({ error: 'Unauthorized' }, 401);
      return runNativeTeam(authorization, 'join', async (owner, checkSession) => {
        authentication.check = checkSession;
        check();
        const key = req.headers.get('Idempotency-Key');
        let body: unknown;
        try { body = await req.json(); } catch { check(); return reply({ error: 'invalid_input' }, 400); }
        check(); if (!validTeamJoin(body, key)) return reply({ error: 'invalid_input' }, 400);
        const result = await joinTeamOriginal(owner, { token: body.token }, key!, check);
        return result.ok ? reply(result) : reply({ error: result.error }, result.status);
      });
    });
    const response = await Promise.race([original, stopped]); check(); return response;
  } catch { return reply({ error: 'team_join_unconfirmed' }, 503); }
  finally { clearTimeout(timer); req.signal.removeEventListener('abort', retire); }
}
