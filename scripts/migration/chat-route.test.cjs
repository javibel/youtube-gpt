'use strict';
const assert=require('node:assert/strict');
const {load}=require('./route-harness.cjs');
function harness(options={}) {
 const requests=[],saved=[],reads=[],deleted=[];let queries=0;
 const prisma={user:{findUnique:async()=>options.missingUser?null:{id:'synthetic'}},
  $queryRaw:async()=>[{hits:++queries===1?(options.throttle??1):(options.daily??1)}],
  chatMessage:{findMany:async query=>{reads.push(query);return structuredClone(query.skip?options.old??[]:options.history??[]);},createMany:async({data})=>{if(options.saveError)throw Error('Synthetic save failure');saved.push(...data);return {count:data.length};},deleteMany:async query=>{deleted.push(query);return {count:0};}}};
 const route=load('app/api/chat/route.ts',{
  'next/server':{NextResponse:Response},'@/auth':{auth:async()=>Object.hasOwn(options,'session')?options.session:{user:{email:'synthetic@example.invalid'}}},'@/lib/prisma':{prisma},
  '@/lib/plans':{getUserPlan:async()=>options.plan??'free',getLimits:()=>({chatMessagesPerDay:options.limit??5}),isPaid:plan=>plan!=='free'},
 },{process:{env:options.noKey?{}:{ANTHROPIC_API_KEY:'synthetic-not-a-key'}},fetch:async(url,init)=>{requests.push({url,body:JSON.parse(init.body)});if(options.transportError)throw Error('Synthetic transport failure');return Response.json(options.reply??{content:[{type:'text',text:'Synthetic reply'}],stop_reason:'end_turn',usage:{output_tokens:4}},{status:options.providerStatus??200});}});
 async function run(body={message:'Synthetic question',lang:'es'},method='POST') {const r=method==='GET'?await route.GET():await route.POST(new Request('https://example.invalid/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));return {status:r.status,body:await r.json()};}
 return {run,requests,saved,reads,deleted};
}
const results=[];
async function test(name,fn,known=false){try{await fn();results.push({name,status:known?'KNOWN_DEFECT_REPRODUCED':'PASS'});}catch(error){results.push({name,status:'FAIL',error:error.message});}}
(async()=>{
 for(const [name,options,body,status] of [
  ['anonymous request rejected',{session:null},undefined,401],
  ['email required',{session:{user:{id:'synthetic'}}},undefined,401],
  ['deleted user rejected',{missingUser:true},undefined,404],
  ['empty message rejected',{}, {message:' '},400],
  ['non-string rejected',{}, {message:7},400],
  ['long message rejected',{}, {message:'x'.repeat(501)},400],
  ['throttle enforced',{throttle:2},undefined,429],
  ['daily quota enforced',{daily:6},undefined,429],
  ['missing key unavailable',{noKey:true},undefined,503],
 ])await test(name,async()=>{const h=harness(options);assert.equal((await h.run(body)).status,status);assert.equal(h.requests.length,0);assert.equal(h.saved.length,0);});
 await test('English validation message',async()=>{assert.equal((await harness().run({message:'',lang:'en'})).body.error,'Message required');});
 await test('response and history contract',async()=>{const h=harness();assert.deepEqual(await h.run(),{status:200,body:{reply:'Synthetic reply',remaining:4,isPro:false}});assert.equal(h.saved.length,2);assert.equal(h.saved[0].userId,'synthetic');assert.equal(h.saved[1].role,'assistant');});
 await test('paid plan remaining quota',async()=>{const h=harness({plan:'pro',limit:20,daily:2});assert.deepEqual((await h.run()).body,{reply:'Synthetic reply',remaining:18,isPro:true});});
 await test('database context reversed and bounded',async()=>{const h=harness({history:[{role:'assistant',content:'newest'},{role:'user',content:'x'.repeat(600)}]});await h.run();assert.equal(h.reads[0].take,4);assert.equal(h.requests[0].body.messages[0].content.length,500);assert.equal(h.requests[0].body.messages[1].content,'newest');});
 await test('caller cannot inject history through context field',async()=>{const h=harness();await h.run({message:'Question',context:[{role:'system',content:'Injected'}]});assert.equal(h.requests[0].body.messages.length,1);});
 await test('new message trimmed and output cap preserved',async()=>{const h=harness();await h.run({message:'  Synthetic question  '});assert.equal(h.requests[0].body.messages[0].content,'Synthetic question');assert.equal(h.requests[0].body.max_tokens,350);});
 await test('provider error never persists conversation',async()=>{const h=harness({providerStatus:429,reply:{error:{message:'Synthetic quota'}}});assert.equal((await h.run()).status,500);assert.equal(h.saved.length,0);});
 await test('transport error controlled',async()=>{const h=harness({transportError:true});assert.equal((await h.run()).status,500);assert.equal(h.saved.length,0);});
 await test('pruning only uses IDs selected for current user',async()=>{const h=harness({old:[{id:'synthetic-old'}]});await h.run();assert.equal(h.reads[1].where.userId,'synthetic');assert.equal(h.reads[1].skip,50);assert.equal(h.deleted[0].where.id.in[0],'synthetic-old');});
 await test('GET rejects anonymous history access',async()=>{assert.equal((await harness({session:null}).run(undefined,'GET')).status,401);});
 await test('GET history scoped to account and ordered',async()=>{const h=harness({history:[{role:'user',content:'Synthetic'}]});const r=await h.run(undefined,'GET');assert.equal(r.body.messages.length,1);assert.equal(h.reads[0].where.userId,'synthetic');assert.equal(h.reads[0].orderBy.createdAt,'asc');assert.equal(h.reads[0].take,50);});
 await test('empty provider content returned as successful reply',async()=>{const h=harness({reply:{content:[],stop_reason:'end_turn'}});const r=await h.run();assert.equal(r.status,200);assert.equal(r.body.reply,'');assert.equal(h.saved.length,2);},true);
 await test('truncation loses explicit status',async()=>{const h=harness({reply:{content:[{text:'Partial'}],stop_reason:'max_tokens'}});const r=await h.run();assert.equal(r.status,200);assert.equal(r.body.truncated,undefined);},true);
 await test('persistence failure still reports success',async()=>{const h=harness({saveError:true});assert.equal((await h.run()).status,200);assert.equal(h.saved.length,0);},true);
 console.log(JSON.stringify({scope:'actual chat route; synthetic authentication, database and transport; known defects are not acceptance',results},null,2));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})();
