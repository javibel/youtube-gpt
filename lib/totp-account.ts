export type TotpAccountExpectation = Readonly<{ expectedUserId: string; expectedEmail: string }>;

// These public selectors can only restrict an operation. They do not establish
// a session, prove a factor, bind an instance/device, or grant recovery authority.
// Callers must supply the principal from their authenticated native session/JWT.
export function expectedTotpAccountMatches(input: unknown, principal: { id?: unknown; email?: unknown }) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const expected = input as { expectedUserId?: unknown; expectedEmail?: unknown };
  return typeof principal.id === 'string' && !!principal.id
    && typeof principal.email === 'string' && !!principal.email.trim()
    && typeof expected.expectedUserId === 'string' && expected.expectedUserId === principal.id
    && typeof expected.expectedEmail === 'string'
    && expected.expectedEmail.trim().toLowerCase() === principal.email.trim().toLowerCase();
}
