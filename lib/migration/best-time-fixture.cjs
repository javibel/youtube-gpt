'use strict';
// Compiled fixture data and explicit in-process transports only. No global
// fetch replacement, sockets, OAuth, model call or operational source claim.
const bestTimeFixture=Object.freeze({userId:'migration-ui-synthetic-best-time',email:'migration-best-time@example.invalid',password:'migration-only-best-time-password',
 subscriptionId:'migration-ui-synthetic-best-time-subscription',tokenId:'migration-ui-synthetic-best-time-token',channelId:'UC_synthetic_best_time_ui',
 referenceAt:'2026-10-12T12:00:00Z',periodEnd:'2099-01-01T00:00:00Z'});
function createBestTimeFixtureTransport(){
 const fail=()=>{throw Error('ISOLATION_BLOCKED: unexpected Best Time fixture transport');};
 const dates=['2026-10-11T12:00:00Z','2026-10-08T12:00:00Z','2026-10-03T12:00:00Z'];
 const videos=()=>dates.map((publishedAt,i)=>({id:String(i).padStart(11,'0'),snippet:{channelId:bestTimeFixture.channelId,publishedAt},statistics:{viewCount:['300','200','300'][i]}}));
 const page=(kind,items)=>({kind,items,pageInfo:{resultsPerPage:items.length,totalResults:items.length}});
 const playlistId='UU_synthetic_best_time_ui';
 return Object.freeze({async token(id,check,options){if(id!==bestTimeFixture.userId||typeof check!=='function'||options?.checkRefreshStep!==check)fail();check();return 'synthetic-best-time-not-a-token';},
  async fetch(url,init){
   const u=new URL(url);if(u.origin!=='https://www.googleapis.com'||init?.method!=='GET'||init.redirect!=='error'||init.cache!=='no-store'
    ||init.headers?.Authorization!=='Bearer synthetic-best-time-not-a-token'||!init.signal||init.signal.aborted)fail();
   const parameters=Object.fromEntries(u.searchParams),same=expected=>JSON.stringify(parameters)===JSON.stringify(expected);let body;
   if(u.pathname==='/youtube/v3/channels'&&same({part:'contentDetails',mine:'true',maxResults:'50'}))body=page('youtube#channelListResponse',[{id:bestTimeFixture.channelId,contentDetails:{relatedPlaylists:{uploads:playlistId}}}]);
   else if(u.pathname==='/youtube/v3/playlistItems'&&same({part:'snippet,contentDetails',playlistId,maxResults:'50'}))body=page('youtube#playlistItemListResponse',videos().map((v,position)=>({kind:'youtube#playlistItem',snippet:{channelId:bestTimeFixture.channelId,videoOwnerChannelId:bestTimeFixture.channelId,playlistId,position,resourceId:{kind:'youtube#video',videoId:v.id}},contentDetails:{videoId:v.id,videoPublishedAt:v.snippet.publishedAt}})));
   else if(u.pathname==='/youtube/v3/videos'&&same({part:'snippet,statistics',id:videos().map(v=>v.id).join(',')}))body=page('youtube#videoListResponse',videos());
   else fail();
   return Response.json(body);
  }});
}
async function seedBestTimeFixture(tx){
 const f=bestTimeFixture,bcrypt=require('bcryptjs');
 const users=(await tx.query('SELECT id,email FROM users WHERE id=$1 OR email=$2',[f.userId,f.email])).rows;
 if(users.some(row=>row.id!==f.userId||row.email!==f.email))throw Error('Best Time fixture owner conflicts');
 const password=await bcrypt.hash(f.password,10);
 await tx.query('INSERT INTO users(id,email,name,password,"emailVerified","marketingOptOut","createdAt","updatedAt") VALUES($1,$2,$3,$4,now(),true,now(),now()) ON CONFLICT(id) DO NOTHING',[f.userId,f.email,'Cuenta ficticia Mejor hora',password]);
 const sub=(await tx.query('SELECT id FROM subscriptions WHERE "userId"=$1',[f.userId])).rows[0];
 if(sub&&sub.id!==f.subscriptionId)throw Error('Best Time fixture subscription conflicts');
 await tx.query('INSERT INTO subscriptions(id,"userId",plan,status,"stripeCustomerId","currentPeriodEnd","createdAt","updatedAt") VALUES($1,$2,\'pro\',\'active\',\'manual_admin\',$3::timestamp,now(),now()) ON CONFLICT("userId") DO NOTHING',[f.subscriptionId,f.userId,f.periodEnd]);
 const token=(await tx.query('SELECT id,"userId","channelId" FROM youtube_tokens WHERE "userId"=$1',[f.userId])).rows[0];
 if(token&&(token.id!==f.tokenId||token.userId!==f.userId||token.channelId!==f.channelId))throw Error('Best Time fixture channel conflicts');
 await tx.query('INSERT INTO youtube_tokens(id,"userId","accessToken","refreshToken","expiresAt","channelId","channelName","createdAt","updatedAt") VALUES($1,$2,\'synthetic-best-time-not-a-token\',\'\',$3::timestamp,$4,\'Canal ficticio Mejor hora\',now(),now()) ON CONFLICT("userId") DO NOTHING',[f.tokenId,f.userId,f.periodEnd,f.channelId]);
 // Never reset plan/token/cache/attempt, regenerate source dates or reconstruct
 // a lost original. Existing rows (including unknown markers) remain intact.
}
module.exports={bestTimeFixture,createBestTimeFixtureTransport,seedBestTimeFixture};
