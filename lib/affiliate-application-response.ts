// Display acknowledgement only; never account, delivery or consent authority.
export function hasAcceptedAffiliateApplicationResponse(status: number, value: unknown): boolean {
  return status === 202 && !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === 2 && (value as { ok?: unknown }).ok === true
    && (value as { status?: unknown }).status === 'accepted';
}
