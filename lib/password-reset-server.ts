import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { validatePassword } from '@/lib/password';
import { takePasswordResetInput, type PasswordResetInput } from '@/lib/password-reset-input';
import { preparePasswordChangeNotice, sendPasswordChangeNotice } from '@/lib/password-change-notice';

export type PasswordResetChange = Readonly<{ kind: 'password-reset-change-original' }>;
export type ResetNoticeOutcome = 'acknowledged' | 'not_started' | 'unconfirmed';
type Receipt = { outcome: string; id: string | null; email: string | null; name: string | null; noticeId: string | null };
type OwnChange = { receipt: Receipt | null; lang: 'es' | 'en'; notice?: Promise<ResetNoticeOutcome> };
const changes = new WeakMap<PasswordResetChange, OwnChange>();
export type PasswordResetPreparation =
  | { status: 'changed'; change: PasswordResetChange }
  | { status: 'invalid' | 'unconfirmed' }
  | { status: 'weak-password'; error: string };

// Native bearer-factor consumption and account mutation share one SQL commit.
// Account lock precedes token writes; all other reset tokens of that account are
// invalidated by this change. Lost commit ACK never grants notice/replay authority.
export async function consumePasswordResetOriginal(input: PasswordResetInput, beforeStep: () => void): Promise<PasswordResetPreparation> {
  try {
    beforeStep();
    const captured = takePasswordResetInput(input);
    if (!captured) return { status: 'invalid' };
    const error = validatePassword(captured.password, captured.lang);
    if (error) return { status: 'weak-password', error };
    beforeStep();
    const hashed = await bcrypt.hash(captured.password, 12);
    beforeStep();
    if (typeof hashed !== 'string' || !/^\$2[aby]\$12\$[./A-Za-z0-9]{53}$/.test(hashed)) return { status: 'unconfirmed' };
    const noticeId = randomUUID();
    const rows = await prisma.$queryRawUnsafe<Receipt[]>(
      `WITH account AS MATERIALIZED (
         SELECT id, email, name FROM users
         WHERE email = (SELECT email FROM password_reset_tokens WHERE token = $1)
         FOR UPDATE
       ), locked_clock AS MATERIALIZED (
         SELECT id, email, timezone('UTC', clock_timestamp()) AS observed FROM account
       ), eligible AS MATERIALIZED (
         SELECT t.id, t.email FROM password_reset_tokens AS t JOIN locked_clock AS a ON a.email = t.email
         WHERE t.token = $1 AND t.expires > a.observed
       ), consumed AS (
         DELETE FROM password_reset_tokens AS t USING eligible AS e
         WHERE t.email = e.email RETURNING t.id
       ), changed AS (
         UPDATE users AS u SET password = $2 FROM account AS a
         WHERE u.id = a.id AND u.email = a.email
           AND EXISTS (SELECT 1 FROM eligible AS e JOIN consumed AS c ON c.id = e.id)
         RETURNING u.id, u.email, u.name
       )
       SELECT CASE WHEN EXISTS (SELECT 1 FROM changed) THEN 'changed' ELSE 'invalid' END AS outcome,
         (SELECT id FROM changed) AS id, (SELECT email FROM changed) AS email,
         (SELECT name FROM changed) AS name,
         CASE WHEN EXISTS (SELECT 1 FROM changed) THEN $3::text ELSE NULL END AS "noticeId"`,
      captured.token, hashed, noticeId,
    );
    if (!Array.isArray(rows) || rows.length !== 1) return { status: 'unconfirmed' };
    const row = rows[0];
    if (Object.keys(row).length !== 5) return { status: 'unconfirmed' };
    if (row.outcome === 'invalid' && row.id === null && row.email === null && row.name === null && row.noticeId === null) return { status: 'invalid' };
    if (row.outcome !== 'changed' || typeof row.id !== 'string' || !/^[\w-]{1,128}$/.test(row.id)
      || row.noticeId !== noticeId || typeof row.email !== 'string' || row.email !== row.email.trim().toLowerCase()
      || row.email.length > 254 || !/^[^\s@,;<>\x00-\x1f\x7f]+@[^\s@,;<>\x00-\x1f\x7f]+\.[^\s@,;<>\x00-\x1f\x7f]+$/.test(row.email)
      || row.name !== null && typeof row.name !== 'string') return { status: 'unconfirmed' };
    const change: PasswordResetChange = Object.freeze({ kind: 'password-reset-change-original' });
    changes.set(change, { receipt: { ...row }, lang: captured.lang });
    return { status: 'changed', change };
  } catch { return { status: 'unconfirmed' }; }
}

// One live SQL ACK owns one native notice. Duplicate handles join the original;
// clone/JSON/another module/token/nonce cannot reconstruct this authority.
export function dispatchPasswordResetNotice(change: PasswordResetChange, beforeStep: () => void, onDispatch: () => void): Promise<ResetNoticeOutcome> {
  const own = changes.get(change);
  if (!own) return Promise.resolve('not_started');
  if (own.notice) return own.notice;
  own.notice = Promise.resolve().then(async () => {
    let issued = false;
    try {
      beforeStep();
      const row = own.receipt!;
      const packet = preparePasswordChangeNotice(row.email!, row.name ?? row.email!, own.lang);
      beforeStep();
      await sendPasswordChangeNotice(packet, row.noticeId!, beforeStep, () => { onDispatch(); issued = true; });
      return 'acknowledged';
    } catch { return issued ? 'unconfirmed' : 'not_started'; }
    finally { own.receipt = null; }
  });
  return own.notice;
}
