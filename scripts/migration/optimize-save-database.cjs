'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{load}=require('./route-harness.cjs'),{harness:getServer}=require('./optimize-get-server.test.cjs'),putServer=require('./optimize-admission-fixture.cjs'),putTest=require('./optimize-put-server.test.cjs'),client=require('./optimize-save-client.test.cjs'),read=require('./optimize-read-client.test.cjs'),{deferred,flush}=require('./chat-widget-harness.cjs');
module.exports=async(prisma,results)=>{
 const users=[],pages=[],owners=[];
 async function owner(plan='pro',token=true){const u=await prisma.user.create({data:{email:'optimize-save-'+randomUUID()+'@example.invalid'}});users.push(u.id);owners.push(u);await prisma.subscription.create({data:{userId:u.id,plan,status:plan==='free'?'canceled':'active'}});if(token)await prisma.youtubeToken.create({data:{userId:u.id,accessToken:'synthetic-token',refreshToken:null,expiresAt:new Date('2026-11-01T00:00:00Z'),channelId:'UC_synthetic'}});return u;}
 const plans=load('lib/plans.ts',{'@/lib/prisma':{prisma}});
 function bind(u,options={}){
  const h=client.create();h.state.user=u.id;h.state.email=u.email;pages.push(h);const originals=[],pending=[],puts=[],reads=[],entered=deferred();let published=null,detailCount=0;
  h.state.send=r=>{
   const p=(async()=>{
    if(r.init.method==='POST'){
     const route=load('app/api/youtube/optimize/route.ts',{'next/server':{NextResponse:Response},'@/auth':{auth:async()=>({user:{id:r.owner,email:r.email}})},'@/lib/prisma':{prisma},'@/lib/youtube-auth':{getAccessToken:()=>{throw Error('No token used by score POST');}},'@/lib/plans':{getUserPlan:()=>{throw Error('No plan used by score POST');},isPaid:()=>false},'@/lib/ai/task-runtime':{getMessagesTask:()=>{throw Error('No model permitted');}}});
     const response=await route.POST(new Request('https://example.invalid/api/youtube/optimize',{method:'POST',body:JSON.stringify(r.body)}));return{ok:response.ok,status:response.status,json:()=>response.json()};
    }
    let native;
    if(r.init.method==='PUT'){
     native=putServer(prisma,u,{input:r.body,key:r.init.headers['Idempotency-Key'],beforePublication:body=>{published=body;},...options.server});puts.push(native);
    }else{
     const id=new URL(r.url,'https://example.invalid').searchParams.get('videoId');if(id!==null)detailCount++;
     native=getServer({userId:u.id,email:u.email,detail:id!==null,videoId:id??undefined,realToken:true,authReader:()=>prisma.user.findUnique({where:{id:r.owner},select:{id:true,email:true}}).then(user=>user?{user}:null),planReader:id=>plans.getUserPlan(id),tokenReader:q=>prisma.youtubeToken.findUnique(q),tokenWriter:()=>{throw Error('No real refresh permitted');},historyReader:q=>prisma.optimizeHistory.findMany(q),edit:(data,kind)=>{if(published&&kind==='detail'){data.items[0].snippet={...data.items[0].snippet,...published.snippet};}return data;}});reads.push(native);
    }
    originals.push(native);const response=await native.original,b=await response.json();if(r.init.method==='PUT')options.corrupt?.(b);
    const target=r.init.method==='PUT'?options.held:detailCount===2&&r.url.includes('?')?options.readHeld:null;
    if(target){entered.resolve();if(target==='headers')await options.gate.promise;}
    return{ok:response.ok,status:response.status,json:()=>target==='JSON'?options.gate.promise.then(()=>b):Promise.resolve(b)};
   })();pending.push(p);void p.catch(()=>{});return p;
  };
  const settle=async()=>{let n=0;do{const batch=pending.slice(n);n=pending.length;await Promise.all(batch);for(let j=0;j<3;j++)await read.ready(h);}while(n<pending.length);};
  const select=async()=>{await read.ready(h);await settle();const button=read.choose(h);assert(button,'Actual SQL list did not contain selection');button.props.onClick();await settle();};
  return{h,originals,puts,reads,pending,entered,settle,select};
 }
 try{
  const neighbor=await owner();await prisma.optimizeHistory.create({data:{userId:neighbor.id,videoId:'synthetic01',field:'title',oldValue:'Neighbor private',newValue:'Neighbor confirmed',createdAt:new Date('2026-10-01T00:00:00Z')}});
  const beforeNeighbor={user:await prisma.user.findUnique({where:{id:neighbor.id}}),token:await prisma.youtubeToken.findUnique({where:{userId:neighbor.id}}),history:await prisma.optimizeHistory.findMany({where:{userId:neighbor.id}})};
  const counts={generation:await prisma.generation.count(),competitor:await prisma.competitorCreationAttempt.count(),extension:await prisma.extensionEvent.count(),ab:await prisma.abTest.count(),abCreate:await prisma.abTestCreationAttempt.count(),abMutation:await prisma.abTestMutationAttempt.count()};
  {
   const u=await owner(),x=bind(u);await x.select();read.input(x.h).props.onChange({target:{value:'Top 5 native creator improvements'}});await read.ready(x.h);const click=client.save(x.h).props.onClick;click();click();await x.settle();
   assert.equal(x.puts.length,1);assert.equal(x.puts[0].transactions(),2);const r=client.puts(x.h)[0],row=await prisma.optimizeUpdateAttempt.findUnique({where:{userId_key:{userId:u.id,key:r.init.headers['Idempotency-Key']}}});assert.equal(row.state,'complete');assert.equal(row.videoId,'synthetic01');assert.equal(await prisma.optimizeHistory.count({where:{userId:u.id}}),1);assert(x.h.text().includes('Top 5 native'));assert(x.h.text().includes('Publicación e historial confirmados'));assert(!x.h.text().includes('Neighbor private'));assert.equal(client.gets(x.h).length,2);
   read.input(x.h).props.onChange({target:{value:'Top 7 deliberate native second edit'}});await read.ready(x.h);client.save(x.h).props.onClick();await x.settle();assert.equal(x.puts.length,2);assert.notEqual(client.puts(x.h)[1].init.headers['Idempotency-Key'],r.init.headers['Idempotency-Key']);assert.equal(client.puts(x.h)[1].body.original.title,r.body.title);assert.equal(await prisma.optimizeHistory.count({where:{userId:u.id}}),2);
   results.push('Optimize save native actual page/key/PUT/auth/plan/token/durable admission/original Google fixture/history atomic SQL/validated GET: duplicate handler denied, own history only, deliberate second edit uses exact confirmed baseline and new key');
  }
  for(const held of ['headers','JSON']){
   const u=await owner(),gate=deferred(),x=bind(u,{held,gate});await x.select();read.input(x.h).props.onChange({target:{value:'Top 5 original native late receipt'}});await read.ready(x.h);client.save(x.h).props.onClick();await x.entered.promise;for(let n=0;n<3;n++)await read.ready(x.h);x.h.advance(60000);await read.ready(x.h);assert(client.save(x.h).props.disabled);assert.equal(client.gets(x.h).length,1);assert.equal(await prisma.optimizeHistory.count({where:{userId:u.id}}),1);client.save(x.h).props.onClick();gate.resolve();await x.settle();assert.equal(x.puts.length,1);assert.equal(client.gets(x.h).length,2);assert(x.h.text().includes('Publicación e historial confirmados'));
   results.push('Optimize save native '+held+' real SQL terminal held after original HTTP200: finite60s client wait, no new key/publication/GET until same original late receipt; exact confirmed owner/history retained');
  }
  {
   const u=await owner(),x=bind(u,{server:{held:'history'}});await x.select();read.input(x.h).props.onChange({target:{value:'Top 5 native history uncertainty'}});await read.ready(x.h);client.save(x.h).props.onClick();await flush();while(!x.puts.length)await flush();await x.puts[0].entered.history.promise;x.puts[0].advance(55000);await x.settle();assert.match(x.h.text(),/No se ha confirmado/);assert(client.save(x.h).props.disabled);assert.equal(client.gets(x.h).length,1);x.puts[0].gates.history.resolve();await putTest.settle(x.puts[0]);await Promise.all(x.puts[0].producers);await x.settle();assert.equal(await prisma.optimizeHistory.count({where:{userId:u.id}}),1);assert.equal((await prisma.optimizeUpdateAttempt.findFirst({where:{userId:u.id}})).state,'complete');client.save(x.h).props.onClick();await x.settle();assert.equal(x.puts.length,1);assert.equal(client.gets(x.h).length,1);assert(!x.h.text().includes('Publicación e historial confirmados'));
   results.push('Optimize save native original server55s503 after fictitious publication: original SQL completion continues once; complete rows/history/time never reconstruct client receipt or authorize a second key/read/publication');
  }
  {
   const u=await owner(),x=bind(u,{server:{completionFails:true}});await x.select();read.input(x.h).props.onChange({target:{value:'Top 5 native rollback case'}});await read.ready(x.h);client.save(x.h).props.onClick();await x.settle();assert.equal(await prisma.optimizeHistory.count({where:{userId:u.id}}),0);assert.equal((await prisma.optimizeUpdateAttempt.findFirst({where:{userId:u.id}})).state,'pending');assert(client.save(x.h).props.disabled);client.save(x.h).props.onClick();await x.settle();assert.equal(x.puts.length,1);assert.equal(client.gets(x.h).length,1);
   const blocked=putServer(prisma,u,{input:client.puts(x.h)[0].body,key:'synthetic-other-key'});assert.equal((await blocked.original).status,503);assert.equal(blocked.transports.length,0);
   results.push('Optimize save native actual history/completion rollback preserves durable pending and client denial; independent native request/alternate key cannot obtain OAuth/publication or recover original');
  }
  {
   const u=await owner(),x=bind(u,{corrupt:b=>{b.userId=neighbor.id;}});await x.select();read.input(x.h).props.onChange({target:{value:'Top 5 malformed native receipt'}});await read.ready(x.h);client.save(x.h).props.onClick();await x.settle();assert.equal(await prisma.optimizeHistory.count({where:{userId:u.id}}),1);assert(client.save(x.h).props.disabled);assert.equal(client.gets(x.h).length,1);assert(!x.h.text().includes('Neighbor private'));assert.match(x.h.text(),/No se ha confirmado/);
   results.push('Optimize save native corrupt owner acknowledgement cannot install confirmed real SQL history/baseline or authorize recovery, even though original fictitious publisher and SQL completed');
  }
  {
   const u=await owner(),gate=deferred(),x=bind(u,{held:'JSON',gate});await x.select();read.input(x.h).props.onChange({target:{value:'Top 5 retired native owner'}});await read.ready(x.h);const old=client.save(x.h).props.onClick;old();await x.entered.promise;x.h.state.user=neighbor.id;x.h.state.email=neighbor.email;x.h.view(true);old();gate.resolve();await x.settle();assert.equal(x.puts.length,1);assert.equal(client.gets(x.h).length,1);assert(!read.input(x.h));assert(!x.h.text().includes('Publicación e historial confirmados'));assert.equal(await prisma.optimizeHistory.count({where:{userId:u.id}}),1);
   results.push('Optimize save native account render retires old handler/result before effects; original owner SQL completes without applying receipt or initiating old post-save GET in neighboring account');
  }
  for(const loss of ['plan','token']){
   const u=await owner(),x=bind(u);await x.select();read.input(x.h).props.onChange({target:{value:'Top 5 native restricted edit'}});await read.ready(x.h);if(loss==='plan')await prisma.subscription.update({where:{userId:u.id},data:{status:'canceled'}});else await prisma.youtubeToken.delete({where:{userId:u.id}});client.save(x.h).props.onClick();await x.settle();assert.equal(x.puts[0].transports.length,0);assert.equal(await prisma.optimizeUpdateAttempt.count({where:{userId:u.id}}),0);assert.equal(await prisma.optimizeHistory.count({where:{userId:u.id}}),0);assert(!client.save(x.h).props.disabled);assert.equal(client.gets(x.h).length,1);
   results.push('Optimize save native stored '+loss+' changed after reading: actual server safe pre-effect rejection reserves/writes nothing and local explicit retry remains available without invented success/history');
  }
  {
   const u=await owner(),gate=deferred(),x=bind(u,{readHeld:'JSON',gate});await x.select();read.input(x.h).props.onChange({target:{value:'Top 5 confirmed native read wait'}});await read.ready(x.h);client.save(x.h).props.onClick();await flush();await Promise.all(x.pending);await read.ready(x.h);await x.entered.promise;await read.ready(x.h);x.h.advance(30000);for(let n=0;n<3;n++)await read.ready(x.h);assert.match(x.h.text(),/Publicación e historial confirmados/);assert(read.retry(x.h).props.disabled);read.retry(x.h).props.onClick();gate.resolve();await x.settle();assert.equal(x.puts.length,1);assert.equal(client.gets(x.h).length,2);assert(x.h.text().includes('Top 5 confirmed native read wait'));
   results.push('Optimize save native post-confirmation actual GET/SQL history body held30s: read uncertainty distinct from exact publication/history receipt, sole original late read applies without republishing');
  }
  assert.deepEqual(await prisma.user.findUnique({where:{id:neighbor.id}}),beforeNeighbor.user);assert.deepEqual(await prisma.youtubeToken.findUnique({where:{userId:neighbor.id}}),beforeNeighbor.token);assert.deepEqual(await prisma.optimizeHistory.findMany({where:{userId:neighbor.id}}),beforeNeighbor.history);
  assert.deepEqual({generation:await prisma.generation.count(),competitor:await prisma.competitorCreationAttempt.count(),extension:await prisma.extensionEvent.count(),ab:await prisma.abTest.count(),abCreate:await prisma.abTestCreationAttempt.count(),abMutation:await prisma.abTestMutationAttempt.count()},counts);
  results.push('Optimize save native preservation: neighboring user/token/history, generations/extensions/competitor and A/B admissions unchanged; exact created synthetic users cleanup only; no real publication/OAuth/model or recovery authority');
 }finally{for(const h of pages)h.unmount();await prisma.user.deleteMany({where:{id:{in:users}}});}
};
