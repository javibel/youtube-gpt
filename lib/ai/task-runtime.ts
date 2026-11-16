import type { OutputSchema } from '@/contracts/ai/v1/core.cjs';
import { waitForOperationalWebRuntime } from './operational-readiness';

export type MessageContent = string | ({ type: 'text'; text: string } | { type: 'image'; source: { type: 'url'; url: string } })[];
export interface MessagesTask {
  create(parameters: { messages: { role: 'user' | 'assistant'; content: MessageContent }[]; max_tokens: number; system?: string; tools?: { name: 'web_search'; maxCalls: number }[] }, options?: { signal?: AbortSignal }): Promise<{ content: { type: 'text'; text: string }[]; incomplete?: boolean; usage?: { output_tokens?: number | null; input_tokens?: number | null } }>;
  retrieve?(parameters: Parameters<MessagesTask['create']>[0], options?: { signal?: AbortSignal }): Promise<Awaited<ReturnType<MessagesTask['create']>> | null>;
}
export type TaskIdentity = ({ userId: string; serviceId?: never } | { serviceId: string; userId?: never }) & {
  taskType: string;
  language: string;
  instructionsVersion: string;
  operationKey?: string;
  outputSchema?: OutputSchema;
  requiredCapabilities?: string[];
  incompletePolicy?: 'reject' | 'expose-text';
};
type TaskFactory = (identity: TaskIdentity) => Promise<MessagesTask>;
const runtimeKey = Symbol.for('ytubviral.ai.task-runtime.v1');
const bundleKey = Symbol.for('ytubviral.ai.shared-runtime.v1');
const shared = globalThis as typeof globalThis & { [runtimeKey]?: TaskFactory; [bundleKey]?: Readonly<{factory:TaskFactory}> };

// Trusted server bootstrap owns the factory, authenticated budget mapping and
// durable store. This module has no public configuration endpoint or SDK fallback.
export function installTaskRuntime(candidate: TaskFactory): void {
  if (typeof candidate !== 'function') throw new Error('A trusted task factory is required');
  if (shared[runtimeKey] || shared[bundleKey]) throw new Error('Task runtime is already installed');
  Object.defineProperty(shared, runtimeKey, { value: candidate, writable: false, configurable: false });
}

export async function getMessagesTask(identity: TaskIdentity, options: { signal?: AbortSignal } = {}): Promise<MessagesTask> {
  if (options.signal?.aborted) throw new Error('Task control was cancelled');
  const prepare = async () => {
    await waitForOperationalWebRuntime();
    if (options.signal?.aborted) throw new Error('Task control was cancelled');
    const factory = shared[bundleKey]?.factory ?? shared[runtimeKey];
    if (!factory) throw new Error('Task control is unavailable');
    return factory(identity);
  };
  if (!options.signal) return prepare();
  const signal = options.signal;
  let onAbort: () => void = () => {};
  const cancellation = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(new Error('Task control was cancelled'));
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([prepare(), cancellation]);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}
