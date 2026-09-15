import { requireAdmin } from '@/lib/auth-guards';
import { getConfigurationService } from '@/lib/ai/configuration-runtime';

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const invalid = () => json({ error: 'Solicitud de configuración no válida' }, 400);

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  const service = getConfigurationService();
  if (!service) return json({ error: 'El control de configuración todavía no está disponible' }, 503);
  try { return json({ configuration: await service.current() }); }
  catch { return json({ error: 'No se pudo consultar la configuración' }, 503); }
}

async function readCommand(request: Request): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing body');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0, text = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 65536) { await reader.cancel(); throw new Error('Body exceeds limit'); }
      text += decoder.decode(chunk.value, { stream: true });
    }
    const body: unknown = JSON.parse(text + decoder.decode());
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid body');
    return body as Record<string, unknown>;
  } finally { reader.releaseLock(); }
}

export async function POST(request: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  const expected = new URL(request.url);
  // NextURL canonicalizes 127.0.0.1 to localhost; retain the actual loopback Host.
  if (expected.hostname === 'localhost' && request.headers.get('host') === `127.0.0.1${expected.port ? ':' + expected.port : ''}`) expected.hostname = '127.0.0.1';
  if (request.headers.get('origin') !== expected.origin || request.headers.get('sec-fetch-site') === 'cross-site') {
    return json({ error: 'Origen no autorizado' }, 403);
  }
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return invalid();
  let command: Record<string, unknown>;
  try { command = await readCommand(request); } catch { return invalid(); }
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
      case 'validate': result = await service.validate(command.configuration); break;
      case 'preview': result = await service.preview(command.configuration, { reason: command.reason as string }); break;
      case 'rollback': result = await service.previewRollback(command.revision as string, { reason: command.reason as string }); break;
      case 'activate': result = await service.activate(command.previewId as string); break;
    }
    return json(result);
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
    const status = code === 'permissions' ? 403 : code === 'invalid_format' ? 400 : ['configuration', 'capability', 'credentials'].includes(String(code)) ? 409 : 503;
    return json({ error: status === 409 ? 'La configuración necesita una nueva validación o previsualización' : 'No se pudo completar la operación de configuración' }, status);
  }
}
