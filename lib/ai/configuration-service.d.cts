import type { Registry, Configuration } from '../../contracts/ai/v1/core.cjs';
import type { ControlStore } from '../../contracts/ai/v1/control-store.cjs';
export interface ConfigurationDependencies {
  registry: Registry;
  reader: Pick<ControlStore, 'active' | 'revision'>;
  activator: Pick<ControlStore, 'publish' | 'activate'>;
  taskCatalog: Record<string, { executor: 'ai' | 'coding'; capabilities: string[]; runtimeIds: string[]; agentIds?: string[] }>;
  getActor: (action: string) => Promise<string | null>;
  getRuntimes: () => Promise<{ id: string; contractVersions: string[]; adapters: Record<string, string> }[]>;
  checkCredential: (context: { runtimeId: string; credentialRef: string; providerId: string }) => Promise<boolean>;
  checkModelAvailability: import('./model-metadata-readiness.cjs').ModelMetadataChecker;
  clock?: () => number;
  previewTtlMs?: number;
}
export interface ConfigurationService {
  current(): Promise<Configuration | null>;
  validate(configuration: unknown): Promise<unknown>;
  preview(configuration: unknown, context: { reason: string }): Promise<unknown>;
  previewRollback(revision: string, context: { reason: string }): Promise<unknown>;
  activate(previewId: string): Promise<unknown>;
}
export declare function createConfigurationService(dependencies: ConfigurationDependencies): Readonly<ConfigurationService>;
/** Trusted read-only startup validator; has no actor, preview, storage or activation. */
export declare function createConfigurationValidator(dependencies:Pick<ConfigurationDependencies,'registry'|'taskCatalog'|'getRuntimes'|'checkCredential'|'checkModelAvailability'>,scope?:Readonly<{runtimeId:string}>):(configuration:unknown)=>Promise<unknown[]>;
