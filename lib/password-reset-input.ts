import { Buffer } from 'node:buffer';
export type PasswordResetInput = Readonly<{ kind: 'password-reset-input' }>;
type Captured = { token: string; password: string; lang: 'es' | 'en' };
const inputs = new WeakMap<PasswordResetInput, Captured>();
export function parsePasswordResetInput(value: unknown): PasswordResetInput | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some(key => !['token', 'password', 'lang'].includes(key))
    || typeof row.token !== 'string' || !/^[a-f0-9]{64}$/.test(row.token)
    || typeof row.password !== 'string' || !row.password || Buffer.byteLength(row.password, 'utf8') > 72
    || row.lang !== undefined && row.lang !== 'es' && row.lang !== 'en') return;
  const input: PasswordResetInput = Object.freeze({ kind: 'password-reset-input' });
  inputs.set(input, { token: row.token, password: row.password, lang: row.lang ?? 'es' });
  return input;
}
// Parsed live input is consumed once; JSON/token/IDs never resume an operation.
// A new bearer-factor request must still pass native one-use token consumption.
export function takePasswordResetInput(input: PasswordResetInput): Captured | undefined {
  const captured = inputs.get(input); inputs.delete(input); return captured;
}
