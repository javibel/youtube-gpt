import type { OutputSchema } from '@/contracts/ai/v1/core.cjs';

export interface MessagesTask {
  create(parameters: { messages: { role: 'user' | 'assistant'; content: string }[]; max_tokens: number; system?: string }, options?: { signal?: AbortSignal }): Promise<{ content: { type: 'text'; text: string }[]; incomplete?: boolean; usage?: { output_tokens?: number | null; input_tokens?: number | null } }>;
}
export interface TaskIdentity {
  taskType: string;
  userId: string;
  language: string;
  instructionsVersion: string;
  outputSchema?: OutputSchema;
  requiredCapabilities?: string[];
  incompletePolicy?: 'reject' | 'expose-text';
}
type TaskFactory = (identity: TaskIdentity) => Promise<MessagesTask>;
let factory: TaskFactory | undefined;

// Trusted server bootstrap owns the factory, authenticated budget mapping and
// durable store. This module has no public configuration endpoint or SDK fallback.
export function installTaskRuntime(candidate: TaskFactory): void {
  if (typeof candidate !== 'function') throw new Error('A trusted task factory is required');
  if (factory) throw new Error('Task runtime is already installed');
  factory = candidate;
}

export async function getMessagesTask(identity: TaskIdentity, options: { signal?: AbortSignal } = {}): Promise<MessagesTask> {
  if (!factory) throw new Error('Task control is unavailable');
  if (options.signal?.aborted) throw new Error('Task control was cancelled');
  if (!options.signal) return factory(identity);
  const signal = options.signal;
  let onAbort: () => void = () => {};
  const cancellation = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(new Error('Task control was cancelled'));
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([factory(identity), cancellation]);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}
