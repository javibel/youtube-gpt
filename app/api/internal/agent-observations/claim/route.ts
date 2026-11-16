import { createObserverHttpHandlers } from '@/lib/ai/observer-channel-http.cjs';
import { getObserverChannel } from '@/lib/ai/observer-channel-runtime.cjs';
import { waitForOperationalWebRuntime } from '@/lib/ai/operational-readiness';
export const runtime = 'nodejs';
const handle = createObserverHttpHandlers({ getService: async () => { await waitForOperationalWebRuntime(); return getObserverChannel(); }, requireAdmin: async () => ({ ok: false, response: new Response(null, { status: 403 }) }) });
export const POST = (request: Request) => handle(request, 'claim');
