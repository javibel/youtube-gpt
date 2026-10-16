'use strict';
// Compiled local sources are configuration,never authentication or recovery.
// The real cookie/SQL gates and admissions remain in the production modules.
const abFixture = Object.freeze({ userId: 'migration-ui-synthetic-admin', email: 'migration-admin@example.invalid', tokenId: 'migration-ui-synthetic-ab-token', token: 'synthetic-ab-not-an-oauth-token', channelId: 'UCaaaaaaaaaaaaaaaaaaaaaa', playlistId: 'UUaaaaaaaaaaaaaaaaaaaaaa', videoId: 'abcdefghijk', publishedAt: '2026-10-12T12:00:00.000Z', periodEnd: '2099-01-01T00:00:00.000Z', originalTitle: 'Synthetic A/B original title' });
let title = abFixture.originalTitle;
const snippet = () => ({ channelId: abFixture.channelId, title, publishedAt: abFixture.publishedAt, description: 'Closed local A/B fixture;not an operational video.', tags: ['synthetic', 'local-only'], categoryId: '22', defaultLanguage: 'en' });
function guarded() { if (process.env.YTV_MIGRATION_WEB_TEST !== '1' || global.__ytvRuntimeGuard !== true || process.env.AUTH_URL !== 'http://127.0.0.1:4300')
    throw Error('ISOLATION_BLOCKED: guarded A/B fixture required'); }
/** @param {string | undefined} userId @param {string} token @param {typeof fetch} nativeFetch @returns {typeof fetch} */
function abFixtureFetch(userId, token, nativeFetch) {
    if (process.env.YTV_MIGRATION_WEB_TEST !== '1')
        return nativeFetch;
    guarded();
    if (userId !== abFixture.userId || token !== abFixture.token)
        throw Error('ISOLATION_BLOCKED: A/B fixture principal mismatch');
    return async (url, init) => {
        guarded();
        const u = new URL(url), method = init?.method ?? 'GET', params = Object.fromEntries(u.searchParams), same = v => JSON.stringify(params) === JSON.stringify(v), fail = () => { throw Error('ISOLATION_BLOCKED: unexpected A/B fixture request'); };
        if (u.origin !== 'https://www.googleapis.com' || u.username || u.password || u.hash || init.cache !== 'no-store' || init.redirect !== 'error' || init.headers?.Authorization !== 'Bearer ' + abFixture.token)
            fail();
        if (method === 'GET') {
            if (!init.signal || init.signal.aborted)
                fail();
            let body;
            if (u.pathname === '/youtube/v3/channels' && (same({ part: 'id', mine: 'true', maxResults: '50' }) || same({ part: 'contentDetails', mine: 'true', maxResults: '50' })))
                body = { kind: 'youtube#channelListResponse', items: [{ kind: 'youtube#channel', id: abFixture.channelId, contentDetails: { relatedPlaylists: { uploads: abFixture.playlistId } } }] };
            else if (u.pathname === '/youtube/v3/playlistItems' && same({ part: 'snippet,contentDetails', playlistId: abFixture.playlistId, maxResults: '20' }))
                body = { kind: 'youtube#playlistItemListResponse', items: [{ kind: 'youtube#playlistItem', snippet: { channelId: abFixture.channelId, playlistId: abFixture.playlistId, resourceId: { kind: 'youtube#video', videoId: abFixture.videoId } }, contentDetails: { videoId: abFixture.videoId } }] };
            else if (u.pathname === '/youtube/v3/videos' && (same({ part: 'snippet', id: abFixture.videoId }) || same({ part: 'snippet,statistics', id: abFixture.videoId })))
                body = { kind: 'youtube#videoListResponse', items: [{ kind: 'youtube#video', id: abFixture.videoId, snippet: snippet(), statistics: { viewCount: '100', likeCount: '5' } }] };
            else
                fail();
            return Response.json(body);
        }
        // The transport owns only this new closed PUT and its ACK. No retry,reset,
        // file,SQL writer,OAuth,network or serialized state restores an old producer.
        if (method !== 'PUT' || u.pathname !== '/youtube/v3/videos' || !same({ part: 'snippet' }) || init.signal !== undefined || init.headers['Content-Type'] !== 'application/json' || typeof init.body !== 'string' || init.body.length > 16384)
            fail();
        const v = JSON.parse(init.body), s = v?.snippet, expected = snippet();
        if (Object.keys(v).sort().join(',') !== 'id,snippet' || v.id !== abFixture.videoId || !s || Object.keys(s).sort().join(',') !== 'categoryId,defaultLanguage,description,tags,title' || typeof s.title !== 'string' || !s.title.trim() || s.title.length > 100 || /[<>]/.test(s.title) || s.description !== expected.description || s.categoryId !== expected.categoryId || s.defaultLanguage !== expected.defaultLanguage || JSON.stringify(s.tags) !== JSON.stringify(expected.tags))
            fail();
        title = s.title;
        return Response.json({ kind: 'youtube#video', id: abFixture.videoId, snippet: snippet() });
    };
}
async function seedAbFixture(tx) {
    guarded();
    const f = abFixture, owner = (await tx.query('SELECT id,email FROM users WHERE id=$1 OR email=$2', [f.userId, f.email])).rows;
    if (owner.length !== 1 || owner[0].id !== f.userId || owner[0].email !== f.email)
        throw Error('A/B fixture owner mismatch');
    const rows = (await tx.query('SELECT id,"userId","channelId","accessToken","expiresAt" FROM youtube_tokens WHERE "userId"=$1', [f.userId])).rows;
    if (rows.length && (!rows.every(r => r.id === f.tokenId && r.userId === f.userId && r.channelId === f.channelId && r.accessToken === f.token)))
        throw Error('A/B fixture token conflicts');
    await tx.query('INSERT INTO youtube_tokens(id,"userId","accessToken","refreshToken","expiresAt","channelId","channelName","createdAt","updatedAt") VALUES($1,$2,$3,$6,$4::timestamp,$5,$7,now(),now()) ON CONFLICT("userId") DO NOTHING', [f.tokenId, f.userId, f.token, f.periodEnd, f.channelId, '', 'Synthetic A/B channel']);
    // Never update an inherited token,plan,test,attempt,source date or expiry.
}
module.exports = { abFixture, abFixtureFetch, seedAbFixture };
