import { createHmac } from 'node:crypto';
import { authenticator } from 'otplib';
import { prisma } from '@/lib/prisma';

/** Consume a verified factor at most once across native credentials and JWT updates.
 * Callers must supply the authenticated account, never a body-selected principal.
 * The permanent watermark only denies replay; it does not recover a lost result.
 */
export async function consumeAdminTotp(userId: string, code: string, secret: string): Promise<boolean> {
  if (typeof userId !== 'string' || !userId || typeof code !== 'string'
    || !/^\d{6}$/.test(code) || typeof secret !== 'string' || !secret) return false;
  try {
    // Capture one native clock/options snapshot before verification and storage.
    // No caller timestamp, receipt, session reference or code hash grants a factor.
    const options = authenticator.allOptions();
    if (!Number.isSafeInteger(options.epoch) || options.epoch < 0
      || options.step !== 30 || options.digits !== 6 || options.algorithm !== 'sha1'
      || options.encoding !== 'hex') return false;
    const verifier = authenticator.clone({ ...options, window: 0 });
    if (verifier.checkDelta(code, secret) !== 0) return false;
    const counter = Math.floor(options.epoch / options.step / 1000);
    if (!Number.isSafeInteger(counter) || counter < 0) return false;
    // Canonical decoded key binds both access paths and spelling-equivalent seeds.
    // Persist neither the secret nor the submitted code. Changing session does not
    // reset consumption; the same seed/account retains its watermark indefinitely.
    const key = createHmac('sha256', Buffer.from(verifier.decode(secret), 'hex'))
      .update(JSON.stringify(['ytv-admin-totp-consumption-v1', userId])).digest('hex');
    const rows = await prisma.$queryRawUnsafe<{ key: string; counter: bigint }[]>(
      `INSERT INTO totp_consumptions (key, counter, consumed_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET counter = EXCLUDED.counter, consumed_at = NOW()
       WHERE totp_consumptions.counter < EXCLUDED.counter
       RETURNING key, counter`, key, BigInt(counter),
    );
    return Array.isArray(rows) && rows.length === 1
      && rows[0]?.key === key && rows[0]?.counter === BigInt(counter);
  } catch {
    // An unavailable store or lost commit acknowledgment must keep access gated.
    // Never delete/release a watermark or automatically repeat the factor grant.
    return false;
  }
}
