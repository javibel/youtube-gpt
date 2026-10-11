import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { mutateTeamMemberOriginal, validMemberMutation } from '@/lib/team-member-mutation';
import type { MemberOperation } from '@/lib/team-member-mutation';
export const maxDuration = 60;

async function originalMutation(request: NextRequest, operation: MemberOperation) {
  const deadline = performance.now() + 55_000;
  let retired = false, rejectWait!: (error: Error) => void;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; });
  void stopped.catch(() => {});
  const retire = () => { if (!retired) { retired = true; rejectWait(Error('Member unconfirmed')); } };
  const timer = setTimeout(retire, 55_000);
  request.signal.addEventListener('abort', retire, { once: true });
  const check = () => { if (request.signal.aborted || performance.now() >= deadline) retire(); if (retired) throw Error('Member unconfirmed'); };
  const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  try {
    const original = Promise.resolve().then(async () => {
      check(); const session = await auth(); check();
      if (!session?.user?.id || typeof session.user.email !== 'string') return reply({ error: 'Unauthorized' }, 401);
      const owner = Object.freeze({ userId: session.user.id, email: session.user.email });
      const key = request.headers.get('Idempotency-Key');
      let body: unknown;
      try { body = await request.json(); } catch { check(); return reply({ error: 'invalid_input' }, 400); }
      check(); if (!validMemberMutation(body, key, operation)) return reply({ error: 'invalid_input' }, 400);
      const result = await mutateTeamMemberOriginal(owner, { teamId: body.teamId, memberId: body.memberId,
        targetUserId: body.targetUserId, previousRole: body.previousRole, role: body.role }, key!, operation, check);
      return result.ok ? reply(result) : reply({ error: result.error }, result.status);
    });
    const response = await Promise.race([original, stopped]); check(); return response;
  } catch { return reply({ error: 'member_mutation_unconfirmed' }, 503); }
  finally { clearTimeout(timer); request.signal.removeEventListener('abort', retire); }
}
export async function PATCH(request: NextRequest) { return originalMutation(request, 'role'); }
export async function DELETE(request: NextRequest) { return originalMutation(request, 'remove'); }
