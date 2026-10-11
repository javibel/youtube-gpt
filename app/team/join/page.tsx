'use client';
import { useEffect, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { useLang } from '@/components/LangProvider';
import { useTeamJoin } from '@/lib/use-team-join';
import { readConfirmedTeamJoin, trustedTeamJoinOutcome, validTeamJoinToken } from '@/lib/team-join-client';
import { useTeamRead } from '@/lib/use-team-read';

export default function TeamJoinPage() {
  return <Suspense fallback={<p role="status">…</p>}><TeamJoinContent /></Suspense>;
}
function TeamJoinContent() {
  const { data: session, status } = useSession(), token = useSearchParams().get('token'), lang = useLang();
  const owner = { userId: session?.user?.id ?? '', email: session?.user?.email ?? null };
  const read = useTeamRead(owner, status, lang), join = useTeamJoin(owner, status, lang, token);
  const t = (es: string, en: string) => lang === 'en' ? en : es;
  const scope = JSON.stringify([owner.userId, owner.email, status, lang, token]);
  useEffect(() => {
    if (join.canObserve() && join.attempt && trustedTeamJoinOutcome(join.attempt)?.status === 'confirmed') {
      const next = readConfirmedTeamJoin(join.attempt); if (next) read.install(next);
    }
  }, [join.attempt, join.outcome, scope]); // eslint-disable-line react-hooks/exhaustive-deps
  const outcome = join.attempt ? trustedTeamJoinOutcome(join.attempt) ?? join.outcome : join.outcome;
  const receipt = outcome?.status === 'confirmed' ? outcome.receipt : null;
  const own = read.data?.team?.members.find(m => m.user.id === owner.userId);
  const matches = !!receipt && !!read.data?.team && read.data.team.id === receipt.teamId && read.data.team.name === receipt.teamName
    && own?.id === receipt.membershipId && own.role === receipt.role && own.user.email === owner.email;
  function start() { if (read.canAct() && !read.data?.team && join.canStart()) join.start(); }
  const rejected: Record<string, string> = {
    invalid_token: t('Enlace inválido o ya utilizado.', 'Invalid or already used link.'),
    expired: t('Este enlace ha caducado.', 'This link has expired.'),
    email_mismatch: t('Este enlace es para otro correo.', 'This link is for a different email.'),
    already_in_team: t('Ya perteneces a un equipo.', 'You already belong to a team.'),
    team_full: t('El equipo está lleno.', 'The team is full.'),
    invitation_changed: t('La invitación ha cambiado. Revisa el enlace antes de aceptar.', 'The invitation changed. Check the link before accepting.'),
  };
  const login = validTeamJoinToken(token) ? '/login?redirect=' + encodeURIComponent('/team/join?token=' + encodeURIComponent(token!)) : '/login';
  return <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--yv-light)', color: 'var(--yv-text-1)' }}>
    <div className="max-w-md w-full mx-4"><div className="yv-glass p-8 text-center">
      <h1 className="font-display font-bold text-2xl mb-2">{t('Unirse al equipo', 'Join team')}</h1>
      <p className="text-sm mb-6">{t('Has recibido una invitación a un equipo en YTubViral.', 'You received an invitation to a YTubViral team.')}</p>
      {status === 'loading' && <p role="status">{t('Comprobando sesión…', 'Checking session…')}</p>}
      {status === 'unauthenticated' && <a href={login}>{t('Iniciar sesión', 'Sign in')}</a>}
      {!validTeamJoinToken(token) && <p role="alert">{t('Enlace inválido.', 'Invalid link.')}</p>}
      <div data-team-join={outcome?.status ?? (join.updating ? 'waiting' : join.blocked ? 'blocked' : 'idle')}>
        {join.updating && <p role="status">{t('Confirmando incorporación…', 'Confirming membership…')}</p>}
        {(outcome?.status === 'unconfirmed' || join.blocked && !join.updating && !outcome) && <p role="alert">{t('Incorporación sin confirmar. No vuelvas a aceptar ni inicies otra acción.', 'Membership unconfirmed. Do not accept again or start another action.')}</p>}
        {join.pending && outcome?.status === 'unconfirmed' && <p role="status">{t('La solicitud original sigue pendiente.', 'The original request is still pending.')}</p>}
        {outcome?.status === 'rejected' && <p role="alert">{rejected[outcome.error] ?? t('No se aceptó la invitación. Revisa la sesión y el enlace.', 'The invitation was not accepted. Check your session and link.')}</p>}
        {receipt && matches && <p role="status">{t('Te has unido a', 'You joined')} {read.data!.team!.name}.</p>}
        {receipt && !matches && <p role={read.loading ? 'status' : 'alert'}>{read.loading
          ? t('Acuse recibido. Comprobando el equipo actual…', 'Acknowledgement received. Checking the current team…')
          : t('Acuse recibido, pero el equipo actual no está confirmado. No aceptes otra vez.', 'Acknowledgement received, but the current team is not confirmed. Do not accept again.')}</p>}
        {join.blocked && receipt && <p role="alert">{t('No se puede iniciar otra acción en esta pestaña.', 'Another action cannot be started in this tab.')}</p>}
      </div>
      {status === 'authenticated' && <>
        {!receipt && read.loading && <p role="status">{t('Comprobando equipo…', 'Checking team…')}</p>}
        {read.error && <p role="alert">{t('No se pudo cargar el equipo.', 'The team could not be loaded.')}</p>}
        {!receipt && read.data?.team && <p role="status">{t('Ya perteneces a un equipo.', 'You already belong to a team.')}</p>}
        {!receipt && <button onClick={start} disabled={!read.canAct() || !!read.data?.team || !join.canStart()} className="btn-offset px-8 py-3 disabled:opacity-50">{t('Aceptar invitación', 'Accept invitation')}</button>}
        <button onClick={() => { if (!join.pending) read.refresh(); }} disabled={read.pending || join.pending}>{t('Actualizar equipo', 'Refresh team')}</button>
        {matches && <a href="/team">{t('Ver equipo', 'View team')}</a>}
      </>}
    </div></div>
  </div>;
}
