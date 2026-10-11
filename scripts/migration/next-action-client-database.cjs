'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {create,ready,ids}=require('./next-action-client.test.cjs'),{fixture,channelId,videoId,flush,deferred}=require('./next-action-fixture.cjs');
module.exports=async(prisma,results)=>{
 const ownerIds=[],cards=[],fixtures=[],gates=[],running=[];
 const models=['user','youtubeToken','generation','subscription','videoSeoScore','trackedCompetitor','bestTimeAnalysis','trendAlert','calendarEntry','abTest','dailyIdea'];
 const counts=async()=>Object.fromEntries(await Promise.all(models.map(async m=>[m,await prisma[m].count()])));
 const baseline=await counts(),today=new Date().toISOString().slice(0,10);
 const createCard=(owner,options={})=>{
  const h=create({storage:options.storage});cards.push(h);h.state.user=owner.id;h.state.email=owner.email;
  h.state.send=request=>{
   const f=fixture({prisma,owner:{id:request.owner,email:request.email},oauth:true,...options.server});
   fixtures.push(f);const entry={fixture:f,jsonReads:0,owner:request.owner};(h.state.observed??=[]).push(entry);
   const p=(async()=>{
    const response=await f.original,data=await response.json();
    entry.status=response.status;entry.data=data;
    if(options.held==='headers'){options.entered.resolve();await options.gate.promise;}
    return{ok:response.ok,status:response.status,json:async()=>{
     entry.jsonReads++;if(options.held==='body'){options.entered.resolve();await options.gate.promise;}return data;
    }};
   })();running.push(p);void p.catch(()=>{});return p;
  };return h;
 };
 const settled=async()=>{for(const f of fixtures)await f.settle();await Promise.allSettled(running);await flush();};
 const eventual=async(fn)=>{for(let i=0;i<500;i++){await flush();if(fn())return;await new Promise(r=>setTimeout(r,2));}throw Error('Native client did not settle');};
 const loaded=async h=>{h.view();await eventual(()=>{h.view();return h.state.card.loaded||h.state.card.error;});assert(h.state.card.loaded&&!h.state.card.error);};
 const completed=async h=>{await eventual(()=>{h.view();return !h.state.card.loading;});};
 const note=t=>results.push('Next action client native '+t);
 try{
  const users=await Promise.all([1,2].map(i=>prisma.user.create({data:{email:'next-client-'+randomUUID()+'@example.invalid',name:'Synthetic next card '+i,password:'NEVER_PUBLIC'}})));ownerIds.push(...users.map(u=>u.id));
  const owner=users[0],foreign=users[1];
  for(const u of users)await prisma.youtubeToken.create({data:{userId:u.id,channelId,videoCount:'4',accessToken:'SYNTHETIC_TOKEN',refreshToken:'SYNTHETIC_REFRESH',expiresAt:new Date(Date.now()+3600000)}});
  await prisma.subscription.create({data:{userId:owner.id,status:'active',plan:'pro',stripeCustomerId:'synthetic-next-client-'+randomUUID()}});
  await prisma.dailyIdea.create({data:{userId:owner.id,date:today,ideas:[{title_es:'IDEA_PROPIA',title_en:'OWN_IDEA'}]}});
  await prisma.dailyIdea.create({data:{userId:foreign.id,date:today,ideas:[{title_es:'IDEA_AJENA',title_en:'FOREIGN_IDEA'}]}});
  await prisma.generation.create({data:{userId:foreign.id,template:'title',inputs:{},output:'FOREIGN_SECRET',tokensUsed:0}});
  await prisma.videoSeoScore.create({data:{userId:owner.id,videoId,score:35,checklist:[]}});
  const seeded=await counts();
  {
   const h=createCard(owner);await loaded(h);assert(ids(h).includes('start_ab_test'));assert(!JSON.stringify(h.state.card.rows).includes('FOREIGN'));assert(!h.text().includes('NEVER_PUBLIC'));assert(!JSON.stringify(h.state.card.rows).includes('SYNTHETIC_TOKEN'));
   h.click('Descartar por hoy');assert(h.state.card.skipped.includes('first_generation'));assert.equal(h.state.storageWrites.length,1);h.click('Deshacer');assert.equal(h.state.card.skipped.length,0);assert.equal(h.state.storageWrites.length,2);
   assert.equal(h.state.observed[0].fixture.calls.filter(c=>c.name==='user').length,1);assert.equal(h.state.observed[0].fixture.calls.filter(c=>c.name==='google').length,1);assert.equal(h.requests[0].init.cache,'no-store');assert.deepEqual(await counts(),seeded);h.unmount();
   note('actual card decodes full paid catalog from real owned SQL/mock Google; canonical dismiss/undo writes only own local preference, never SQL/token/foreign data');
  }
  {
   const h=createCard(owner);await loaded(h);await prisma.subscription.update({where:{userId:owner.id},data:{status:'canceled'}});h.state.card.refresh();await completed(h);assert(!ids(h).includes('start_ab_test'));assert(h.state.card.loaded&&!h.state.card.error);await prisma.subscription.update({where:{userId:owner.id},data:{status:'active'}});h.unmount();
   note('refresh uses current actual canceled subscription, removes paid-only action and retains no prior entitlement');
  }
  {
   const h=createCard(owner);await loaded(h);const snapshot=JSON.stringify(h.state.card.rows);
   h.state.send=request=>{
    const f=fixture({prisma,owner:{id:request.owner,email:request.email},oauth:true,reject:'generation'});fixtures.push(f);
    const p=f.original.then(async response=>({ok:response.ok,status:response.status,json:()=>response.json()}));running.push(p);return p;
   };
   h.state.card.refresh();await completed(h);assert(h.text().includes('Reintentar'));assert.equal(JSON.stringify(h.state.card.rows),snapshot);assert.equal(h.state.card.error,true);
   const originalSend=createCard(owner).state.send;h.state.send=originalSend;h.click('Reintentar');await completed(h);assert(!h.state.card.error);assert.deepEqual(await counts(),seeded);h.unmount();
   note('failed real generation SQL acknowledgement returns503; refresh preserves last owned catalog, retry follows original failure once without fabricating empty absence');
  }
  for(const field of ['id','email'])for(const held of ['headers','body']){
   const gate=deferred(),entered=deferred();gates.push(gate);const h=createCard(owner,{held,gate,entered});h.view();await entered.promise;
   const old=h.state.card;if(field==='id')h.state.user=foreign.id;else h.state.email=foreign.email;
   assert.equal(h.text(h.view(true)),'');old.dismiss('first_generation');old.undo();old.navigate(1);
   gate.resolve();await settled();assert.equal(h.text(h.view(true)),'');assert.equal(h.state.observed[0].jsonReads,held==='headers'?0:1);assert.equal(h.state.storageWrites.length,0);
   h.state.user=foreign.id;h.state.email=foreign.email;const newCard=createCard(foreign);h.state.send=newCard.state.send;await loaded(h);
   assert(!ids(h).includes('first_generation'));assert(!ids(h).includes('start_ab_test'));assert(JSON.stringify(h.state.card.rows).includes('IDEA_AJENA'));assert(!JSON.stringify(h.state.card.rows).includes('IDEA_PROPIA'));h.unmount();newCard.unmount();assert.deepEqual(await counts(),seeded);
   note(field+' changes before effects hide original '+held+' SQL reply and captured preferences; next full foreign identity loads only its own Free catalog');
  }
  for(const held of ['headers','body'])for(const action of ['logout','unmount','timeout']){
   const gate=deferred(),entered=deferred();gates.push(gate);const h=createCard(owner,{held,gate,entered});h.view();await entered.promise;const parent=h.state.actionWrites.length;
   if(action==='logout'){h.state.auth='unauthenticated';h.view(true);}else if(action==='unmount')h.unmount();else h.advance(30000);
   await flush();if(action==='timeout'){assert(h.text().includes('Reintentar'));assert(h.requests[0].init.signal.aborted);}
   gate.resolve();await settled();
   if(action!=='unmount'){assert(!h.text().includes('ES'));assert(!h.text().includes('IDEA_PROPIA'));h.unmount();}
   assert.equal(h.state.observed[0].jsonReads,held==='headers'?0:1);if(action==='unmount')assert.equal(h.state.actionWrites.length,parent);assert.equal(h.state.storageWrites.length,0);assert.deepEqual(await counts(),seeded);
   note(held+'/'+action+' original SQL/mock provider ack settles once after client retirement; no late catalog, parsing, parent/storage side effect or query replay');
  }
  {
   const storage=new Map(),h=createCard(owner,{storage});await loaded(h);h.click('Descartar por hoy');const key=h.state.storageWrites[0].key;h.unmount();
   const reloaded=createCard(owner,{storage});await loaded(reloaded);assert(!reloaded.text().includes('ES first_generation'));assert(reloaded.state.card.skipped.includes('first_generation'));assert.equal(reloaded.state.storageWrites.length,0);
   const other=createCard(foreign,{storage});await loaded(other);assert.equal(other.state.card.skipped.length,0);assert.equal(storage.get(key),'["first_generation"]');reloaded.unmount();other.unmount();assert.deepEqual(await counts(),seeded);
   note('real SQL reload reuses only exact owned UTC-day dismissal; foreign identity cannot inherit, overwrite or migrate accountless preference');
  }
  for(const field of ['id','email']){
   const server={session:{user:{id:owner.id,email:owner.email,[field]:foreign[field]}}},h=createCard(owner,{server});
   h.view();await eventual(()=>{h.view();return h.state.card.error;});assert(!h.state.card.loaded);assert(h.text().includes('Reintentar'));assert.deepEqual(h.state.observed[0].fixture.calls.map(c=>c.name),['auth','user']);h.unmount();assert.deepEqual(await counts(),seeded);
   note('actual server rejects '+field+' identity discordance before plans/signals; actual card renders explicit retry and no action');
  }
 }finally{
  for(const gate of gates)gate.resolve();for(const h of cards)h.unmount();await settled();await prisma.user.deleteMany({where:{id:{in:ownerIds}}});assert.deepEqual(await counts(),baseline);
 }
};
