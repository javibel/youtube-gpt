import { isParsedSignupInput, type SignupInput } from '@/lib/signup-input';

export type SignupTurnstilePermit = Readonly<{ kind: 'signup-turnstile-original' }>;
type Result = { status: 'verified'; permit: SignupTurnstilePermit }
  | { status: 'invalid' | 'not-configured' | 'unconfirmed' };
const permits = new WeakMap<SignupTurnstilePermit, { input: SignupInput | null; deadline: number }>();
const endpoint = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** One Siteverify original and body, bounded together. Metadata/clock checks only
 * deny; neither JSON success nor a captured timestamp recreates this capability.
 * Reference: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */
export async function verifySignupTurnstile(input: SignupInput): Promise<Result> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  const hostname = process.env.TURNSTILE_EXPECTED_HOSTNAME?.trim();
  if (!secret || !hostname || !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(hostname)) return { status: 'not-configured' };
  if (!input || !isParsedSignupInput(input) || !Object.isFrozen(input) || typeof input.turnstileToken !== 'string'
    || !/^[!-~]{1,2048}$/.test(input.turnstileToken)) return { status: 'invalid' };
  const controller = new AbortController();
  let retired = false, timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = Date.now() + 10000;
  const original = (async (): Promise<Result> => {
    try {
      const response = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret, response: input.turnstileToken }),
        redirect: 'error', credentials: 'omit', cache: 'no-store', signal: controller.signal,
      });
      if (retired || response.status !== 200 || !response.ok || response.redirected
        || !response.headers.get('content-type')?.toLowerCase().includes('application/json')
        || !response.body) return { status: 'unconfirmed' };
      const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
      let text = '', bytes = 0;
      try {
        while (true) {
          const part = await reader.read();
          if (retired) return { status: 'unconfirmed' };
          if (part.done) break;
          bytes += part.value.byteLength;
          if (bytes > 16384) return { status: 'unconfirmed' };
          text += decoder.decode(part.value, { stream: true });
        }
        text += decoder.decode();
      } finally { reader.releaseLock(); }
      const data: unknown = JSON.parse(text);
      if (retired || Date.now() >= deadline || !data || typeof data !== 'object' || Array.isArray(data)) return { status: 'unconfirmed' };
      const value = data as Record<string, unknown>;
      if (Object.keys(value).some(key => !['success', 'challenge_ts', 'hostname', 'action', 'error-codes', 'cdata', 'metadata'].includes(key))
        || !Array.isArray(value['error-codes']) || value['error-codes'].some(code => typeof code !== 'string')) return { status: 'unconfirmed' };
      if (value.success === false && value['error-codes'].length > 0) return { status: 'invalid' };
      if (value.success !== true || value['error-codes'].length !== 0
        || value.hostname !== hostname || value.action !== 'signup'
        || typeof value.challenge_ts !== 'string') return { status: 'unconfirmed' };
      const issued = Date.parse(value.challenge_ts), age = Date.now() - issued;
      if (!Number.isFinite(issued) || age < 0 || age >= 300000) return { status: 'invalid' };
      const permit: SignupTurnstilePermit = Object.freeze({ kind: 'signup-turnstile-original' });
      permits.set(permit, { input, deadline });
      return { status: 'verified', permit };
    } catch { return { status: 'unconfirmed' }; }
  })();
  const expired = new Promise<Result>(resolve => {
    timer = setTimeout(() => { retired = true; controller.abort(); resolve({ status: 'unconfirmed' }); }, 10000);
  });
  try { return await Promise.race([original, expired]); }
  finally { if (timer !== undefined) clearTimeout(timer); }
}

/** Consume once for this exact captured input; a clone/receipt/another module fails. */
export function takeSignupTurnstilePermit(permit: SignupTurnstilePermit, input: SignupInput): boolean {
  const record = permits.get(permit);
  if (!record || record.input !== input || Date.now() >= record.deadline) return false;
  record.input = null;
  return true;
}
