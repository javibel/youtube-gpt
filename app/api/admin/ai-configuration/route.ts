import { requireAdmin } from '@/lib/auth-guards';
import { getConfigurationService } from '@/lib/ai/configuration-runtime';

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const invalid = () => json({ error: 'Solicitud de configuración no válida' }, 400);
const unconfirmed = () => json({ error: 'No se pudo confirmar la activación. Consulta el estado antes de intentarlo de nuevo.', state: 'uncertain' }, 503);

class ConfigurationWaitError extends Error {}

// One monotonic deadline covers authorization, body and service. Retiring this
// HTTP waiter does not cancel an original service operation or confirm its writes.
function createWait(signal?: AbortSignal) {
  const deadline = performance.now() + 30000;
  let stopped = false, reject!: (error: Error) => void;
  const retired = new Promise<never>((_, fail) => { reject = fail; });
  void retired.catch(() => {});
  const stop = () => { if (!stopped) { stopped = true; reject(new ConfigurationWaitError()); } };
  const check = () => {
    if (stopped || signal?.aborted || performance.now() >= deadline) { stop(); throw new ConfigurationWaitError(); }
  };
  const timer = setTimeout(stop, 30000);
  signal?.addEventListener('abort', stop, { once: true });
  return {
    async run<T>(operation: () => Promise<T>): Promise<T> {
      check();
      const result = await Promise.race([Promise.resolve().then(() => { check(); return operation(); }), retired]);
      check();
      return result;
    },
    close() { clearTimeout(timer); signal?.removeEventListener('abort', stop); },
  };
}

export async function GET(request: Request) {
  const wait = createWait(request?.signal);
  try {
    const gate = await wait.run(() => requireAdmin());
    if (!gate.ok) return gate.response;
    const service = getConfigurationService();
    if (!service) return json({ error: 'El control de configuración todavía no está disponible' }, 503);
    return json({ configuration: await wait.run(() => service.current()) });
  }
  catch { return json({ error: 'No se pudo consultar la configuración' }, 503); }
  finally { wait.close(); }
}

async function readCommand(request: Request, wait: ReturnType<typeof createWait>): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing body');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0, text = '', exhausted = false;
  try {
    while (true) {
      const chunk = await wait.run(() => reader.read());
      if (chunk.done) { exhausted = true; break; }
      size += chunk.value.byteLength;
      if (size > 65536) throw new Error('Body exceeds limit');
      text += decoder.decode(chunk.value, { stream: true });
    }
    const body: unknown = JSON.parse(text + decoder.decode());
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid body');
    return body as Record<string, unknown>;
  } finally {
    // A blocked cancel promise must not extend the original HTTP deadline.
    if (!exhausted) { try { void reader.cancel().catch(() => {}); } catch {} }
    try { reader.releaseLock(); } catch {}
  }
}

export async function POST(request: Request) {
  const wait = createWait(request.signal);
  let activationStarted = false;
  try {
    const gate = await wait.run(() => requireAdmin());
    if (!gate.ok) return gate.response;
    const expected = new URL(request.url);
    // NextURL canonicalizes 127.0.0.1 to localhost; retain the actual loopback Host.
    if (expected.hostname === 'localhost' && request.headers.get('host') === `127.0.0.1${expected.port ? ':' + expected.port : ''}`) expected.hostname = '127.0.0.1';
    if (request.headers.get('origin') !== expected.origin || request.headers.get('sec-fetch-site') === 'cross-site') {
      return json({ error: 'Origen no autorizado' }, 403);
    }
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return invalid();
    let command: Record<string, unknown>;
    try { command = await readCommand(request, wait); } catch (error) { if (error instanceof ConfigurationWaitError) throw error; return invalid(); }
    const allowed: Record<string, string[]> = {
      validate: ['action', 'configuration'], preview: ['action', 'configuration', 'reason'],
      rollback: ['action', 'revision', 'reason'], activate: ['action', 'previewId'],
    };
    if (typeof command.action !== 'string' || !Object.hasOwn(allowed, command.action) || Object.keys(command).some(key => !allowed[command.action as string].includes(key))) return invalid();
    if (['preview', 'rollback'].includes(command.action) && (typeof command.reason !== 'string' || !command.reason.trim() || command.reason.length > 1000)) return invalid();
    if (command.action === 'activate' && (typeof command.previewId !== 'string' || !command.previewId || command.previewId.length > 128)) return invalid();
    if (command.action === 'rollback' && (typeof command.revision !== 'string' || !command.revision || command.revision.length > 128)) return invalid();
    if (['validate', 'preview'].includes(command.action) && (!command.configuration || typeof command.configuration !== 'object' || Array.isArray(command.configuration))) return invalid();
    const service = getConfigurationService();
    if (!service) return json({ error: 'El control de configuración todavía no está disponible' }, 503);
    try {
      let result: unknown;
      switch (command.action) {
        case 'validate': result = await wait.run(() => service.validate(command.configuration)); break;
        case 'preview': result = await wait.run(() => service.preview(command.configuration, { reason: command.reason as string })); break;
        case 'rollback': result = await wait.run(() => service.previewRollback(command.revision as string, { reason: command.reason as string })); break;
        case 'activate': result = await wait.run(() => { activationStarted = true; return service.activate(command.previewId as string); }); break;
      }
      return json(result);
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
      const status = code === 'permissions' ? 403 : code === 'invalid_format' ? 400 : ['configuration', 'capability', 'credentials'].includes(String(code)) ? 409 : 503;
      if (status === 503 && activationStarted) return unconfirmed();
      return json({ error: status === 409 ? 'La configuración necesita una nueva validación o previsualización' : 'No se pudo completar la operación de configuración' }, status);
    }
  } catch { return activationStarted ? unconfirmed() : json({ error: 'No se pudo completar la operación de configuración' }, 503); }
  finally { wait.close(); }
}
