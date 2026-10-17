'use strict';
const assert=require('assert/strict'),{fixture,reached,drain}=require('./admin-social-messages-fixture.cjs'),{transport}=require('./gmail-text-fixture.cjs');
const text='Gracias por escribirnos. Un saludo,\nEquipo YTubViral\nytubviral.com';
async function generation(o={}){
 const store=o.store??new Map(),t=o.transport??transport(),b=await fixture({...o,env:{...t.env,MESSAGES_DRAFT_GENERATE_ENABLED:'true',...o.env},gmailFetch:t.fetch,
  sql:async(sql,args)=>{if(o.sql)return o.sql(sql,args);const[id,commandRef,userId,email,verifiedAt,sessionRef,mailbox,messageId,threadId,json,content]=args,source=JSON.parse(json),key=mailbox+':'+messageId,row=store.get(key),actor=b.f.account(),allowed=actor&&actor.id===userId&&actor.email===email&&actor.emailVerified?.getTime()===verifiedAt.getTime();
   if(sql.startsWith('INSERT')){if(!allowed||row||[...store.values()].some(v=>v.commandRef===commandRef))return[];store.set(key,{id,commandRef,userId,email,sessionRef,mailbox,messageId,threadId,source,state:'pending',content:null,completedAt:null});return o.badAdmission??[{id}];}
   const same=!!allowed&&!!row&&row.id===id&&row.commandRef===commandRef&&row.userId===userId&&row.email===email&&row.sessionRef===sessionRef&&row.threadId===threadId&&JSON.stringify(row.source)===json;
   if(sql.startsWith('UPDATE')){if(!same||row.state!=='pending')return[];Object.assign(row,{state:'completed',content,completedAt:'own-completion'});return o.badCompletion??[{id}];}
   const valid=same&&(sql.includes("state='pending'")?row.state==='pending':row.state==='completed'&&row.content===content&&!!row.completedAt);return o.badVeto??[{eligible:!!valid}];
  },
  task:async(i,stage)=>{assert.equal(i.serviceId,'brand-agent');assert.equal(i.taskType,'brand.gmail-reply');assert.equal(i.instructionsVersion,'brand.gmail-reply-v2');assert.equal(i.incompletePolicy,'reject');assert.equal(i.language,'auto');assert([...store.values()].some(r=>r.id===i.operationKey&&r.state==='pending')||o.sql);return{create:params=>stage('draft-model',async()=>{assert.equal(params.max_tokens,400);assert.equal(params.tools,undefined);assert.equal(params.messages.length,1);assert.equal(params.messages[0].role,'user');const input=JSON.parse(params.messages[0].content);assert.equal(input.message.source.id,o.messageId??'1');assert(Object.isFrozen(params)===false);return o.result??{content:[{type:'text',text:o.text??text}]};})};}
 });Object.assign(b,{store,transport:t});return b;
}
module.exports={generation,reached,drain,text};
