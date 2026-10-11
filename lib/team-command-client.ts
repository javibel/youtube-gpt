import type { TeamOwner } from '@/lib/team-read-contract';

const active = new Map<string, object>(), denied = new Set<string>();
const scope = (owner: TeamOwner, teamId: string) => JSON.stringify([owner.userId, owner.email, teamId]);
const prefixes = ['ytubviral:team-command:', 'ytubviral:team-members:', 'ytubviral:team-revoke:'];
export function teamCommandBlocked(owner: TeamOwner, teamId: string): boolean {
  const identity = scope(owner, teamId);
  if (active.has(identity) || denied.has(identity)) return true;
  // Presence only denies. Older member markers also deny across operations;
  // their contents never restore a producer, receipt or permission.
  try { return prefixes.some(prefix => sessionStorage.getItem(prefix + identity) !== null); }
  catch { return true; }
}
export function reserveTeamCommand(owner: TeamOwner, teamId: string): (() => void) | null {
  if (teamCommandBlocked(owner, teamId)) return null;
  const identity = scope(owner, teamId), token = {}, marker = prefixes[0] + identity;
  active.set(identity, token);
  try { sessionStorage.setItem(marker, 'pending'); }
  catch { denied.add(identity); return null; }
  // Only the capturing live original calls this closure after its exact
  // acknowledgement or a known rejection before effects. No expiry/reset.
  return () => {
    if (active.get(identity) !== token) return;
    try { sessionStorage.removeItem(marker); active.delete(identity); }
    catch { denied.add(identity); }
  };
}
