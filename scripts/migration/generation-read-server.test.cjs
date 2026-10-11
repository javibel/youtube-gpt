'use strict';
const assert=require('node:assert/strict'),{load}=require('./route-harness.cjs'),{deferred,flush}=require('./chat-widget-harness.cjs');
const identity={id:'history-one',email:'history-one@example.invalid'};
function row(i=0){return{id:'generation-'+i,template:'title',createdAt:new Date('2026-01-01T00:00:00Z'),tokensUsed:17,output:'Synthetic '+i,inputs:{tema:'Synthetic',nested:{value:'Original'}},userId:'NEVER_PUBLIC',ipAddress:'NEVER_PUBLIC',user:{password:'NEVER_PUBLIC'}};}
function fixture(options={}){
 let now=0,serial=0;const calls=[],replies=[],timers=new Map(),controller=new AbortController(),user=options.user===undefined?{...identity}:options.user;
 const values={user:{...identity},total:23,rows:Array.from({length:10},(_,i)=>row(i)),...options.values};
 const invoke=async(name,q)=>{calls.push({name,q});return options.stages?.[name]?options.stages[name](q):values[name];};
 const route=load('app/api/user/generations/route.ts',{
  'next/server':{NextResponse:{json(body,init){replies.push({body,init});return options.reply?options.reply(body,init):Response.json(body,init);}}},
  '@/auth':{auth:()=>invoke('auth').then(()=>options.auth?options.auth():user?{user}:null)},
  '@/lib/prisma':{prisma:{user:{findUnique:q=>invoke('user',q)},generation:{count:q=>invoke('total',q),findMany:q=>invoke('rows',q)}}},
  '@/lib/ai/history-usage':load('lib/ai/history-usage.ts')
 },{performance:{now:()=>now},setTimeout(fn,ms){const id=++serial;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id)});
 if(options.aborted)controller.abort();
 const request={nextUrl:new URL('https://example.invalid/api/user/generations'+(options.search??'')),signal:controller.signal},original=route.GET(request);
 return{original,calls,replies,timers,controller,user,values,request,advance(ms,fire=true){now+=ms;if(fire)for(const[id,t]of [...timers])if(t.at<=now){timers.delete(id);t.fn();}}};
}
async function unavailable(f){const r=await f.original;assert.equal(r.status,503);assert.equal(r.headers.get('cache-control'),'no-store');assert.deepEqual(await r.json(),{error:'Historial no disponible'});assert.equal(f.timers.size,0);}
async function run(){
 const results=[],test=async(name,fn)=>{try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.stack});}};
 await test('own public page preserves nested inputs, output, timestamps, nullable usage and scoped SQL',async()=>{
  const f=fixture(),r=await f.original,b=await r.json();assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(b.total,23);assert.equal(b.page,1);assert.equal(b.hasMore,true);assert.equal(b.generations.length,10);
  assert.deepEqual(Object.keys(b.generations[0]).sort(),['createdAt','id','inputs','output','template','tokensUsed']);assert(!JSON.stringify(b).includes('NEVER_PUBLIC'));assert.equal(b.generations[0].inputs.nested.value,'Original');assert.equal(f.timers.size,0);
  assert.deepEqual(f.calls.map(c=>c.name),['auth','user','total','rows']);for(const c of f.calls.filter(c=>['total','rows'].includes(c.name)))assert.equal(c.q.where.userId,identity.id);
  const q=f.calls.find(c=>c.name==='rows').q;assert.equal(q.skip,0);assert.equal(q.take,10);assert.deepEqual(JSON.parse(JSON.stringify(q.orderBy)),[{createdAt:'desc'},{id:'desc'}]);
 });
 for(const page of [2,1000000])await test('page '+page+' captures offset and remains independent of concurrent count',async()=>{
  const f=fixture({search:'?page='+page,values:{total:0,rows:[row()]}}),r=await f.original,b=await r.json();assert.equal(r.status,200);assert.equal(b.total,0);assert.equal(b.generations.length,1);assert.equal(b.page,page);assert.equal(b.hasMore,false);assert.equal(f.calls.find(c=>c.name==='rows').q.skip,(page-1)*10);
 });
 await test('confirmed zero is distinct from unavailable read',async()=>{const f=fixture({values:{total:0,rows:[]}}),b=await(await f.original).json();assert.deepEqual(b,{generations:[],total:0,page:1,hasMore:false});});
 for(const page of ['0','-1','01','1.5','1e2','1000001','99999999','x',''])await test('invalid page '+JSON.stringify(page)+' rejects before SQL',async()=>{
  const f=fixture({search:'?page='+page}),r=await f.original;assert.equal(r.status,400);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(f.calls.length,1);
 });
 for(const [name,user]of [['null',null],['no id',{email:identity.email}],['no email',{id:identity.id}],['bad id',{id:12,email:identity.email}],['bad email',{id:identity.id,email:12}]])await test('unauthenticated '+name+' no-store401 without SQL',async()=>{const f=fixture({user}),r=await f.original;assert.equal(r.status,401);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(f.calls.length,1);});
 await test('missing own account no-store404 before history dispatch',async()=>{const f=fixture({values:{user:null}}),r=await f.original;assert.equal(r.status,404);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(f.calls.length,2);});
 for(const field of ['id','email'])await test('selected '+field+' mismatch denies both count and page',async()=>{const f=fixture({values:{user:{...identity,[field]:'foreign'}}}),r=await f.original;assert.equal(r.status,401);assert.equal(f.calls.length,2);});
 for(const stage of ['auth','user','total','rows']){
  for(const action of ['timeout','abort'])await test(stage+'/'+action+' retires HTTP only and never dispatches late next stage',async()=>{
   const g=deferred(),f=fixture({stages:{[stage]:()=>g.promise}});await flush();if(action==='timeout')f.advance(25000);else f.controller.abort();await unavailable(f);
   const at=f.calls.length;g.resolve(stage==='auth'?undefined:f.values[stage]);await flush();assert.equal(f.calls.length,at);assert.equal(f.calls.filter(c=>c.name===stage).length,1);assert(!f.replies.some(x=>x.init.status===200));
  });
  await test(stage+' private exception returns503 without empty history or diagnostics',async()=>{await unavailable(fixture({stages:{[stage]:async()=>{throw Error('NEVER_PUBLIC SQL');}}}));});
 }
 await test('already aborted request never authenticates',async()=>{const f=fixture({aborted:true});await unavailable(f);assert.equal(f.calls.length,0);});
 await test('auth20s/account4s/history1s share the same25s budget',async()=>{
  const a=deferred(),u=deferred(),q=deferred(),f=fixture({stages:{auth:()=>a.promise,user:()=>u.promise,rows:()=>q.promise}});
  await flush();f.advance(20000);a.resolve();await flush();f.advance(4000);u.resolve({...identity});await flush();f.advance(1000);await unavailable(f);q.resolve(f.values.rows);await flush();assert(!f.replies.some(x=>x.init.status===200));
 });
 await test('expiry detected by monotonic clock before timer callback',async()=>{const g=deferred(),f=fixture({stages:{user:()=>g.promise}});await flush();f.advance(25000,false);g.resolve({...identity});await unavailable(f);assert.equal(f.calls.length,2);});
 await test('captured owner and page never follow mutable session/selection/URL during pending read',async()=>{
  const u=deferred(),q=deferred(),selected={...identity},f=fixture({search:'?page=2',stages:{user:()=>u.promise,rows:()=>q.promise}});
  await flush();Object.assign(f.user,{id:'foreign',email:'foreign@example.invalid'});f.request.nextUrl.searchParams.set('page','3');u.resolve(selected);await flush();Object.assign(selected,{id:'foreign',email:'foreign@example.invalid'});q.resolve(f.values.rows);
  const b=await(await f.original).json();assert.equal(b.page,2);for(const c of f.calls.filter(c=>c.q?.where?.userId))assert.equal(c.q.where.userId,identity.id);
 });
 await test('nested row/date snapshot cannot change while count stays pending',async()=>{
  const g=deferred(),rows=[row()],f=fixture({values:{rows,total:1},stages:{total:()=>g.promise}});await flush();
  rows[0].inputs.nested.value='Foreign';rows[0].output='Foreign';rows[0].createdAt.setFullYear(2040);rows.push(row(2));g.resolve(1);
  const b=await(await f.original).json();assert.equal(b.generations.length,1);assert.equal(b.generations[0].output,'Synthetic 0');assert.equal(b.generations[0].createdAt,'2026-01-01T00:00:00.000Z');assert.equal(b.generations[0].inputs.nested.value,'Original');
 });
 for(const tokens of [0,-1,1.5,null,undefined,Number.MAX_SAFE_INTEGER+1])await test('legacy usage '+String(tokens)+' stays nullable without fabricated0',async()=>{const f=fixture({values:{rows:[{...row(),tokensUsed:tokens}],total:1}}),b=await(await f.original).json();assert.equal(b.generations[0].tokensUsed,null);});
 for(const inputs of [null,[],['Synthetic'],12,'Synthetic'])await test('valid legacy JSON '+JSON.stringify(inputs)+' preserves shape',async()=>{const f=fixture({values:{rows:[{...row(),inputs}],total:1}}),b=await(await f.original).json();assert.deepEqual(b.generations[0].inputs,inputs);});
 const circular={};circular.self=circular;
 for(const[name,values]of [['negative count',{total:-1}],['fraction count',{total:1.5}],['overflow count',{total:Number.MAX_SAFE_INTEGER+1}],['missing count',{total:undefined}],['missing rows',{rows:undefined}],['overfull page',{rows:Array.from({length:11},(_,i)=>row(i))}],['duplicate ID',{rows:[row(),row()]}],['invalid date',{rows:[{...row(),createdAt:new Date('invalid')}]}],['invalid template',{rows:[{...row(),template:{private:'NEVER_PUBLIC'}}]}],['invalid output',{rows:[{...row(),output:null}]}],['missing JSON',{rows:[{...row(),inputs:undefined}]}],['circular JSON',{rows:[{...row(),inputs:circular}]}]])
 await test(name+' fails closed without public diagnostics',async()=>{await unavailable(fixture({values}));});
 for(const action of ['timeout','abort','reject'])await test('public JSON acknowledgement '+action+' remains inside original budget',async()=>{
  const g=deferred(),f=fixture({reply:(body,init)=>init.status===200?g.promise:Response.json(body,init)});await flush();if(action==='timeout')f.advance(25000);else if(action==='abort')f.controller.abort();else g.reject(Error('NEVER_PUBLIC'));await unavailable(f);if(action!=='reject'){g.resolve(Response.json({late:true}));await flush();}assert.equal(f.calls.length,4);
 });
 await test('JSON serialization crossing deadline prevents late200 without timer callback',async()=>{let f;f=fixture({reply:(body,init)=>{if(init.status===200)f.advance(25000,false);return Response.json(body,init);}});await unavailable(f);});
 console.log(JSON.stringify({status:results.every(r=>r.status==='PASS')?'PASS':'FAIL',scope:'Actual generation GET / synthetic auth, SQL and clock / no effects',results},null,2));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
}
module.exports={fixture,identity,row};if(require.main===module)run();
