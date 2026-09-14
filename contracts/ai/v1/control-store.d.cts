import type { Registry, Configuration, AiRequest, CodingRequest, Snapshot, Usage, Status, Result } from './core.cjs';
export interface Transaction { query(sql: string, parameters?: unknown[]): Promise<Record<string, unknown>[]> }
export interface RoleBoundDatabase {
  role: 'reader' | 'activator' | 'executor';
  transaction<T>(work: (transaction: Transaction) => Promise<T>): Promise<T>;
}
export interface Admission { runId: string; snapshot: Readonly<Snapshot>; status: Status | 'running' | 'uncertain'; replay: boolean; result?: Readonly<Result>; accounting?: { state: 'settled' | 'uncertain'; replay: boolean } }
export interface ControlStore {
  publish(configuration: Configuration, actor: { actor: string }): Promise<{ revision: string }>;
  activate(revision: string, context: { expectedRevision?: string | null; actor: string; reason: string }): Promise<{ previousRevision: string | null; revision: string }>;
  active(): Promise<Configuration | null>;
  revision(revision: string): Promise<Configuration | null>;
  admit(request: AiRequest | CodingRequest, context: { runId: string; budgetId: string; agentId?: string; principalId?: string; executor?: 'ai' | 'coding' }): Promise<Admission>;
  reconcile(runId: string, outcome: { status: Status | 'uncertain'; usage?: Partial<Usage>; result?: Readonly<Result> }): Promise<{ state: 'settled' | 'uncertain'; replay?: boolean; retainedMicros?: number }>;
}
export declare function createControlStore(database: RoleBoundDatabase, registry: Registry): Readonly<ControlStore>;
