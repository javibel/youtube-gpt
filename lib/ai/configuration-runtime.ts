import 'server-only';
import { createHash } from 'node:crypto';
import { requireAdmin } from '@/lib/auth-guards';
import { createConfigurationService, type ConfigurationDependencies, type ConfigurationService } from './configuration-service.cjs';

const runtimeKey = Symbol.for('ytubviral.ai.configuration-runtime.v1');
const shared = globalThis as typeof globalThis & { [runtimeKey]?: Readonly<ConfigurationService> };

// Trusted local server composition installs stores and runtime declarations.
// Operator identity always comes from the authenticated server session.
export function installConfigurationRuntime(dependencies: Omit<ConfigurationDependencies, 'getActor'>): void {
  if (shared[runtimeKey]) throw new Error('Configuration runtime is already installed');
  const service = createConfigurationService({ ...dependencies, getActor: async () => {
    const gate = await requireAdmin();
    return gate.ok ? 'admin_' + createHash('sha256').update(gate.email).digest('hex') : null;
  } });
  Object.defineProperty(shared, runtimeKey, { value: service, writable: false, configurable: false });
}

export function getConfigurationService(): Readonly<ConfigurationService> | undefined {
  return shared[runtimeKey];
}
