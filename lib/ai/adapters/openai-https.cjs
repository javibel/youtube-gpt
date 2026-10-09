'use strict';
const https=require('node:https'),tls=require('node:tls'),{isIP}=require('node:net');
const hostname='api.openai.com',endpoint='https://api.openai.com/v1/responses';
const failure=()=>new Error('Provider connection unavailable');
function publicIPv4(address){
 if(typeof address!=='string'||isIP(address)!==4)return false;
 const [a,b,c]=address.split('.').map(Number);
 // Conservative egress policy: no local, shared, documentation, protocol,
 // benchmark, multicast or reserved destinations. IPv6 is not enabled here.
 return a!==0&&a!==10&&a!==127&&a<224&&!(a===100&&b>=64&&b<=127)
  &&!(a===169&&b===254)&&!(a===172&&b>=16&&b<=31)
  &&!(a===192&&(b===168||(b===0&&(c===0||c===2))||(b===88&&c===99)))
  &&!(a===198&&(b===18||b===19||(b===51&&c===100)))&&!(a===203&&b===0&&c===113);
}
// This server capability is never installed at import/startup. Bootstrap must
// supply its resolver; a caller/configuration cannot choose host, port, CA,
// proxy, redirect, agent or lookup. The HTTP transport owns the total deadline.
function createOpenAIHttpsFetch(options={}){
 if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>!['resolveAddress','maxRequestBytes'].includes(k)))throw failure();
 const {resolveAddress,maxRequestBytes}=options;
 if(typeof resolveAddress!=='function'||!Number.isSafeInteger(maxRequestBytes)||maxRequestBytes<1||maxRequestBytes>16*1024*1024)throw failure();
 return async function fetch(url,init){
  if(url!==endpoint||!init||Object.keys(init).some(k=>!['method','headers','body','signal','redirect','credentials','cache'].includes(k))
   ||init.method!=='POST'||init.redirect!=='error'||init.credentials!=='omit'||init.cache!=='no-store'
   ||!(init.signal instanceof AbortSignal)||init.signal.aborted||typeof init.body!=='string'||Buffer.byteLength(init.body)>maxRequestBytes)throw failure();
  const headers=init.headers;
  if(!headers||Object.keys(headers).length!==3||headers['content-type']!=='application/json'||headers.accept!=='application/json'
   ||typeof headers.authorization!=='string'||!/^Bearer [\x21-\x7e]{1,16384}$/.test(headers.authorization))throw failure();
  // Capture all wire fields before async resolution. A DNS answer is a selector,
  // never peer identity; the built-in trust roots and hostname check remain required.
  const body=init.body,signal=init.signal,wireHeaders={authorization:headers.authorization,'content-type':'application/json',accept:'application/json'};
  let rejectAbort;const interrupted=new Promise((_,reject)=>{rejectAbort=reject;});void interrupted.catch(()=>{});
  const abortResolution=()=>rejectAbort(failure());signal.addEventListener('abort',abortResolution,{once:true});
  let address;
  try{address=await Promise.race([Promise.resolve().then(()=>{if(signal.aborted)throw failure();return resolveAddress({hostname,signal});}),interrupted]);}
  catch{throw failure();}finally{signal.removeEventListener('abort',abortResolution);}
  if(signal.aborted||!publicIPv4(address))throw failure();
  return new Promise((resolve,reject)=>{
   let request,incoming,agent,verified=false,settled=false,streamCreated=false,stopped=false;
   const cleanup=()=>{signal.removeEventListener('abort',abort);try{agent?.destroy();}catch{}};
   const stop=()=>{if(stopped)return;stopped=true;if(!settled){settled=true;reject(failure());}try{incoming?.destroy(streamCreated?failure():undefined);}catch{}try{request?.destroy(failure());}catch{}cleanup();};
   const abort=()=>stop();signal.addEventListener('abort',abort,{once:true});
   try{
    if(signal.aborted){stop();return;}
    agent=new https.Agent({keepAlive:false,maxCachedSessions:0,proxyEnv:{}});
    request=https.request({protocol:'https:',hostname,port:443,path:'/v1/responses',method:'POST',headers:wireHeaders,agent,
     family:4,autoSelectFamily:false,maxHeaderSize:16*1024,servername:hostname,minVersion:'TLSv1.2',rejectUnauthorized:true,
     ca:[...tls.rootCertificates],checkServerIdentity:tls.checkServerIdentity,
     lookup:(name,options,callback)=>{if(signal.aborted||name!==hostname){callback(failure());return;}if(options?.all)callback(null,[{address,family:4}]);else callback(null,address,4);}},response=>{
      incoming=response;
      if(signal.aborted||!verified||settled||!Number.isInteger(response.statusCode)){stop();return;}
      try{
       const selected=new Headers();for(const name of ['content-type','content-length'])if(response.headers[name]!==undefined){if(typeof response.headers[name]!=='string')throw failure();selected.set(name,response.headers[name]);}
       let closed=false;
       const bodyStream=new ReadableStream({
        start(controller){
         response.pause();
         const fail=()=>{if(!closed){closed=true;controller.error(failure());}stop();};
         response.on('data',chunk=>{if(closed)return;try{if(!Buffer.isBuffer(chunk))throw failure();controller.enqueue(chunk);if(controller.desiredSize<=0)response.pause();}catch{fail();}});
         response.once('end',()=>{if(closed)return;if(response.complete!==true){fail();return;}closed=true;controller.close();});
         response.on('error',fail);response.once('aborted',fail);
         response.once('close',()=>{cleanup();if(!closed)fail();});
        },
        pull(){if(!closed)response.resume();},
        cancel(){closed=true;stop();}
       },{highWaterMark:64*1024,size:chunk=>chunk.byteLength});streamCreated=true;
       settled=true;resolve({url:endpoint,redirected:false,status:response.statusCode,headers:selected,body:bodyStream});
      }catch{stop();}
     });
    request.on('error',stop);
    request.once('socket',socket=>{
     socket.once('secureConnect',()=>{
      try{
       if(signal.aborted||settled||socket.encrypted!==true||socket.authorized!==true||socket.remoteAddress!==address||socket.servername!==hostname
        ||tls.checkServerIdentity(hostname,socket.getPeerCertificate())){stop();return;}
       verified=true;request.end(body);
      }catch{stop();}
     });
    });
   }catch{stop();}
  });
 };
}
module.exports={createOpenAIHttpsFetch};
