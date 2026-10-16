'use strict';
const metadata=require('./ab-metadata-fixture.cjs');
const assert=require('node:assert/strict'),{load}=require('./route-harness.cjs');
const {deferred}=require('./calendar-http-read-deadline.test.cjs');
// Real helper/route/plan/transactions. Only auth, time and title transport are
// synthetic. Hooks fault the original transaction/acknowledgement, never recover it.
module.exports=function fixture(prisma,owner,options={}){
 const entered=deferred(),gate=deferred(),puts=[],timers=new Map(),producers=[];let transactions=0,now=0,sequence=0;
 const db={abTest:prisma.abTest,$transaction:async(fn,settings)=>{
  const phase=++transactions;
  const value=await prisma.$transaction(tx=>fn({
   $queryRawUnsafe:(...args)=>tx.$queryRawUnsafe(...args),
   abTest:tx.abTest, optimizeUpdateAttempt:tx.optimizeUpdateAttempt,
   abTestMutationAttempt:{findFirst:args=>tx.abTestMutationAttempt.findFirst(args),findUnique:args=>tx.abTestMutationAttempt.findUnique(args),create:async args=>{const row=await tx.abTestMutationAttempt.create(args);options.afterReservation?.();return row;},updateMany:async args=>{await options.onCompletion?.();if(options.completionFails)throw Error('Synthetic original completion failure');return tx.abTestMutationAttempt.updateMany(args);}},
   abTestCreationAttempt:{
    findFirst:args=>tx.abTestCreationAttempt.findFirst(args),count:args=>tx.abTestCreationAttempt.count(args),findUnique:args=>tx.abTestCreationAttempt.findUnique(args),
    create:async args=>{const row=await tx.abTestCreationAttempt.create(args);options.afterReservation?.();return row;},
    updateMany:args=>{if(options.completionFails)throw Error('Synthetic original completion failure');return tx.abTestCreationAttempt.updateMany(args);},
   },
  }),settings);
  if(phase===1)await options.admissionAcknowledgement?.();
  if(phase===2)await options.completionAcknowledgement?.();
  return value;
 }};
 const youtube={getAccessToken:async id=>{assert.equal(id,owner.id);return'synthetic-title-token';}};
 const plans=load('lib/plans.ts',{'@/lib/prisma':{prisma}});
 const globals={performance:{now:()=>now},setTimeout(fn,ms){const id=++sequence;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id),fetch:async(url,init={})=>{
  assert.match(url,/^https:\/\/www.googleapis.com\/youtube\/v3\/videos\?/);assert.equal(init.headers.Authorization,'Bearer synthetic-title-token');
  if(init.method!=='PUT'){await options.onSnippet?.();const value=metadata.list(new URL(url).searchParams.get('id'),{title:'Original synthetic',categoryId:options.invalidCategory?null:'22',views:options.views??12});options.modifySource?.(value);return Response.json(value);}
  const body=JSON.parse(init.body);assert.match(body.id,/^synthetic-admission-/);assert.equal(body.snippet.title,options.expectedTitle??'A synthetic');puts.push(body);entered.resolve();
  options.onTitle?.();if(options.holdTitle)await gate.promise;
  if(options.titleThrows)throw Error('Synthetic title acknowledgement lost');
  if(options.titleStatus)return new Response('Synthetic rejection',{status:options.titleStatus});const ack=metadata.ack(body);options.modifyAck?.(ack);return metadata.response(async()=>{await options.onAckBody?.();return ack;});
 }};
 const originalHelper=load('lib/ab-test.ts',{'node:crypto':require('node:crypto'),'@/lib/prisma':{prisma:db},'@/lib/youtube-auth':youtube,'@/lib/plans':plans},globals);
 const track=p=>{producers.push(p);void p.catch(()=>{});return p;};
 const ownAdmission=p=>track(p.then(a=>a.ok?{...a,complete:(...args)=>track(a.complete(...args))}:a));
 const helper={...originalHelper,createAbTest:(...args)=>track(originalHelper.createAbTest(...args)),beginAbTestMutation:(...args)=>ownAdmission(originalHelper.beginAbTestMutation(...args)),beginAbTestTransition:(...args)=>ownAdmission(originalHelper.beginAbTestTransition(...args))};
 const route=load('app/api/youtube/ab-test/route.ts',{'next/server':{NextRequest:Request,NextResponse:Response},'@/auth':{auth:async()=>({user:{id:owner.id}})},'@/lib/prisma':{prisma:db},'@/lib/youtube-auth':youtube,'@/lib/ab-test':helper},globals);
 // This legacy SQL-helper fixture has an explicit closed authorization boundary;
 // native extension credential/plan checks are exercised by their own suite.
 const extension=load('app/api/extension/ab-test/route.ts',{'next/server':{NextRequest:Request,NextResponse:Response},'@/lib/extension-ab-create-native-authorization':{validExtensionAbKey:()=>true,authorizeExtensionAbCreation:async()=>Object.freeze({}),checkExtensionAbCreation(){},extensionAbInput:v=>v,createExtensionAbOriginal:(_original,_key,input,check)=>helper.createAbTest(owner.id,input,check)},'@/lib/extension-ab-read-native-authorization':{authorizeExtensionAbRead(){throw Error('This fixture admits only the original POST');}}},globals);
 const input=videoId=>({videoId,variantA:'A synthetic',variantB:'B synthetic',hoursPerVariant:48});
 return{helper,route,extension,db,globals,youtube,puts,entered,release:()=>gate.resolve(),async settled(){for(let i=0;i<6;i++){const n=producers.length;await Promise.allSettled([...producers]);for(let j=0;j<40;j++)await Promise.resolve();if(n===producers.length)break;}},timers,input,
  create:videoId=>helper.createAbTest(owner.id,input(videoId)),
  web:(videoId,signal)=>route.POST(new Request('https://example.invalid/api/youtube/ab-test',{method:'POST',body:JSON.stringify(input(videoId)),signal})),
  extensionCreate:videoId=>extension.POST(new Request('https://example.invalid/api/extension/ab-test',{method:'POST',headers:{'idempotency-key':require('node:crypto').randomUUID()},body:JSON.stringify(input(videoId))})),
  mutate:(testId,action,signal)=>route.PATCH(new Request('https://example.invalid/api/youtube/ab-test',{method:'PATCH',body:JSON.stringify({testId,action}),signal})),
  expire(){now+=55000;for(const[id,t]of [...timers])if(t.at<=now){timers.delete(id);t.fn();}},
 };
};
