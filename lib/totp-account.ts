export type TotpAccountExpectation = Readonly<{ expectedUserId: string; expectedEmail: string; expectedAuthSessionRef: string }>;

// These public selectors can only restrict an operation. They do not establish
// a session, prove a factor, or grant device/recovery authority. The reference
// only compares against a claim issued by a native authenticated sign-in.
// Callers must supply the principal from their authenticated native session/JWT.
export function expectedTotpAccountMatches(input: unknown, principal: { id?: unknown; email?: unknown; authSessionRef?: unknown }) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const expected = input as { expectedUserId?: unknown; expectedEmail?: unknown; expectedAuthSessionRef?: unknown };
  return typeof principal.id === 'string' && !!principal.id
    && typeof principal.email === 'string' && !!principal.email.trim()
    && typeof expected.expectedUserId === 'string' && expected.expectedUserId === principal.id
    && typeof expected.expectedEmail === 'string'
    && expected.expectedEmail.trim().toLowerCase() === principal.email.trim().toLowerCase()
    && typeof principal.authSessionRef === 'string' && !!principal.authSessionRef
    && typeof expected.expectedAuthSessionRef === 'string' && expected.expectedAuthSessionRef === principal.authSessionRef;
}
