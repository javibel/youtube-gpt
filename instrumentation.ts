/**
 * Next.js Instrumentation — runs once on server startup.
 *
 * Trims trailing whitespace / newlines from every environment variable.
 * This prevents the recurring bug where values pasted into the Vercel
 * Dashboard (or pulled via CLI) carry invisible `\n` characters that
 * silently break OAuth flows, API keys, URLs, etc.
 */
export async function register() {
  // Select using normalized metadata without changing any secret bytes. A
  // mixed startup must fail before trimming or constructing either runtime.
  const nodeRuntime = process.env.NEXT_RUNTIME?.trim() === 'nodejs';
  const fixtureRequested = process.env.YTV_MIGRATION_WEB_TEST?.trim() === '1';
  const operationalRequested = process.env.YTV_OPERATIONAL_RUNTIME?.trim() === '1';
  if (nodeRuntime && fixtureRequested && operationalRequested) {
    throw new Error('Fixture and operational startup cannot share a process');
  }
  if (nodeRuntime && operationalRequested) {
    const { registerYTubViralNativeRelease } = await import('./lib/ai/ytubviral-native-release.cjs');
    registerYTubViralNativeRelease();
    const { prepareConfiguredPlatformWebHost } = await import('./lib/ai/platform-web-host');
    await prepareConfiguredPlatformWebHost();
  }
  for (const key of Object.keys(process.env)) {
    const val = process.env[key];
    if (val && val !== val.trim()) {
      process.env[key] = val.trim();
    }
  }
  if (nodeRuntime && fixtureRequested) {
    const { installLocalFixture } = await import('./lib/migration/local-fixture-runtime');
    await installLocalFixture();
  }
  if (nodeRuntime && operationalRequested) {
    const { installConfiguredOperationalWebRuntime } = await import('./lib/ai/operational-runtime');
    await installConfiguredOperationalWebRuntime();
  }
}
