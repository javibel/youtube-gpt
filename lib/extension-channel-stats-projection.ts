type Row = Record<string, unknown>;
const day = 86_400_000;
function row(value: unknown): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Channel statistics unconfirmed');
  return value as Row;
}
function count(value: unknown, kind: 'text' | 'integer' | 'bigint'): number {
  if (kind === 'text' && (typeof value !== 'string' || !/^\d{1,16}$/.test(value))) throw Error('Channel statistics unconfirmed');
  if ((kind === 'integer' && typeof value !== 'number') || (kind === 'bigint' && typeof value !== 'bigint')) throw Error('Channel statistics unconfirmed');
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw Error('Channel statistics unconfirmed');
  return number;
}
function timestamp(value: unknown, asOf: number): number {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()) || value.getTime() < 0 || value.getTime() > asOf) throw Error('Channel statistics unconfirmed');
  return value.getTime();
}
export function projectExtensionChannelStats(channelRow: unknown, snapshotRows: unknown, ownerId: string, asOf: number) {
  const channel = row(channelRow);
  if (channel.userId !== ownerId || typeof channel.channelId !== 'string' || !/^UC[A-Za-z0-9_-]{22}$/.test(channel.channelId)
    || !(channel.channelName === null || typeof channel.channelName === 'string' && channel.channelName.length <= 512)
    || !(channel.channelThumb === null || typeof channel.channelThumb === 'string' && channel.channelThumb.length <= 2048)
    || !Number.isSafeInteger(asOf) || !Array.isArray(snapshotRows) || snapshotRows.length > 30) throw Error('Channel statistics unconfirmed');
  const cachedAt = timestamp(channel.updatedAt, asOf);
  const subs = count(channel.subscribers, 'text'), views = count(channel.totalViews, 'text'), videos = count(channel.videoCount, 'text');
  if (channel.channelThumb) {
    const url = new URL(channel.channelThumb as string);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !['yt3.ggpht.com','yt3.googleusercontent.com','lh3.googleusercontent.com','i.ytimg.com'].includes(url.hostname)) throw Error('Channel statistics unconfirmed');
  }
  let previous = Infinity;
  const snapshots = snapshotRows.map(value => {
    const s = row(value), at = timestamp(s.recordedAt, asOf);
    if (s.userId !== ownerId || at > previous) throw Error('Channel statistics unconfirmed');
    previous = at;
    return { subs: count(s.subscribers, 'integer'), views: count(s.totalViews, 'bigint'), videos: count(s.videoCount, 'integer'), at };
  });
  const latest = snapshots[0], subsNow = latest?.subs ?? subs, viewsNow = latest?.views ?? views;
  // These are intervals in the retained history, not proof that the channel is
  // current. Declared capture dates are preserved and never renewed here.
  const baseline = (min: number, max: number) => latest && snapshots.find(s => latest.at - s.at >= min * day && latest.at - s.at <= max * day);
  const week = baseline(6,8), month = baseline(27,33);
  const growth7d = week ? subsNow - week.subs : 0, growth30d = month ? subsNow - month.subs : 0;
  const monthDays = month && latest ? (latest.at - month.at) / day : null;
  const subsPct = Math.min(100, Math.round(subsNow / 1000 * 100));
  // Preserved view-based heuristic. Lifetime views cannot establish measured
  // watch time, an eligibility period or acceptance for monetization.
  const estWatchHours = Math.round(viewsNow * 0.067), watchPct = Math.min(100, Math.round(estWatchHours / 4000 * 100));
  const subsEtaDays = subsNow < 1000 && growth30d > 0 && monthDays !== null ? Math.ceil((1000 - subsNow) * monthDays / growth30d) : null;
  return {
    channel: { name: channel.channelName || '', thumb: channel.channelThumb || '', subs: subsNow, totalViews: viewsNow, videoCount: videos },
    growth: { subs7d: growth7d, subs30d: growth30d, views7d: week ? viewsNow - week.views : 0, views30d: month ? viewsNow - month.views : 0 },
    monetization: { subsPct, watchPct, subsEtaDays, estWatchHours },
    sparkline: snapshots.map(s => ({subs:s.subs,views:s.views,date:new Date(s.at).toISOString().slice(0,10)})).reverse(),
    dataQuality: { source:'cached-channel-history', freshness:'unconfirmed', cachedAt:new Date(cachedAt).toISOString(),
      metricsAsOf:new Date(latest?.at ?? cachedAt).toISOString(), growth7dAvailable:!!week, growth30dAvailable:!!month,
      rateIntervalDays:monthDays, watchHours:'view-based-estimate', eligibility:'not-assessed' },
  };
}
