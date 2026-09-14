export type Status = 'completed' | 'incomplete' | 'refused' | 'failed' | 'cancelled';
export type ErrorCode = 'credentials' | 'permissions' | 'quota' | 'rate_limit' | 'deadline' | 'transport' | 'capability' | 'invalid_format' | 'uncertain' | 'configuration' | 'cancelled';
export interface Budget { currency: string; maxCostMicros: number; maxOutputTokens: number; deadlineMs: number }
export interface OutputSchema {
  type: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';
  properties?: Record<string, OutputSchema>; required?: string[]; additionalProperties?: boolean;
  items?: OutputSchema; enum?: (string | number | boolean | null)[];
  minimum?: number; maximum?: number; minLength?: number; maxLength?: number; minItems?: number; maxItems?: number;
}
export interface CommonRequest {
  requestId: string; taskType: string; contractVersion: '1.0'; inputVersion: string;
  language: string; instructions: string; instructionsVersion: string;
  requiredCapabilities: string[]; budget: Budget; idempotencyKey?: string;
}
export interface AiRequest extends CommonRequest {
  messages: { role: 'system' | 'user' | 'assistant' | 'tool'; content: ({ type: 'text'; text: string } | { type: 'image'; url: string; mediaType: string })[] }[];
  outputSchema?: OutputSchema; toolPolicy: { allowed: string[]; maxCalls: number };
}
export interface Snapshot {
  providerId: string; model: string; adapterVersion: string; credentialRef: string;
  configRevision: string; profileId: string; executor: 'ai' | 'coding';
  exception: { scope: 'task' | 'agent'; id: string; authorizedBy: string } | null;
}
export interface Usage {
  inputTokens: number | null; outputTokens: number | null; cacheReadTokens: number | null;
  cacheWriteTokens: number | null; toolCalls: number | null; costMicros: number | null;
  currency: string; priceVersion: string | null; estimated: boolean;
}
export interface AdapterResult {
  status: Status; text?: string | null; data?: unknown; sources?: { url: string; title: string }[];
  usage?: Partial<Usage>; error?: { code: ErrorCode; message: string } | null;
}
export interface Result extends Omit<AdapterResult, 'usage' | 'error'> {
  requestId: string; runId: string; contractVersion: '1.0'; providerId: string; model: string;
  adapterVersion: string; configRevision: string; instructionsVersion: string;
  usage: Usage; error: { code: ErrorCode; message: string; retryable: boolean } | null;
}
export interface Selection { providerId: string; model: string }
export interface Configuration {
  contractVersion: '1.0'; revision: string; fallback: 'none'; activeProfile: string;
  profiles: Record<string, Record<string, Selection>>;
  exceptions: { scope: 'task' | 'agent'; id: string; selection: Selection; authorizedBy: string; reason: string }[];
}
export interface Checkpoint { objective: string; progress: string; changes: string[]; tests: string[]; pending: string[] }
export interface CodingRequest extends CommonRequest {
  objective: string; repositoryId: string; baseRevision: string; allowedFiles: string[];
  permissions: { read: boolean; edit: boolean; execute: boolean; commit: boolean; deploy: false; communicate: false };
  allowedCommands: string[][]; checkpoint?: Checkpoint;
}
export interface CodingData {
  changes: { path: string; kind: 'create' | 'modify' | 'delete'; patch: string }[];
  commands: { argv: string[]; exitCode: number }[];
  validations: { name: string; passed: boolean }[]; pending: string[];
}
export interface Provider {
  providerId: string; adapterVersion: string; enabled: boolean; credentialRef: string;
  models: Record<string, { verified: true; executors: ('ai' | 'coding')[]; capabilities: string[] }>;
  execute(context: { request: Readonly<AiRequest | CodingRequest>; snapshot: Readonly<Snapshot>; runId: string; signal: AbortSignal }): Promise<AdapterResult & { checkpoint?: Checkpoint }>;
}
export interface Registry {
  runPinned(snapshot: Snapshot, request: AiRequest | CodingRequest, context: { runId: string; signal?: AbortSignal }): Promise<Readonly<Result & { checkpoint?: Checkpoint | null }>>;
  register(provider: Provider): void;
  resolve(configuration: Configuration, request: Pick<CommonRequest, 'taskType' | 'requiredCapabilities'>, context?: { agentId?: string; executor?: 'ai' | 'coding' }): Readonly<Snapshot>;
  run(configuration: Configuration, request: AiRequest, context: { runId: string; agentId?: string; signal?: AbortSignal }): Promise<Readonly<Result>>;
  runCoding(configuration: Configuration, request: CodingRequest, context: { runId: string; agentId?: string; signal?: AbortSignal }): Promise<Readonly<Result & { checkpoint: Checkpoint | null }>>;
}
export declare class ContractError extends Error { code: ErrorCode; retryable: boolean; constructor(code: ErrorCode, message: string) }
export declare const CONTRACT_VERSION: '1.0';
export declare const STATUSES: readonly Status[];
export declare const ERROR_POLICIES: Readonly<Record<ErrorCode, { retryable: boolean }>>;
export declare function createRegistry(): Registry;
export declare function validateRequest(value: unknown): Readonly<AiRequest>;
export declare function validateSchema(value: unknown): void;
export declare function validateData(schema: OutputSchema, value: unknown): unknown;
export declare function validateResult(value: AdapterResult, request: AiRequest, snapshot: Snapshot, runId: string): Readonly<Result>;
