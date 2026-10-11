'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{load}=require('./route-harness.cjs'),{deferred,flush}=require('./chat-widget-harness.cjs');
module.exports=async(prisma,results)=>{
 const users=[],teams=[],running=[],gates=[];
 async function fixture(){
  const people=[];for(let i=0;i<3;i++){const u=await prisma.user.create({data:{email:'member-'+randomUUID()+'@example.invalid'}});users.push(u.id);people.push(u);}
  const team=await prisma.team.create({data:{name:'Synthetic members',slug:'member-'+randomUUID()}});teams.push(team.id);
  const members=[];for(let i=0;i<3;i++)members.push(await prisma.teamMember.create({data:{teamId:team.id,userId:people[i].id,role:['owner','admin','member'][i]}}));
  return{team,people,members};
 }
 function bind(f,options={}){
  let now=1000,n=0;const timers=new Map(),entered=deferred(),gate=deferred(),effects=[];
  gates.push(gate);
  const actor=f.people[options.actor??0],target=f.members[options.target??2],operation=options.remove?'remove':'role',key=options.key??randomUUID();
  const body={teamId:f.team.id,memberId:target.id,targetUserId:target.userId,previousRole:target.role,role:options.remove?null:'admin',...options.body};
  const hold=async stage=>{if(options.held===stage){entered.resolve();await gate.promise;}};
  const transaction=async(fn,settings)=>{const index=++n;const result=await prisma.$transaction(async tx=>fn({
   $queryRawUnsafe:tx.$queryRawUnsafe.bind(tx),
   teamMemberMutationAttempt:{findFirst:tx.teamMemberMutationAttempt.findFirst.bind(tx.teamMemberMutationAttempt),findUnique:tx.teamMemberMutationAttempt.findUnique.bind(tx.teamMemberMutationAttempt),create:tx.teamMemberMutationAttempt.create.bind(tx.teamMemberMutationAttempt),updateMany:q=>options.noMark?{count:0}:tx.teamMemberMutationAttempt.updateMany(q)},
   teamMember:{updateMany:async q=>{const r=options.noEffect?{count:0}:await tx.teamMember.updateMany(q);await hold('mutate');return r;},deleteMany:async q=>{const r=options.noEffect?{count:0}:await tx.teamMember.deleteMany(q);await hold('mutate');return r;}}
  }),settings);await hold(index===1?'admission-ack':'completion-ack');if(index===2&&options.ackFail)throw Error('Private lost committed acknowledgement');return result;};
  const helper=load('lib/team-member-mutation.ts',{'node:crypto':require('node:crypto'),'@/lib/prisma':{prisma:{$transaction:transaction}}});
  const route=load('app/api/team/members/route.ts',{'next/server':{NextResponse:Response},'@/auth':{auth:async()=>({user:await prisma.user.findUnique({where:{id:actor.id},select:{id:true,email:true}})})},'@/lib/team-member-mutation':{...helper,mutateTeamMemberOriginal(...args){const p=helper.mutateTeamMemberOriginal(...args);effects.push(p);running.push(p);return p;}}},{performance:{now:()=>now},setTimeout(fn,ms){const id=timers.size+1;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id)});
  const original=route[options.remove?'DELETE':'PATCH'](new Request('https://example.invalid/api/team/members',{method:options.remove?'DELETE':'PATCH',headers:{'content-type':'application/json','Idempotency-Key':key},body:JSON.stringify(body)}));
  async function observe(status){const r=await original;assert.equal(r.status,status);assert.equal(r.headers.get('cache-control'),'no-store');const b=await r.json();if(status===503)assert.deepEqual(b,{error:'member_mutation_unconfirmed'});return b;}
  return{original,actor,key,body,entered,observe,advance(){now+=55000;for(const[id,t]of [...timers])if(t.at<=now){timers.delete(id);t.fn();}},async finish(){gate.resolve();await Promise.all(effects);await flush();}};
 }
 const row=x=>prisma.teamMemberMutationAttempt.findUnique({where:{userId_key:{userId:x.actor.id,key:x.key}}});
 const baseline={history:await prisma.optimizeHistory.count(),optimize:await prisma.optimizeUpdateAttempt.count(),invites:await prisma.teamInvitation.count(),creations:await prisma.teamCreationAttempt.count(),admissions:await prisma.teamMemberMutationAttempt.count(),users:await prisma.user.count(),teams:await prisma.team.count(),members:await prisma.teamMember.count()};
 try{
  for(const remove of [false,true]){const f=await fixture(),x=bind(f,{remove}),ack=await x.observe(200);assert.deepEqual(ack,{ok:true,userId:x.actor.id,email:x.actor.email,key:x.key,operation:remove?'remove':'role',...x.body,status:remove?'removed':'updated'});assert.equal((await row(x)).state,'complete');const target=await prisma.teamMember.findUnique({where:{id:x.body.memberId}});if(remove)assert.equal(target,null);else assert.equal(target.role,'admin');await bind(f,{remove,key:x.key}).observe(503);assert.equal(await prisma.teamMemberMutationAttempt.count({where:{teamId:f.team.id}}),1);results.push('Member native exact '+(remove?'remove':'role')+' atomic completion and no independent replay');
   if(remove){await prisma.team.delete({where:{id:f.team.id}});assert.equal((await row(x)).state,'complete');assert.equal((await row(x)).teamId,f.team.id);results.push('Member native ledger survives target and team deletion without granting recovery');}
  }
  {const f=await fixture(),key=randomUUID(),xs=Array.from({length:3},()=>bind(f,{key})),responses=await Promise.all(xs.map(x=>x.original));assert.equal(responses.filter(r=>r.status===200).length,1);assert(responses.every(r=>r.status===200||r.status===503));assert.equal(await prisma.teamMemberMutationAttempt.count({where:{teamId:f.team.id}}),1);assert.equal((await prisma.teamMember.findUnique({where:{id:f.members[2].id}})).role,'admin');results.push('Member native three independently loaded same-key originals produce one effect');}
  {const f=await fixture(),x=bind(f,{held:'admission-ack'});await x.entered.promise;await bind(f,{actor:1,remove:true}).observe(503);await bind(f,{key:randomUUID()}).observe(503);assert.equal(await prisma.teamMemberMutationAttempt.count({where:{teamId:f.team.id}}),1);await x.finish();await x.observe(200);results.push('Member native pending team admission excludes other actor/key/operation without takeover');}
  for(const remove of [false,true])for(const held of ['admission-ack','mutate','completion-ack']){
   const f=await fixture(),x=bind(f,{held,remove});await x.entered.promise;x.advance();await x.observe(503);await x.finish();assert.equal((await row(x)).state,held==='admission-ack'?'pending':'complete');const target=await prisma.teamMember.findUnique({where:{id:f.members[2].id}});if(held==='admission-ack')assert.equal(target.role,'member');else if(remove)assert.equal(target,null);else assert.equal(target.role,'admin');await bind(f,{key:x.key,remove}).observe(503);if(held==='admission-ack')await bind(f,{key:randomUUID(),remove}).observe(503);results.push('Member native '+(remove?'remove':'role')+' '+held+' timeout retains only original atomic SQL and durable denial');
  }
  for(const remove of [false,true])for(const fault of ['noEffect','noMark','ackFail']){
   const f=await fixture(),x=bind(f,{remove,[fault]:true});await x.observe(503);assert.equal((await row(x)).state,fault==='ackFail'?'complete':'pending');const target=await prisma.teamMember.findUnique({where:{id:f.members[2].id}});if(fault==='ackFail'&&remove)assert.equal(target,null);else assert.equal(target.role,fault==='ackFail'?'admin':'member');await bind(f,{remove,key:x.key}).observe(503);results.push('Member native '+(remove?'remove':'role')+' '+fault+' proves rollback/committed-ack uncertainty without replay');
  }
  for(const remove of [false,true]){
   const f=await fixture(),x=bind(f,{remove,held:'mutate'});await x.entered.promise;
   const legacy=prisma.teamMember.update({where:{id:f.members[0].id},data:{role:'member'}});let finished=false;
   const terminal=legacy.then(()=>{finished=true;});running.push(terminal);
   let blocked=false;
   for(let i=0;i<100&&!blocked;i++){
    blocked=(await prisma.$queryRawUnsafe("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND state='active' AND wait_event_type='Lock' AND query LIKE '%team_members%'"))[0].n>0;
    if(!blocked)await new Promise(resolve=>setTimeout(resolve,5));
   }
   assert(blocked,'Legacy member change must actually wait on native row lock');assert.equal(finished,false);
   await x.finish();await x.observe(200);await terminal;assert.equal((await row(x)).state,'complete');assert.equal((await prisma.teamMember.findUnique({where:{id:f.members[0].id}})).role,'member');
   results.push('Member native '+(remove?'remove':'role')+' holds actor/target permission locks through atomic effect against legacy writer');
  }
  for(const change of ['email','actor-role','actor-membership','target-role','target-user','target-delete']){
   const f=await fixture(),x=bind(f,{held:'admission-ack'});await x.entered.promise;
   if(change==='email')await prisma.user.update({where:{id:f.people[0].id},data:{email:'changed-'+randomUUID()+'@example.invalid'}});
   if(change==='actor-role')await prisma.teamMember.update({where:{id:f.members[0].id},data:{role:'admin'}});
   if(change==='actor-membership'){await prisma.teamMember.delete({where:{id:f.members[0].id}});await prisma.teamMember.create({data:{teamId:f.team.id,userId:f.people[0].id,role:'owner'}});}
   if(change==='target-role')await prisma.teamMember.update({where:{id:f.members[2].id},data:{role:'admin'}});
   if(change==='target-user'){await prisma.teamMember.delete({where:{id:f.members[1].id}});await prisma.teamMember.update({where:{id:f.members[2].id},data:{userId:f.people[1].id}});}
   if(change==='target-delete')await prisma.teamMember.delete({where:{id:f.members[2].id}});
   await x.finish();await x.observe(503);assert.equal((await row(x)).state,'pending');const target=await prisma.teamMember.findUnique({where:{id:f.members[2].id}});if(change==='target-delete')assert.equal(target,null);else assert.equal(target.role,change==='target-role'?'admin':'member');results.push('Member native changed '+change+' between transactions cannot redirect original authority');
  }
  for(const options of [{actor:1},{actor:1,remove:true,target:1},{body:{targetUserId:'foreign'}},{body:{teamId:'foreign'}},{body:{previousRole:'admin',role:'member'}},{body:{targetUserId:null}}]){
   const f=await fixture(),x=bind(f,options),r=await x.original;assert([400,403,404,409].includes(r.status));assert.equal(await prisma.teamMemberMutationAttempt.count({where:{teamId:f.team.id}}),0);assert.equal((await prisma.teamMember.findUnique({where:{id:f.members[2].id}})).role,'member');results.push('Member native pre-effect permission or stale exact scope '+JSON.stringify(options));
  }
  {const f=await fixture(),x=bind(f,{actor:1,remove:true});await x.observe(200);assert.equal(await prisma.teamMember.findUnique({where:{id:f.members[2].id}}),null);assert.equal((await row(x)).actorRole,'admin');results.push('Member native admin removes member with captured own membership permission');}
  assert.equal(await prisma.optimizeHistory.count(),baseline.history);assert.equal(await prisma.optimizeUpdateAttempt.count(),baseline.optimize);assert.equal(await prisma.teamInvitation.count(),baseline.invites);assert.equal(await prisma.teamCreationAttempt.count(),baseline.creations);results.push('Member native does not touch history, other admissions, invitations or communications');
 }finally{
  for(const gate of gates)gate.resolve();await Promise.all(running);for(const team of teams)await prisma.team.deleteMany({where:{id:team}});for(const user of users)await prisma.user.deleteMany({where:{id:user}});
 }
 for(const[name,expected]of Object.entries({users:baseline.users,teams:baseline.teams,members:baseline.members,admissions:baseline.admissions})){const model={users:prisma.user,teams:prisma.team,members:prisma.teamMember,admissions:prisma.teamMemberMutationAttempt}[name];assert.equal(await model.count(),expected);}
 results.push('Member native cleanup only own fixture IDs preserves pre-existing rows/admissions');
};
