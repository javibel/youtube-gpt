import 'server-only';
import { connectLocalFixture } from './local-fixture.cjs';
import { installTaskRuntime } from '@/lib/ai/task-runtime';
import { installConfigurationRuntime } from '@/lib/ai/configuration-runtime';
import { installBestTimeFixtureEntry } from './best-time-entry';
import { bestTimeFixture, createBestTimeFixtureTransport } from './best-time-fixture.cjs';
import { createBestTimeYouTubeSources } from '@/lib/best-time-youtube-sources';
import { runBoundBestTimeOriginal } from '@/lib/best-time-original';

let installation: Promise<void> | undefined;
export function installLocalFixture(): Promise<void> {
  return installation ??= (async () => {
    const composition = await connectLocalFixture();
    try {
      installTaskRuntime(composition.taskFactory);
      installConfigurationRuntime(composition.configurationDependencies);
      const owner = Object.freeze({ id: bestTimeFixture.userId, email: bestTimeFixture.email });
      const transport = createBestTimeFixtureTransport();
      installBestTimeFixtureEntry(request => runBoundBestTimeOriginal(request,
        createBestTimeYouTubeSources(bestTimeFixture.referenceAt, request.signal, transport), owner));
      process.once('SIGTERM', () => { void composition.close(); });
      process.once('SIGINT', () => { void composition.close(); });
    } catch (error) { await composition.close(); throw error; }
  })();
}
