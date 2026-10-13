/** Negative selectors for the app's owned sign-out transport. The native encrypted
 * cookie remains the principal and Auth.js still verifies its original CSRF POST.
 * These public values cannot authenticate, recover or revoke another device.
 */
export async function guardNativeSignout(
  request: Request,
  readCookie: (request: Request) => Promise<unknown>,
  nativePost: (request: Request) => Promise<Response>,
): Promise<Response> {
  const header = request.headers.get('x-ytv-signout-expectation');
  // Preserve other installed Auth.js consumers. Only the owned transport claims
  // this restriction; this is not a global logout/cookie-write serialization rule.
  if (header === null) return nativePost(request);
  try {
    if (header.length > 4096) return Response.json({ error: 'invalid_expectation' }, { status: 400 });
    const expected: unknown = JSON.parse(decodeURIComponent(header));
    if (!expected || typeof expected !== 'object' || Array.isArray(expected))
      return Response.json({ error: 'invalid_expectation' }, { status: 400 });
    const value = expected as Record<string, unknown>;
    const keys = Object.keys(value);
    if (keys.length !== 3 || !keys.every(key => ['userId', 'email', 'authSessionRef'].includes(key))
      || typeof value.userId !== 'string' || !value.userId
      || typeof value.email !== 'string' || !value.email.trim()
      || typeof value.authSessionRef !== 'string')
      return Response.json({ error: 'invalid_expectation' }, { status: 400 });
    const cookie = await readCookie(request);
    const token = cookie && typeof cookie === 'object' && !Array.isArray(cookie)
      ? cookie as Record<string, unknown> : null;
    // Empty reference preserves explicit logout of a legacy native cookie only.
    // Two legacy cookies for the same account remain indistinguishable here.
    const refMatches = token?.authSessionRef === undefined
      ? value.authSessionRef === ''
      : typeof token.authSessionRef === 'string' && !!token.authSessionRef
        && token.authSessionRef === value.authSessionRef;
    if (!token || typeof token.id !== 'string' || token.id !== value.userId
      || typeof token.email !== 'string'
      || token.email.trim().toLowerCase() !== value.email.trim().toLowerCase() || !refMatches)
      return Response.json({ error: 'session_changed' }, { status: 409 });
    return await nativePost(request);
  } catch {
    return Response.json({ error: 'signout_unavailable' }, { status: 503 });
  }
}
