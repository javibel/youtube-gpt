import { validatePassword } from '@/lib/password';
import { isDisposableEmail } from '@/lib/disposable-domains';

export type SignupInput = Readonly<{
  email: string; password: string; name: string; lang: 'es' | 'en'; turnstileToken: string;
  utmSource?: string; utmMedium?: string; utmCampaign?: string;
  signupReferrer?: string; signupLandingPage?: string; ref?: string; aff?: string;
}>;
const optional = { utmSource: 100, utmMedium: 100, utmCampaign: 100,
  signupReferrer: 500, signupLandingPage: 500, ref: 20, aff: 40 } as const;
const parsed = new WeakSet<SignupInput>();
export function isParsedSignupInput(input: SignupInput): boolean { return parsed.has(input); }
const keys = new Set(['email', 'password', 'name', 'lang', 'turnstileToken', ...Object.keys(optional)]);
export function parseSignupInput(body: unknown): SignupInput | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some(key => !keys.has(key))) return null;
  const value = body as Record<string, unknown>;
  if (typeof value.email !== 'string' || typeof value.password !== 'string'
    || typeof value.name !== 'string' || typeof value.turnstileToken !== 'string'
    || (value.lang !== undefined && value.lang !== 'es' && value.lang !== 'en')) return null;
  const email = value.email.trim().toLowerCase(), name = value.name.trim(), lang = value.lang === 'en' ? 'en' : 'es';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || /[\u0000-\u001f\u007f]/.test(email) || !name || name.length > 100 || /[\u0000-\u001f\u007f]/.test(name)
    || new TextEncoder().encode(value.password).length > 72 || validatePassword(value.password, lang)
    || isDisposableEmail(email) || !/^[!-~]{1,2048}$/.test(value.turnstileToken)) return null;
  const metadata: Record<string, string> = {};
  for (const [key, max] of Object.entries(optional)) {
    if (value[key] === undefined) continue;
    if (typeof value[key] !== 'string') return null;
    metadata[key] = value[key].slice(0, max);
  }
  const input: SignupInput = Object.freeze({ email, name, password: value.password, lang, turnstileToken: value.turnstileToken, ...metadata });
  parsed.add(input);
  return input;
}
