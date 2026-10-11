import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { inviteTeamOriginal, validTeamInvitation } from '@/lib/team-invitation';
import { revokeInvitationOriginal, validInvitationRevocation } from '@/lib/team-invitation-revocation';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const deadline = performance.now() + 55_000;
  let retired = false, rejectWait!: (error: Error) => void;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; });
  void stopped.catch(() => {});
  const retire = () => { if (!retired) { retired = true; rejectWait(Error('Invitation unconfirmed')); } };
  const timer = setTimeout(retire, 55_000);
  req.signal.addEventListener('abort', retire, { once: true });
  const check = () => { if (req.signal.aborted || performance.now() >= deadline) retire(); if (retired) throw Error('Invitation unconfirmed'); };
  const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  try {
    const original = Promise.resolve().then(async () => {
      check(); const session = await auth(); check();
      if (!session?.user?.id || typeof session.user.email !== 'string') return reply({ error: 'Unauthorized' }, 401);
      const owner = Object.freeze({ userId: session.user.id, email: session.user.email });
      const key = req.headers.get('Idempotency-Key');
      let body: unknown;
      try { body = await req.json(); } catch { check(); return reply({ error: 'invalid_input' }, 400); }
      check(); if (!validTeamInvitation(body, key)) return reply({ error: 'invalid_input' }, 400);
      const result = await inviteTeamOriginal(owner, { teamId: body.teamId, memberId: body.memberId, previousRole: body.previousRole, targetEmail: body.targetEmail, role: body.role }, key!, check);
      return result.ok ? reply(result, 201) : reply({ error: result.error }, result.status);
    });
    const response = await Promise.race([original, stopped]); check(); return response;
  } catch { return reply({ error: 'team_invitation_unconfirmed' }, 503); }
  finally { clearTimeout(timer); req.signal.removeEventListener('abort', retire); }
}

export async function DELETE(req: NextRequest) {
  const deadline = performance.now() + 55_000;
  let retired = false, rejectWait!: (error: Error) => void;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; });
  void stopped.catch(() => {});
  const retire = () => { if (!retired) { retired = true; rejectWait(Error('Revocation unconfirmed')); } };
  const timer = setTimeout(retire, 55_000);
  req.signal.addEventListener('abort', retire, { once: true });
  const check = () => { if (req.signal.aborted || performance.now() >= deadline) retire(); if (retired) throw Error('Revocation unconfirmed'); };
  const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  try {
    const original = Promise.resolve().then(async () => {
      check(); const session = await auth(); check();
      if (!session?.user?.id || typeof session.user.email !== 'string') return reply({ error: 'Unauthorized' }, 401);
      const owner = Object.freeze({ userId: session.user.id, email: session.user.email });
      const key = req.headers.get('Idempotency-Key');
      let body: unknown;
      try { body = await req.json(); } catch { check(); return reply({ error: 'invalid_input' }, 400); }
      check(); if (!validInvitationRevocation(body, key)) return reply({ error: 'invalid_input' }, 400);
      const result = await revokeInvitationOriginal(owner, { teamId: body.teamId, invitationId: body.invitationId,
        targetEmail: body.targetEmail, previousRole: body.previousRole, previousExpiresAt: body.previousExpiresAt }, key!, check);
      return result.ok ? reply(result) : reply({ error: result.error }, result.status);
    });
    const response = await Promise.race([original, stopped]); check(); return response;
  } catch { return reply({ error: 'invitation_revocation_unconfirmed' }, 503); }
  finally { clearTimeout(timer); req.signal.removeEventListener('abort', retire); }
}
