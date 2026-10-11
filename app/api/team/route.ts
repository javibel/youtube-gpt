import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { createTeamOriginal, validTeamCreation } from '@/lib/team-creation';
import { exitTeamOriginal, validTeamExit } from '@/lib/team-exit';
export const maxDuration = 60;
import { decodeTeamRead } from '@/lib/team-read-contract';

// GET — get user's team (if any)
export async function GET(request?: Request) {
  const deadline = performance.now() + 25_000;
  let retired = false, rejectWait!: (error: Error) => void;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; });
  void stopped.catch(() => {});
  const retire = () => { if (!retired) { retired = true; rejectWait(Error('Team unavailable')); } };
  const timer = setTimeout(retire, 25_000);
  request?.signal.addEventListener('abort', retire, { once: true });
  const check = () => { if (request?.signal.aborted || performance.now() >= deadline) retire(); if (retired) throw Error('Team unavailable'); };
  const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  try {
    const original = Promise.resolve().then(async () => {
      check(); const session = await auth(); check();
      if (!session?.user?.id) return reply({ error: 'Unauthorized' }, 401);
      const owner = Object.freeze({ userId: session.user.id, email: session.user.email ?? null });
      const observedAt = new Date().toISOString();
      // Two rows detect ambiguous membership. The projection excludes invitation
      // tokens, private user fields and unnecessary team metadata at the SQL edge.
      const memberships = await prisma.teamMember.findMany({
        where: { userId: owner.userId }, take: 2,
        select: { id: true, userId: true, teamId: true, role: true, team: { select: {
          id: true, name: true, slug: true, plan: true, maxMembers: true,
          members: { take: 1001, orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }], select: { id: true, userId: true, teamId: true, role: true, joinedAt: true, user: { select: { id: true, name: true, email: true } } } },
          invitations: { take: 1001, where: { expiresAt: { gt: new Date(observedAt) } }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], select: { id: true, teamId: true, email: true, role: true, expiresAt: true } },
        } } },
      });
      check();
      if (!memberships.length) return reply({ ...owner, observedAt, team: null, role: null });
      if (memberships.length !== 1) throw Error('Team unavailable');
      const membership = memberships[0], team = membership.team;
      if (membership.userId !== owner.userId || membership.teamId !== team.id
        || team.members.some(m => m.teamId !== team.id || m.userId !== m.user.id)
        || team.invitations.some(i => i.teamId !== team.id)
        || !team.members.some(m => m.id === membership.id && m.userId === owner.userId && m.role === membership.role)) throw Error('Team unavailable');
      const data = decodeTeamRead({ ...owner, observedAt, role: membership.role, team: { ...team,
        members: team.members.map(m => ({ id: m.id, role: m.role, joinedAt: m.joinedAt.toISOString(), user: m.user })),
        invitations: membership.role === 'member' ? [] : team.invitations.map(i => ({ id: i.id, email: i.email, role: i.role, expiresAt: i.expiresAt.toISOString() })),
      } }, owner);
      check(); return reply({ ...owner, ...data });
    });
    const response = await Promise.race([original, stopped]); check(); return response;
  } catch { return reply({ error: 'team_read_unavailable' }, 503); }
  finally { clearTimeout(timer); request?.signal.removeEventListener('abort', retire); }
}

// POST — create team
export async function POST(request: NextRequest) {
  const deadline = performance.now() + 55_000;
  let retired = false, rejectWait!: (error: Error) => void;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; });
  void stopped.catch(() => {});
  const retire = () => { if (!retired) { retired = true; rejectWait(Error('Team unconfirmed')); } };
  const timer = setTimeout(retire, 55_000);
  request.signal.addEventListener('abort', retire, { once: true });
  const check = () => { if (request.signal.aborted || performance.now() >= deadline) retire(); if (retired) throw Error('Team unconfirmed'); };
  const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  try {
    const original = Promise.resolve().then(async () => {
      check(); const session = await auth(); check();
      if (!session?.user?.id || typeof session.user.email !== 'string') return reply({ error: 'Unauthorized' }, 401);
      const owner = Object.freeze({ userId: session.user.id, email: session.user.email });
      const key = request.headers.get('Idempotency-Key');
      let body: unknown;
      try { body = await request.json(); } catch { check(); return reply({ error: 'invalid_input' }, 400); }
      check(); if (!validTeamCreation(body, key)) return reply({ error: 'invalid_input' }, 400);
      const result = await createTeamOriginal(owner, { name: body.name }, key!, check);
      return result.ok ? reply(result, 201) : reply({ error: result.error }, result.status);
    });
    const response = await Promise.race([original, stopped]); check(); return response;
  } catch { return reply({ error: 'team_create_unconfirmed' }, 503); }
  finally { clearTimeout(timer); request.signal.removeEventListener('abort', retire); }
}

// PATCH — update team name
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const membership = await prisma.teamMember.findFirst({
    where: { userId: session.user.id, role: { in: ['owner', 'admin'] } },
  });
  if (!membership) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const { name } = await req.json();
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return NextResponse.json({ error: 'Team name required' }, { status: 400 });
  }

  await prisma.team.update({
    where: { id: membership.teamId },
    data: { name: name.trim() },
  });

  return NextResponse.json({ ok: true });
}

// DELETE — leave or delete team
export async function DELETE(request: NextRequest) {
  const deadline = performance.now() + 55_000;
  let retired = false, rejectWait!: (error: Error) => void;
  const stopped = new Promise<never>((_, reject) => { rejectWait = reject; });
  void stopped.catch(() => {});
  const retire = () => { if (!retired) { retired = true; rejectWait(Error('Team exit unconfirmed')); } };
  const timer = setTimeout(retire, 55_000);
  request.signal.addEventListener('abort', retire, { once: true });
  const check = () => { if (request.signal.aborted || performance.now() >= deadline) retire(); if (retired) throw Error('Team exit unconfirmed'); };
  const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  try {
    const original = Promise.resolve().then(async () => {
      check(); const session = await auth(); check();
      if (!session?.user?.id || typeof session.user.email !== 'string') return reply({ error: 'Unauthorized' }, 401);
      const owner = Object.freeze({ userId: session.user.id, email: session.user.email });
      const key = request.headers.get('Idempotency-Key');
      let body: unknown;
      try { body = await request.json(); } catch { check(); return reply({ error: 'invalid_input' }, 400); }
      check(); if (!validTeamExit(body, key)) return reply({ error: 'invalid_input' }, 400);
      const result = await exitTeamOriginal(owner, body, key!, check);
      return result.ok ? reply(result) : reply({ error: result.error }, result.status);
    });
    const response = await Promise.race([original, stopped]); check(); return response;
  } catch { return reply({ error: 'team_exit_unconfirmed' }, 503); }
  finally { clearTimeout(timer); request.signal.removeEventListener('abort', retire); }
}
