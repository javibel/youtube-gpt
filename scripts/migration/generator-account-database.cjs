'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{load}=require('./route-harness.cjs');
const {page}=require('./generic-generation-page.test.cjs');
module.exports=async function(prisma,results){
 const users=await Promise.all([1,2].map(i=>prisma.user.create({data:{email:'generator-account-'+randomUUID()+'@example.invalid',name:'Synthetic generator '+i}})));
 let owner=users[0];const plans=load('lib/plans.ts',{'@/lib/prisma':{prisma}}),session=()=>({user:{id:owner.id,email:owner.email}});
 const stats=load('app/api/user/stats/route.ts',{'next/server':{NextResponse:Response},'@/auth':{auth:async()=>session()},'@/lib/prisma':{prisma},'@/lib/plans':plans});
 const channel=load('app/api/youtube/channel/route.ts',{'next/server':{NextResponse:Response},'@/auth':{auth:async()=>session()},'@/lib/prisma':{prisma}});
 const send=url=>url==='/api/user/stats'?stats.GET():channel.GET(new Request('https://example.invalid/api/youtube/channel'));
 const h=page({user:owner.id,email:owner.email,read:send});
 try {
  await h.ready();assert.match(h.text(),/Te quedan\s+10/);assert.doesNotMatch(h.text(),/No se pudo comprobar/);results.push('original generator page and shared statistics/channel hooks read authenticated own free plan and absent connection from original routes/PostgreSQL');
  await prisma.youtubeToken.create({data:{userId:owner.id,accessToken:'synthetic-local-only',refreshToken:null,expiresAt:new Date(Date.now()+86400000),channelId:'UC_synthetic_'+owner.id,channelName:'Synthetic',subscribers:'1',totalViews:'2',videoCount:'1'}});
  await prisma.subscription.create({data:{userId:owner.id,plan:'business',status:'active',stripeCustomerId:'manual_admin',currentPeriodEnd:new Date(Date.now()+86400000)}});
  // Reset only component lifetime, never runtime authority or fixtures' declared freshness.
  h.unmount();const paid=page({user:owner.id,email:owner.email,read:send});
  try {
   await paid.ready();assert.match(paid.text(),/Ilimitado/);assert.match(paid.text(),/último estado guardado/);assert.doesNotMatch(paid.text(),/No se pudo comprobar/);results.push('original generator reads confirmed Business and cached channel without transport/refresh credentials or private token exposure');
   const generation=await prisma.generation.create({data:{userId:owner.id,template:'title',inputs:{},output:'Synthetic confirmed result',tokensUsed:0}});
   paid.state.send=async()=>new Response(JSON.stringify({content:generation.output,truncated:false}),{status:200});await paid.button('Generar ahora')();await paid.ready();assert.match(paid.text(),/Synthetic confirmed result/);assert.equal(await prisma.generation.count({where:{userId:owner.id}}),1);assert.equal(await prisma.generation.count({where:{userId:users[1].id}}),0);results.push('confirmed synthetic generation acknowledgement triggers original plan read of real stored quota without optimistic decrement or another account mutation');
   owner=users[1];paid.state.user=owner.id;paid.state.email=owner.email;paid.render();assert.doesNotMatch(paid.text(),/Ilimitado/);await paid.ready();assert.match(paid.text(),/Te quedan\s+10/);assert.doesNotMatch(paid.text(),/último estado guardado/);assert.doesNotMatch(paid.text(),/Synthetic confirmed result/);results.push('generator account switch clears original plan/channel/text before effects and reads separate PostgreSQL account');
  }finally{paid.unmount();}
 }finally{h.unmount();await prisma.user.deleteMany({where:{id:{in:users.map(u=>u.id)}}});}
};
