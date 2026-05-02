/**
 * Next.js Instrumentation — runs once on server startup.
 *
 * Trims trailing whitespace / newlines from every environment variable.
 * This prevents the recurring bug where values pasted into the Vercel
 * Dashboard (or pulled via CLI) carry invisible `\n` characters that
 * silently break OAuth flows, API keys, URLs, etc.
 */
export function register() {
  for (const key of Object.keys(process.env)) {
    const val = process.env[key];
    if (val && val !== val.trim()) {
      process.env[key] = val.trim();
    }
  }
}
