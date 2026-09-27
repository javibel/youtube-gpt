import type { AiRequest, CodingRequest, Registry, Result, Checkpoint } from './core.cjs';
import type { ControlStore, Admission } from './control-store.cjs';
export type TaskOutcome = { kind: 'existing-run'; runId: string; status: Admission['status']; snapshot: Admission['snapshot'] } | { kind: 'result'; result: Readonly<Result & { checkpoint?: Checkpoint | null }>; accounting: Awaited<ReturnType<ControlStore['reconcile']>> };
export declare function createTaskRunner(options: { store: ControlStore; registry: Registry; executor?: 'ai' | 'coding'; clock?: () => number }): Readonly<{
  run(request: AiRequest | CodingRequest, context: { runId: string; budgetId: string; agentId?: string; principalId?: string; signal?: AbortSignal }): Promise<TaskOutcome>;
  runClaimed(request: AiRequest | CodingRequest, context: { runId: string; budgetId: string; agentId?: string; principalId?: string; dispatchDigest: string; signal?: AbortSignal }): Promise<Extract<TaskOutcome, { kind: 'result' }>>;
}>;
