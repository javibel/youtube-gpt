import { WebhookInputError } from '@/lib/stripe-webhook-contract';
const BODY_LIMIT = 256 * 1024;
export class WebhookWaitRetired extends Error {}
export function webhookWait(signal: AbortSignal, duration = 55000) {
  const until = performance.now() + duration;
  let retired = false;
  let reject!: (error: Error) => void;
  const stopped = new Promise<never>((_, fail) => { reject = fail; });
  // The request may already be aborted before the first dependency starts.
  void stopped.catch(() => {});
  const retire = () => { if (!retired) { retired = true; reject(new WebhookWaitRetired()); } };
  const timer = setTimeout(retire, duration);
  signal.addEventListener('abort', retire, { once: true });
  if (signal.aborted) retire();
  const check = () => {
    if (retired || signal.aborted || performance.now() >= until) { retire(); throw new WebhookWaitRetired(); }
  };
  return {
    check,
    async run<T>(work: () => T | PromiseLike<T>): Promise<T> {
      check();
      const result = await Promise.race([Promise.resolve(work()), stopped]);
      check();
      return result;
    },
    close() { clearTimeout(timer); signal.removeEventListener('abort', retire); },
  };
}
export type WebhookWait = ReturnType<typeof webhookWait>;
export async function readWebhookBody(request: Request, wait: WebhookWait): Promise<string> {
  wait.check();
  const reader = request.body?.getReader();
  if (!reader) throw new WebhookInputError(400, 'Cuerpo vacío');
  let complete = false;
  try {
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const part = await wait.run(() => reader.read());
      if (part.done) { complete = true; break; }
      if (!(part.value instanceof Uint8Array)) throw new WebhookInputError(400, 'Cuerpo inválido');
      length += part.value.byteLength;
      if (length > BODY_LIMIT) throw new WebhookInputError(413, 'Cuerpo demasiado grande');
      chunks.push(new Uint8Array(part.value));
    }
    if (!length) throw new WebhookInputError(400, 'Cuerpo vacío');
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { wait.check(); bytes.set(chunk, offset); offset += chunk.length; }
    let body: string;
    try { body = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
    catch { throw new WebhookInputError(400, 'Cuerpo inválido'); }
    wait.check();
    return body;
  } finally {
    if (!complete) { try { void reader.cancel().catch(() => {}); } catch {} }
    try { reader.releaseLock(); } catch {}
  }
}
