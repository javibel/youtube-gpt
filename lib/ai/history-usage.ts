// Legacy zero means either missing usage or no AI call, not a proven measurement.
// Keep the database compatible; the execution ledger holds exact nullable usage.
export function historyOutputTokens(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}
