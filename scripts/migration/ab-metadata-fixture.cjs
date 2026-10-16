'use strict';
const channelId='UC_synthetic_metadata';
function video(id,patch={}){const {views='12',...snippet}=patch;return{kind:'youtube#video',id,snippet:{channelId,title:'Original synthetic',description:'Keep description https://example.invalid',tags:['keep','metadata'],categoryId:'22',defaultLanguage:'en',...snippet},statistics:views===undefined?{}:{viewCount:String(views)}};}
const list=(id,patch)=>({kind:'youtube#videoListResponse',items:[video(id,patch)]});
const ack=payload=>({kind:'youtube#video',id:payload.id,snippet:{channelId,...payload.snippet}});
function response(producer,status=200){let once=false;return new Response(new ReadableStream({async pull(controller){if(once)return;once=true;try{const value=await producer();controller.enqueue(new TextEncoder().encode(typeof value==='string'?value:JSON.stringify(value)));controller.close();}catch(error){controller.error(error);}}},{highWaterMark:0}),{status,headers:{'content-type':'application/json'}});}
module.exports={channelId,video,list,ack,response};
