export const selectionId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{11}$/.test(v);
export const selectionChannel = (v: unknown): v is string => typeof v === 'string' && /^UC[A-Za-z0-9_-]{22}$/.test(v);
export function selectionObject(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('ab_selection_unconfirmed');
  return v as Record<string, unknown>;
}
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v,k));
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const iso = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v)) && Date.parse(v) >= 0 && new Date(v).toISOString() === v;
const title = (v: unknown): v is string => typeof v === 'string' && !!v.trim() && v.length <= 100 && !/[\x00-\x1f\x7f]/.test(v) && v.isWellFormed();
export type AbSelectionVideo = {videoId:string;channelId:string;title:string;thumbnail:string;publishedAt:string;views:number|null;likes:number|null};
export type AbSelection = {connected:boolean;channelId:string|null;videos:AbSelectionVideo[];selectedVideoIds:string[];unavailableVideoIds:string[];hasMore:boolean};
function thumbnail(v: unknown, id: string): v is string {
  if (v === '') return true;
  if (typeof v !== 'string' || v.length > 2048) return false;
  const u = new URL(v);
  return u.protocol === 'https:' && u.hostname === 'i.ytimg.com' && !u.username && !u.password && !u.port && !u.search && !u.hash && u.pathname.startsWith('/vi/'+id+'/');
}
export function abSelectionVideo(value: unknown, channelId: string, at: number): AbSelectionVideo {
  const v = selectionObject(value);
  if (!exact(v,['videoId','channelId','title','thumbnail','publishedAt','views','likes']) || !selectionId(v.videoId) || v.channelId !== channelId
    || !title(v.title) || !thumbnail(v.thumbnail,v.videoId) || !iso(v.publishedAt) || Date.parse(v.publishedAt) > at
    || v.views !== null && !count(v.views) || v.likes !== null && !count(v.likes)) throw Error('ab_selection_unconfirmed');
  return v as AbSelectionVideo;
}
export function abSelection(value: unknown, at: number): AbSelection {
  const v = selectionObject(value);
  if (!exact(v,['connected','channelId','videos','selectedVideoIds','unavailableVideoIds','hasMore']) || typeof v.connected !== 'boolean'
    || typeof v.hasMore !== 'boolean' || !Array.isArray(v.selectedVideoIds) || v.selectedVideoIds.length > 20 || !v.selectedVideoIds.every(selectionId)
    || new Set(v.selectedVideoIds).size !== v.selectedVideoIds.length || !Array.isArray(v.unavailableVideoIds)
    || !v.unavailableVideoIds.every(selectionId) || new Set(v.unavailableVideoIds).size !== v.unavailableVideoIds.length
    || v.unavailableVideoIds.some(id => !(v.selectedVideoIds as string[]).includes(id)) || !Array.isArray(v.videos)
    || (v.connected ? !selectionChannel(v.channelId) : v.channelId !== null)) throw Error('ab_selection_unconfirmed');
  const expected = (v.selectedVideoIds as string[]).filter(id => !(v.unavailableVideoIds as string[]).includes(id));
  if (v.videos.length !== expected.length || !v.connected && (expected.length || v.selectedVideoIds.length || v.hasMore)) throw Error('ab_selection_unconfirmed');
  v.videos.forEach((row,i) => { if (abSelectionVideo(row,v.channelId as string,at).videoId !== expected[i]) throw Error('ab_selection_unconfirmed'); });
  return v as AbSelection;
}
export function abSelectionSource(value: unknown, channelId: string, at: number): AbSelectionVideo {
  const v = selectionObject(value), s = selectionObject(v.snippet), stats = v.statistics === undefined ? {} : selectionObject(v.statistics);
  if (v.kind !== 'youtube#video' || !selectionId(v.id) || s.channelId !== channelId) throw Error('ab_selection_unconfirmed');
  const metric = (v: unknown) => {
    if (v === undefined) return null;
    if (typeof v !== 'string' || !/^(0|[1-9][0-9]*)$/.test(v) || !count(Number(v))) throw Error('ab_selection_unconfirmed');
    return Number(v);
  };
  let image = '';
  if (s.thumbnails !== undefined) { const images = selectionObject(s.thumbnails); for (const size of ['high','medium','default']) if (images[size] !== undefined) { image = selectionObject(images[size]).url as string; break; } }
  return abSelectionVideo({videoId:v.id,channelId,title:s.title,thumbnail:image,publishedAt:s.publishedAt,views:metric(stats.viewCount),likes:metric(stats.likeCount)},channelId,at);
}
