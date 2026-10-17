'use strict';
const {randomBytes,randomUUID}=require('node:crypto');
const environment=Object.freeze({GMAIL_READ_ENABLED:'true',GMAIL_TEXT_READ_ENABLED:'true',GMAIL_READ_MAILBOX:'synthetic-messages@example.invalid',GMAIL_CLIENT_ID:'synthetic-messages-client',GMAIL_CLIENT_SECRET:'synthetic-messages-secret',GMAIL_REFRESH_TOKEN:'synthetic-messages-refresh',MESSAGES_DRAFT_PREPARE_ENABLED:'true',MESSAGES_DRAFT_GENERATE_ENABLED:'true',YOUTUBE_DRAFT_GENERATE_ENABLED:'true',YOUTUBE_API_KEY:'synthetic-messages-key',YOUTUBE_CHANNEL_ID:'UC'+'M'.repeat(22)});
const date='2026-10-12T12:00:00.000Z',scope='https://www.googleapis.com/auth/gmail.readonly',token='synthetic-messages-access';
function createMessagesFixtureTransport(check){
 if(typeof check!=='function')throw Error('A live original fixture lifecycle is required');
 const guard=()=>{check();if(process.env.YTV_MIGRATION_WEB_TEST!=='1'||globalThis.__ytvRuntimeGuard!==true||process.env.AUTH_URL!=='http://127.0.0.1:4300')throw Error('ISOLATION_BLOCKED: guarded message fixture required');for(const[k,v]of Object.entries(environment))if(process.env[k]!==v)throw Error('ISOLATION_BLOCKED: message fixture configuration changed');};guard();
 // A new explicitly synthetic dataset per owned startup;never rewrite inherited
 // dates,rows or uncertain attempts. No reset,recovery or network delegation.
 const messageId=randomBytes(16).toString('hex'),threadId=randomBytes(16).toString('hex'),commentId='synthetic-'+randomUUID(),thread='thread-'+commentId,author='UC'+'A'.repeat(22),question='[Simulación local] ¿Cómo puedo mejorar el título de mi vídeo? No es un mensaje operativo.';
 const headers=[{name:'From',value:'Espectador ficticio <viewer@example.invalid>'},{name:'To',value:environment.GMAIL_READ_MAILBOX},{name:'Subject',value:'[Simulación local] Pregunta de prueba'},{name:'Message-Id',value:'<'+messageId+'@example.invalid>'},{name:'Date',value:'Mon, 12 Oct 2026 12:00:00 +0000'}];
 const part=d=>'partId,mimeType,filename,headers,body(size,attachmentId),parts('+(d<4?part(d+1):'partId,mimeType')+')',preflight='id,threadId,labelIds,payload('+part(0)+')',data=preflight.replace('body(size,attachmentId)','body(size,data,attachmentId)');
 const fail=()=>{throw Error('ISOLATION_BLOCKED: unexpected closed message request');};
 return async(url,init)=>{guard();const u=new URL(url);if(u.username||u.password||u.hash||!init||init.cache!=='no-store'||init.redirect!=='error'||!init.signal||init.signal.aborted)fail();const params=Object.fromEntries(u.searchParams),same=v=>[...u.searchParams.keys()].length===Object.keys(v).length&&Object.keys(params).length===Object.keys(v).length&&Object.keys(v).every(k=>params[k]===v[k]);let body;
 if(u.origin==='https://oauth2.googleapis.com'&&u.pathname==='/token'){
  if(u.search||init.method!=='POST'||init.credentials!=='omit'||init.headers?.Authorization)fail();const form=new URLSearchParams(init.body);if([...form.keys()].sort().join(',')!=='client_id,client_secret,grant_type,refresh_token'||form.get('client_id')!==environment.GMAIL_CLIENT_ID||form.get('client_secret')!==environment.GMAIL_CLIENT_SECRET||form.get('refresh_token')!==environment.GMAIL_REFRESH_TOKEN||form.get('grant_type')!=='refresh_token')fail();body={access_token:token,token_type:'Bearer',scope,expires_in:3600};
 }else if(u.origin==='https://gmail.googleapis.com'){
  if(init.method!=='GET'||init.body!==undefined||init.credentials!=='omit'||init.headers?.Authorization!=='Bearer '+token)fail();
  if(u.pathname==='/gmail/v1/users/me/profile'&&u.search==='')body={emailAddress:environment.GMAIL_READ_MAILBOX};
  else if(u.pathname==='/gmail/v1/users/me/messages'&&same({q:'is:unread in:inbox -from:'+environment.GMAIL_READ_MAILBOX,maxResults:'10',includeSpamTrash:'false'}))body={messages:[{id:messageId,threadId}],resultSizeEstimate:1};
  else if(u.pathname==='/gmail/v1/users/me/messages/'+messageId){
   const format=u.searchParams.get('format'),fields=u.searchParams.get('fields');
   if(format==='metadata'&&fields==='id,threadId,labelIds,payload(headers)'&&u.searchParams.getAll('metadataHeaders').join(',')==='From,To,Subject,Message-Id,Reply-To,Date,List-Unsubscribe'&&[...u.searchParams.keys()].length===9&&[...u.searchParams.keys()].every(k=>['format','fields','metadataHeaders'].includes(k)))body={id:messageId,threadId,labelIds:['INBOX','UNREAD'],payload:{headers}};
   else if(format==='full'&&(fields===preflight||fields===data)&&[...u.searchParams.keys()].sort().join(',')==='fields,format'){const bytes=Buffer.from(question);body={id:messageId,threadId,labelIds:['INBOX','UNREAD'],payload:{partId:'',mimeType:'text/plain',filename:'',headers:[...headers,{name:'Content-Type',value:'text/plain; charset="UTF-8"'}],body:{size:bytes.length,...(fields===data?{data:bytes.toString('base64url')}:{})}}};}
   else fail();
  }else fail();
 }else if(u.origin==='https://www.googleapis.com'&&u.pathname==='/youtube/v3/commentThreads'){
  if(init.method!=='GET'||init.body!==undefined||init.headers?.Authorization||u.searchParams.get('key')!==environment.YOUTUBE_API_KEY)fail();
  if(!same({part:'snippet',allThreadsRelatedToChannelId:environment.YOUTUBE_CHANNEL_ID,maxResults:'20',order:'time',textFormat:'plainText',key:environment.YOUTUBE_API_KEY})&&!same({part:'snippet',id:thread,textFormat:'plainText',key:environment.YOUTUBE_API_KEY}))fail();
  body={kind:'youtube#commentThreadListResponse',items:[{kind:'youtube#commentThread',id:thread,snippet:{channelId:environment.YOUTUBE_CHANNEL_ID,canReply:true,videoId:'synthetic-video',topLevelComment:{kind:'youtube#comment',id:commentId,snippet:{channelId:environment.YOUTUBE_CHANNEL_ID,textDisplay:question,authorDisplayName:'Espectador ficticio',authorChannelId:{value:author},publishedAt:date,updatedAt:date}}}}]};
 }else fail();
 guard();if(init.signal.aborted)fail();return Response.json(body);
 };
}
module.exports={environment,createMessagesFixtureTransport};
