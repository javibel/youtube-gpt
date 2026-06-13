import crypto from 'crypto';

// Token de baja sin estado: userId firmado con HMAC. Permite dar de baja en un
// clic sin login (LSSI). El secreto reutiliza NEXTAUTH_SECRET si no hay uno propio.
const SECRET = (process.env.EMAIL_TOKEN_SECRET || process.env.NEXTAUTH_SECRET || '').trim();

export function signUnsubscribe(userId: string): string {
  const sig = crypto.createHmac('sha256', SECRET).update(userId).digest('base64url');
  return `${Buffer.from(userId).toString('base64url')}.${sig}`;
}

export function verifyUnsubscribe(token: string): string | null {
  const [b64, sig] = (token || '').split('.');
  if (!b64 || !sig) return null;
  let userId: string;
  try { userId = Buffer.from(b64, 'base64url').toString('utf8'); } catch { return null; }
  const expected = crypto.createHmac('sha256', SECRET).update(userId).digest('base64url');
  // Comparación en tiempo constante
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  return userId;
}
