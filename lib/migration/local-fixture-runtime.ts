import 'server-only';
import { connectLocalFixture } from './local-fixture.cjs';
import { installTaskRuntime } from '@/lib/ai/task-runtime';
import { installConfigurationRuntime } from '@/lib/ai/configuration-runtime';
import { installBestTimeFixtureEntry } from './best-time-entry';
import { bestTimeFixture, createBestTimeFixtureTransport } from './best-time-fixture.cjs';
import { createBestTimeYouTubeSources } from '@/lib/best-time-youtube-sources';
import { runBoundBestTimeOriginal } from '@/lib/best-time-original';
import { getFixtureLifecycle } from './local-fixture-lifecycle.cjs';

let installation: Promise<void> | undefined;
export function installLocalFixture(): Promise<void> {
  return installation ??= (async () => {
    const lifecycle = getFixtureLifecycle();
    const composition = await lifecycle.openResource(() => connectLocalFixture());
    try {
      lifecycle.check();
      installTaskRuntime(composition.taskFactory);
      installConfigurationRuntime(composition.configurationDependencies);
      const owner = Object.freeze({ id: bestTimeFixture.userId, email: bestTimeFixture.email });
      const transport = createBestTimeFixtureTransport();
      installBestTimeFixtureEntry(request => lifecycle.runOriginal(() => runBoundBestTimeOriginal(request,
        createBestTimeYouTubeSources(bestTimeFixture.referenceAt, request.signal, transport), owner, true)));
    } catch (error) { await lifecycle.closeResource(composition); throw error; }
  })();
}
