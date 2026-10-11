export interface TeamOwner { userId: string; email: string | null }
export type TeamRole = 'owner' | 'admin' | 'member';
export interface TeamMemberView { id: string; role: TeamRole; joinedAt: string; user: { id: string; name: string | null; email: string } }
export interface TeamInvitationView { id: string; email: string; role: 'admin' | 'member'; expiresAt: string }
export interface TeamView { id: string; name: string; slug: string; plan: 'team' | 'agency'; maxMembers: number; members: TeamMemberView[]; invitations: TeamInvitationView[] }
export interface TeamReadData { team: TeamView | null; role: TeamRole | null; observedAt: string }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,128}$/.test(v);
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const email = (v: unknown): v is string => text(v, 320) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const role = (v: unknown): v is TeamRole => v === 'owner' || v === 'admin' || v === 'member';
const date = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;

// Classification uses the confirmed read's observation, never a renewed expiry.
// This is display/capacity data, not authority to recover or settle a command.
export function isTeamInvitationExpired(invitation: TeamInvitationView, observedAt: string): boolean {
  return !date(observedAt) || !date(invitation.expiresAt) || Date.parse(invitation.expiresAt) <= Date.parse(observedAt);
}
export function activeTeamInvitationCount(team: TeamView, observedAt: string): number {
  return team.invitations.filter(i => !isTeamInvitationExpired(i, observedAt)).length;
}

// A public read is display data only; it cannot grant a mutation or recovery.
export function decodeTeamRead(value: unknown, owner: TeamOwner): TeamReadData {
  if (!object(value) || value.userId !== owner.userId || value.email !== owner.email || !id(owner.userId) || !date(value.observedAt)) throw Error('Team unavailable');
  if (value.team === null) {
    if (value.role !== null) throw Error('Team unavailable');
    return { team: null, role: null, observedAt: value.observedAt };
  }
  const t = value.team;
  if (!role(value.role) || !object(t) || !id(t.id) || !text(t.name, 250) || !text(t.slug, 80)
    || (t.plan !== 'team' && t.plan !== 'agency') || !Number.isSafeInteger(t.maxMembers) || (t.maxMembers as number) < 1 || (t.maxMembers as number) > 1000
    || !Array.isArray(t.members) || t.members.length < 1 || t.members.length > 1000 || !Array.isArray(t.invitations) || t.invitations.length > 1000) throw Error('Team unavailable');
  const memberIds = new Set<string>(), users = new Set<string>(); let previous = -Infinity, owners = 0;
  const members = t.members.map(m => {
    if (!object(m) || !id(m.id) || memberIds.has(m.id) || !role(m.role) || !date(m.joinedAt) || Date.parse(m.joinedAt) < previous
      || !object(m.user) || !id(m.user.id) || users.has(m.user.id) || !email(m.user.email) || (m.user.name !== null && !text(m.user.name, 250))) throw Error('Team unavailable');
    memberIds.add(m.id); users.add(m.user.id); previous = Date.parse(m.joinedAt); if (m.role === 'owner') owners++;
    return { id: m.id, role: m.role, joinedAt: m.joinedAt, user: { id: m.user.id, name: m.user.name as string | null, email: m.user.email } };
  });
  const own = members.find(m => m.user.id === owner.userId);
  if (!own || own.role !== value.role || own.user.email !== owner.email || owners !== 1 || (value.role === 'member' && t.invitations.length)) throw Error('Team unavailable');
  const inviteIds = new Set<string>(), emails = new Set<string>();
  const invitations = t.invitations.map(i => {
    if (!object(i) || !id(i.id) || inviteIds.has(i.id) || !email(i.email) || emails.has(i.email.toLowerCase())
      || (i.role !== 'admin' && i.role !== 'member') || !date(i.expiresAt)) throw Error('Team unavailable');
    inviteIds.add(i.id); emails.add(i.email.toLowerCase());
    return { id: i.id, email: i.email, role: i.role as 'admin' | 'member', expiresAt: i.expiresAt };
  });
  return { team: { id: t.id, name: t.name, slug: t.slug, plan: t.plan, maxMembers: t.maxMembers as number, members, invitations }, role: value.role, observedAt: value.observedAt };
}
