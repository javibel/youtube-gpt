'use strict';
const {load}=require('./route-harness.cjs'),{harness}=require('./optimize-put-server.test.cjs');
// Actual helper/transactions, synthetic auth/provider/time. Faults belong to the
// original acknowledgement/transaction; they never reconstruct or release it.
module.exports=(prisma,owner,options={})=>{
 let transactions=0;const producers=[],track=p=>{producers.push(p);void p.catch(()=>{});return p;};
 const db={$transaction:async(fn,settings)=>{const n=++transactions,value=await prisma.$transaction(tx=>fn({
  $queryRawUnsafe:(...args)=>tx.$queryRawUnsafe(...args),youtubeToken:tx.youtubeToken,abTest:tx.abTest,abTestCreationAttempt:tx.abTestCreationAttempt,abTestMutationAttempt:tx.abTestMutationAttempt,
  optimizeUpdateAttempt:{findFirst:q=>tx.optimizeUpdateAttempt.findFirst(q),findUnique:q=>tx.optimizeUpdateAttempt.findUnique(q),create:async q=>{const r=await tx.optimizeUpdateAttempt.create(q);options.afterReservation?.();return r;},updateMany:q=>{if(options.completionFails)throw Error('Synthetic completion transaction failure');return tx.optimizeUpdateAttempt.updateMany(q);}},
  optimizeHistory:{createMany:q=>options.historyWriter?options.historyWriter(q,tx):tx.optimizeHistory.createMany(q)},
 }),settings);if(n===1)await options.admissionAcknowledgement?.();else await options.completionAcknowledgement?.();return value;}};
 const original=load('lib/optimize-update.ts',{'node:crypto':require('node:crypto'),'@/lib/prisma':{prisma:db}}),begin=(...args)=>track(original.beginOptimizeUpdate(...args).then(a=>a.ok?{...a,complete:entries=>track(a.complete(entries))}:a));
 const plans=load('lib/plans.ts',{'@/lib/prisma':{prisma}});
 const h=harness({userId:owner.id,email:owner.email,realToken:true,authReader:()=>prisma.user.findUnique({where:{id:owner.id},select:{id:true,email:true}}).then(user=>user?{user}:null),planReader:id=>plans.getUserPlan(id),tokenReader:q=>prisma.youtubeToken.findUnique(q),tokenWriter:q=>prisma.youtubeToken.update(q),...options,admitter:begin});
 h.helper=original;h.producers=producers;h.transactions=()=>transactions;return h;
};
