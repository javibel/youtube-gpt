import 'server-only';
import { createOpenAIRuntimeBootstrap, type OpenAIRuntimeDependencies, type OpenAIRuntimeReadiness } from './openai-runtime-bootstrap.cjs';
import { installTaskRuntime } from './task-runtime';

const bootstrapKey = Symbol.for('ytubviral.ai.openai-bootstrap.v1');
type Registration = { dependencies: OpenAIRuntimeDependencies; signal?: AbortSignal; promise: Promise<Readonly<OpenAIRuntimeReadiness>> };
const shared = globalThis as typeof globalThis & { [bootstrapKey]?: Readonly<Registration> };

// Opt-in trusted server entry, never imported by application startup. Original
// capabilities and readiness wait survive duplicate bundles; failures stay
// failed and are not turned into an activation or a silently replaced runtime.
export function installOpenAITaskRuntime(dependencies: OpenAIRuntimeDependencies, options: { signal?: AbortSignal } = {}): Promise<Readonly<OpenAIRuntimeReadiness>> {
  const signal = options.signal;
  const original = shared[bootstrapKey];
  if (original) {
    if (original.dependencies !== dependencies || original.signal !== signal) throw new Error('OpenAI bootstrap already has original capabilities');
    return original.promise;
  }
  const bootstrap = createOpenAIRuntimeBootstrap(dependencies);
  const promise = Promise.resolve().then(async () => {
    const candidate = await bootstrap.prepare({ signal });
    if (signal?.aborted) throw new Error('OpenAI bootstrap was cancelled');
    installTaskRuntime(candidate.factory);
    return candidate.readiness;
  });
  Object.defineProperty(shared, bootstrapKey, { value: Object.freeze({ dependencies, signal, promise }), writable: false, configurable: false });
  return promise;
}
