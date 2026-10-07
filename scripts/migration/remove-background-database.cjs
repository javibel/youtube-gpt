'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{load}=require('./route-harness.cjs'),{editor}=require('./thumbnail-editor-save.test.cjs'),{png}=require('./remove-background-provider.test.cjs');
module.exports=async function(prisma,results){
 const user=await prisma.user.create({data:{email:'removal-boundary-'+randomUUID()+'@example.invalid',name:'Synthetic removal boundary'}}),auth={auth:async()=>({user:{id:user.id,email:user.email}})},plans=load('lib/plans.ts',{'@/lib/prisma':{prisma}}),rate=load('lib/rate-limit-db.ts',{'@/lib/prisma':{prisma}});
 let calls=0,broken=true,h;
 const globals={FormData,Blob,AbortController,setTimeout,clearTimeout,process:{env:{REMOVE_BG_API_KEY:'synthetic-not-a-key'}},fetch:async()=>{calls++;return broken?new Response('private provider HTML',{headers:{'content-type':'image/png'}}):new Response(png(),{headers:{'content-type':'image/png'}});}};
 const provider=load('lib/image/remove-background-provider.ts',{},globals),removal=load('app/api/remove-bg/route.ts',{'next/server':{NextResponse:Response},'@/auth':auth,'@/lib/prisma':{prisma},'@/lib/plans':plans,'@/lib/rate-limit-db':rate,'@/lib/image/remove-background-provider':provider},globals);
 const request=()=>{const body=new FormData();body.append('file',new File(['synthetic photo'],'photo.png',{type:'image/png'}));return new Request('https://example.invalid/api/remove-bg',{method:'POST',body});};
 try{
  assert.equal((await removal.POST(request())).status,403);assert.equal(calls,0);
  await prisma.subscription.create({data:{userId:user.id,plan:'pro',status:'active',stripeCustomerId:'manual_admin',currentPeriodEnd:new Date(Date.now()+86400000)}});
  h=editor({user:user.id,email:user.email});await h.background();const input=h.nodes().filter(n=>n.type==='input'&&n.props.type==='file')[1];await input.props.onChange({target:{files:[new File(['synthetic photo'],'photo.png',{type:'image/png'})],value:''}});for(let i=0;i<16;i++)await Promise.resolve();h.render();
  h.state.removeSend=init=>removal.POST(new Request('https://example.invalid/api/remove-bg',init));await h.button('Eliminar fondo')();assert.match(h.text(),/no está confirmado/);assert.equal(calls,1);assert.equal(await prisma.generation.count({where:{userId:user.id}}),0);
  broken=false;await h.button('Volver a intentar eliminación')();h.render();assert.equal(calls,2);assert.equal(h.state.removalRequests.length,2);assert.equal(await h.state.removalRequests[0].body.get('file').text(),await h.state.removalRequests[1].body.get('file').text());
  const row=(await prisma.$queryRawUnsafe('SELECT hits FROM rate_limits WHERE key=$1','remove-bg:'+user.id))[0];assert.equal(Number(row.hits),2);
  await prisma.subscription.update({where:{userId:user.id},data:{currentPeriodEnd:new Date(Date.now()-1000)}});assert.equal((await removal.POST(request())).status,403);assert.equal(calls,2);
  results.push('actual removal route/provider/editor/plans and strict PostgreSQL limiter reject malformed provider PNG, retain original for explicit retry (two billed transport fixtures, same input), enforce stored Pro expiry and persist two admission hits; no generation/recovery receipt invented');
 }finally{h?.unmount();await prisma.$executeRawUnsafe('DELETE FROM rate_limits WHERE key=$1','remove-bg:'+user.id);await prisma.user.delete({where:{id:user.id}});}
};

