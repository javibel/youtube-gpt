import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { readNativeVerifiedUser } from '@/lib/native-user-session';
import { ACHIEVEMENTS } from '@/lib/achievement-definitions';
import type { Prisma } from '@prisma/client';

declare const achievementsBrand: unique symbol;
export type NativeAchievementsOriginal = { readonly [achievementsBrand]: true };
type Own = { owner: Readonly<{ userId: string; email: string }>; expires: number; referenceTime: number; used: boolean };
const originals = new WeakMap<object, Own>();
const keys = new Set(ACHIEVEMENTS.map(def => def.key));
const unavailable = () => Error('Achievements unavailable');
const id = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,128}$/.test(v);
const date = (v: unknown): string => {
  if (!(v instanceof Date) || !Number.isFinite(v.getTime())) throw unavailable();
  return v.toISOString();
};
function count(v: unknown): number {
  if (typeof v === 'bigint') {
    if (v < BigInt(0) || v > BigInt(Number.MAX_SAFE_INTEGER)) throw unavailable();
    return Number(v);
  }
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) throw unavailable();
  return v;
}
function channelCount(v: unknown): number | null {
  if (v === null) return null;
  if (typeof v !== 'string' || !/^(0|[1-9]\d{0,15})$/.test(v)) throw unavailable();
  return count(Number(v));
}
export async function authorizeNativeAchievements(): Promise<NativeAchievementsOriginal | null> {
  const principal = await readNativeVerifiedUser();
  if (!principal) return null;
  const original = Object.freeze({}) as NativeAchievementsOriginal;
  originals.set(original, { owner: Object.freeze({ userId: principal.id, email: principal.email }), expires: principal.expires, referenceTime: Date.now(), used: false });
  return original;
}
function retained(original: NativeAchievementsOriginal): Own {
  const own = original && typeof original === 'object' ? originals.get(original) : undefined;
  if (!own || own.expires <= Date.now() / 1000) throw unavailable();
  return own;
}
export function checkNativeAchievements(original: NativeAchievementsOriginal): void {
  retained(original);
}

