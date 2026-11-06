/**
 * Next.js Instrumentation — runs once on server startup.
 *
 * Trims trailing whitespace / newlines from every environment variable.
 * This prevents the recurring bug where values pasted into the Vercel
 * Dashboard (or pulled via CLI) carry invisible `\n` characters that
 * silently break OAuth flows, API keys, URLs, etc.
 */
export async function register() {
  const fixtureRequested = process.env.YTV_MIGRATION_WEB_TEST?.trim() === '1';
  const operationalRequested = process.env.YTV_OPERATIONAL_RUNTIME?.trim() === '1';
  // Keep the literal Next runtime guard around every Node-only import. Next's
  // Edge compiler must remove these branches before resolving dependencies.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Reject mixed startup before changing secret bytes or constructing owners.
    if (fixtureRequested && operationalRequested) {
      throw new Error('Fixture and operational startup cannot share a process');
    }
    if (operationalRequested) {
      const { registerYTubViralNativeRelease } = await import('./lib/ai/ytubviral-native-release.cjs');
      const { getAuthenticatedConfigurationActor } = await import('./lib/ai/configuration-runtime');
      registerYTubViralNativeRelease({getAdministrativeActor:getAuthenticatedConfigurationActor});
      const { prepareConfiguredPlatformWebHost } = await import('./lib/ai/platform-web-host');
      await prepareConfiguredPlatformWebHost();
    }
  }
  for (const key of Object.keys(process.env)) {
    const val = process.env[key];
    if (val && val !== val.trim()) {
      process.env[key] = val.trim();
    }
  }
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (fixtureRequested) {
      const { installLocalFixture } = await import('./lib/migration/local-fixture-runtime');
      await installLocalFixture();
    }
    if (operationalRequested) {
      const { installConfiguredOperationalWebRuntime } = await import('./lib/ai/operational-runtime');
      await installConfiguredOperationalWebRuntime();
    }
  }
}
