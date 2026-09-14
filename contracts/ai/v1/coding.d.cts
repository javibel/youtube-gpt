import type { CodingRequest, Checkpoint, AdapterResult, Result, Snapshot, OutputSchema } from './core.cjs';
export declare const outputSchema: OutputSchema;
export declare const checkpointSchema: OutputSchema;
export declare function validateCodingRequest(value: unknown): Readonly<CodingRequest & { outputSchema: OutputSchema }>;
export declare function validateCodingResult(value: AdapterResult & { checkpoint?: Checkpoint }, request: CodingRequest & { outputSchema: OutputSchema }, snapshot: Snapshot, runId: string): Readonly<Result & { checkpoint: Checkpoint | null }>;
