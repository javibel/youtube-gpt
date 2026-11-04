import { requireAdmin } from '@/lib/auth-guards';
import { createObserverHttpHandlers } from '@/lib/ai/observer-channel-http.cjs';
import { getObserverChannel } from '@/lib/ai/observer-channel-runtime.cjs';
export const runtime = 'nodejs';
const handle = createObserverHttpHandlers({ getService: getObserverChannel, requireAdmin });
export const GET = (request: Request) => handle(request, 'admin');
export const POST = (request: Request) => handle(request, 'admin');
