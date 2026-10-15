import { prisma } from '@/lib/prisma';
import { hasPaidAccess } from '@/lib/plans';
import { projectExtensionChannelStats } from '@/lib/extension-channel-stats-projection';

declare const extensionChannelStatsBrand: unique symbol;
export type ExtensionChannelStatsSession = { readonly [extensionChannelStatsBrand]: true };
type Owner = Readonly<{ id: string; email: string; name: string | null }>;
type View = Readonly<{ viewRef: string; language: 'es' | 'en'; surface: 'channel' | 'popup' }>;
const originals = new WeakMap<object, { owner: Owner; token: string; tokenId: string; expires: number; verifiedAt: number; asOf: number; deadline: number; horizon: number; signal: AbortSignal; used: boolean }>();
const emailPattern = /^[^\s@,;<>"\x00-\x1f\x7f]+@[^\s@,;<>"\x00-\x1f\x7f]+\.[^\s@,;<>"\x00-\x1f\x7f]+$/;
export const validExtensionReadRef = (value: unknown): value is string => typeof value === 'string'
  && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const selectUser = { id: true, email: true, name: true, emailVerified: true } as const;
function eligible(row: Awaited<ReturnType<typeof lookup>>, token: string) {
  const now = Date.now();
  return !!row && row.token === token && typeof row.id === 'string' && !!row.id
    && !!row.user && typeof row.user.id === 'string' && row.userId === row.user.id
    && /^[A-Za-z0-9_-]{1,128}$/.test(row.user.id)
    && typeof row.user.email === 'string' && row.user.email.length <= 254
    && row.user.email === row.user.email.trim().toLowerCase() && emailPattern.test(row.user.email)
    && (row.user.name === null || typeof row.user.name === 'string')
    && row.expiresAt instanceof Date && Number.isFinite(row.expiresAt.getTime()) && row.expiresAt.getTime() > now
    && row.user.emailVerified instanceof Date && Number.isFinite(row.user.emailVerified.getTime())
    && row.user.emailVerified.getTime() >= 0 && row.user.emailVerified.getTime() <= now;
}
const lookup = (token: string) => prisma.extensionToken.findUnique({ where: { token }, include: { user: { select: selectUser } } });
export async function authorizeExtensionChannelStats(request: Request): Promise<ExtensionChannelStatsSession | null> {
  const asOf = Date.now(), deadline = performance.now() + 25_000, signal = request.signal;
  const header = request.headers.get('Authorization');
  if (signal.aborted || !header || !/^Bearer [a-f0-9]{64}$/.test(header)) return null;
  const token = header.slice(7), row = await lookup(token);
  if (!eligible(row, token) || !row || !row.user.email || signal.aborted
    || Date.now() < asOf || Date.now() >= asOf + 25_000 || performance.now() >= deadline) return null;
  const original = Object.freeze({}) as ExtensionChannelStatsSession;
  originals.set(original, { owner: Object.freeze({ id: row.user.id, email: row.user.email, name: row.user.name }),
    token, tokenId: row.id, expires: row.expiresAt.getTime(), verifiedAt: row.user.emailVerified!.getTime(),
    asOf, deadline, horizon: Math.min(row.expiresAt.getTime(), asOf + 25_000), signal, used: false });
  return original;
}
function retained(original: ExtensionChannelStatsSession) {
  const own = original && typeof original === 'object' ? originals.get(original) : undefined;
  if (!own || own.signal.aborted || Date.now() < own.asOf || own.horizon <= Date.now()
    || performance.now() >= own.deadline) throw Error('Extension identity unconfirmed');
  return own;
}
export function checkExtensionChannelStats(original: ExtensionChannelStatsSession): void { retained(original); }
export async function readExtensionChannelStats(original: ExtensionChannelStatsSession, readRef: string, beforeStep: () => void, view?: View) {
  const own = retained(original);
  if (own.used || !validExtensionReadRef(readRef) || view && (!validExtensionReadRef(view.viewRef)
    || !['es', 'en'].includes(view.language) || !['channel', 'popup'].includes(view.surface))) throw Error('Extension identity unconfirmed');
  const binding = view && Object.freeze({ viewRef: view.viewRef, language: view.language, surface: view.surface });
  own.used = true;
  const check = () => { retained(original); beforeStep(); };
  check();
  const subscription = await prisma.subscription.findUnique({ where: { userId: own.owner.id },
    select: { status: true, stripeCustomerId: true, currentPeriodEnd: true } });
  check();
  const isPro = hasPaidAccess(subscription, new Date(own.asOf));
  const channel = await prisma.youtubeToken.findUnique({ where: { userId: own.owner.id },
    select: { userId:true,channelId:true,channelName:true,channelThumb:true,subscribers:true,totalViews:true,videoCount:true,updatedAt:true } });
  check();
  if (channel !== null && (channel.userId !== own.owner.id || !(channel.channelId === null
    || typeof channel.channelId === 'string' && /^UC[A-Za-z0-9_-]{22}$/.test(channel.channelId)))) throw Error('Extension identity unconfirmed');
  const snapshots = channel?.channelId ? await prisma.channelSnapshot.findMany({ where: { userId:own.owner.id },orderBy:{recordedAt:'desc'},take:30,
    select:{userId:true,subscribers:true,totalViews:true,videoCount:true,recordedAt:true} }) : [];
  check();
  // Capture values before the credential recheck yields. Neither a later row
  // mutation nor the display envelope grants a new source or a fresher capture.
  const projected = channel?.channelId ? projectExtensionChannelStats(channel, snapshots, own.owner.id, own.asOf) : null;
  const snapshot = projected && Object.freeze({ channel: Object.freeze({ ...projected.channel }),
    growth: Object.freeze({ ...projected.growth }), monetization: Object.freeze({ ...projected.monetization }),
    sparkline: Object.freeze(projected.sparkline.map(point => Object.freeze({ ...point }))),
    dataQuality: Object.freeze({ ...projected.dataQuality }) });
  check();
  // This fresh read can only revoke the original grant, never select another
  // owner or renew the token horizon captured by the incoming credential.
  const current = await lookup(own.token);
  check();
  if (!eligible(current, own.token) || !current || current.id !== own.tokenId
    || current.userId !== own.owner.id || current.user.email !== own.owner.email
    || current.user.emailVerified?.getTime() !== own.verifiedAt
    || current.expiresAt.getTime() !== own.expires) throw Error('Extension identity unconfirmed');
  const result = Object.freeze({ ...(snapshot ?? { error: 'youtube_not_connected', code: 'youtube_not_connected' }),
    readRef, isPro, expiresAt: own.horizon, ...(binding ? { channelStats: Object.freeze({ readRef, ...binding,
      userId: own.owner.id, expiresAt: own.horizon }) } : {}) });
  check(); return result;
}
