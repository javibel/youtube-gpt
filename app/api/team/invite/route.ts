import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';
import { sendTransactionalEmail } from '@/lib/send-email';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const membership = await prisma.teamMember.findFirst({
    where: { userId: session.user.id, role: { in: ['owner', 'admin'] } },
    include: { team: { include: { members: true, invitations: { where: { expiresAt: { gt: new Date() } } } } } },
  });
  if (!membership) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const team = membership.team;
  const currentCount = team.members.length + team.invitations.length;
  if (currentCount >= team.maxMembers) {
    return NextResponse.json({ error: 'team_full' }, { status: 400 });
  }

  const { email, role = 'member' } = await req.json();
  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Email required' }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Check if already a member
  const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existingUser) {
    const existingMember = await prisma.teamMember.findFirst({
      where: { teamId: team.id, userId: existingUser.id },
    });
    if (existingMember) {
      return NextResponse.json({ error: 'already_member' }, { status: 400 });
    }
  }

  // Check if already invited
  const existingInvite = await prisma.teamInvitation.findFirst({
    where: { teamId: team.id, email: normalizedEmail, expiresAt: { gt: new Date() } },
  });
  if (existingInvite) {
    return NextResponse.json({ error: 'already_invited' }, { status: 400 });
  }

  // Clean up expired invitations for this email
  await prisma.teamInvitation.deleteMany({
    where: { teamId: team.id, email: normalizedEmail },
  });

  const token = crypto.randomBytes(32).toString('hex');
  const invitation = await prisma.teamInvitation.create({
    data: {
      teamId: team.id,
      email: normalizedEmail,
      role: role === 'admin' ? 'admin' : 'member',
      token,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000), // 7 days
    },
  });

  // Send invitation email
  const baseUrl = process.env.APP_PUBLIC_URL ?? 'https://ytubviral.com';
  const joinUrl = `${baseUrl}/team/join?token=${token}`;
  const inviterName = session.user.name || session.user.email || 'Someone';

  // Detect language from existing user or default
  const userLang = existingUser
    ? ((await prisma.user.findUnique({ where: { id: existingUser.id }, select: { lang: true } }))?.lang ?? 'es')
    : 'es';
  const isEn = userLang === 'en';

  const subject = isEn
    ? `You're invited to join ${team.name} on YTubViral`
    : `Te han invitado a unirte a ${team.name} en YTubViral`;

  const html = `<!DOCTYPE html>
<html lang="${isEn ? 'en' : 'es'}">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:48px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#111111;border-radius:12px;border:1px solid rgba(255,255,255,0.08);padding:40px;">
        <tr><td style="padding:40px;">
          <p style="margin:0 0 16px;font-size:11px;font-weight:600;color:#e84d5b;text-transform:uppercase;letter-spacing:0.15em;font-family:monospace;">${isEn ? 'TEAM INVITATION' : 'INVITACION DE EQUIPO'}</p>
          <p style="margin:0 0 8px;font-size:22px;font-weight:800;color:#ffffff;">${isEn ? `Join ${team.name}` : `Unete a ${team.name}`}</p>
          <p style="margin:0 0 28px;font-size:15px;color:#71717a;line-height:1.7;">${isEn
    ? `${inviterName} has invited you to join their team on YTubViral. Click the button below to accept — the link expires in 7 days.`
    : `${inviterName} te ha invitado a unirte a su equipo en YTubViral. Haz clic en el boton para aceptar — el enlace expira en 7 dias.`}</p>
          <a href="${joinUrl}" style="display:inline-block;background:#e84d5b;color:#ffffff;font-weight:700;font-size:14px;padding:14px 32px;border-radius:6px;text-decoration:none;box-shadow:3px 3px 0 #000;">${isEn ? 'Join team' : 'Unirse al equipo'} &rarr;</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  sendTransactionalEmail({ to: normalizedEmail, subject, html })
    .catch(err => console.error('Team invite email error:', err));

  return NextResponse.json({ invitation }, { status: 201 });
}

// DELETE — revoke invitation
export async function DELETE(req: NextRequest) {
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

  const { invitationId } = await req.json();
  if (!invitationId) {
    return NextResponse.json({ error: 'Invitation ID required' }, { status: 400 });
  }

  await prisma.teamInvitation.deleteMany({
    where: { id: invitationId, teamId: membership.teamId },
  });

  return NextResponse.json({ ok: true });
}