type Admission = { id: string; userId: string; key: string; achievementId: string; state: string };
type AchievementRow = { id: string; userId: string; key: string; unlockedAt: Date };
function captureRows(rows: AchievementRow[], userId: string) {
  if (!Array.isArray(rows) || rows.length > keys.size) throw unavailable();
  const seen = new Set<string>();
  return rows.map(row => {
    if (!id(row.id) || row.userId !== userId || !keys.has(row.key) || seen.has(row.key)) throw unavailable();
    seen.add(row.key);
    return Object.freeze({ key: row.key, unlockedAt: date(row.unlockedAt) });
  });
}
// Admission is a permanent denial for another producer of the same user/key.
// Its fields may only deny this original; no lookup constructs or resumes one.
async function unlock(own: Own, key: string, check: () => void): Promise<string | null> {
  const captured = Object.freeze({ id: randomUUID(), userId: own.owner.userId, key, achievementId: randomUUID() });
  const lock = async (tx: Prisma.TransactionClient) => {
    check();
    const rows = await tx.$queryRawUnsafe<Array<{ id: string; email: string }>>('SELECT id,email FROM users WHERE id=$1 FOR UPDATE', own.owner.userId);
    check();
    if (rows.length !== 1 || rows[0].id !== own.owner.userId || rows[0].email !== own.owner.email) throw unavailable();
  };
  const exact = (row: Admission | undefined) => !!row && row.state === 'pending' && Object.entries(captured).every(([k,v]) => row[k as keyof typeof captured] === v);
  const admitted = await prisma.$transaction(async tx => {
    await lock(tx);
    const prior = await tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM achievement_unlock_admissions WHERE "userId"=$1 AND key=$2', captured.userId, key);
    check(); if (prior.length) throw unavailable();
    const existing = await tx.achievement.findUnique({ where: { userId_key: { userId: captured.userId, key } }, select: { id: true } });
    check(); if (existing) return null; // Existing data is not a new unlock acknowledgement.
    const rows = await tx.$queryRawUnsafe<Admission[]>('INSERT INTO achievement_unlock_admissions (id,"userId",key,"achievementId",state) VALUES ($1,$2,$3,$4,\'pending\') RETURNING id,"userId",key,"achievementId",state', captured.id, captured.userId, key, captured.achievementId);
    check(); if (rows.length !== 1 || !exact(rows[0])) throw unavailable();
    return true;
  }, { maxWait: 10_000, timeout: 15_000 });
  check(); if (!admitted) return null;
  const acknowledged = await prisma.$transaction(async tx => {
    await lock(tx);
    const rows = await tx.$queryRawUnsafe<Admission[]>('SELECT id,"userId",key,"achievementId",state FROM achievement_unlock_admissions WHERE id=$1 FOR UPDATE', captured.id);
    check(); if (rows.length !== 1 || !exact(rows[0])) throw unavailable();
    check();
    // Once invoked, creation and completion commit/rollback in this transaction.
    // HTTP retirement/expiry cannot cancel or replay the dispatched write.
    const created = await tx.achievement.create({ data: { id: captured.achievementId, userId: captured.userId, key }, select: { id: true, userId: true, key: true, unlockedAt: true } });
    if (created.id !== captured.achievementId || created.userId !== captured.userId || created.key !== key) throw unavailable();
    const unlockedAt = date(created.unlockedAt);
    const marked = await tx.$executeRawUnsafe('UPDATE achievement_unlock_admissions SET state=\'complete\' WHERE id=$1 AND "userId"=$2 AND key=$3 AND "achievementId"=$4 AND state=\'pending\'', captured.id, captured.userId, key, captured.achievementId);
    if (marked !== 1) throw unavailable();
    return Object.freeze({ key, unlockedAt });
  }, { maxWait: 10_000, timeout: 15_000 });
  check();
  return acknowledged.key;
}
export async function produceNativeAchievements(original: NativeAchievementsOriginal, beforeStep: () => void) {
  const own = retained(original);
  if (own.used) throw unavailable();
  own.used = true;
  const check = () => { beforeStep(); retained(original); };
  const read = async <T,R>(query: () => PromiseLike<T>, capture: (value: T) => R): Promise<R> => {
    check(); const value = await query(); check(); const result = capture(value); check(); return result;
  };
  const userId = own.owner.userId;
  const pending = await read(() => prisma.$queryRawUnsafe<Array<{ key: string; state: string }>>('SELECT key,state FROM achievement_unlock_admissions WHERE "userId"=$1 LIMIT $2', userId, keys.size + 1), rows => {
    if (!Array.isArray(rows) || rows.length > keys.size || rows.some(row => !keys.has(row.key) || !['pending','complete'].includes(row.state))) throw unavailable();
    return rows.some(row => row.state === 'pending');
  });
  if (pending) throw unavailable();
  const existing = await read(() => prisma.achievement.findMany({ where: { userId }, take: keys.size + 1, select: { id: true, userId: true, key: true, unlockedAt: true }, orderBy: [{ unlockedAt: 'desc' }, { id: 'desc' }] }), rows => captureRows(rows,userId));
  const existingKeys = new Set(existing.map(row => row.key));
  const yt = await read(() => prisma.youtubeToken.findUnique({ where: { userId }, select: { userId: true, channelId: true, subscribers: true, videoCount: true } }), row => {
    if (!row) return null;
    if (row.userId !== userId || row.channelId !== null && (typeof row.channelId !== 'string' || !row.channelId || row.channelId.length > 128)) throw unavailable();
    return Object.freeze({ channel: !!row.channelId, videos: channelCount(row.videoCount), subscribers: channelCount(row.subscribers) });
  });
  const metrics = await read(() => prisma.$queryRawUnsafe<Array<{ optimizeCount: bigint; maxSeo: number | null; improved: boolean; abWinner: boolean; chatCount: bigint }>>(
    'SELECT (SELECT count(*) FROM optimize_history WHERE "userId"=$1) AS "optimizeCount",(SELECT max(score) FROM video_seo_scores WHERE "userId"=$1) AS "maxSeo",EXISTS(SELECT 1 FROM optimize_history WHERE "userId"=$1 AND "scoreBefore" BETWEEN 0 AND 100 AND "scoreAfter" BETWEEN 0 AND 100 AND "scoreAfter"-"scoreBefore">=20) AS improved,EXISTS(SELECT 1 FROM ab_tests WHERE "userId"=$1 AND winner IS NOT NULL) AS "abWinner",(SELECT count(*) FROM chat_messages WHERE "userId"=$1 AND role=\'user\') AS "chatCount"', userId), rows => {
    if (rows.length !== 1 || typeof rows[0].improved !== 'boolean' || typeof rows[0].abWinner !== 'boolean') throw unavailable();
    const row=rows[0];if(row.maxSeo!==null&&(typeof row.maxSeo!=='number'||!Number.isInteger(row.maxSeo)||row.maxSeo<0||row.maxSeo>100))throw unavailable();
    return Object.freeze({ optimizes: count(row.optimizeCount), seo: row.maxSeo, improved: row.improved, winner: row.abWinner, chats: count(row.chatCount) });
  });
  const activity = async (query: () => PromiseLike<Array<{ createdAt: Date }>>) => read(query, rows => {
    if (!Array.isArray(rows) || rows.length > 30) throw unavailable();
    return rows.map(row => { const value=date(row.createdAt);if(row.createdAt.getTime()>own.referenceTime)throw unavailable();return value.slice(0,10); });
  });
  const generations = await activity(() => prisma.generation.findMany({ where: { userId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 30, select: { createdAt: true } }));
  const chats = await activity(() => prisma.chatMessage.findMany({ where: { userId, role: 'user' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 30, select: { createdAt: true } }));
  const days = new Set([...generations,...chats]);let streak=0;
  for(let i=0;i<31;i++){const day=new Date(own.referenceTime-i*86400000).toISOString().slice(0,10);if(days.has(day))streak++;else if(i>0)break;}
  const eligible: Array<[string,boolean]> = [
    ['first_video',!!yt?.channel],['ten_videos',yt?.videos!==null&&yt?.videos!==undefined&&yt.videos>=10],['hundred_subs',yt?.subscribers!==null&&yt?.subscribers!==undefined&&yt.subscribers>=100],['thousand_subs',yt?.subscribers!==null&&yt?.subscribers!==undefined&&yt.subscribers>=1000],
    ['first_optimize',metrics.optimizes>0],['seo_70',metrics.seo!==null&&metrics.seo>=70],['seo_90',metrics.seo!==null&&metrics.seo>=90],['score_up_20',metrics.improved],['ab_winner',metrics.winner],
    ['streak_3',streak>=3],['streak_7',streak>=7],['streak_30',streak>=30],['coach_5',metrics.chats>=5],['coach_50',metrics.chats>=50]
  ];
  const newlyUnlocked: string[]=[];
  for(const[key,condition]of eligible)if(condition&&!existingKeys.has(key)){check();const acknowledged=await unlock(own,key,check);if(acknowledged)newlyUnlocked.push(acknowledged);}
  const rows = await read(() => prisma.achievement.findMany({ where: { userId }, take: keys.size + 1, select: { id: true, userId: true, key: true, unlockedAt: true }, orderBy: [{ unlockedAt: 'desc' }, { id: 'desc' }] }), value => captureRows(value,userId));
  const map=new Map(rows.map(row=>[row.key,row.unlockedAt]));
  if(newlyUnlocked.some(key=>!map.has(key)))throw unavailable(); // A later read may deny, never replace an original write ACK.
  check();
  return { achievements: ACHIEVEMENTS.map(def=>({...def,unlocked:map.has(def.key),unlockedAt:map.get(def.key)??null})),totalUnlocked:rows.length,totalAvailable:ACHIEVEMENTS.length,newlyUnlocked };
}
