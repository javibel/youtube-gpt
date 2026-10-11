'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{load}=require('./route-harness.cjs'),{deferred,flush}=require('./chat-widget-harness.cjs');
module.exports=async(prisma,results)=>{
 const users=[],teams=[],running=[],gates=[];
 const baseline={users:await prisma.user.count(),teams:await prisma.team.count(),members:await prisma.teamMember.count(),invitations:await prisma.teamInvitation.count(),revocations:await prisma.teamInvitationRevocationAttempt.count(),membersAdmissions:await prisma.teamMemberMutationAttempt.count(),history:await prisma.optimizeHistory.count(),creations:await prisma.teamCreationAttempt.count()};
 async function fixture(){
  const people=[];for(let i=0;i<3;i++){const u=await prisma.user.create({data:{email:'revoke-'+randomUUID()+'@example.invalid'}});users.push(u.id);people.push(u);}
  const team=await prisma.team.create({data:{name:'Synthetic revocation',slug:'revoke-'+randomUUID()}});teams.push(team.id);
  const members=[];for(let i=0;i<3;i++)members.push(await prisma.teamMember.create({data:{teamId:team.id,userId:people[i].id,role:['owner','admin','member'][i]}}));
  const invitation=await prisma.teamInvitation.create({data:{teamId:team.id,email:'selected-'+randomUUID()+'@example.invalid',role:'member',token:randomUUID(),expiresAt:new Date('2099-01-01')}});
  return{people,team,members,invitation};
 }
 function bind(f,options={}){
  let now=1000,n=0;const timers=new Map(),entered=deferred(),gate=deferred(),effects=[];gates.push(gate);
  const actor=f.people[options.actor??0],key=options.key??randomUUID(),body={teamId:f.team.id,invitationId:f.invitation.id,targetEmail:f.invitation.email,previousRole:f.invitation.role,previousExpiresAt:f.invitation.expiresAt.toISOString(),...options.body};
  const hold=async stage=>{if(options.held===stage){entered.resolve();await gate.promise;}};
  const transaction=async(fn,settings)=>{const index=++n;const result=await prisma.$transaction(async tx=>fn({
   $queryRawUnsafe:tx.$queryRawUnsafe.bind(tx),
   teamMemberMutationAttempt:tx.teamMemberMutationAttempt,
   teamInvitationRevocationAttempt:{findFirst:tx.teamInvitationRevocationAttempt.findFirst.bind(tx.teamInvitationRevocationAttempt),findUnique:tx.teamInvitationRevocationAttempt.findUnique.bind(tx.teamInvitationRevocationAttempt),create:tx.teamInvitationRevocationAttempt.create.bind(tx.teamInvitationRevocationAttempt),updateMany:q=>options.noMark?{count:0}:tx.teamInvitationRevocationAttempt.updateMany(q)},
   teamInvitation:{deleteMany:async q=>{const r=options.noEffect?{count:0}:await tx.teamInvitation.deleteMany(q);await hold('mutate');return r;}}
  }),settings);await hold(index===1?'admission-ack':'completion-ack');if(index===2&&options.ackFail)throw Error('Private lost committed acknowledgement');return result;};
  const helper=load('lib/team-invitation-revocation.ts',{'node:crypto':require('node:crypto'),'@/lib/prisma':{prisma:{$transaction:transaction}}});
  const route=load('app/api/team/invite/route.ts',{'next/server':{NextResponse:Response},'@/auth':{auth:async()=>({user:await prisma.user.findUnique({where:{id:actor.id},select:{id:true,email:true}})})},'@/lib/prisma':{prisma},crypto:require('node:crypto'),'@/lib/send-email':{sendTransactionalEmail(){throw Error('No email');}},'@/lib/team-invitation-revocation':{...helper,revokeInvitationOriginal(...args){const p=helper.revokeInvitationOriginal(...args);effects.push(p);running.push(p);return p;}}},{performance:{now:()=>now},setTimeout(fn,ms){const id=timers.size+1;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id)});
  const original=route.DELETE(new Request('https://example.invalid/api/team/invite',{method:'DELETE',headers:{'content-type':'application/json','Idempotency-Key':key},body:JSON.stringify(body)}));running.push(original);
  async function observe(status){const r=await original;assert.equal(r.status,status);assert.equal(r.headers.get('cache-control'),'no-store');const b=await r.json();if(status===503)assert.deepEqual(b,{error:'invitation_revocation_unconfirmed'});return b;}
  return{original,actor,key,body,entered,observe,advance(){now+=55000;for(const[id,t]of [...timers])if(t.at<=now){timers.delete(id);t.fn();}},async finish(){gate.resolve();await Promise.all(effects);await flush();}};
 }
 const row=x=>prisma.teamInvitationRevocationAttempt.findUnique({where:{userId_key:{userId:x.actor.id,key:x.key}}});
 function member(f,options={}){
  const actor=f.people[options.actor??0],target=f.members[2],key=options.key??randomUUID(),helper=load('lib/team-member-mutation.ts',{'node:crypto':require('node:crypto'),'@/lib/prisma':{prisma}});
  const gate=deferred(),entered=deferred();gates.push(gate);let n=0;
  const bound=options.held?load('lib/team-member-mutation.ts',{'node:crypto':require('node:crypto'),'@/lib/prisma':{prisma:{$transaction:async(fn,settings)=>{const i=++n,result=await prisma.$transaction(fn,settings);if(i===1){entered.resolve();await gate.promise;}return result;}}}}):helper;
  const p=bound.mutateTeamMemberOriginal({userId:actor.id,email:actor.email},{teamId:f.team.id,memberId:target.id,targetUserId:target.userId,previousRole:target.role,role:options.remove?null:'admin'},key,options.remove?'remove':'role',()=>{});running.push(p);
  return{p,key,entered,finish(){gate.resolve();return p;}};
 }
 try{
  for(const actor of [0,1]){const f=await fixture(),x=bind(f,{actor}),ack=await x.observe(200);assert.deepEqual(ack,{ok:true,userId:x.actor.id,email:x.actor.email,key:x.key,operation:'revoke',...x.body,status:'revoked'});assert.equal(await prisma.teamInvitation.findUnique({where:{id:f.invitation.id}}),null);assert.equal((await row(x)).state,'complete');assert(!JSON.stringify(ack).includes(f.invitation.token));await bind(f,{key:x.key,actor}).observe(503);assert.equal(await prisma.teamInvitationRevocationAttempt.count({where:{teamId:f.team.id}}),1);results.push('Revoke native '+(actor?'admin':'owner')+' exact original DELETE atomic completion, token-free selected acknowledgement and no replay');}
  {const f=await fixture(),key=randomUUID(),xs=Array.from({length:3},()=>bind(f,{key})),responses=await Promise.all(xs.map(x=>x.original));assert.equal(responses.filter(r=>r.status===200).length,1);assert(responses.every(r=>[200,503].includes(r.status)));assert.equal(await prisma.teamInvitationRevocationAttempt.count({where:{teamId:f.team.id}}),1);results.push('Revoke native independently loaded same-key originals produce one deletion');}
  {const f=await fixture(),x=bind(f,{held:'admission-ack'});await x.entered.promise;await bind(f,{actor:1}).observe(503);await bind(f,{key:randomUUID()}).observe(503);assert.equal(await prisma.teamInvitationRevocationAttempt.count({where:{teamId:f.team.id}}),1);await x.finish();await x.observe(200);results.push('Revoke native pending team admission excludes other actor/key without takeover');}
  for(const held of ['admission-ack','mutate','completion-ack']){const f=await fixture(),x=bind(f,{held});await x.entered.promise;x.advance();await x.observe(503);await x.finish();assert.equal((await row(x)).state,held==='admission-ack'?'pending':'complete');assert.equal(!!await prisma.teamInvitation.findUnique({where:{id:f.invitation.id}}),held==='admission-ack');await bind(f,{key:x.key}).observe(503);if(held==='admission-ack')await bind(f,{key:randomUUID()}).observe(503);results.push('Revoke native '+held+'55s retires HTTP observer, preserves only original atomic SQL and durable denial');}
  for(const fault of ['noEffect','noMark','ackFail']){const f=await fixture(),x=bind(f,{[fault]:true});await x.observe(503);assert.equal((await row(x)).state,fault==='ackFail'?'complete':'pending');assert.equal(!!await prisma.teamInvitation.findUnique({where:{id:f.invitation.id}}),fault!=='ackFail');await bind(f,{key:x.key}).observe(503);results.push('Revoke native '+fault+' proves rollback or committed-ack uncertainty without repetition');}
  for(const table of ['actor','invitation']){
   const f=await fixture(),x=bind(f,{held:'mutate'});await x.entered.promise;let finished=false;
   const legacy=(table==='actor'?prisma.teamMember.update({where:{id:f.members[0].id},data:{role:'member'}}):prisma.teamInvitation.deleteMany({where:{id:f.invitation.id}})).then(()=>{finished=true;});running.push(legacy);
   let blocked=false;for(let i=0;i<100&&!blocked;i++){blocked=(await prisma.$queryRawUnsafe("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND state='active' AND wait_event_type='Lock' AND query LIKE '%"+(table==='actor'?'team_members':'team_invitations')+"%'"))[0].n>0;if(!blocked)await new Promise(resolve=>setTimeout(resolve,5));}
   assert(blocked,'Native legacy writer actually waits on owned row lock');assert.equal(finished,false);await x.finish();await x.observe(200);await legacy;assert.equal((await row(x)).state,'complete');results.push('Revoke native '+table+' permission/target row lock excludes legacy writer through effect and atomic completion');
  }
  for(const change of ['email','actor-role','actor-membership','target-email','target-role','target-expiry','target-delete','target-team']){
   const f=await fixture(),x=bind(f,{held:'admission-ack'});await x.entered.promise;
   if(change==='email')await prisma.user.update({where:{id:f.people[0].id},data:{email:'changed-'+randomUUID()+'@example.invalid'}});
   if(change==='actor-role')await prisma.teamMember.update({where:{id:f.members[0].id},data:{role:'admin'}});
   if(change==='actor-membership'){await prisma.teamMember.delete({where:{id:f.members[0].id}});await prisma.teamMember.create({data:{teamId:f.team.id,userId:f.people[0].id,role:'owner'}});}
   if(change==='target-email')await prisma.teamInvitation.update({where:{id:f.invitation.id},data:{email:'changed-'+randomUUID()+'@example.invalid'}});
   if(change==='target-role')await prisma.teamInvitation.update({where:{id:f.invitation.id},data:{role:'admin'}});
   if(change==='target-expiry')await prisma.teamInvitation.update({where:{id:f.invitation.id},data:{expiresAt:new Date('2098-01-01')}});
   if(change==='target-delete')await prisma.teamInvitation.delete({where:{id:f.invitation.id}});
   if(change==='target-team'){const other=await prisma.team.create({data:{name:'Other synthetic team',slug:'other-'+randomUUID()}});teams.push(other.id);await prisma.teamInvitation.update({where:{id:f.invitation.id},data:{teamId:other.id}});}
   await x.finish();await x.observe(503);assert.equal((await row(x)).state,'pending');assert.equal(!!await prisma.teamInvitation.findUnique({where:{id:f.invitation.id}}),change!=='target-delete');results.push('Revoke native changed '+change+' between transactions cannot redirect original scope/permission');
  }
  for(const options of [{actor:2},{body:{teamId:'foreign'}},{body:{targetEmail:'foreign@example.invalid'}},{body:{previousRole:'admin'}},{body:{previousExpiresAt:'2098-01-01T00:00:00.000Z'}},{body:{invitationId:null}}]){const f=await fixture(),x=bind(f,options),r=await x.original;assert([400,403,404,409].includes(r.status));assert.equal(await prisma.teamInvitationRevocationAttempt.count({where:{teamId:f.team.id}}),0);assert(await prisma.teamInvitation.findUnique({where:{id:f.invitation.id}}));results.push('Revoke native pre-effect permission/stale selected target '+JSON.stringify(options));}
  {const f=await fixture(),x=bind(f,{held:'admission-ack'});await x.entered.promise;for(const remove of [false,true]){const y=member(f,{remove});assert.equal((await y.p).status,503);assert.equal(await prisma.teamMemberMutationAttempt.count({where:{teamId:f.team.id}}),0);}await x.finish();await x.observe(200);results.push('Revoke native pending revocation denies independently loaded role and removal originals under shared team lock');}
  {const f=await fixture(),y=member(f,{held:true});await y.entered.promise;await bind(f).observe(503);assert.equal(await prisma.teamInvitationRevocationAttempt.count({where:{teamId:f.team.id}}),0);await y.finish();assert.equal((await y.p).ok,true);results.push('Revoke native pending member original denies independently loaded revocation without interleaving or takeover');}
  {const f=await fixture(),x=bind(f);await x.observe(200);assert.equal((await member(f,{key:x.key}).p).status,503);assert.equal(await prisma.teamMemberMutationAttempt.count({where:{teamId:f.team.id}}),0);results.push('Revoke native completed revocation key cannot be reused as member operation');}
  {const f=await fixture(),y=member(f);assert.equal((await y.p).ok,true);await bind(f,{key:y.key}).observe(503);assert.equal(await prisma.teamInvitationRevocationAttempt.count({where:{teamId:f.team.id}}),0);results.push('Revoke native completed member key cannot be reused as revocation');}
  {const f=await fixture(),x=bind(f);await x.observe(200);await prisma.team.delete({where:{id:f.team.id}});assert.equal((await row(x)).state,'complete');assert.equal((await row(x)).invitationId,f.invitation.id);results.push('Revoke native admission survives invitation/team deletion and never grants recovery');}
  assert.equal(await prisma.optimizeHistory.count(),baseline.history);assert.equal(await prisma.teamCreationAttempt.count(),baseline.creations);results.push('Revoke native fixtures preserve unrelated history/creation admissions; no email/models/OAuth');
 }finally{for(const gate of gates)gate.resolve();await Promise.all(running);for(const team of teams)await prisma.team.deleteMany({where:{id:team}});for(const user of users)await prisma.user.deleteMany({where:{id:user}});}
 for(const[name,expected]of Object.entries(baseline)){const model={users:prisma.user,teams:prisma.team,members:prisma.teamMember,invitations:prisma.teamInvitation,revocations:prisma.teamInvitationRevocationAttempt,membersAdmissions:prisma.teamMemberMutationAttempt,history:prisma.optimizeHistory,creations:prisma.teamCreationAttempt}[name];assert.equal(await model.count(),expected);}
 results.push('Revoke native cleanup by own fixture IDs preserves pre-existing rows/admissions');
};
