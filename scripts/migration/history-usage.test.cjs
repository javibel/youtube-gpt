'use strict';
const assert=require('node:assert/strict');
const {load}=require('./route-harness.cjs');
const usage=load('lib/ai/history-usage.ts');
const rows=[0,17].map((tokensUsed,i)=>({id:String(i),template:'title',tokensUsed,createdAt:new Date('2026-09-14T00:00:00Z'),output:'Synthetic',inputs:{tema:'Synthetic'},user:{email:'synthetic@example.invalid'}}));
const results=[];
async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.message});}}
function harness(path,denied=false){
 let reads=0;
 const prisma={user:{findUnique:async()=>{reads++;return {id:'synthetic'};},count:async()=>0,findMany:async()=>[]},subscription:{findMany:async()=>[]},generation:{count:async()=>2,groupBy:async()=>[],findMany:async()=>{reads++;return rows;}}};
 const route=load(path,{'@/lib/ai/history-usage':usage,'next/server':{NextResponse:Response},'@/auth':{auth:async()=>denied?null:{user:{email:'synthetic@example.invalid'}}},'@/lib/prisma':{prisma},'@/lib/auth-guards':{requireAdmin:async()=>denied?{ok:false,response:Response.json({error:'Unauthorized'},{status:403})}:{ok:true}},'@/lib/plans':{isPaidStatus:()=>false}});
 return {route,reads:()=>reads};
}
(async()=>{
 await test('legacy ambiguous zero and invalid metrics stay unknown',()=>{for(const n of [0,null,undefined,-1,1.2,Infinity,NaN,'12',{},Number.MAX_SAFE_INTEGER+1])assert.equal(usage.historyOutputTokens(n),null);assert.equal(usage.historyOutputTokens(17),17);});
 await test('user history preserves ownership pagination and nullable usage',async()=>{const h=harness('app/api/user/generations/route.ts');const r=await h.route.GET({nextUrl:new URL('https://example.invalid/?page=1')});const b=await r.json();assert.deepEqual(b.generations.map(g=>g.tokensUsed),[null,17]);assert.equal(b.total,2);assert.equal(b.hasMore,false);assert.equal(b.generations[0].output,'Synthetic');});
 await test('admin history preserves measured positive usage',async()=>{const h=harness('app/api/admin/stats/route.ts');const b=await(await h.route.GET()).json();assert.deepEqual(b.recentGenerations.map(g=>g.tokensUsed),[null,17]);});
 await test('CSV leaves unavailable usage blank',async()=>{const h=harness('app/api/admin/export/route.ts');const r=await h.route.GET({nextUrl:new URL('https://example.invalid/?type=generations')});const lines=(await r.text()).split('\n');assert.equal(lines[1].split(',')[3],'');assert.equal(lines[2].split(',')[3],'17');});
 for(const path of ['app/api/user/generations/route.ts','app/api/admin/stats/route.ts','app/api/admin/export/route.ts'])await test('unauthorized history denied before reads: '+path,async()=>{const h=harness(path,true);const r=await h.route.GET({nextUrl:new URL('https://example.invalid/')});assert.ok([401,403].includes(r.status));assert.equal(h.reads(),0);});
 console.log(JSON.stringify({scope:'history readers with synthetic records; legacy zero is ambiguous, exact zero remains available only in execution ledger',results},null,2));
 if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})();
