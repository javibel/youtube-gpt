import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

export type ProfileUpdateInput =
  | { operation: 'name'; previousName: string | null; name: string }
  | { operation: 'language'; previousLang: 'es' | 'en'; lang: 'es' | 'en' };
export type ProfileOwner = { userId: string; email: string };
export type ProfileUpdateResult = ({ ok: true; userId: string; email: string; key: string; status: 'updated' } & ProfileUpdateInput)
  | { ok: false; status: number; error: string };
const uncertain = (): ProfileUpdateResult => ({ ok: false, status: 503, error: 'profile_update_unconfirmed' });
const id = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,128}$/.test(v);
const language = (v: unknown): v is 'es' | 'en' => v === 'es' || v === 'en';
export function validProfileUpdate(input: unknown, key: unknown): input is ProfileUpdateInput {
  if (!id(key) || !input || typeof input !== 'object' || Array.isArray(input)) return false;
  const v = input as Record<string, unknown>;
  const fields = v.operation === 'name' ? ['operation', 'previousName', 'name'] : ['operation', 'previousLang', 'lang'];
  if (Object.keys(v).length !== 3 || fields.some(k => !Object.hasOwn(v, k))) return false;
  return v.operation === 'name'
    ? (v.previousName === null || typeof v.previousName === 'string' && v.previousName.length <= 1000)
      && typeof v.name === 'string' && v.name === v.name.trim() && v.name.length >= 1 && v.name.length <= 100
      && v.name !== v.previousName
    : v.operation === 'language' && language(v.previousLang) && language(v.lang) && v.lang !== v.previousLang;
}
// The row/key can only deny another invocation. The fresh original owns the
// captured admission and atomic completion; there is no resume/reset API.
export async function updateProfileOriginal(owner: ProfileOwner, input: unknown, key: string, beforeStep: () => void): Promise<ProfileUpdateResult> {
  try {
    beforeStep();
    if (!validProfileUpdate(input, key) || !id(owner.userId) || typeof owner.email !== 'string' || !owner.email)
      return { ok: false, status: 400, error: 'invalid_input' };
    const own = Object.freeze({ userId: owner.userId, email: owner.email });
    const selected: ProfileUpdateInput = Object.freeze(input.operation === 'name'
      ? { operation: 'name', previousName: input.previousName, name: input.name }
      : { operation: 'language', previousLang: input.previousLang, lang: input.lang });
    const captured = Object.freeze({ id: randomUUID(), ...own, key, operation: selected.operation,
      previousName: selected.operation === 'name' ? selected.previousName : null,
      name: selected.operation === 'name' ? selected.name : null,
      previousLang: selected.operation === 'language' ? selected.previousLang : null,
      lang: selected.operation === 'language' ? selected.lang : null });
    const lock = async (tx: Prisma.TransactionClient) => {
      beforeStep();
      const rows = await tx.$queryRawUnsafe<Array<{ id: string; email: string; name: string | null; lang: string }>>(
        'SELECT id,email,name,lang FROM users WHERE id=$1 FOR UPDATE', own.userId);
      beforeStep();
      if (!rows.length) return 'profile_not_found';
      if (rows.length !== 1 || rows[0].id !== own.userId || rows[0].email !== own.email) throw Error('Profile unconfirmed');
      return (selected.operation === 'name' ? rows[0].name !== selected.previousName : rows[0].lang !== selected.previousLang)
        ? 'profile_changed' : null;
    };
    const matches = (row: Record<string, unknown> | null) => !!row && row.state === 'pending'
      && Object.entries(captured).every(([k, value]) => row[k] === value);
    const admission = await prisma.$transaction(async tx => {
      const denied = await lock(tx);
      const prior = await tx.profileUpdateAttempt.findFirst({ where: { userId: own.userId,
        OR: [{ key }, { state: { not: 'complete' } }] } });
      beforeStep();
      if (prior) return { denied: 'profile_update_unconfirmed' };
      if (denied) return { denied };
      const row = await tx.profileUpdateAttempt.create({ data: { ...captured, state: 'pending' } });
      beforeStep();
      return { row };
    }, { maxWait: 10_000, timeout: 15_000 });
    if ('denied' in admission) {
      const error = admission.denied || 'profile_update_unconfirmed';
      return { ok: false, status: error === 'profile_not_found' ? 404 : error === 'profile_changed' ? 409 : 503, error };
    }
    if (!matches(admission.row)) return uncertain();
    beforeStep();
    await prisma.$transaction(async tx => {
      if (await lock(tx)) throw Error('Profile unconfirmed');
      const row = await tx.profileUpdateAttempt.findUnique({ where: { id: captured.id } });
      beforeStep(); if (!matches(row)) throw Error('Profile unconfirmed');
      // Once invoked, the original effect and marker commit together even if
      // its HTTP observer retires. No deadline cancellation between these writes.
      const changed = await tx.user.updateMany({ where: { id: own.userId, email: own.email,
        ...(selected.operation === 'name' ? { name: selected.previousName } : { lang: selected.previousLang }) },
        data: selected.operation === 'name' ? { name: selected.name } : { lang: selected.lang } });
      if (changed.count !== 1) throw Error('Profile unconfirmed');
      const marked = await tx.profileUpdateAttempt.updateMany({ where: { ...captured, state: 'pending' }, data: { state: 'complete' } });
      if (marked.count !== 1) throw Error('Profile unconfirmed');
    }, { maxWait: 10_000, timeout: 15_000 });
    return { ok: true, ...own, key, status: 'updated', ...selected };
  } catch { return uncertain(); }
}
