'use client';

import { useState, useRef } from 'react';
import { useSession } from 'next-auth/react';
import DashboardShell from '@/components/DashboardShell';
import { useLang } from '@/components/LangProvider';
import { useTeamRead } from '@/lib/use-team-read';

type Lang = 'es' | 'en';

const ROLE_LABELS: Record<string, Record<Lang, string>> = {
  owner: { es: 'Propietario', en: 'Owner' },
  admin: { es: 'Admin', en: 'Admin' },
  member: { es: 'Miembro', en: 'Member' },
};

const ROLE_COLORS: Record<string, string> = {
  owner: '#FFD700',
  admin: '#a855f7',
  member: '#71717a',
};

export default function TeamPage() {
  const { data: session, status } = useSession();
  const lang = useLang();
  const read = useTeamRead({ userId: session?.user?.id ?? '', email: session?.user?.email ?? null }, status, lang);
  const team = read.data?.team ?? null, myRole = read.data?.role ?? '';
  const scope = JSON.stringify([session?.user?.id, session?.user?.email, status, lang]);
  const current = useRef({ scope });
  if (current.current.scope !== scope) current.current = { scope };
  const invocation = current.current;
  const [error, setError] = useState('');
  const [teamName, setTeamName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [creating, setCreating] = useState(false);
  const [inviting, setInviting] = useState(false);
  const formScope = useRef(scope);
  if (formScope.current !== scope) {
    formScope.current = scope;
    setError(''); setTeamName(''); setInviteEmail(''); setInviteRole('member'); setCreating(false); setInviting(false);
  }

  const t = (es: string, en: string) => (lang === 'en' ? en : es);
  const isOwnerOrAdmin = myRole === 'owner' || myRole === 'admin';

  async function createTeam() {
    if (!read.canAct() || team || !teamName.trim()) return;
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: teamName.trim() }),
      });
      const data = await res.json();
      if (!read.canAct()) return;
      if (!res.ok) {
        if (data.error === 'pro_required') setError(t('Necesitas el plan Pro.', 'You need the Pro plan.'));
        else if (data.error === 'already_in_team') setError(t('Ya perteneces a un equipo.', 'You already belong to a team.'));
        else setError(data.error || 'Error');
        return;
      }
      read.refresh();
    } catch {
      if (read.canAct()) setError(t('Error de conexion', 'Connection error'));
    } finally {
      if (current.current === invocation) setCreating(false);
    }
  }

  async function inviteMember() {
    if (!read.canAct() || !isOwnerOrAdmin || !inviteEmail.trim()) return;
    setInviting(true);
    setError('');
    try {
      const res = await fetch('/api/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const data = await res.json();
      if (!read.canAct()) return;
      if (!res.ok) {
        const msgs: Record<string, string> = {
          team_full: t('El equipo esta lleno.', 'Team is full.'),
          already_member: t('Ya es miembro del equipo.', 'Already a team member.'),
          already_invited: t('Ya tiene una invitacion pendiente.', 'Already has a pending invitation.'),
        };
        setError(msgs[data.error] || data.error || 'Error');
        return;
      }
      // Refresh team data
      read.refresh();
      setInviteEmail('');
    } catch {
      if (read.canAct()) setError(t('Error de conexion', 'Connection error'));
    } finally {
      if (current.current === invocation) setInviting(false);
    }
  }

  async function removeMember(memberId: string) {
    if (!read.canAct() || myRole !== 'owner' || !team?.members.some(m => m.id === memberId && m.user.id !== session?.user?.id)) return;
    try {
      const res = await fetch('/api/team/members', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId }),
      });
      if (res.ok && read.canAct()) read.refresh();
    } catch {
      if (read.canAct()) setError(t('Error al eliminar', 'Error removing'));
    }
  }

  async function changeRole(memberId: string, role: string) {
    if (!read.canAct() || myRole !== 'owner' || !['admin', 'member'].includes(role) || !team?.members.some(m => m.id === memberId && m.user.id !== session?.user?.id)) return;
    try {
      const res = await fetch('/api/team/members', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId, role }),
      });
      if (res.ok && read.canAct()) read.refresh();
    } catch {
      if (read.canAct()) setError(t('Error al cambiar rol', 'Error changing role'));
    }
  }

  async function revokeInvitation(invitationId: string) {
    if (!read.canAct() || !isOwnerOrAdmin || !team?.invitations.some(i => i.id === invitationId)) return;
    try {
      const res = await fetch('/api/team/invite', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitationId }),
      });
      if (res.ok && read.canAct()) read.refresh();
    } catch {
      if (read.canAct()) setError(t('Error', 'Error'));
    }
  }

  async function leaveOrDeleteTeam() {
    if (!read.canAct() || !team) return;
    try {
      const res = await fetch('/api/team', { method: 'DELETE' });
      if (res.ok && read.canAct()) read.refresh();
    } catch {
      if (read.canAct()) setError(t('Error', 'Error'));
    }
  }

  if (status === 'loading' || (status === 'authenticated' && read.loading)) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--yv-light)', color: 'var(--yv-text-1)' }}>
        <p role="status">{t('Leyendo tu equipo…', 'Reading your team…')}</p>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--yv-light)', color: 'var(--yv-text-1)' }}>
        <div className="text-center">
          <h1 className="font-display font-bold text-3xl text-white mb-4">{t('Equipo', 'Team')}</h1>
          <a href="/login" className="btn-offset inline-flex px-8 py-3 text-sm font-display">{t('Iniciar sesión', 'Sign in')}</a>
        </div>
      </div>
    );
  }

  if (read.error || !read.data) return <DashboardShell><div className="yv-page" data-team-read="error">
    <p role="alert">{t('No se pudo cargar el equipo.', 'Could not load the team.')}</p>
    {read.pending && <p role="status">{t('La lectura original sigue pendiente.', 'The original read is still pending.')}</p>}
    <button onClick={read.refresh} disabled={read.pending}>{t('Reintentar lectura', 'Retry read')}</button>
  </div></DashboardShell>;

  return (
    <DashboardShell>

      {/* data-clarity-mask: lista emails de los miembros del equipo — datos de terceros
          que no han consentido esta grabación. Ver app/admin/page.tsx. */}
      <div className="yv-page" data-clarity-mask="true" data-team-read={team ? 'team' : 'empty'}>

        {/* Page title */}
        <div className="yv-page-header">
          <div className="yv-page-header__left">
            <span className="yv-page-header__eyebrow">{t('EQUIPO', 'TEAM')}</span>
            <h1 className="yv-page-header__title">
              {team ? team.name : t('Tu equipo', 'Your team')}<span style={{ color: 'var(--yv-brand)' }}>.</span>
            </h1>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 rounded-lg border border-red-500/30" style={{ background: 'rgba(232,77,91,0.08)' }}>
            <p className="text-sm text-red-400 font-mono-jb">{error}</p>
          </div>
        )}

        {/* No team — create one */}
        {!team && (
          <div className="yv-card p-8 text-center">
            <p role="status">{t('Lectura confirmada: no perteneces a un equipo.', 'Confirmed read: you do not belong to a team.')}</p>
            <div className="w-16 h-16 mx-auto mb-6 rounded-2xl flex items-center justify-center" style={{ background: 'var(--yv-brand-soft)' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--yv-brand)" strokeWidth="1.5">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                <line x1="23" y1="11" x2="17" y2="11"/><line x1="20" y1="8" x2="20" y2="14"/>
              </svg>
            </div>
            <h3 className="font-display font-bold text-xl text-white mb-2">
              {t('Crea tu equipo', 'Create your team')}
            </h3>
            <p className="font-mono-jb text-sm max-w-md mx-auto mb-6" style={{ color: 'var(--yv-text-3)' }}>
              {t(
                'Colabora con tu equipo de contenido. Invita hasta 5 miembros (Team) o 25 (Agency).',
                'Collaborate with your content team. Invite up to 5 members (Team) or 25 (Agency).',
              )}
            </p>
            <div className="flex items-center gap-3 max-w-sm mx-auto">
              <input
                value={teamName}
                onChange={e => { if (read.canAct()) setTeamName(e.target.value); }}
                placeholder={t('Nombre del equipo...', 'Team name...')}
                maxLength={50}
                className="flex-1 px-4 py-3 yv-input text-sm font-mono-jb"
                onKeyDown={e => e.key === 'Enter' && createTeam()}
              />
              <button
                onClick={createTeam}
                disabled={creating || !teamName.trim()}
                className="btn-offset px-6 py-3 text-sm font-display disabled:opacity-50"
              >
                {creating ? '...' : t('Crear', 'Create')}
              </button>
            </div>
          </div>
        )}

        {/* Team exists */}
        {team && (
          <div className="space-y-8">

            {/* Team info bar */}
            <div className="yv-card flex items-center gap-4 p-4">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center font-display font-bold text-lg" style={{ background: 'var(--yv-brand-soft)', color: 'var(--yv-brand)' }}>
                {team.name[0].toUpperCase()}
              </div>
              <div className="flex-1">
                <p className="font-display font-bold text-white">{team.name}</p>
                <p className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-3)' }}>
                  {team.members.length}/{team.maxMembers} {t('miembros', 'members')} · {team.plan.toUpperCase()}
                </p>
              </div>
              <span className="font-mono-jb text-[13px] font-bold px-2.5 py-1 rounded" style={{ background: `${ROLE_COLORS[myRole]}22`, color: ROLE_COLORS[myRole] }}>
                {ROLE_LABELS[myRole]?.[lang] || myRole}
              </span>
            </div>

            {/* Members */}
            <div className="yv-card yv-card--flush">
              <div className="yv-card__header">
                <h2 className="yv-card__title">{t('Miembros', 'Members')}</h2>
              </div>
              <div className="divide-y divide-white/5">
                {team.members.map(member => (
                  <div key={member.id} className="flex items-center gap-3 px-5 py-3.5">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold" style={{ background: 'rgba(255,255,255,0.06)', color: '#a1a1aa' }}>
                      {(member.user.name?.[0] || member.user.email[0]).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{member.user.name || member.user.email}</p>
                      <p className="font-mono-jb text-[13px] truncate" style={{ color: 'var(--yv-text-4)' }}>{member.user.email}</p>
                    </div>
                    <span className="font-mono-jb text-[13px] font-bold px-2 py-0.5 rounded" style={{ background: `${ROLE_COLORS[member.role]}15`, color: ROLE_COLORS[member.role] }}>
                      {ROLE_LABELS[member.role]?.[lang] || member.role}
                    </span>
                    {myRole === 'owner' && member.user.id !== session?.user?.id && (
                      <div className="flex items-center gap-1">
                        <select
                          value={member.role}
                          onChange={e => changeRole(member.id, e.target.value)}
                          className="text-[13px] font-mono-jb bg-transparent rounded px-1.5 py-1 focus:outline-none"
                          style={{ border: '1px solid var(--yv-border)', color: 'var(--yv-text-2)' }}
                        >
                          <option value="member">{t('Miembro', 'Member')}</option>
                          <option value="admin">Admin</option>
                        </select>
                        <button
                          onClick={() => removeMember(member.id)}
                          className="hover:text-red-400 transition p-1"
                          style={{ color: 'var(--yv-text-4)' }}
                          title={t('Eliminar', 'Remove')}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Pending invitations */}
            {team.invitations.length > 0 && (
              <div className="yv-card yv-card--flush">
                <div className="yv-card__header">
                  <h2 className="yv-card__title">{t('Invitaciones pendientes', 'Pending invitations')}</h2>
                </div>
                <div className="divide-y divide-white/5">
                  {team.invitations.map(inv => (
                    <div key={inv.id} className="flex items-center gap-3 px-5 py-3.5">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.04)' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#52525b" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate" style={{ color: 'var(--yv-text-2)' }}>{inv.email}</p>
                        <p className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-4)' }}>
                          {t('Expira', 'Expires')} {new Date(inv.expiresAt).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-ES', { month: 'short', day: 'numeric' })}
                        </p>
                      </div>
                      {isOwnerOrAdmin && (
                        <button
                          onClick={() => revokeInvitation(inv.id)}
                          className="font-mono-jb text-[13px] hover:text-red-400 transition"
                          style={{ color: 'var(--yv-text-4)' }}
                        >
                          {t('Revocar', 'Revoke')}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Invite form */}
            {isOwnerOrAdmin && team.members.length + team.invitations.length < team.maxMembers && (
              <div className="yv-card p-5">
                <h2 className="font-display font-bold mb-4" style={{ color: 'var(--yv-text-1)' }}>{t('Invitar miembro', 'Invite member')}</h2>
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <label className="font-mono-jb text-[13px] block mb-1.5" style={{ color: 'var(--yv-text-4)' }}>Email</label>
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={e => { if (read.canAct()) setInviteEmail(e.target.value); }}
                      placeholder="colleague@example.com"
                      className="w-full px-4 py-2.5 yv-input text-sm font-mono-jb"
                      onKeyDown={e => e.key === 'Enter' && inviteMember()}
                    />
                  </div>
                  {myRole === 'owner' && (
                    <div>
                      <label className="font-mono-jb text-[13px] block mb-1.5" style={{ color: 'var(--yv-text-4)' }}>{t('Rol', 'Role')}</label>
                      <select
                        value={inviteRole}
                        onChange={e => { if (read.canAct()) setInviteRole(e.target.value); }}
                        className="px-3 py-2.5 yv-input text-sm font-mono-jb"
                      >
                        <option value="member">{t('Miembro', 'Member')}</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                  )}
                  <button
                    onClick={inviteMember}
                    disabled={inviting || !inviteEmail.trim()}
                    className="btn-offset px-6 py-2.5 text-sm font-display disabled:opacity-50"
                  >
                    {inviting ? '...' : t('Invitar', 'Invite')}
                  </button>
                </div>
              </div>
            )}

            {/* Danger zone */}
            <div className="yv-card p-5">
              <h2 className="font-mono-jb text-[13px] uppercase tracking-wider mb-3" style={{ color: 'var(--yv-text-3)' }}>
                {t('Zona de peligro', 'Danger zone')}
              </h2>
              <button
                onClick={leaveOrDeleteTeam}
                className="font-mono-jb text-[13px] text-red-400 hover:text-red-300 transition"
              >
                {myRole === 'owner'
                  ? t('Eliminar equipo', 'Delete team')
                  : t('Abandonar equipo', 'Leave team')}
              </button>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
