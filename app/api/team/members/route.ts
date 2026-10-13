import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { authorizeNativeTeam, runNativeTeam } from '@/lib/team-native-authorization';
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
  const checkWait = () => { if (request.signal.aborted || performance.now() >= deadline) retire(); if (retired) throw Error('Member unconfirmed'); };
  const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  const authentication: { check?: () => void } = {};
  const check = () => { checkWait(); authentication.check?.(); };
  try {
    const original = Promise.resolve().then(async () => {
      checkWait(); const authorization = await authorizeNativeTeam((operation === 'role' ? 'member-role' : 'member-remove')); checkWait();
      if (!authorization) return reply({ error: 'Unauthorized' }, 401);
      return runNativeTeam(authorization, (operation === 'role' ? 'member-role' : 'member-remove'), async (owner, checkSession) => {
        authentication.check = checkSession;
        check();
        const key = request.headers.get('Idempotency-Key');
        let body: unknown;
        try { body = await request.json(); } catch { check(); return reply({ error: 'invalid_input' }, 400); }
        check(); if (!validMemberMutation(body, key, operation)) return reply({ error: 'invalid_input' }, 400);
        const result = await mutateTeamMemberOriginal(owner, { teamId: body.teamId, memberId: body.memberId,
          targetUserId: body.targetUserId, previousRole: body.previousRole, role: body.role }, key!, operation, check);
        return result.ok ? reply(result) : reply({ error: result.error }, result.status);
      });
    });
    const response = await Promise.race([original, stopped]); check(); return response;
  } catch { return reply({ error: 'member_mutation_unconfirmed' }, 503); }
  finally { clearTimeout(timer); request.signal.removeEventListener('abort', retire); }
}
export async function PATCH(request: NextRequest) { return originalMutation(request, 'role'); }
export async function DELETE(request: NextRequest) { return originalMutation(request, 'remove'); }
