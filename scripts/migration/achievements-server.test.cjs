'use strict';
const assert=require('node:assert/strict'),{NextRequest}=require('next/server'),{load}=require('./route-harness.cjs'),{deferred,flush}=require('./chat-widget-harness.cjs');
const defs=load('lib/achievement-definitions.ts'),bindings=[];
async function bound(options={}){
 let now=1000,offset=0,serial=0;const events=[],timers=new Map(),gates={},entered={},originals=[],operations=[],controller=new AbortController();
 if(options.held)gates[options.held]=deferred();
 let f,issued,principal={id:'achievement-fixture-user',email:'achievement@example.invalid',expires:Math.floor(Date.now()/1000)+300};
 if(options.native){f=await require('./admin-native-authorization.test.cjs').fixture({adminEmail:'other-admin@example.invalid'});issued=await f.login();principal={id:issued.decoded.id,email:issued.decoded.email,expires:issued.decoded.exp};}
 const state={owner:{id:principal.id,email:principal.email},rows:[],admissions:[],yt:null,metrics:{optimizeCount:0n,maxSeo:null,improved:false,abWinner:false,chatCount:0n},generations:[],chats:[]};
 const step=(name,fn=()=>undefined)=>{const p=(async()=>{events.push(name);(entered[name]??=deferred()).resolve();const value=await fn();if(options.held===name)await gates[name].promise;if(options.fail===name)throw Error('PRIVATE_DIAGNOSTIC');return value;})();operations.push(p);return p;};
 const globals={Date:new Proxy(Date,{get(t,k,r){return k==='now'?()=>Date.now()+offset:Reflect.get(t,k,r);}}),Headers,process:{env:{AUTH_URL:'http://127.0.0.1:4300'}},performance:{now:()=>now},setTimeout(fn,ms){const id=++serial;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id)};
 const accountReader=options.native?load('lib/native-user-session.ts',{'next/headers':{headers:async()=>f.headers()},'@/auth':{readNativeSessionCookie:q=>step('decode',()=>f.authBindings.readNativeSessionCookie(q))},'@/lib/prisma':{prisma:{user:{findUnique:q=>step('account',()=>f.prisma.user.findUnique(q))}}},'@/lib/admin-email':{ADMIN_EMAIL:'other-admin@example.invalid'}},globals):{readNativeVerifiedUser:()=>step('authorization',()=>options.unauthorized?null:principal)};
 let transactions=0;
 const sql=(text,...args)=>{
  assert.equal(args[0],principal.id);
  if(text.startsWith('SELECT key,state')){assert.equal(args[1],defs.ACHIEVEMENTS.length+1);return step('admissions',()=>state.admissions.map(({key,state})=>({key,state})));}
  assert(text.startsWith('SELECT (SELECT count(*)'));return step('metrics',()=>[{...state.metrics}]);
 };
 const tx={
  $queryRawUnsafe(text,...a){
   if(text.startsWith('SELECT id,email'))return step('lock',()=>[{...state.owner}]);
   if(text.startsWith('SELECT id FROM'))return step('prior',()=>state.admissions.filter(x=>x.userId===a[0]&&x.key===a[1]).map(x=>({id:x.id})));
   if(text.startsWith('INSERT INTO'))return step('admit',()=>{const row={id:a[0],userId:a[1],key:a[2],achievementId:a[3],state:'pending'};state.admissions.push(row);return [{...row}];});
   assert(text.startsWith('SELECT id,"userId"'));return step('owned',()=>state.admissions.filter(x=>x.id===a[0]).map(x=>({...x})));
  },
  $executeRawUnsafe(text,...a){return step('complete',()=>{const row=state.admissions.find(x=>x.id===a[0]&&x.userId===a[1]&&x.key===a[2]&&x.achievementId===a[3]&&x.state==='pending');if(!row)return 0;row.state='complete';return options.badMarker?0:1;});},
  achievement:{
   findUnique:q=>step('existing-key',()=>state.rows.find(x=>x.userId===q.where.userId_key.userId&&x.key===q.where.userId_key.key)?{id:'existing'}:null),
   create:q=>step('create',()=>{assert.equal(q.data.userId,principal.id);const row={...q.data,unlockedAt:new Date()};state.rows.push(row);return options.badAck?{...row,userId:'foreign'}:{...row};})
  }
 };
 let reads=0;
 const prisma={
  $queryRawUnsafe:sql,
  async $transaction(fn){const n=++transactions,snapshot={rows:state.rows.map(x=>({...x})),admissions:state.admissions.map(x=>({...x}))};let value;try{value=await step('tx'+n,()=>fn(tx));}catch(e){state.rows=snapshot.rows;state.admissions=snapshot.admissions;throw e;}return step(n===1?'admission-ack':'write-ack',()=>value);},
  achievement:{findMany:q=>step(++reads===1?'rows':'final',()=>{assert.equal(q.where.userId,principal.id);assert.equal(q.take,defs.ACHIEVEMENTS.length+1);assert.equal(Object.keys(q.select).length,4);return state.rows.map(x=>({...x}));})},
  youtubeToken:{findUnique:q=>step('youtube',()=>{assert.equal(q.where.userId,principal.id);assert.deepEqual(Object.keys(q.select),['userId','channelId','subscribers','videoCount']);return state.yt&&{...state.yt};})},
  generation:{findMany:q=>step('generations',()=>{assert.equal(q.take,30);assert.equal(q.where.userId,principal.id);return state.generations.map(x=>({...x}));})},
  chatMessage:{findMany:q=>step('chats',()=>{assert.equal(q.take,30);assert.equal(q.where.userId,principal.id);assert.equal(q.where.role,'user');return state.chats.map(x=>({...x}));})}
 };
 const mocks={'@/lib/native-user-session':accountReader,'@/lib/prisma':{prisma},'node:crypto':require('node:crypto'),'@/lib/achievement-definitions':defs};
 const native=load('lib/achievements-native-authorization.ts',mocks,globals);
 const route=load('app/api/achievements/route.ts',{'@/lib/achievements-native-authorization':native,'next/server':{NextResponse:{json:(body,init)=>init.status===200?step('JSON',()=>Response.json(body,init)):Response.json(body,init)}}},globals);
 const start=()=>{const p=route.GET(new NextRequest('http://127.0.0.1:4300/api/achievements?userId=foreign',{signal:controller.signal}));originals.push(p);return p;};
 const reply=async(p,status)=>{const response=await p;assert.equal(response.status,status);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.getSetCookie().length,0);const body=await response.json();if(status===503)assert.deepEqual(body,{error:'achievements_unconfirmed'});if(status===401)assert.deepEqual(body,{error:'unauthorized'});assert(!JSON.stringify(body).includes('PRIVATE_DIAGNOSTIC'));return body;};
 const h={native,globals,mocks,prisma,principal,f,issued,state,events,operations,originals,gates,entered,timers,controller,start,reply,expire(){offset=600000;},deadline(){now+=55000;for(const[id,t]of [...timers])if(t.at<=now){timers.delete(id);t.fn();}},async release(name){gates[name]?.resolve();await flush();}};bindings.push(h);return h;
}
async function reach(h,name){let timer;try{await Promise.race([(h.entered[name]??=deferred()).promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Not reached: '+name)),8000))]);}finally{clearTimeout(timer);}}
async function suite(nativeOnly=false){
 const results=[];async function test(name,fn){const first=bindings.length;try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.stack});}finally{for(const h of bindings.slice(first)){for(const g of Object.values(h.gates))g.resolve();await Promise.allSettled(h.originals);await Promise.allSettled(h.operations);}}}
 if(nativeOnly){
  await test('installed Auth.js CSRF/credentials/bcrypt/callback/JWE native cookie and native account before own data, no refresh',async()=>{const h=await bound({native:true}),nativeCallsBefore=h.f.calls.native,b=await h.reply(h.start(),200);assert.equal(b.newlyUnlocked.length,0);assert.deepEqual(h.events.slice(0,4),['decode','account','admissions','rows']);assert.equal(h.f.calls.refresh,0);assert.equal(h.f.calls.native,nativeCallsBefore);});
  for(const[name,patch]of [['TOTP pending',{requiresTotp:true}],['verification pending',{requiresVerification:true}],['reference missing',{authSessionRef:undefined}],['subject mismatch',{sub:'foreign'}],['role absent',{isAdmin:undefined}],['role incoherent',{isAdmin:true}]])await test('native '+name+' denied before achievements',async()=>{const h=await bound({native:true});await h.f.negativeCookie({...h.issued.decoded,...patch});await h.reply(h.start(),401);assert(!h.events.includes('admissions'));assert(!h.events.includes('account'));});
  for(const mode of ['absent','tampered','bearer'])await test('native '+mode+' does not authorize declared query user',async()=>{const h=await bound({native:true});h.f.setHeaders(mode==='absent'?{}:mode==='tampered'?{cookie:h.f.cookieName+'=tampered'}:{authorization:'Bearer '+h.issued.cookies[0].split('=')[1]});await h.reply(h.start(),401);assert(!h.events.includes('admissions'));});
  for(const patch of [null,{emailVerified:null},{email:'foreign@example.invalid'}])await test('native dependent account only denies '+JSON.stringify(patch),async()=>{const h=await bound({native:true});h.f.setAccount(patch===null?null:{...h.f.account(),...patch});await h.reply(h.start(),401);assert(!h.events.includes('admissions'));});
  for(const name of ['decode','account'])await test('native '+name+' abort drains original without business dispatch',async()=>{const h=await bound({native:true,held:name}),p=h.start();await reach(h,name);h.controller.abort();await h.reply(p,503);await h.release(name);assert(!h.events.includes('admissions'));});
 }else{
  await test('no eligible conditions: complete public definitions, finite bounded projections, no writes',async()=>{const h=await bound(),b=await h.reply(h.start(),200);assert.equal(b.totalAvailable,defs.ACHIEVEMENTS.length);assert.equal(b.totalUnlocked,0);assert.deepEqual(b.newlyUnlocked,[]);assert(!h.events.includes('tx1'));assert.equal(h.timers.size,0);});
  await test('verified create plus atomic completion acknowledges exactly own key and ISO timestamp',async()=>{const h=await bound();h.state.yt={userId:h.principal.id,channelId:'channel',videoCount:null,subscribers:null};const b=await h.reply(h.start(),200);assert.deepEqual(b.newlyUnlocked,['first_video']);assert.equal(b.totalUnlocked,1);assert.equal(h.state.admissions[0].state,'complete');assert.equal(h.events.filter(x=>x==='create').length,1);const next=await h.reply(h.start(),200);assert.deepEqual(next.newlyUnlocked,[]);assert.equal(h.events.filter(x=>x==='create').length,1);});
  await test('preserved thresholds and UTC streak with bounded primitive captures',async()=>{const h=await bound();h.state.yt={userId:h.principal.id,channelId:'channel',videoCount:'10',subscribers:'1000'};h.state.metrics={optimizeCount:1n,maxSeo:90,improved:true,abWinner:true,chatCount:50n};h.state.generations=Array.from({length:30},(_,i)=>({createdAt:new Date(Date.now()-i*86400000)}));const b=await h.reply(h.start(),200);assert.equal(b.newlyUnlocked.length,14);assert.equal(b.totalUnlocked,14);assert.equal(h.state.admissions.length,14);});
  await test('genuine unauthenticated user never reads achievement data',async()=>{const h=await bound({unauthorized:true});await h.reply(h.start(),401);assert.deepEqual(h.events,['authorization']);});
  await test('opaque original cannot be copied, serialized, forged, borrowed or reused',async()=>{const h=await bound(),own=await h.native.authorizeNativeAchievements(),foreign=load('lib/achievements-native-authorization.ts',h.mocks,h.globals),other=await foreign.authorizeNativeAchievements();for(const fake of [{},{...own},JSON.parse(JSON.stringify(own)),other,{owner:h.principal,expires:9999999999}])await assert.rejects(h.native.produceNativeAchievements(fake,()=>{}));assert(!h.events.includes('admissions'));await h.native.produceNativeAchievements(own,()=>{});await assert.rejects(h.native.produceNativeAchievements(own,()=>{}));});
  for(const[name,patch]of [
   ['malformed numeric channel',h=>h.state.yt={userId:h.principal.id,channelId:'c',videoCount:'10junk',subscribers:'100'}],
   ['foreign youtube row',h=>h.state.yt={userId:'foreign',channelId:'c',videoCount:'10',subscribers:'100'}],
   ['unsafe count',h=>h.state.metrics.chatCount=9007199254740992n],
   ['invalid score',h=>h.state.metrics.maxSeo=101],
   ['non boolean winner',h=>h.state.metrics.abWinner='true'],
   ['future activity',h=>h.state.generations=[{createdAt:new Date(Date.now()+100000)}]],
   ['invalid date',h=>h.state.chats=[{createdAt:new Date(NaN)}]],
   ['foreign existing row',h=>h.state.rows=[{id:'row',userId:'foreign',key:'first_video',unlockedAt:new Date()}]],
   ['unknown key',h=>h.state.rows=[{id:'row',userId:h.principal.id,key:'foreign',unlockedAt:new Date()}]],
   ['pending permanent admission',h=>h.state.admissions=[{key:'first_video',state:'pending'}]]
  ])await test(name+' unavailable without dispatch',async()=>{const h=await bound();patch(h);await h.reply(h.start(),503);assert(!h.events.includes('create'));});
  for(const fail of ['admit','admission-ack','create','write-ack','complete'])await test('failure/lost '+fail+' never becomes unlock ACK or replay',async()=>{const h=await bound({fail});h.state.yt={userId:h.principal.id,channelId:'c',videoCount:null,subscribers:null};await h.reply(h.start(),503);assert(!h.events.includes('JSON'));if(fail!=='admit'){const count=h.events.filter(x=>x==='create').length;const res=await h.start();assert([200,503].includes(res.status));const b=await res.json();assert(!b.newlyUnlocked||b.newlyUnlocked.length===0);assert.equal(h.events.filter(x=>x==='create').length,count);}});
  for(const patch of [{badAck:true},{badMarker:true}])await test('mismatched original write evidence rolls back and remains denied '+JSON.stringify(patch),async()=>{const h=await bound(patch);h.state.yt={userId:h.principal.id,channelId:'c',videoCount:null,subscribers:null};await h.reply(h.start(),503);assert.equal(h.state.rows.length,0);assert.equal(h.state.admissions[0].state,'pending');await h.reply(h.start(),503);assert.equal(h.events.filter(x=>x==='create').length,1);});
  for(const held of ['metrics','admit','admission-ack','create','write-ack','final','JSON'])for(const why of ['expiry','abort','deadline'])await test(why+' during '+held+' retains original and suppresses late response/effects',async()=>{const h=await bound({held});h.state.yt={userId:h.principal.id,channelId:'c',videoCount:null,subscribers:null};const p=h.start();await reach(h,held);if(why==='expiry'){h.expire();await h.release(held);}else{if(why==='abort')h.controller.abort();else h.deadline();}await h.reply(p,503);await h.release(held);await Promise.allSettled(h.operations);assert.equal(h.events.filter(x=>x===held).length,1);if(['metrics','admit','admission-ack'].includes(held))assert(!h.events.includes('create'));if(held==='create')assert.equal(h.state.admissions[0].state,'complete');});
 }
 return{status:results.every(x=>x.status==='PASS')?'PASS':'FAIL',scope:nativeOnly?'Actual installed native Auth.js/NextRequest-compatible Request/session issuer/reader with closed synthetic accounts and achievement effects. Not operative auth/consent/freshness.':'Actual achievement producer, private original, bounded reads, permanent denial admission, original ACK, expiry/55s/abort with closed SQL and clocks; no operative acceptance.',results};
}
module.exports={bound,reach,suite};if(require.main===module)suite(process.argv.includes('--native')).then(r=>{console.log(JSON.stringify(r,null,2));if(r.status!=='PASS')process.exitCode=1;}).catch(e=>{console.error(e.stack);process.exitCode=1;});
