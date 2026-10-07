'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{load}=require('./route-harness.cjs'),{editor}=require('./thumbnail-editor-save.test.cjs');
module.exports=async function(prisma,results){
 const user=await prisma.user.create({data:{email:'background-editor-'+randomUUID()+'@example.invalid',name:'Synthetic background editor'}});
 const uploads=[],plans=load('lib/plans.ts',{'@/lib/prisma':{prisma}}),auth={auth:async()=>({user:{id:user.id,email:user.email}})};
 const put=async(name,bytes,settings)=>{uploads.push({name,bytes:Buffer.from(bytes),settings});return{url:'https://example.invalid/'+name};};
 const background=load('app/api/thumbnail-background/route.ts',{'@/auth':auth,'@/lib/prisma':{prisma},'@/lib/plans':plans,'@vercel/blob':{put},'@/lib/ai/task-runtime':{getMessagesTask:async()=>{throw Error('Upload must not invoke a model');}}},{Buffer,FormData,process:{env:{}},fetch:async()=>{throw Error('Upload must not contact image provider');}});
 const save=load('app/api/thumbnail-save/route.ts',{'@/auth':auth,'@/lib/prisma':{prisma},'@/lib/plans':plans,'@vercel/blob':{put},'node:crypto':require('node:crypto')},{Buffer,URL});
 let h;
 try{
  await prisma.subscription.create({data:{userId:user.id,plan:'pro',status:'active',stripeCustomerId:'manual_admin',currentPeriodEnd:new Date(Date.now()+86400000)}});
  h=editor({user:user.id,email:user.email});let lost=true,first;
  h.state.backgroundSend=init=>{first=background.POST(new Request('https://example.invalid/api/thumbnail-background',init)).then(response=>{if(lost){lost=false;assert.equal(response.status,200);throw Error('synthetic lost upload acknowledgement');}return response;});return first;};
  h.nodes().filter(n=>n.type==='input'&&n.props.type==='file')[0].props.onChange({target:{files:[new File(['synthetic background PNG'],'bg.png',{type:'image/png'})],value:''}});
  for(let i=0;i<4;i++)await Promise.resolve();assert.ok(first);await first.catch(()=>{});for(let i=0;i<16;i++)await Promise.resolve();h.render();
  assert.match(h.text(),/Fondo sin confirmar/);assert.match(h.text(),/consumir de nuevo/);assert.equal(uploads.length,1);assert.equal(await prisma.generation.count({where:{userId:user.id}}),0);
  await h.button('Volver a intentar fondo')();h.render();assert.equal(uploads.length,2);assert.ok(uploads[0].bytes.equals(uploads[1].bytes));assert.equal(uploads[0].settings.contentType,'image/png');assert.equal(h.state.backgroundRequests.length,2);
  h.state.send=init=>save.POST(new Request('https://example.invalid/api/thumbnail-save',init));await h.button('Guardar miniatura')();assert.equal(await prisma.generation.count({where:{userId:user.id,template:'thumbnail'}}),1);assert.equal(uploads.length,3);assert.equal(h.state.confirmed.length,1);
  results.push('original background editor/hook/upload API/plans/PostgreSQL preserve exact file after lost upload acknowledgement and warn before explicit non-idempotent reupload (two synthetic Blob writes, zero models); subsequent immutable save records once');
 }finally{h?.unmount();await prisma.user.delete({where:{id:user.id}});}
};

