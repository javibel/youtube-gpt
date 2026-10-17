'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),{load}=require('./route-harness.cjs');
function installTransport(b,o={}){
 if(b.facebookTransportInstalled)return b;b.facebookTransportInstalled=true;Object.assign(b.env,{META_PAGE_ID:'123456',META_PAGE_ACCESS_TOKEN:'closed-token',META_APP_SECRET:'closed-secret',FACEBOOK_GRAPH_API_VERSION:'v24.0'});
 b.graphCalls??=[];b.globals.ReadableStream=ReadableStream;
 const blobFetch=b.globals.fetch;
 b.globals.fetch=(url,settings)=>String(url).startsWith('https://graph.facebook.com/')?b.stage('facebook-photo',async()=>{
  b.graphCalls.push({url,settings});assert.equal(url,'https://graph.facebook.com/v24.0/'+b.env.META_PAGE_ID+'/photos');assert.equal(settings.method,'POST');assert.equal(settings.redirect,'error');assert.equal(settings.cache,'no-store');assert(settings.signal instanceof AbortSignal);
  const body=JSON.parse(settings.body);assert.equal(body.access_token,'closed-token');assert.equal(body.appsecret_proof,crypto.createHmac('sha256','closed-secret').update('closed-token').digest('hex'));assert.equal(body.caption,o.text??'Closed social draft');assert.match(body.url,/^https:\/\/closedstore\.public\.blob\.vercel-storage\.com\/social-cron\//);
  let first=true;return new Response(new ReadableStream({async pull(controller){if(!first)return;first=false;try{const bytes=await b.stage('facebook-photo-body',async()=>Buffer.from(JSON.stringify(o.graphBody??{id:'777',post_id:'123456_888'})));controller.enqueue(bytes);controller.close();}catch(error){controller.error(error);}}}),{status:o.graphStatus??200,headers:{'content-type':'application/json'}});
 }):blobFetch(url,settings);
 b.transport=load('lib/agent/cron-facebook-photo-transport.ts',{'node:crypto':crypto},b.globals);b.mocks['./ideogram-image']=b.cronImageHelper;b.mocks['./cron-facebook-photo-transport']=b.transport;
 return b;
}
module.exports={installTransport};
