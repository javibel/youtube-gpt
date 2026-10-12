// Cached facts only. Reading this projection does not establish source freshness.
export function bestTimeCache(value: {
  userId: string; heatmap: unknown; topSlots: unknown; videoCount: number;
  aiTip: unknown; analyzedAt: Date;
}, userId: string) {
  const fail = () => { throw Error('Best time cache unavailable'); };
  const integer = (v: unknown, min: number, max: number): number => {
    if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min || v > max) return fail();
    return v;
  };
  if (value.userId !== userId) return fail();
  const videoCount = integer(value.videoCount, 3, 50);
  if (!Array.isArray(value.heatmap) || value.heatmap.length !== 7) return fail();
  const heatmap = Object.freeze(Array.from(value.heatmap, row => {
    if (!Array.isArray(row) || row.length !== 24) return fail();
    return Object.freeze(Array.from(row, score => integer(score, 0, 100)));
  }));
  if (!Array.isArray(value.topSlots) || value.topSlots.length > 3) return fail();
  const cells = new Set<string>();
  let selectedVideos = 0;
  const topSlots = Object.freeze(Array.from(value.topSlots, slot => {
    if (!slot || typeof slot !== 'object' || Array.isArray(slot)
      || Object.keys(slot).length !== 4
      || !['day', 'hour', 'score', 'videoCount'].every(key => Object.hasOwn(slot, key))) return fail();
    const day = integer(slot.day, 0, 6), hour = integer(slot.hour, 0, 23);
    const score = integer(slot.score, 1, 100), count = integer(slot.videoCount, 1, videoCount);
    const key = day + ':' + hour;
    if (cells.has(key) || heatmap[day][hour] !== score) return fail();
    cells.add(key);
    selectedVideos += count;
    if (selectedVideos > videoCount) return fail();
    return Object.freeze({ day, hour, score, videoCount: count });
  }));
  let aiTip: Readonly<{ es: string; en: string }> | null = null;
  if (value.aiTip !== null) {
    const tip = value.aiTip;
    if (!tip || typeof tip !== 'object' || Array.isArray(tip)
      || Object.keys(tip).length !== 2 || !Object.hasOwn(tip, 'es') || !Object.hasOwn(tip, 'en')) return fail();
    const { es, en } = tip as { es: unknown; en: unknown };
    if (typeof es !== 'string' || typeof en !== 'string' || es.length > 4096 || en.length > 4096) return fail();
    aiTip = Object.freeze({ es, en });
  }
  // Native Date conversion rejects strings, invalid dates and overridden serializers.
  const analyzedAt = Date.prototype.toISOString.call(value.analyzedAt);
  return Object.freeze({ heatmap, topSlots, videoCount, aiTip, analyzedAt });
}
