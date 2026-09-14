import type { OutputSchema } from '@/contracts/ai/v1/core.cjs';

export interface MessagesTask {
  create(parameters: { messages: { role: 'user' | 'assistant'; content: string }[]; max_tokens: number; system?: string }): Promise<{ content: { type: 'text'; text: string }[] }>;
}
export interface TaskIdentity {
  taskType: string;
  userId: string;
  language: string;
  instructionsVersion: string;
  outputSchema: OutputSchema;
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

export async function getMessagesTask(identity: TaskIdentity): Promise<MessagesTask> {
  if (!factory) throw new Error('Task control is unavailable');
  return factory(identity);
}
