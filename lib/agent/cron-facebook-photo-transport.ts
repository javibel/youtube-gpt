import { createHmac } from 'node:crypto';

type Input = Readonly<{ date: string; caption: string; imageUrl: string }>;
type Ack = Readonly<{ photoId: string; postId: string }>;
const unconfirmed = () => Error('social_publish_unconfirmed');

// Transport component only. The caller must separately own the live native
// publication purpose, source/image continuations, account/day admission and
// SQL completion ACK. Preparing a target or receiving this HTTP DTO grants none
// of those authorities. No active cron calls this component yet.
export function prepareCronFacebookPhotoTransport(context: {
  signal: AbortSignal; remaining: () => number; validate: () => Promise<void>;
}) {
  const page = process.env.META_PAGE_ID, token = process.env.META_PAGE_ACCESS_TOKEN;
  const version = process.env.FACEBOOK_GRAPH_API_VERSION, secret = process.env.META_APP_SECRET;
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  const store = blobToken?.match(/^vercel_blob_rw_([a-zA-Z0-9]+)_[a-zA-Z0-9]+$/)?.[1];
  if (!page || !/^\d{1,32}$/.test(page) || !token || token.length > 4096 || /[\x00-\x20\x7f]/.test(token)
    || !version || !/^v[1-9]\d{0,2}\.0$/.test(version) || !store
    || secret !== undefined && (!secret || secret.length > 4096 || /[\x00-\x20\x7f]/.test(secret))
    || !context || !(context.signal instanceof AbortSignal) || typeof context.remaining !== 'function' || typeof context.validate !== 'function') throw unconfirmed();
  const { signal, remaining, validate } = context;
  const check = () => {
    if (signal.aborted || process.env.META_PAGE_ID !== page || process.env.META_PAGE_ACCESS_TOKEN !== token
      || process.env.FACEBOOK_GRAPH_API_VERSION !== version || process.env.META_APP_SECRET !== secret
      || process.env.BLOB_READ_WRITE_TOKEN !== blobToken) throw unconfirmed();
    const time = remaining(); if (!Number.isFinite(time) || time < 1) throw unconfirmed(); return Math.floor(time);
  };
  check();
  let own: { input: Input; promise: Promise<Ack> } | undefined;
  const publish = (input: Input): Promise<Ack> => {
    if (own) return input?.date === own.input.date && input?.caption === own.input.caption && input?.imageUrl === own.input.imageUrl
      ? own.promise : Promise.reject(unconfirmed());
    // Copy the exact first request. Its promise, including failure/uncertainty,
    // remains latched; subsequent calls cannot substitute data or retry it.
    const snapshot = Object.freeze({ date: input?.date, caption: input?.caption, imageUrl: input?.imageUrl });
    const promise = Promise.resolve().then(async () => {
      check();
      if (typeof snapshot.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(snapshot.date)
        || new Date(snapshot.date + 'T00:00:00Z').toISOString().slice(0, 10) !== snapshot.date
        || typeof snapshot.caption !== 'string' || !snapshot.caption.trim() || snapshot.caption.length > 20000
        || typeof snapshot.imageUrl !== 'string') throw unconfirmed();
      const prefix = `https://${store.toLowerCase()}.public.blob.vercel-storage.com/social-cron/${snapshot.date}/`;
      if (!snapshot.imageUrl.startsWith(prefix) || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\.jpg$/.test(snapshot.imageUrl.slice(prefix.length))) throw unconfirmed();
      const budget = Math.min(30000, check()), controller = new AbortController();
      let retired = false, body: ReadableStream<Uint8Array> | null | undefined, reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      let rejectWait: (error: Error) => void = () => {};
      const interruption = new Promise<never>((_, reject) => { rejectWait = reject; }); void interruption.catch(() => {});
      const stop = () => { retired = true; controller.abort(); rejectWait(unconfirmed()); };
      signal.addEventListener('abort', stop, { once: true });
      if (signal.aborted) stop();
      const timer = setTimeout(stop, budget);
      const live = () => { check(); if (retired) throw unconfirmed(); };
      try {
        return await Promise.race([(async () => {
          await validate(); live();
          const response = await fetch(`https://graph.facebook.com/${version}/${page}/photos`, {
            method: 'POST', redirect: 'error', cache: 'no-store', signal: controller.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ caption: snapshot.caption, url: snapshot.imageUrl, access_token: token,
              ...(secret ? { appsecret_proof: createHmac('sha256', secret).update(token).digest('hex') } : {}) }),
          });
          body = response.body;
          if (retired) { void body?.cancel().catch(() => {}); throw unconfirmed(); }
          live();
          if (!response.ok || response.redirected || !body || response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw unconfirmed();
          const declared = response.headers.get('content-length'), limit = 64 * 1024;
          if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) < 1 || Number(declared) > limit)) throw unconfirmed();
          reader = body.getReader(); const parts: Buffer[] = []; let size = 0;
          for (;;) { const part = await reader.read(); live(); if (part.done) break; size += part.value.byteLength;
            if (size > limit) throw unconfirmed(); parts.push(Buffer.from(part.value)); }
          if (!size || declared !== null && Number(declared) !== size) throw unconfirmed();
          const ack: unknown = JSON.parse(Buffer.concat(parts, size).toString('utf8'));
          if (!ack || typeof ack !== 'object' || Object.keys(ack).sort().join(',') !== 'id,post_id'
            || !('id' in ack) || typeof ack.id !== 'string' || !/^\d{1,32}$/.test(ack.id)
            || !('post_id' in ack) || typeof ack.post_id !== 'string' || !new RegExp('^' + page + '_\\d{1,32}$').test(ack.post_id)) throw unconfirmed();
          await validate(); live();
          return Object.freeze({ photoId: ack.id, postId: ack.post_id });
        })(), interruption]);
      } finally {
        clearTimeout(timer); signal.removeEventListener('abort', stop); controller.abort();
        void (reader ? reader.cancel() : body?.cancel())?.catch(() => {});
      }
    }).catch(() => { throw unconfirmed(); });
    own = { input: snapshot, promise }; return promise;
  };
  // This target is trusted configuration data,not an admission or remote permission.
  return Object.freeze({ accountId: page, check, publish });
}
