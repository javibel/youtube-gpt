'use strict';
const assert=require('assert/strict'),{transport:metadata,item}=require('./gmail-metadata-fixture.cjs');
function fieldsAt(dataDepth){const part=d=>'partId,mimeType,filename,headers,body(size,'+(d===dataDepth?'data,':'')+'attachmentId),parts('+(d<4?part(d+1):'partId,mimeType')+')';return'id,threadId,labelIds,payload('+part(0)+')';}
const fields=fieldsAt(0),mimeFields=fieldsAt(),dataFields=[0,1,2,3,4].map(fieldsAt);
function full(n=1,content='PRIVATE NATIVE TEXT'){const bytes=Buffer.from(content);return{...item(n),labelIds:['INBOX','UNREAD'],payload:{partId:'',mimeType:'text/plain',filename:'',headers:[{name:'From',value:'Closed reader <viewer@example.invalid>'},{name:'Subject',value:'Closed support question'},{name:'Message-Id',value:'<closed@example.invalid>'},{name:'Content-Type',value:'text/plain; charset="UTF-8"'}],body:{size:bytes.length,data:bytes.toString('base64url')}}};}
function multipart(n=1,{texts=['PRIVATE FIRST','PRIVATE SECOND'],depth=1}={}){
 const message=full(n),container=(level,prefix)=>({partId:prefix,mimeType:'multipart/mixed',filename:'',headers:[{name:'Content-Type',value:'multipart/mixed; boundary="closed"'}],body:{size:0},parts:level===1?texts.map((text,i)=>({...full(n,text).payload,partId:(prefix?prefix+'.':'')+i,headers:[{name:'Content-Type',value:'text/plain; charset="UTF-8"'}]})):[container(level-1,(prefix?prefix+'.':'')+'0')]});
 const tree=container(depth,'');tree.headers=[...message.payload.headers.slice(0,-1),...tree.headers];message.payload=tree;return message;
}
function project(p,depth,dataDepth){if(depth===5)return{partId:p.partId,mimeType:p.mimeType};if(p.body&&depth!==dataDepth)delete p.body.data;if(Array.isArray(p.parts))p.parts=p.parts.map(v=>project(v,depth+1,dataDepth));return p;}
function transport(o={}){
 const t=metadata(o.metadata??{count:o.count,expires:o.expires,hasMore:o.hasMore}),http=[],bodies=[],preflights=[],data=[];
 return{env:{...t.env,GMAIL_TEXT_READ_ENABLED:'true',...o.env},metadata:t,http,bodies,preflights,data,fetch(url,settings,stage){
  const u=new URL(url);if(u.searchParams.get('format')!=='full')return t.fetch(url,settings,stage);
  assert.equal(u.origin,'https://gmail.googleapis.com');assert(/^\/gmail\/v1\/users\/me\/messages\/[a-f0-9]+$/.test(u.pathname));
  const mask=u.searchParams.get('fields'),mime=mask===mimeFields,depth=dataFields.indexOf(mask);assert(mime||depth>=0,'Only bounded depth field masks,no selector/filter/attachment requests');
  assert.deepEqual([...u.searchParams.keys()].sort(),['fields','format']);assert.equal(settings.method,'GET');assert.equal(settings.body,undefined);assert.equal(settings.cache,'no-store');assert.equal(settings.redirect,'error');assert.equal(settings.credentials,'omit');assert.equal(settings.headers.Authorization,'Bearer closed-access-token');assert(settings.signal instanceof AbortSignal);
  http.push({url,method:settings.method,mime,depth:mime?undefined:depth});(mime?preflights:data).push(url);const opts=mime?(o.mime??{}):o;
  return stage(mime?'gmail-mime':'gmail-text',async()=>{
   const n=parseInt(u.pathname.split('/').pop(),16);let value=JSON.parse(JSON.stringify(o.message?o.message(n):full(n,o.text??'PRIVATE NATIVE TEXT')));value.payload=project(value.payload,0,mime?undefined:depth);
   if(o.change)value=o.change(value,n)??value;if(mime&&value.payload.body)delete value.payload.body.data;const change=mime?o.changeMime:o.changeData;if(change)value=change(value,n)??value;
   let canceled=false;const stream=new ReadableStream({start(c){stage(mime?'gmail-mime-body':'gmail-text-body',async()=>{bodies.push(n);if(canceled)return;const bytes=opts.bytes??new TextEncoder().encode(opts.raw??JSON.stringify(value));if(opts.chunks)for(let i=0;i<opts.chunks;i++)c.enqueue(new Uint8Array());else c.enqueue(bytes);c.close();}).catch(e=>{if(!canceled)c.error(e);});},cancel(){canceled=true;}}),response=new Response(stream,{status:opts.status??200,headers:{'content-type':opts.contentType??'application/json'}});
   if(opts.redirected)Object.defineProperty(response,'redirected',{value:true});if(opts.wrongUrl)Object.defineProperty(response,'url',{value:'https://foreign.invalid'});return response;
  });
 }};
}
module.exports={transport,full,multipart,fields,mimeFields,fieldsAt};
