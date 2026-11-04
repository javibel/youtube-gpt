import { createObserverHttpHandlers } from '@/lib/ai/observer-channel-http.cjs';
import { getObserverChannel } from '@/lib/ai/observer-channel-runtime.cjs';
export const runtime = 'nodejs';
const handle = createObserverHttpHandlers({ getService: getObserverChannel, requireAdmin: async () => ({ ok: false, response: new Response(null, { status: 403 }) }) });
export const POST = (request: Request) => handle(request, 'result');
