// A local immutable projection is shape validation, never authorization or delivery ownership.
export class WebhookInputError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
export function captureWebhookEvent(input: unknown, check: () => void) {
  let nodes = 0;
  let characters = 0;
  const ancestors = new Set<object>();
  function copy(value: unknown, depth: number): any {
    check();
    if (++nodes > 12000 || depth > 32) throw new WebhookInputError(400, 'Evento demasiado complejo');
    if (typeof value === 'string') { characters += value.length; if (characters > 256 * 1024) throw new WebhookInputError(400, 'Evento demasiado grande'); return value; }
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'object' || !value || ancestors.has(value)) throw new WebhookInputError(400, 'Evento inválido');
    const prototype = Object.getPrototypeOf(value);
    const constructor = prototype && Object.getOwnPropertyDescriptor(prototype, 'constructor');
    if (!Array.isArray(value) && prototype !== null &&
        (Object.getPrototypeOf(prototype) !== null || !constructor || !Object.hasOwn(constructor, 'value') || typeof constructor.value !== 'function' || constructor.value.name !== 'Object')) throw new WebhookInputError(400, 'Evento inválido');
    ancestors.add(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Array.isArray(value) && (value.length > 12000 || Reflect.ownKeys(descriptors).length !== value.length + 1)) throw new WebhookInputError(400, 'Evento inválido');
    const target: any = Array.isArray(value) ? [] : Object.create(null);
    for (const key of Reflect.ownKeys(descriptors)) {
      if (typeof key !== 'string') throw new WebhookInputError(400, 'Evento inválido');
      if (Array.isArray(value) && key === 'length') continue;
      characters += key.length;
      if (characters > 256 * 1024) throw new WebhookInputError(400, 'Evento demasiado grande');
      if (Array.isArray(value) && !/^(0|[1-9][0-9]*)$/.test(key)) throw new WebhookInputError(400, 'Evento inválido');
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw new WebhookInputError(400, 'Evento inválido');
      Object.defineProperty(target, key, { value: copy(descriptor.value, depth + 1), enumerable: true });
    }
    ancestors.delete(value);
    return Object.freeze(target);
  }
  const event = copy(input, 0);
  const record = (v: any) => v && typeof v === 'object' && !Array.isArray(v);
  if (!record(event) || event.object !== 'event' ||
      !validStripeId(event.id, 'evt') ||
      typeof event.type !== 'string' || event.type.length > 128 ||
      !/^[a-z_]+(?:\.[a-z_]+)+$/.test(event.type) ||
      !Number.isSafeInteger(event.created) || event.created < 0 || event.created > 253402300799 ||
      typeof event.livemode !== 'boolean' ||
      !(event.api_version === null || (typeof event.api_version === 'string' && event.api_version.length > 0 && event.api_version.length <= 128)) ||
      !record(event.data) || !record(event.data.object)) throw new WebhookInputError(400, 'Evento inválido');
  check();
  // Retain the declared timestamp; it is not a freshness, ordering or recovery credential.
  return event;
}
function validStripeId(value: unknown, prefix: string): value is string {
  return typeof value === 'string' && value.length <= 128 && new RegExp('^' + prefix + '_[A-Za-z0-9_]+$').test(value);
}
function reference(value: any, prefix: string, object: string): string {
  const id = typeof value === 'string' ? value :
    value && typeof value === 'object' && !Array.isArray(value) && value.object === object && value.deleted !== true ? value.id : null;
  if (!validStripeId(id, prefix)) throw new WebhookInputError(400, 'Referencia de checkout inválida');
  return id;
}
export function checkoutEventProjection(event: any) {
  if (event.type !== 'checkout.session.completed') return null;
  const session = event.data.object;
  if (session.object !== 'checkout.session' || !validStripeId(session.id, 'cs') ||
      !['subscription', 'payment', 'setup'].includes(session.mode) ||
      !['paid', 'unpaid', 'no_payment_required'].includes(session.payment_status)) throw new WebhookInputError(400, 'Checkout inválido');
  if (session.mode !== 'subscription') return null;
  const userId = session.metadata?.userId;
  if (typeof userId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(userId)) throw new WebhookInputError(400, 'Usuario de checkout inválido');
  return Object.freeze({ sessionId: session.id, userId,
    customerId: reference(session.customer, 'cus', 'customer'),
    subscriptionId: reference(session.subscription, 'sub', 'subscription'),
    paymentStatus: session.payment_status });
}
