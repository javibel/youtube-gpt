const DB_NAME = 'ytubviral_previews';
const STORE   = 'previews';
const VERSION = 1;

export interface StoredPreview {
  id: string;           // generationId
  blob: Blob;
  title: string;        // gen.inputs?.tema or section title
  format: string;       // 'tiktok' | 'youtube' | 'square'
  createdAt: string;    // ISO
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror  = () => reject(req.error);
  });
}

export async function savePreview(preview: StoredPreview): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(preview);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

export async function loadPreviews(): Promise<StoredPreview[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result ?? []).sort(
      (a: StoredPreview, b: StoredPreview) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    ));
    req.onerror = () => reject(req.error);
  });
}

export async function deletePreview(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}
