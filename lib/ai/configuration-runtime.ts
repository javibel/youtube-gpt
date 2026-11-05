import 'server-only';
import { createHash } from 'node:crypto';
import { requireAdmin } from '@/lib/auth-guards';
import { createConfigurationService, type ConfigurationDependencies, type ConfigurationService } from './configuration-service.cjs';
import type { TaskIdentity, MessagesTask } from './task-runtime';

const runtimeKey = Symbol.for('ytubviral.ai.configuration-runtime.v1');
const bundleKey = Symbol.for('ytubviral.ai.shared-runtime.v1');
export type SharedRuntimeBundle = {factory:(identity:TaskIdentity)=>Promise<MessagesTask>;service:Readonly<ConfigurationService>};
const shared = globalThis as typeof globalThis & { [runtimeKey]?: Readonly<ConfigurationService>; [bundleKey]?: Readonly<SharedRuntimeBundle> };
// Original session-derived actor, shared by configuration control and its
// agent observation reader. Never supplied by an HTTP body or release JSON.
export async function getAuthenticatedConfigurationActor():Promise<string|null> {
  const gate=await requireAdmin();
  return gate.ok ? 'admin_'+createHash('sha256').update(gate.email).digest('hex') : null;
}

// Trusted local server composition installs stores and runtime declarations.
// Operator identity always comes from the authenticated server session.
export function createAuthenticatedConfigurationService(dependencies: Omit<ConfigurationDependencies, 'getActor'>): Readonly<ConfigurationService> {
  return createConfigurationService({ ...dependencies, getActor:getAuthenticatedConfigurationActor });
}

export function installConfigurationRuntime(dependencies: Omit<ConfigurationDependencies, 'getActor'>): void {
  if (shared[runtimeKey] || shared[bundleKey]) throw new Error('Configuration runtime is already installed');
  const service = createAuthenticatedConfigurationService(dependencies);
  Object.defineProperty(shared, runtimeKey, { value: service, writable: false, configurable: false });
}

export function getConfigurationService(): Readonly<ConfigurationService> | undefined {
  return shared[bundleKey]?.service ?? shared[runtimeKey];
}
