import { prisma } from '@/lib/prisma';
import { runCronBrandImageRead, type NativeCronBrandImageRead } from '@/lib/cron-dispatch-original';

declare const cachedBrandImageRead: unique symbol;
export type CachedBrandImageRead = { readonly [cachedBrandImageRead]: true };
type Row = { date: string; url: string; source: string; stamp: string };
const reads = new WeakMap<object, { row: Readonly<Row>; validate: () => Promise<void>; use?: Promise<unknown> }>();
const outcomes = new WeakMap<object, CachedBrandImageRead | null>();
function outcome(value: CachedBrandImageRead | null) {
  const receipt = Object.freeze({}); outcomes.set(receipt, value); return receipt;
}
const select = 'SELECT image_date::text AS date,url,source,created_at::text AS stamp FROM daily_brand_image WHERE image_date=$1::date';

// The new native purpose authorizes only an ordinary read. SQL fields, source
// markers and URL shape are untrusted resource data / vetoes, never evidence of
// the old producer's ACK, provenance, consent, freshness or completed accounting.
// No generation/upload promise or claim is looked up, resumed or released here.
export function readCachedBrandImage(original?: NativeCronBrandImageRead): Promise<CachedBrandImageRead | null> {
  return runCronBrandImageRead(original, async ({ date, checkBeforeRead: check }) => {
    check();
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    const store = token?.match(/^vercel_blob_rw_([a-zA-Z0-9]+)_[a-zA-Z0-9]+$/)?.[1];
    if (!token || !store) throw Error('daily_brand_image_read_unconfirmed');
    const config = () => { check(); if (process.env.BLOB_READ_WRITE_TOKEN !== token) throw Error('daily_brand_image_read_unconfirmed'); };
    const rows = await prisma.$queryRawUnsafe<Row[]>(select, date); config();
    if (!Array.isArray(rows) || rows.length > 1) throw Error('daily_brand_image_read_unconfirmed');
    if (!rows.length) return outcome(null);
    const row = rows[0], id = typeof row?.source === 'string' && row.source.match(/^cron-native-v1:([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})$/)?.[1];
    if (!row || Object.keys(row).sort().join(',') !== 'date,source,stamp,url' || row.date !== date || !id
      || row.url !== `https://${store.toLowerCase()}.public.blob.vercel-storage.com/social-cron/${date}/${id}.jpg`
      || typeof row.stamp !== 'string' || !row.stamp) throw Error('daily_brand_image_read_unconfirmed');
    const snapshot = Object.freeze({ ...row });
    const validate = async () => {
      config(); const current = await prisma.$queryRawUnsafe<Row[]>(select, date); config();
      if (!Array.isArray(current) || current.length !== 1 || !current[0]
        || Object.keys(current[0]).sort().join(',') !== 'date,source,stamp,url'
        || (['date', 'url', 'source', 'stamp'] as const).some(k => current[0][k] !== snapshot[k])) throw Error('daily_brand_image_read_unconfirmed');
    };
    const cap = Object.freeze({}) as CachedBrandImageRead;
    reads.set(cap, { row: snapshot, validate }); return outcome(cap);
  }).then(receipt => {
    // A prior unrelated callback on the public native runner cannot counterfeit
    // either this reader's resource receipt or its acknowledged cache miss.
    if (!receipt || typeof receipt !== 'object' || !outcomes.has(receipt)) throw Error('daily_brand_image_read_unconfirmed');
    return outcomes.get(receipt)!;
  });
}

// Distinct from consumeCronBrandImageCache: this never acknowledges a producer.
// A consumer needs its own authority for any effect; this callback supplies data.
export function consumeCachedBrandImageRead<T>(receipt: CachedBrandImageRead | undefined,
  run: (resource: Readonly<{ date: string; url: string; source: string; producerAcknowledged: false }>) => Promise<T>): Promise<T> {
  const own = receipt && reads.get(receipt);
  if (!own) return Promise.reject(Error('daily_brand_image_read_unconfirmed'));
  return (own.use ??= Promise.resolve().then(async () => {
    await own.validate();
    const result = await run(Object.freeze({ date: own.row.date, url: own.row.url, source: own.row.source, producerAcknowledged: false as const }));
    await own.validate(); return result;
  })) as Promise<T>;
}
