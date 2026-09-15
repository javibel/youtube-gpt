import 'server-only';
import { createHash } from 'node:crypto';
import { requireAdmin } from '@/lib/auth-guards';
import { createConfigurationService, type ConfigurationDependencies, type ConfigurationService } from './configuration-service.cjs';

let service: Readonly<ConfigurationService> | undefined;

// Trusted local server composition installs stores and runtime declarations.
// Operator identity always comes from the authenticated server session.
export function installConfigurationRuntime(dependencies: Omit<ConfigurationDependencies, 'getActor'>): void {
  if (service) throw new Error('Configuration runtime is already installed');
  service = createConfigurationService({ ...dependencies, getActor: async () => {
    const gate = await requireAdmin();
    return gate.ok ? 'admin_' + createHash('sha256').update(gate.email).digest('hex') : null;
  } });
}

export function getConfigurationService(): Readonly<ConfigurationService> | undefined {
  return service;
}
