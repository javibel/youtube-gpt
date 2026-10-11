import { decodeTeamRead } from '@/lib/team-read-contract';
import type { TeamOwner, TeamReadData } from '@/lib/team-read-contract';
export type TeamOutcome = { status: 'ready'; data: TeamReadData } | { status: 'error'; error: string };
export interface TeamRead { owner: TeamOwner; pending: boolean; original: Promise<TeamOutcome>; waiter: Promise<TeamOutcome>; outcome?: TeamOutcome; waitOutcome?: TeamOutcome }
const live = new Map<string, TeamRead>();
const unavailable = (): TeamOutcome => ({ status: 'error', error: 'team_read_unavailable' });
export function beginTeamRead(owner: TeamOwner, afterCurrent = false): TeamRead {
  const own = Object.freeze({ userId: owner.userId, email: owner.email }), key = JSON.stringify([own.userId, own.email]);
  const existing = live.get(key); if (existing && !afterCurrent) return existing;
  const read: TeamRead = { owner: own, pending: true, original: Promise.resolve(unavailable()), waiter: Promise.resolve(unavailable()) };
  live.set(key, read); const deadline = performance.now() + 30_000;
  read.original = Promise.resolve().then(async (): Promise<TeamOutcome> => {
    try {
      if (existing) await existing.original;
      if (!own.userId || performance.now() >= deadline) return unavailable();
      const response = await fetch('/api/team', { method: 'GET', cache: 'no-store' });
      const body: unknown = await response.json();
      if (response.ok && response.status === 200) return { status: 'ready', data: decodeTeamRead(body, own) };
      if (body && typeof body === 'object' && 'error' in body && ((response.status === 401 && body.error === 'Unauthorized') || (response.status === 503 && body.error === 'team_read_unavailable'))) return { status: 'error', error: body.error as string };
    } catch { /* Do not display private SQL, auth or transport diagnostics. */ }
    return unavailable();
  }).then(outcome => { read.pending = false; read.outcome = outcome; if (live.get(key) === read) live.delete(key); return outcome; });
  let timer: ReturnType<typeof setTimeout> | undefined;
  read.waiter = (async () => {
    try {
      const outcome = await Promise.race([read.original, new Promise<TeamOutcome>(resolve => { timer = setTimeout(() => resolve(unavailable()), Math.max(0, deadline - performance.now())); })]);
      return read.waitOutcome = performance.now() >= deadline ? unavailable() : outcome;
    } finally { clearTimeout(timer); }
  })();
  return read;
}
