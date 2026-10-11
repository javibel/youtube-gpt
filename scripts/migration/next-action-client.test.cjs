'use strict';
const assert=require('node:assert/strict'),{harness,deferred,flush,reply}=require('./chat-widget-harness.cjs');
const paths={connect_channel:'/profile',first_generation:'/generate',score_recent_video:'/seo-score',optimize_low_score:'/optimize',track_competitors:'/competitors/tracking',best_time_stale:'/best-time',trend_alert_unseen:'/trends',plan_week:'/calendar',start_ab_test:'/ab-test',daily_idea:'/generate'};
const row=(id='first_generation',label=id)=>({id,title:{es:'ES '+label,en:'EN '+label},reason:{es:'Motivo '+label,en:'Reason '+label},cta:{es:'Ir',en:'Go'},href:paths[id],...(id==='optimize_low_score'?{score:35}:{})});
const body=rows=>({action:rows[0]??null,actions:rows});
const scopeKey=h=>'ytv_na_skip_v2_'+encodeURIComponent(JSON.stringify([h.state.user,h.state.email]))+'_'+new Date(Date.parse('2026-10-11T00:00:00Z')+10000).toISOString().slice(0,10);
const create=options=>{const h=harness({nextAction:true,...options}),click=h.click;h.click=label=>{const result=click(label);h.view();return result;};return h;};
const ready=async h=>{h.view();await flush();h.view();};
const ids=h=>h.state.card.rows.map(r=>r.id);
async function main(){
 let passed=0;const test=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
 await test('Actual card preserves ordered navigation, ES/EN, scores, CTA parameters and daily-idea parent suppression',async()=>{
  const h=create(),rows=[row('first_generation'),{...row('optimize_low_score'),href:'/optimize?video=aaaaaaaaaaa'},row('daily_idea')];
  h.state.send=()=>reply(body(rows));await ready(h);
  assert.deepEqual(ids(h),rows.map(r=>r.id));assert(h.text().includes('ES first_generation'));
  assert.equal(h.nodes().find(n=>n.type==='a').props.href,'/generate?from=next-action');
  assert(h.button('Sugerencia anterior').props.disabled);h.click('Siguiente sugerencia');assert(h.text().includes('35 /100'));
  assert.equal(h.nodes().find(n=>n.type==='a').props.href,'/optimize?video=aaaaaaaaaaa&from=next-action');
  h.click('Siguiente sugerencia');assert.equal(h.state.actionWrites.at(-1),'daily_idea');assert(h.button('Siguiente sugerencia').props.disabled);
  h.state.lang='en';assert(h.text().includes('EN daily_idea'));h.click('Previous suggestion');assert.equal(h.state.actionWrites.at(-1),'optimize_low_score');
  h.unmount();
 });
 await test('Dismiss/undo last action persists once outside state updater, remains undoable12s and uses own daily key',async()=>{
  const h=create();h.state.send=()=>reply(body([row('daily_idea')]));await ready(h);
  h.click('Descartar por hoy');assert(h.text().includes('Descartada por hoy'));assert.equal(h.state.actionWrites.at(-1),null);assert.equal(h.nodes().filter(n=>n.type==='a').length,0);
  assert.equal(h.state.storageWrites.length,1);assert.equal(h.state.storageWrites[0].key,scopeKey(h));assert.deepEqual(JSON.parse(h.storage.get(scopeKey(h))),['daily_idea']);
  h.advance(11999);h.click('Deshacer');assert(h.text().includes('ES daily_idea'));assert.equal(h.state.storageWrites.length,2);assert.deepEqual(JSON.parse(h.storage.get(scopeKey(h))),[]);
  h.click('Descartar por hoy');h.advance(12000);assert.equal(h.text(),'');assert.equal(h.state.storageWrites.length,3);h.unmount();
 });
 await test('Middle dismiss/navigation and undo restore canonical position without stale timer clearing next undo',async()=>{
  const h=create();h.state.send=()=>reply(body(['first_generation','plan_week','daily_idea'].map(id=>row(id))));await ready(h);
  h.click('Siguiente sugerencia');h.click('Descartar por hoy');assert(h.text().includes('ES daily_idea'));h.click('Deshacer');assert(h.text().includes('ES plan_week'));
  h.click('Descartar por hoy');h.advance(6000);h.click('Descartar por hoy');h.advance(6000);assert(h.text().includes('Deshacer'));h.advance(6000);assert(!h.text().includes('Deshacer'));h.unmount();
 });
 await test('Accountless legacy and foreign scoped skips do not establish owned preferences',async()=>{
  const storage=new Map([['ytv_na_skip_2026-10-11',JSON.stringify(['first_generation'])],['ytv_na_skip_v2_foreign_2026-10-11',JSON.stringify(['first_generation'])]]);
  const h=create({storage});h.state.send=()=>reply(body([row()]));await ready(h);assert(h.text().includes('ES first_generation'));assert.deepEqual(h.state.storageReads,[scopeKey(h)]);assert.equal(h.state.storageWrites.length,0);h.unmount();
 });
 await test('Only valid unique saved IDs affect owned choices; account/email switch loads its own key',async()=>{
  const h=create();h.storage.set(scopeKey(h),JSON.stringify(['first_generation','first_generation','unknown',4]));h.state.send=()=>reply(body([row(),row('plan_week')]));await ready(h);
  assert(h.text().includes('ES plan_week'));assert.deepEqual([...h.state.card.skipped],['first_generation']);
  h.state.email='second@example.invalid';await ready(h);assert(h.text().includes('ES first_generation'));assert.equal(h.state.storageWrites.length,0);h.unmount();
 });
 for(const failure of ['get','set'])await test('Storage '+failure+' failure retains in-memory dismissal and undo without erasing another key',async()=>{
  const h=create();h.storage.set('FOREIGN','UNCHANGED');h.state.storageFailure=failure;h.state.send=()=>reply(body([row()]));await ready(h);h.click('Descartar por hoy');assert(h.text().includes('Deshacer'));h.click('Deshacer');assert(h.text().includes('ES first_generation'));assert.equal(h.storage.get('FOREIGN'),'UNCHANGED');h.unmount();
 });
 for(const change of ['id','email','logout'])for(const stage of ['headers','body'])await test('Changed '+change+' before effects retires '+stage+' and all captured preference/navigation callbacks',async()=>{
  const h=create(),gate=deferred();let bodies=0;
  h.state.send=()=>stage==='headers'?gate.promise:Promise.resolve({ok:true,json(){bodies++;return gate.promise;}});
  h.view();await flush();const captured=h.state.card,req=h.requests[0];
  if(change==='id')h.state.user='fixture-two';else if(change==='email')h.state.email='two@example.invalid';else h.state.auth='unauthenticated';
  assert.equal(h.text(h.view(true)),'');captured.dismiss('first_generation');captured.undo();captured.navigate(1);
  gate.resolve(stage==='headers'?{ok:true,json(){bodies++;return Promise.resolve(body([row('daily_idea','OLD_SECRET')]));}}:body([row('daily_idea','OLD_SECRET')]));
  await flush();assert(!h.text(h.view(true)).includes('OLD_SECRET'));assert.equal(bodies,stage==='headers'?0:1);assert.equal(h.state.storageWrites.length,0);
  h.state.send=()=>reply(body([row('plan_week','NEW')]));await ready(h);
  if(change==='logout'){assert.equal(h.requests.length,1);assert.equal(h.text(),'');assert.equal(h.state.actionWrites.at(-1),null);}
  else{assert(h.text().includes('NEW'));assert.equal(h.state.actionWrites.at(-1),'plan_week');}
  h.unmount();
 });
 for(const stage of ['headers','body'])await test('Unmount retires '+stage+' and never consumes late body or updates parent/storage',async()=>{
  const h=create(),gate=deferred();let bodies=0;
  h.state.send=()=>stage==='headers'?gate.promise:Promise.resolve({ok:true,json(){bodies++;return gate.promise;}});h.view();await flush();const parentCount=h.state.actionWrites.length;h.unmount();await flush();
  gate.resolve(stage==='headers'?{ok:true,json(){bodies++;return Promise.resolve(body([row()]));}}:body([row()]));await flush();assert(h.requests[0].init.signal.aborted);assert.equal(bodies,stage==='headers'?0:1);assert.equal(h.state.actionWrites.length,parentCount);assert.equal(h.state.storageWrites.length,0);
 });
 await test('Strict Mode replay and concurrent retry coalesce the original GET',async()=>{
  const h=create(),gate=deferred();h.state.send=()=>gate.promise;h.view();h.strictEffects();h.state.card.retry();h.state.card.retry();await flush();assert.equal(h.requests.length,1);assert(!h.requests[0].init.signal.aborted);
  gate.resolve(reply(body([row()])));await flush();assert(h.text().includes('ES first_generation'));assert.equal(h.requests[0].init.cache,'no-store');h.unmount();
 });
 for(const stage of ['headers','body'])await test('Shared30s '+stage+' budget reports retry and suppresses late ack',async()=>{
  const h=create(),gate=deferred();let bodies=0;
  h.state.send=()=>stage==='headers'?gate.promise:Promise.resolve({ok:true,json(){bodies++;return gate.promise;}});h.view();await flush();h.advance(30000);await flush();assert(h.text().includes('No se pudieron consultar'));assert(h.button('Reintentar'));assert(h.requests[0].init.signal.aborted);
  const old=h.state.card;h.state.send=()=>reply(body([row('plan_week','NEW')]));old.retry();old.retry();await flush();assert(h.text().includes('NEW'));assert.equal(h.requests.length,2);
  gate.resolve(stage==='headers'?{ok:true,json(){bodies++;return Promise.resolve(body([row('daily_idea','LATE')]));}}:body([row('daily_idea','LATE')]));await flush();assert(!h.text().includes('LATE'));assert.equal(bodies,stage==='headers'?0:1);h.unmount();
 });
 await test('Headers and body share one deadline rather than renewing body30s',async()=>{
  const h=create(),headers=deferred(),data=deferred();h.state.send=()=>headers.promise;h.view();h.advance(29000);headers.resolve({ok:true,json:()=>data.promise});await flush();h.advance(1000);await flush();assert(h.text().includes('Reintentar'));data.resolve(body([row()]));await flush();assert(!h.text().includes('ES first_generation'));h.unmount();
 });
 await test('Monotonic deadline rejects late headers even before delayed timer callbacks run',async()=>{
  const h=create(),gate=deferred();let bodyReads=0;h.state.send=()=>gate.promise;h.view();h.advance(30000,false);gate.resolve({ok:true,json(){bodyReads++;return Promise.resolve(body([row()]));}});await flush();assert(h.text().includes('Reintentar'));assert.equal(bodyReads,0);h.unmount();
 });
 await test('Fresh refresh wins retained old ack and failed refresh preserves last owned snapshot and dismissal',async()=>{
  const h=create();h.state.send=()=>reply(body([row(),row('daily_idea')]));await ready(h);h.click('Descartar por hoy');
  const old=deferred();h.state.send=()=>old.promise;h.state.card.refresh();h.state.send=()=>reply({error:'PRIVATE'},503);h.state.card.refresh();await flush();assert(h.text().includes('ES daily_idea'));assert(h.text().includes('Reintentar'));assert.equal(h.state.actionWrites.at(-1),'daily_idea');
  h.state.send=()=>reply(body([row('plan_week','FRESH')]));h.click('Reintentar');await flush();assert(h.text().includes('FRESH'));old.resolve(reply(body([row('daily_idea','OLD_SECRET')])));await flush();assert(!h.text().includes('OLD_SECRET'));assert.equal(h.state.storageWrites.length,1);h.unmount();
 });
 for(const status of [401,403,503])await test('HTTP'+status+' does not parse response error into empty success or disclose diagnostics',async()=>{
  const h=create();let reads=0;h.state.send=()=>({ok:false,status,json(){reads++;throw Error('PRIVATE_SECRET');}});await ready(h);assert(h.text().includes('Reintentar'));assert(!h.text().includes('PRIVATE'));assert.equal(reads,0);assert.equal(h.state.card.loaded,false);h.unmount();
 });
 const invalid=[
  ['missing catalog',{action:row()}],['null',null],['unknown ID',body([{...row(),id:'unknown'}])],
  ['duplicate',body([row(),row()])],['wrong path',body([{...row(),href:'/billing'}])],
  ['external',body([{...row(),href:'https://evil.invalid'}])],['protocol relative',body([{...row(),href:'//evil.invalid/generate'}])],
  ['backslash origin',body([{...row(),href:'/\\evil.invalid/generate'}])],['fragment',body([{...row(),href:'/generate#key'}])],
  ['NaN score',body([{...row(),score:NaN}])],['out of range',body([{...row(),score:101}])],
  ['missing ES',body([{...row(),reason:{en:'ONLY'}}])],['blank EN',body([{...row(),cta:{es:'Ir',en:' '}}])],
  ['mismatched selected',{action:row('plan_week'),actions:[row()]}],['false empty',{action:row(),actions:[]}]
 ];
 for(const[name,data]of invalid)await test('Malformed '+name+' remains explicit unavailable; no fabricated absence/CTA',async()=>{
  const h=create();h.state.send=()=>reply(data);await ready(h);assert(h.text().includes('Reintentar'));assert.equal(h.nodes().filter(n=>n.type==='a').length,0);assert.equal(h.state.card.loaded,false);h.unmount();
 });
 await test('Decoded rows capture bilingual fields at acknowledgement and ignore unrelated private fields',async()=>{
  const h=create(),data=body([{...row(),password:'NEVER_PUBLIC'}]);h.state.send=()=>reply(data);await ready(h);data.actions[0].title.es='MUTATED_PRIVATE';assert(h.text().includes('ES first_generation'));assert(!h.text().includes('PRIVATE'));assert(!JSON.stringify(h.state.card.rows).includes('password'));h.unmount();
 });
 await test('Confirmed empty success remains empty without failure and resets daily parent',async()=>{
  const h=create();await ready(h);assert.equal(h.text(),'');assert(h.state.card.loaded);assert(!h.state.card.error);assert.equal(h.state.actionWrites.at(-1),null);h.unmount();
 });
 await test('Missing identity/loading/anonymous never dispatch GET, consume skips or expose prior choices',async()=>{
  for(const status of ['loading','unauthenticated','authenticated']){
   const h=create();h.state.auth=status;if(status==='authenticated')h.state.user=undefined;await ready(h);assert.equal(h.requests.length,0);assert.equal(h.state.storageReads.length,0);assert.equal(h.text(),'');h.unmount();
  }
 });
 await test('UTC day rollover retires old undo, uses fresh own key and fetches again without renewing stored provenance',async()=>{
  const h=create();h.state.send=()=>reply(body([row()]));await ready(h);h.click('Descartar por hoy');const old=h.state.card,key=scopeKey(h),writes=h.state.storageWrites.length;
  h.advance(86400000);await ready(h);assert(h.text().includes('ES first_generation'));assert.equal(h.requests.length,2);assert(h.state.storageReads.at(-1).endsWith('_2026-10-12'));
  old.undo();old.dismiss('first_generation');assert.equal(h.state.storageWrites.length,writes);assert.deepEqual(JSON.parse(h.storage.get(key)),['first_generation']);h.unmount();
 });
 console.log('PASS: next action client '+passed+' contracts');
}
module.exports={create,row,body,ready,scopeKey,ids};
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
