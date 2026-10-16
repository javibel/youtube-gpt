import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { hasPaidAccess } from '@/lib/plans';
import { captureAbMutationTest } from '@/lib/ab-mutate-contract';
import { selectionChannel, selectionObject } from '@/lib/ab-selection-contract';
import { captureAbTitleMetadata, publishAbTitleOriginal, reportedAbViews } from '@/lib/ab-title-metadata';
import { observeAbWindows } from '@/lib/ab-observation';
import { beginAbTestTransition } from '@/lib/ab-test';
import { runNativeAbProcessor, type NativeAbProcessor } from '@/lib/ab-processor-original';
type Result = {
    switched: number;
    completed: number;
    errors: string[];
    unconfirmed?: true;
    scanned?: number;
    hasMore?: boolean;
    coverage?: 'pages-within-original-budget';
};
const retainedOwners = new Set<string>();
const date = (v: unknown): v is Date => v instanceof Date && Number.isFinite(v.getTime()) && v.getTime() >= 0;
const id = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);
export async function processAbTests(original?: NativeAbProcessor | null, beforeStep?: () => void): Promise<Result> {
    const nativeFetch = fetch;
    return runNativeAbProcessor(original, async (context) => {
        const check = () => { context.check(); beforeStep?.(); context.check(); };
        const step = async <T,>(fn: () => Promise<T>): Promise<T> => { check(); const value = await fn(); check(); return value; };
        const result: Result = { switched: 0, completed: 0, errors: [], scanned: 0, hasMore: false, coverage: 'pages-within-original-budget' };
        // This cursor exists only inside this live invocation. It selects source
        // rows; it never admits,resumes or completes any title producer.
        let cursor: string | undefined;
        for (;;) {
            const rows = await step(() => prisma.abTest.findMany({ where: { status: { in: ['variant_a', 'variant_b'] }, ...(cursor ? { id: { gt: cursor } } : {}) }, orderBy: { id: 'asc' }, take: 51 }));
            if (!Array.isArray(rows) || rows.length > 51)
                throw Error('ab_processor_unconfirmed');
            result.hasMore = rows.length > 50;
            for (const found of rows.slice(0, 50)) {
                check();
                result.scanned!++;
                try {
                    // SQL data is a captured expectation,not authority for a title producer.
                    const test = { ...found, startedAt: new Date(found.startedAt.getTime()), switchedAt: found.switchedAt && new Date(found.switchedAt.getTime()), completedAt: found.completedAt && new Date(found.completedAt.getTime()) }, snapshot = captureAbMutationTest(test);
                    const start = test.status === 'variant_a' ? test.startedAt : test.switchedAt;
                    if (!start || Date.now() < start.getTime() + test.hoursPerVariant * 3600000)
                        continue;
                    if (retainedOwners.has(test.userId))
                        throw Error('ab_processor_unconfirmed');
                    const account = await step(() => prisma.user.findUnique({ where: { id: test.userId }, select: { id: true, email: true, emailVerified: true } }));
                    if (!account || !id(account.id) || account.id !== test.userId || typeof account.email !== 'string' || account.email !== account.email.trim().toLowerCase() || account.email.length > 254 || !/^\S+@\S+\.\S+$/.test(account.email) || !date(account.emailVerified) || account.emailVerified.getTime() > Date.now())
                        throw Error('ab_processor_unconfirmed');
                    const ownerSnapshot = JSON.stringify([account.id, account.email, account.emailVerified.getTime()]);
                    const p = await step(() => prisma.subscription.findUnique({ where: { userId: test.userId } }));
                    if (!p || !id(p.id) || p.userId !== test.userId || !['pro', 'business'].includes(p.plan) || !hasPaidAccess(p, new Date(Date.now())) || !date(p.currentPeriodEnd))
                        throw Error('ab_processor_unconfirmed');
                    const planSnapshot = JSON.stringify([p.id, p.userId, p.plan, p.status, p.stripeCustomerId, p.currentPeriodEnd.getTime()]);
                    const yt = await step(() => prisma.youtubeToken.findUnique({ where: { userId: test.userId } }));
                    if (!yt || !id(yt.id) || yt.userId !== test.userId || !selectionChannel(yt.channelId) || typeof yt.accessToken !== 'string' || !yt.accessToken || yt.accessToken.length > 8192 || /[\r\n]/.test(yt.accessToken) || !date(yt.expiresAt) || yt.expiresAt.getTime() <= Date.now())
                        throw Error('ab_processor_unconfirmed');
                    const token = yt.accessToken, channelId = yt.channelId, tokenSnapshot = JSON.stringify([yt.id, yt.userId, channelId, token, yt.expiresAt.getTime()]);
                    const validUntil = Math.min(yt.expiresAt.getTime(), p.stripeCustomerId === 'manual_admin' ? p.currentPeriodEnd.getTime() : context.at + 55000);
                    context.shortenLifetime(validUntil);
                    const current = async (db: Prisma.TransactionClient | typeof prisma = prisma, checkTest = true) => {
                        check();
                        if (Date.now() >= validUntil)
                            throw Error('ab_processor_unconfirmed');
                        const u = await step(() => db.user.findUnique({ where: { id: test.userId }, select: { id: true, email: true, emailVerified: true } }));
                        if (!u || !date(u.emailVerified) || JSON.stringify([u.id, u.email, u.emailVerified.getTime()]) !== ownerSnapshot)
                            throw Error('ab_processor_unconfirmed');
                        const plan = await step(() => db.subscription.findUnique({ where: { userId: test.userId } }));
                        if (!plan || !date(plan.currentPeriodEnd) || JSON.stringify([plan.id, plan.userId, plan.plan, plan.status, plan.stripeCustomerId, plan.currentPeriodEnd.getTime()]) !== planSnapshot)
                            throw Error('ab_processor_unconfirmed');
                        const t = await step(() => db.youtubeToken.findUnique({ where: { userId: test.userId } }));
                        if (!t || !date(t.expiresAt) || JSON.stringify([t.id, t.userId, t.channelId, t.accessToken, t.expiresAt.getTime()]) !== tokenSnapshot)
                            throw Error('ab_processor_unconfirmed');
                        if (checkTest) {
                            const row = await step(() => db.abTest.findFirst({ where: { id: test.id, userId: test.userId } }));
                            if (!row || JSON.stringify(captureAbMutationTest(row)) !== JSON.stringify(snapshot))
                                throw Error('ab_processor_unconfirmed');
                        }
                    };
                    const source = async (path: string, params: Record<string, string>) => {
                        await current();
                        const url = new URL(path, 'https://www.googleapis.com');
                        url.search = new URLSearchParams(params).toString();
                        const r = await step(() => nativeFetch(url.href, { cache: 'no-store', redirect: 'error', headers: { Authorization: 'Bearer ' + token }, signal: context.signal }));
                        if (r.status !== 200 || !r.ok || r.redirected || !/^application\/json(?:;|$)/i.test(r.headers.get('content-type') ?? '') || !r.body)
                            throw Error('ab_processor_unconfirmed');
                        const reader = r.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
                        let bytes = 0, body = '';
                        try {
                            for (;;) {
                                const part = await step(() => reader.read());
                                if (part.done)
                                    break;
                                bytes += part.value.byteLength;
                                if (bytes > 1048576)
                                    throw Error('ab_processor_unconfirmed');
                                body += decoder.decode(part.value, { stream: true });
                            }
                            body += decoder.decode();
                        }
                        finally {
                            void reader.cancel().catch(() => { });
                        }
                        return selectionObject(JSON.parse(body));
                    };
                    const actor = await source('/youtube/v3/channels', { part: 'id', mine: 'true', maxResults: '50' });
                    if (actor.kind !== 'youtube#channelListResponse' || !Array.isArray(actor.items) || actor.items.length > 50 || actor.nextPageToken)
                        throw Error('ab_processor_unconfirmed');
                    const matches = actor.items.map(selectionObject).filter(v => v.id === channelId);
                    if (matches.length !== 1 || matches[0].kind !== 'youtube#channel')
                        throw Error('ab_processor_unconfirmed');
                    const videos = await source('/youtube/v3/videos', { part: 'snippet,statistics', id: test.videoId });
                    if (videos.kind !== 'youtube#videoListResponse' || !Array.isArray(videos.items) || videos.items.length !== 1 || videos.nextPageToken)
                        throw Error('ab_processor_unconfirmed');
                    const video = selectionObject(videos.items[0]), snippet = selectionObject(video.snippet);
                    if (video.kind !== 'youtube#video' || video.id !== test.videoId || snippet.channelId !== channelId || snippet.title !== (test.status === 'variant_a' ? test.variantA : test.variantB))
                        throw Error('ab_processor_unconfirmed');
                    const views = reportedAbViews(video);
                    if (views === null)
                        throw Error('ab_processor_unconfirmed');
                    const observedAt = new Date(Date.now()), observation = test.status === 'variant_b' ? observeAbWindows({ ...test, endViews: views, completedAt: observedAt }) : null;
                    if (test.status === 'variant_b' && !observation)
                        throw Error('ab_processor_unconfirmed');
                    const transition = test.status === 'variant_a' ? { action: 'switch_variant' as const, at: observedAt, views } : { action: 'complete_test' as const, at: observedAt, views, winner: observation!.leadingWindow };
                    const title = test.status === 'variant_a' ? test.variantB : observation!.selectedVariant === 'A' ? test.variantA : test.variantB, payload = captureAbTitleMetadata(video, test.videoId, title), commandRef = randomUUID();
                    await current();
                    check();
                    retainedOwners.add(test.userId);
                    let admitted = false;
                    const nativeCheck = async (tx: Prisma.TransactionClient) => {
                        await current(tx);
                        const pending = await step(() => tx.abTestMutationAttempt.findUnique({ where: { id: commandRef } }));
                        if (pending && (!admitted || pending.userId !== test.userId || pending.testId !== test.id || pending.videoId !== test.videoId || pending.action !== transition.action || pending.state !== 'pending') || admitted && !pending)
                            throw Error('ab_processor_unconfirmed');
                        const predecessor = await step(() => tx.abTestMutationAttempt.findFirst({ where: { userId: test.userId, state: { not: 'complete' }, ...(admitted ? { id: { not: commandRef } } : {}) } }));
                        if (predecessor)
                            throw Error('ab_processor_unconfirmed');
                        const creation = await step(() => tx.abTestCreationAttempt.findFirst({ where: { userId: test.userId, state: { not: 'complete' } } }));
                        if (creation)
                            throw Error('ab_processor_unconfirmed');
                    };
                    const admission = await beginAbTestTransition(test.userId, test, transition, check, { attemptId: commandRef, check: nativeCheck, admitted: () => { check(); admitted = true; } });
                    check();
                    if (!admission.ok)
                        throw Error('ab_processor_unconfirmed');
                    // No retiring HTTP/cron check is allowed between an invoked PUT and its
                    // own mandatory SQL completion. A failed ACK keeps its pending exclusion.
                    const ack = await publishAbTitleOriginal(token, payload);
                    if (!ack.ok)
                        throw Error('ab_processor_unconfirmed');
                    const completed = await admission.complete();
                    check();
                    if (completed.id !== test.id || completed.userId !== test.userId || completed.status !== (transition.action === 'switch_variant' ? 'variant_b' : 'completed') || (transition.action === 'switch_variant' ? completed.switchedAt : completed.completedAt)?.getTime() !== transition.at.getTime())
                        throw Error('ab_processor_unconfirmed');
                    // The new state is already durable. Recheck native context without trying
                    // to adopt it from a second SQL read or recreating an admission.
                    await current(prisma, false);
                    retainedOwners.delete(test.userId);
                    if (transition.action === 'switch_variant')
                        result.switched++;
                    else
                        result.completed++;
                }
                catch {
                    check();
                    result.errors.push('ab_processor_unconfirmed');
                    result.unconfirmed = true;
                }
            }
            if (rows.length <= 50)
                break;
            const next = rows[49]?.id;
            if (typeof next !== 'string' || !next || next === cursor)
                throw Error('ab_processor_unconfirmed');
            cursor = next;
        }
        check();
        return result;
    }, { switched: 0, completed: 0, errors: ['ab_processor_unconfirmed'], unconfirmed: true });
}
