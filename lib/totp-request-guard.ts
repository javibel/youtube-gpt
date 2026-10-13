import { expectedTotpAccountMatches } from './totp-account';

/** Opt-in negative guard before Auth.js's original session POST can reissue cookies.
 * Public selectors cannot grant a principal/factor or recover an original result.
 */
export async function guardNativeTotpUpdate(request: Request,
  readCookie: (request: Request) => Promise<unknown>,
  nativePost: (request: Request) => Promise<Response>): Promise<Response> {
  const header = request.headers.get('x-ytv-totp-expectation');
  if (header === null) return nativePost(request); // Other native session consumers retain their defaults.
  try {
    if (header.length > 4096) return Response.json({ error: 'invalid_expectation' }, { status: 400 });
    const body: unknown = JSON.parse(decodeURIComponent(header));
    if (!body || typeof body !== 'object' || Array.isArray(body))
      return Response.json({ error: 'invalid_expectation' }, { status: 400 });
    const value = body as Record<string, unknown>, keys = Object.keys(value);
    if (keys.length !== 3 || !keys.every(key => ['expectedUserId', 'expectedEmail', 'expectedAuthSessionRef'].includes(key))
      || typeof value.expectedUserId !== 'string' || !value.expectedUserId
      || typeof value.expectedEmail !== 'string' || !value.expectedEmail.trim()
      || typeof value.expectedAuthSessionRef !== 'string' || !value.expectedAuthSessionRef)
      return Response.json({ error: 'invalid_expectation' }, { status: 400 });
    const cookie = await readCookie(request);
    const token = cookie && typeof cookie === 'object' && !Array.isArray(cookie)
      ? cookie as Record<string, unknown> : null;
    if (!token || !expectedTotpAccountMatches(value, token))
      return Response.json({ error: 'session_changed' }, { status: 409 });
    // Native CSRF and JWT callback/OTP/consumption remain responsible for grant.
    // An already-issued response can still race another browser cookie writer.
    return await nativePost(request);
  } catch {
    return Response.json({ error: 'verification_unavailable' }, { status: 503 });
  }
}
