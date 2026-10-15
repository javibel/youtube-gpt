export type RetentionLanguage = 'es' | 'en';
export type RetentionInput = Readonly<{ lang: RetentionLanguage; videoId?: string }>;
export type RetentionDrop = { time: number; drop: number; retentionBefore: number; retentionAfter: number };
export type RetentionVideo = { videoId: string; title: string; views: number; duration: number; retention: number[];
  avgRetention: number; hookScore: number | null; hookWindowSeconds: number; dropOffPoints: RetentionDrop[] };
export type RetentionResult = { videos: RetentionVideo[]; aiTips: string[];
  dropOffReasons: Record<string, { timestamp: string; reason: string }[]>; tipsStatus: 'available' | 'unavailable';
  retentionAnalysis: { commandRef: string; userId: string; email: string; sessionRef: string; lang: RetentionLanguage;
    channelId: string; requestedStartDate: string; requestedEndDate: string; coverage: 'not-reported'; asOf: number; expiresAt: number } };
export const retentionVideoId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{11}$/.test(v);
export const retentionChannelId = (v: unknown): v is string => typeof v === 'string' && /^UC[A-Za-z0-9_-]{22}$/.test(v);
export const retentionCommand = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
export function retentionObject(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('retention_unconfirmed');
  return v as Record<string, unknown>;
}
export function retentionInput(v: unknown): RetentionInput {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('invalid_input');
  const body = retentionObject(v);
  if (Object.keys(body).some(k => !['lang', 'videoId'].includes(k)) || !['es', 'en'].includes(body.lang as string)
    || Object.hasOwn(body, 'videoId') && !retentionVideoId(body.videoId)) throw Error('invalid_input');
  return Object.freeze({ lang: body.lang as RetentionLanguage, ...(body.videoId ? { videoId: body.videoId as string } : {}) });
}
export const retentionTime = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
const percent = (v: number) => Math.round(v * 100);
export function retentionMetrics(video: Pick<RetentionVideo, 'videoId' | 'title' | 'views' | 'duration'>, value: unknown): RetentionVideo {
  const table = retentionObject(value), columns = table.columnHeaders;
  if (table.kind !== 'youtubeAnalytics#resultTable' || !Array.isArray(columns) || columns.length !== 2
    || columns.some((column, i) => {
      const c = retentionObject(column);
      return c.name !== ['elapsedVideoTimeRatio', 'audienceWatchRatio'][i] || c.columnType !== ['DIMENSION', 'METRIC'][i] || c.dataType !== 'FLOAT';
    }) || !Array.isArray(table.rows) || table.rows.length !== 100) throw Error('no_retention_data');
  const ratios = table.rows.map((row, i) => {
    if (!Array.isArray(row) || row.length !== 2 || typeof row[0] !== 'number' || !Number.isFinite(row[0]) || Math.abs(row[0] - (i + 1) / 100) > 1e-9
      || typeof row[1] !== 'number' || !Number.isFinite(row[1]) || row[1] < 0 || row[1] > Number.MAX_SAFE_INTEGER / 100) throw Error('no_retention_data');
    return row[1];
  });
  // 100 intervals, exclusive ends 0.01..1. Rewatches may exceed 100%.
  // Use only whole bins ending by 30s; no invented score if the first bin is longer.
  const bins = Math.min(100, Math.floor(Math.min(30, video.duration) * 100 / video.duration + 1e-9));
  const drops: RetentionDrop[] = [];
  for (let i = 1; i < ratios.length; i++) if (ratios[i - 1] - ratios[i] > 0.10 + 1e-12) drops.push({
    time: Math.round((i + 1) * video.duration / 100), drop: percent(ratios[i - 1] - ratios[i]),
    retentionBefore: percent(ratios[i - 1]), retentionAfter: percent(ratios[i]),
  });
  return { ...video, retention: ratios.map(percent), avgRetention: percent(ratios.reduce((sum, r) => sum + r / 100, 0)),
    hookScore: bins ? percent(ratios.slice(0, bins).reduce((sum, r) => sum + r / bins, 0)) : null,
    hookWindowSeconds: bins * video.duration / 100, dropOffPoints: drops.slice(0, 5) };
}
export function retentionInsights(value: unknown, videos: RetentionVideo[]) {
  const result = retentionObject(value);
  if (Object.keys(result).some(k => !['tips', 'dropOffReasons'].includes(k)) || !Array.isArray(result.tips)
    || result.tips.length < 1 || result.tips.length > 4 || result.tips.some(t => typeof t !== 'string' || !t.trim() || t.length > 1000)) throw Error('retention_unconfirmed');
  const reasons = retentionObject(result.dropOffReasons ?? {});
  for (const [id, entries] of Object.entries(reasons)) {
    const video = videos.find(v => v.videoId === id);
    if (!video || !Array.isArray(entries) || entries.length > 5) throw Error('retention_unconfirmed');
    const seen = new Set<string>();
    for (const entry of entries) {
      const r = retentionObject(entry);
      if (Object.keys(r).length !== 2 || typeof r.timestamp !== 'string' || seen.has(r.timestamp)
        || !video.dropOffPoints.some(d => retentionTime(d.time) === r.timestamp)
        || typeof r.reason !== 'string' || !r.reason.trim() || r.reason.length > 1000) throw Error('retention_unconfirmed');
      seen.add(r.timestamp);
    }
  }
  return { aiTips: result.tips as string[], dropOffReasons: reasons as RetentionResult['dropOffReasons'] };
}
