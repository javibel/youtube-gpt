import { prisma } from '@/lib/prisma';

type Receipt = { outcome: string; id: string | null; email: string | null; name: string | null };
export type EmailVerificationResult =
  | { status: 'verified'; email: string; name: string | null }
  | { status: 'invalid' | 'expired' | 'unconfirmed' };

/** One native SQL statement consumes this code and verifies its own account.
 * The database row lock serializes competing codes for that account. There is
 * no read/update gap, retry, receipt adoption or recovery from a later lookup.
 */
export async function consumeEmailVerification(email: string, code: string): Promise<EmailVerificationResult> {
  if (typeof email !== 'string' || !email || email.length > 254
    || typeof code !== 'string' || !/^\d{6}$/.test(code)) return { status: 'invalid' };
  try {
    const rows = await prisma.$queryRawUnsafe<Receipt[]>(
      `WITH account AS MATERIALIZED (
         SELECT id, email, name, "emailVerified" FROM users WHERE email = $1 FOR UPDATE
       ), consumed AS (
         DELETE FROM email_verification_tokens AS t USING account AS a
         WHERE t.email = a.email AND t.token = $2 AND a."emailVerified" IS NULL
         RETURNING t.expires
       ), verified AS (
         UPDATE users AS u SET "emailVerified" = timezone('UTC', clock_timestamp())
         FROM account AS a
         WHERE u.id = a.id AND u.email = a.email AND u."emailVerified" IS NULL
           AND EXISTS (SELECT 1 FROM consumed WHERE expires > timezone('UTC', clock_timestamp()))
         RETURNING u.id, u.email, u.name
       )
       SELECT CASE WHEN EXISTS (SELECT 1 FROM verified) THEN 'verified'
         WHEN EXISTS (SELECT 1 FROM consumed WHERE expires <= timezone('UTC', clock_timestamp())) THEN 'expired'
         ELSE 'invalid' END AS outcome,
         (SELECT id FROM verified) AS id, (SELECT email FROM verified) AS email,
         (SELECT name FROM verified) AS name`,
      email, code,
    );
    if (!Array.isArray(rows) || rows.length !== 1) return { status: 'unconfirmed' };
    const row = rows[0];
    if (row.outcome === 'verified' && typeof row.id === 'string' && row.id.length > 0
      && row.email === email && (row.name === null || typeof row.name === 'string')) {
      return { status: 'verified', email: row.email, name: row.name };
    }
    if ((row.outcome === 'invalid' || row.outcome === 'expired')
      && row.id === null && row.email === null && row.name === null) return { status: row.outcome };
    return { status: 'unconfirmed' };
  } catch {
    // A lost acknowledgment can leave a committed verification. Never replay it
    // or claim verification/delivery from metadata or an independent DB probe.
    return { status: 'unconfirmed' };
  }
}
