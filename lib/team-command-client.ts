import type { TeamOwner } from '@/lib/team-read-contract';

const active = new Map<string, object>(), denied = new Set<string>();
const scope = (owner: TeamOwner, teamId: string) => JSON.stringify([owner.userId, owner.email, teamId]);
const prefixes = ['ytubviral:team-command:', 'ytubviral:team-members:', 'ytubviral:team-revoke:', 'ytubviral:team-exit:', 'ytubviral:team-rename:', 'ytubviral:team-invite:'];
const owners = new Map<string, object>(), deniedOwners = new Set<string>();
const ownerScope = (owner: TeamOwner) => JSON.stringify([owner.userId, owner.email]);
const ownerPrefix = 'ytubviral:team-owner-command:';
export function teamOwnerCommandBlocked(owner: TeamOwner): boolean {
  const identity = ownerScope(owner);
  if (owners.has(identity) || deniedOwners.has(identity)) return true;
  try {
    if ([ownerPrefix, 'ytubviral:team-create:', 'ytubviral:team-invite-owner:', 'ytubviral:team-exit-owner:', 'ytubviral:team-rename-owner:', 'ytubviral:team-join:'].some(p => sessionStorage.getItem(p + identity) !== null)) return true;
    // Legacy team-scoped markers only deny. Neither keys nor contents can
    // restore an original operation, even when the current GET has no team.
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i); if (!key) continue;
      const prefix = prefixes.find(p => key.startsWith(p)); if (!prefix) continue;
      try { const parts: unknown = JSON.parse(key.slice(prefix.length)); if (Array.isArray(parts) && parts[0] === owner.userId && parts[1] === owner.email) return true; } catch { /* Unrelated malformed key. */ }
    }
    return false;
  } catch { return true; }
}
export function teamOwnerStorageDenied(owner: TeamOwner): boolean { return deniedOwners.has(ownerScope(owner)); }
export function reserveTeamOwnerCommand(owner: TeamOwner): (() => void) | null {
  if (teamOwnerCommandBlocked(owner)) return null;
  const identity = ownerScope(owner), token = {}, marker = ownerPrefix + identity;
  owners.set(identity, token);
  try { sessionStorage.setItem(marker, 'pending'); } catch { deniedOwners.add(identity); return null; }
  return () => {
    if (owners.get(identity) !== token) return;
    try { sessionStorage.removeItem(marker); owners.delete(identity); } catch { deniedOwners.add(identity); }
  };
}
export function teamCommandBlocked(owner: TeamOwner, teamId: string): boolean {
  const identity = scope(owner, teamId);
  if (teamOwnerCommandBlocked(owner) || active.has(identity) || denied.has(identity)) return true;
  // Presence only denies. Older member markers also deny across operations;
  // their contents never restore a producer, receipt or permission.
  try { return prefixes.some(prefix => sessionStorage.getItem(prefix + identity) !== null); }
  catch { return true; }
}
export function reserveTeamCommand(owner: TeamOwner, teamId: string): (() => void) | null {
  if (teamCommandBlocked(owner, teamId)) return null;
  const releaseOwner = reserveTeamOwnerCommand(owner); if (!releaseOwner) return null;
  const identity = scope(owner, teamId), token = {}, marker = prefixes[0] + identity;
  active.set(identity, token);
  try { sessionStorage.setItem(marker, 'pending'); }
  catch { denied.add(identity); return null; }
  // Only the capturing live original calls this closure after its exact
  // acknowledgement or a known rejection before effects. No expiry/reset.
  return () => {
    if (active.get(identity) !== token) return;
    try { sessionStorage.removeItem(marker); active.delete(identity); releaseOwner(); }
    catch { denied.add(identity); }
  };
}
