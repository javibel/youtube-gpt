import 'server-only';
import { connectLocalFixture } from './local-fixture.cjs';
import { installTaskRuntime } from '@/lib/ai/task-runtime';
import { installConfigurationRuntime } from '@/lib/ai/configuration-runtime';

let installation: Promise<void> | undefined;
export function installLocalFixture(): Promise<void> {
  return installation ??= (async () => {
    const composition = await connectLocalFixture();
    try {
      installTaskRuntime(composition.taskFactory);
      installConfigurationRuntime(composition.configurationDependencies);
      process.once('SIGTERM', () => { void composition.close(); });
      process.once('SIGINT', () => { void composition.close(); });
    } catch (error) { await composition.close(); throw error; }
  })();
}
