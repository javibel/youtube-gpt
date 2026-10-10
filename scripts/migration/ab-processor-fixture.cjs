'use strict';
const {load}=require('./route-harness.cjs'),{taskFixture}=require('./task-fixture.cjs');
module.exports=(prisma,owner,options={})=>{
 const base=require('./ab-creation-fixture.cjs')(prisma,owner,{expectedTitle:'B synthetic',views:40,...options}),calls=[];
 const db={...base.db,abTest:{...base.db.abTest,findMany:async args=>{const rows=await prisma.abTest.findMany({...args,where:{...args.where,userId:owner.id}});await options.afterScan?.(rows);return rows;}}};
 const runtime=taskFixture({taskType:'youtube.ab-result-insight',userId:owner.id,controlUnavailable:options.noControl,respond:async payload=>{calls.push(payload);await options.onInsight?.();return {content:[{type:'text',text:'{"es":"Resultado sintético","en":"Synthetic result"}'}],stop_reason:'end_turn'};}});
 const processor=load('lib/ab-test-processor.ts',{'@/lib/prisma':{prisma:db},'@/lib/youtube-auth':base.youtube,'@/lib/ab-test':base.helper,'@/lib/ai/task-runtime':runtime},base.globals);
 return{...base,calls,run:()=>processor.processAbTests(options.guard)};
};
