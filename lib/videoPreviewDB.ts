const DB_NAME = 'ytubviral_previews';
const STORE = 'scopedPreviews';
const VERSION = 2;
const WAIT_MS = 30_000;

export interface PreviewScope { userId: string; email: string }
export interface StoredPreview {
  id: string;
  blob: Blob;
  title: string;
  format: string;
  createdAt: string;
}
type ScopedPreview = StoredPreview & { scope: string };

// Partition selection only: these browser records cannot authorize a server
// upload, prove a saved account result, or establish operational provenance.
function scopeKey(owner: PreviewScope): string {
  if (!owner || typeof owner.userId !== 'string' || !owner.userId.trim()
    || owner.userId !== owner.userId.trim() || owner.userId.length > 256
    || typeof owner.email !== 'string' || !owner.email.trim()
    || owner.email !== owner.email.trim() || owner.email.length > 320) throw new Error('Preview cache scope unavailable');
  return JSON.stringify([owner.userId, owner.email]);
}
function validPreview(value: StoredPreview): boolean {
  return !!value && typeof value.id === 'string' && !!value.id.trim() && value.id.length <= 256
    && typeof value.title === 'string' && !!value.title.trim() && value.title.length <= 512
    && typeof value.format === 'string' && !!value.format.trim() && value.format.length <= 32
    && typeof value.createdAt === 'string' && value.createdAt.length <= 64
    && Number.isFinite(Date.parse(value.createdAt))
    && value.blob instanceof Blob && value.blob.size >= 2000 && value.blob.size <= 8 * 1024 * 1024
    && value.blob.type.length <= 256 && /^video\/[a-z0-9.+-]{1,64}$/i.test(value.blob.type.split(';')[0]);
}
function openDB(deadline: number, signal?: AbortSignal): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('Preview cache wait ended')); return; }
    let settled = false;
    let request: IDBOpenDBRequest;
    const finish = (error?: Error, db?: IDBDatabase) => {
      if (settled) { db?.close(); return; }
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (error) { db?.close(); reject(error); } else resolve(db!);
    };
    const abort = () => finish(new Error('Preview cache wait ended'));
    const timer = setTimeout(abort, Math.max(0, deadline - Date.now()));
    signal?.addEventListener('abort', abort, { once: true });
    try {
      request = indexedDB.open(DB_NAME, VERSION);
      request.onupgradeneeded = () => {
        if (settled) { try { request.transaction?.abort(); } catch {} return; }
        try {
          const db = request.result;
          // Legacy unowned records are preserved, never attributed to a login.
          if (!db.objectStoreNames.contains(STORE)) {
            db.createObjectStore(STORE, { keyPath: ['scope', 'id'] }).createIndex('scope', 'scope');
          }
        } catch { try { request.transaction?.abort(); } catch {} finish(new Error('Preview cache upgrade unavailable')); }
      };
      request.onblocked = () => finish(new Error('Preview cache upgrade blocked'));
      request.onerror = () => finish(new Error('Preview cache open unavailable'));
      request.onsuccess = () => finish(undefined, request.result);
    } catch { finish(new Error('Preview cache open unavailable')); }
  });
}
async function operation<T>(owner: PreviewScope, mode: IDBTransactionMode,
  make: (store: IDBObjectStore, scope: string) => IDBRequest,
  readResult: (value: unknown, scope: string) => T, signal?: AbortSignal): Promise<T> {
  const scope = scopeKey(owner), deadline = Date.now() + WAIT_MS;
  const db = await openDB(deadline, signal);
  return new Promise((resolve, reject) => {
    let settled = false, tx: IDBTransaction | null = null, result: T;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (error) { try { tx?.abort(); } catch {} }
      db.close();
      if (error) reject(error); else resolve(result);
    };
    const abort = () => finish(new Error('Preview cache wait ended'));
    const timer = setTimeout(abort, Math.max(0, deadline - Date.now()));
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted || Date.now() >= deadline) { abort(); return; }
    try {
      tx = db.transaction(STORE, mode);
      const req = make(tx.objectStore(STORE), scope);
      req.onsuccess = () => {
        if (settled) return;
        try { result = readResult(req.result, scope); } catch { finish(new Error('Preview cache record unavailable')); }
      };
      req.onerror = () => finish(new Error('Preview cache request unavailable'));
      tx.oncomplete = () => finish();
      tx.onerror = () => finish(new Error('Preview cache transaction unavailable'));
      tx.onabort = () => finish(new Error('Preview cache transaction aborted'));
      db.onversionchange = () => finish(new Error('Preview cache version changed'));
    } catch { finish(new Error('Preview cache transaction unavailable')); }
  });
}
export async function savePreview(preview: StoredPreview, owner: PreviewScope, signal?: AbortSignal): Promise<void> {
  scopeKey(owner);
  if (!validPreview(preview)) throw new Error('Preview cache input unavailable');
  await operation(owner, 'readwrite', (store, scope) => store.put({
    scope, id: preview.id, blob: preview.blob, title: preview.title, format: preview.format, createdAt: preview.createdAt,
  }), () => undefined, signal);
}
export async function loadPreviews(owner: PreviewScope, signal?: AbortSignal): Promise<StoredPreview[]> {
  return operation(owner, 'readonly', (store, scope) => store.index('scope').getAll(scope), (value, scope) => {
    if (!Array.isArray(value)) throw new Error('Invalid cache listing');
    const ids = new Set<string>();
    return value.map((row: ScopedPreview) => {
      if (row?.scope !== scope || !validPreview(row) || ids.has(row.id)
        || Object.keys(row).sort().join(',') !== 'blob,createdAt,format,id,scope,title') throw new Error('Invalid cache row');
      ids.add(row.id);
      return { id: row.id, blob: row.blob, title: row.title, format: row.format, createdAt: row.createdAt };
    }).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, signal);
}
export async function deletePreview(id: string, owner: PreviewScope, signal?: AbortSignal): Promise<void> {
  scopeKey(owner);
  if (typeof id !== 'string' || !id.trim() || id.length > 256) throw new Error('Preview cache identity unavailable');
  await operation(owner, 'readwrite', (store, scope) => store.delete([scope, id]), () => undefined, signal);
}
