import type { ControlSchema } from '../../contracts/ai/v1/control-store.cjs';
import type { TaskIdentity, MessagesTask } from './task-runtime';
import type { ModelMetadataChecker, ModelMetadataObservation } from './model-metadata-readiness.cjs';
export interface OpenAIRuntimeDependencies {
  database: { role: 'executor'; controlSchema?: ControlSchema; transaction: <T>(fn: (tx: { query: (sql: string, args: unknown[]) => Promise<unknown[]> }) => Promise<T>) => Promise<T> };
  resolveAddress: (context: { hostname: string; signal: AbortSignal }) => Promise<string>;
  readCredential: (context: { credentialRef: string; signal: AbortSignal }) => Promise<string>;
  credentialRef: string;
  models: Record<string, { verified: true; executors: ('ai' | 'coding')[]; capabilities: string[] }>;
  preflight: (context: unknown) => Promise<{ upperBoundMicros: number; currency: string; priceVersion: string }>;
  priceUsage: (context: unknown) => Promise<{ costMicros: number; currency: string; priceVersion: string; estimated: boolean } | null>;
  maxRequestBytes: number;
  maxResponseBytes: number;
  policies: Record<string, { maxToolCalls: number; budget: { currency: string; maxCostMicros: number; maxOutputTokens: number; deadlineMs: number }; serviceIds?: string[] }>;
  authorize: (context: { userId?: string; serviceId?: string; taskType: string }) => Promise<{ budgetId: string; agentId?: string } | null>;
  taskCatalog: Record<string, { capabilities: string[]; agentIds?: string[] }>;
  pricing: { version: string; currency: string };
  budgetBindings: Record<string, string[]>;
  checkCredential: (context: { runtimeId: 'web'; providerId: string; credentialRef: string; signal: AbortSignal }) => Promise<boolean>;
  checkModelAvailability: ModelMetadataChecker;
  timeoutMs: number;
}
export interface OpenAIRuntimeReadiness { runtimeId: 'web'; providerId: string; adapterVersion: string; configRevision: string; activeProfile: string; priceVersion: string; currency: string; taskTypes: readonly string[]; assignments: readonly Readonly<{ profile: string; taskType: string; agentId: string | null; model: string }>[]; modelMetadata: readonly Readonly<ModelMetadataObservation>[] }
export declare function createOpenAIRuntimeBootstrap(dependencies: OpenAIRuntimeDependencies): Readonly<{ prepare(options?: { signal?: AbortSignal }): Promise<Readonly<{ factory: (identity: TaskIdentity) => Promise<MessagesTask>; readiness: Readonly<OpenAIRuntimeReadiness> }>> }>;
