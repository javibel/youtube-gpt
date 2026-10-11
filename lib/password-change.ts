import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { validatePassword } from '@/lib/password';
import type { Prisma } from '@prisma/client';

export type PasswordChangeInput = { currentPassword: string; newPassword: string; lang?: 'es' | 'en' };
export type PasswordOwner = { userId: string; email: string };
export type PasswordChangeSuccess = { ok: true; userId: string; email: string; key: string; status: 'updated';
  lang: 'es' | 'en'; noticeId: string; noticeName: string };
export type PasswordChangeResult = PasswordChangeSuccess | { ok: false; status: number; error: string };
const uncertain = (): PasswordChangeResult => ({ ok: false, status: 503, error: 'password_change_unconfirmed' });
const validId = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,128}$/.test(v);
export const validPasswordKey = validId;
export function validPasswordChange(input: unknown): input is PasswordChangeInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const row = input as Record<string, unknown>;
  if (Object.keys(row).some(k => !['currentPassword', 'newPassword', 'lang'].includes(k))
    || !Object.hasOwn(row, 'currentPassword') || !Object.hasOwn(row, 'newPassword')) return false;
  return typeof row.currentPassword === 'string' && !!row.currentPassword
    && Buffer.byteLength(row.currentPassword, 'utf8') <= 72
    && typeof row.newPassword === 'string' && !!row.newPassword && Buffer.byteLength(row.newPassword, 'utf8') <= 72
    && (row.lang === undefined || row.lang === 'es' || row.lang === 'en');
}
// A fresh original captures its secrets only in memory. Durable metadata may
// deny another invocation; it cannot establish ownership, resume or send mail.
export async function changePasswordOriginal(owner: PasswordOwner, input: unknown, key: string, beforeStep: () => void): Promise<PasswordChangeResult> {
  try {
    beforeStep();
    if (!validPasswordChange(input) || !validId(key) || !validId(owner.userId)
      || typeof owner.email !== 'string' || !owner.email || owner.email.length > 320)
      return { ok: false, status: 400, error: 'invalid_input' };
    const own = Object.freeze({ userId: owner.userId, email: owner.email });
    const capturedInput = Object.freeze({ currentPassword: input.currentPassword, newPassword: input.newPassword,
      lang: input.lang ?? 'es' });
    const policy = validatePassword(capturedInput.newPassword, capturedInput.lang);
    if (policy) return { ok: false, status: 400, error: policy };
    beforeStep();
    const user = await prisma.user.findUnique({ where: { id: own.userId },
      select: { id: true, email: true, password: true, name: true } });
    beforeStep();
    if (!user || user.id !== own.userId || user.email !== own.email) return { ok: false, status: 401, error: 'Unauthorized' };
    const prior = await prisma.passwordChangeAttempt.findFirst({ where: { userId: own.userId,
      OR: [{ key }, { state: { not: 'complete' } }] } });
    beforeStep();
    if (prior) return uncertain();
    if (!user.password) return { ok: false, status: 400, error: capturedInput.lang === 'en'
      ? 'Cannot change password for this account' : 'No se puede cambiar la contraseña de esta cuenta' };
    const previous = user.password;
    const noticeName = user.name ?? own.email;
    const valid = await bcrypt.compare(capturedInput.currentPassword, previous);
    beforeStep();
    if (!valid) return { ok: false, status: 400, error: capturedInput.lang === 'en'
      ? 'Current password is incorrect' : 'La contraseña actual no es correcta' };
    const hashed = await bcrypt.hash(capturedInput.newPassword, 12);
    beforeStep();
    if (typeof hashed !== 'string' || !/^\$2[aby]\$12\$[./A-Za-z0-9]{53}$/.test(hashed)) throw Error('Password unconfirmed');
    const captured = Object.freeze({ id: randomUUID(), ...own, key, lang: capturedInput.lang });
    const lock = async (tx: Prisma.TransactionClient) => {
      beforeStep();
      const rows = await tx.$queryRawUnsafe<Array<{ id: string; email: string; password: string | null }>>(
        'SELECT id,email,password FROM users WHERE id=$1 FOR UPDATE', own.userId);
      beforeStep();
      if (rows.length !== 1 || rows[0].id !== own.userId || rows[0].email !== own.email) throw Error('Password unconfirmed');
      return rows[0].password !== previous;
    };
    const matches = (row: Record<string, unknown> | null) => !!row && row.state === 'pending'
      && Object.entries(captured).every(([field, value]) => row[field] === value);
    const admission = await prisma.$transaction(async tx => {
      const changed = await lock(tx);
      const retained = await tx.passwordChangeAttempt.findFirst({ where: { userId: own.userId,
        OR: [{ key }, { state: { not: 'complete' } }] } });
      beforeStep();
      if (retained) return { denied: 'password_change_unconfirmed' };
      if (changed) return { denied: 'password_changed' };
      const row = await tx.passwordChangeAttempt.create({ data: { ...captured, state: 'pending' } });
      beforeStep(); return { row };
    }, { maxWait: 10_000, timeout: 15_000 });
    if ('denied' in admission) return { ok: false, status: admission.denied === 'password_changed' ? 409 : 503,
      error: admission.denied || 'password_change_unconfirmed' };
    if (!matches(admission.row)) return uncertain();
    beforeStep();
    await prisma.$transaction(async tx => {
      if (await lock(tx)) throw Error('Password unconfirmed');
      const row = await tx.passwordChangeAttempt.findUnique({ where: { id: captured.id } });
      beforeStep(); if (!matches(row)) throw Error('Password unconfirmed');
      // The dispatched password CAS and completion marker commit atomically.
      // HTTP retirement cannot cancel/replay these already invoked writes.
      const changed = await tx.user.updateMany({ where: { id: own.userId, email: own.email, password: previous },
        data: { password: hashed } });
      if (changed.count !== 1) throw Error('Password unconfirmed');
      const marked = await tx.passwordChangeAttempt.updateMany({ where: { ...captured, state: 'pending' },
        data: { state: 'complete' } });
      if (marked.count !== 1) throw Error('Password unconfirmed');
    }, { maxWait: 10_000, timeout: 15_000 });
    return { ok: true, ...own, key, status: 'updated', lang: capturedInput.lang, noticeId: captured.id, noticeName };
  } catch { return uncertain(); }
}
