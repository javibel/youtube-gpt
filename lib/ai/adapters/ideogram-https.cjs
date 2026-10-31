'use strict';
const https=require('node:https'),tls=require('node:tls'),{isIP}=require('node:net');
const {performance}=require('node:perf_hooks');
const {setTimeout,clearTimeout}=require('node:timers');
const {randomBytes}=require('node:crypto');
const hostname='api.ideogram.ai',endpoint='https://api.ideogram.ai/v1/ideogram-v3/generate';
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
function createIdeogramHttpsFetch(options={}){
 if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>!['resolveAddress','maxRequestBytes'].includes(k)))throw failure();
 const {resolveAddress,maxRequestBytes}=options;
 if(typeof resolveAddress!=='function'||!Number.isSafeInteger(maxRequestBytes)||maxRequestBytes<1||maxRequestBytes>65536)throw failure();
 const retirement=new AbortController(),pending=new Set(),observed=new WeakMap();
 let retired=false,originalStop;
 const observePromise=promise=>{
  const original={kind:'dns',promise};pending.add(original);
  void promise.finally(()=>pending.delete(original)).catch(()=>{});return promise;
 };
 const observeClose=(native,kind)=>{
  if(!native||!['object','function'].includes(typeof native))return;
  if(observed.has(native))return observed.get(native);
  let resolve;const promise=new Promise(done=>{resolve=done;}),original={kind,promise};observed.set(native,promise);pending.add(original);
  // An object without an observable close remains pending, never absent.
  if(typeof native.once==='function')native.once('close',()=>{pending.delete(original);resolve();});
  return promise;
 };
 function stop(options){
  if(originalStop)return originalStop;
  if(!options||typeof options!=='object'||Array.isArray(options)||Reflect.ownKeys(options).length!==1)throw failure();
  const timeout=Object.getOwnPropertyDescriptor(options,'timeoutMs');
  if(!timeout||!Object.hasOwn(timeout,'value')||!Number.isSafeInteger(timeout.value)||timeout.value<1||timeout.value>30000)throw failure();
  const deadline=performance.now()+timeout.value,originals=[...pending];let finish,timer;
  originalStop=new Promise(resolve=>{finish=resolve;});retired=true;
  const expired=new Promise(resolve=>{timer=setTimeout(()=>resolve(false),Math.max(0,deadline-performance.now()));});
  retirement.abort();
  void Promise.race([Promise.allSettled(originals.map(original=>original.promise)).then(()=>true),expired]).then(complete=>{
   clearTimeout(timer);const drained=complete===true&&pending.size===0&&performance.now()<=deadline;
   finish(Object.freeze({drained,uncertain:!drained,closed:drained,pending:pending.size,dnsPending:[...pending].filter(original=>original.kind==='dns').length,nativePending:[...pending].filter(original=>original.kind!=='dns').length,accepting:false,restartAllowed:false}));
  });
  return originalStop;
 }
 async function fetch(url,init){
  if(retired)throw failure();
  if(url!==endpoint||!init||Object.keys(init).some(k=>!['method','headers','body','signal','redirect','cache'].includes(k))||init.method!=='POST'||init.redirect!=='error'||init.cache!=='no-store'||!(init.signal instanceof AbortSignal)||init.signal.aborted||!(init.body instanceof FormData))throw failure();
  const headers=init.headers;
  if(!headers||Object.keys(headers).length!==1||typeof headers['Api-Key']!=='string'||! /^[\x21-\x7e]{1,16384}$/.test(headers['Api-Key']))throw failure();
  // Only the original six text fields; never accept files, arbitrary multipart
  // metadata, a caller boundary or CR/LF in field names. Capture before DNS.
  const fields=[...init.body.entries()],expected=['prompt','resolution','rendering_speed','magic_prompt','style_type','negative_prompt'];
  if(fields.length!==6||new Set(fields.map(([k])=>k)).size!==6||fields.some(([k,v])=>!expected.includes(k)||typeof v!=='string')||init.body.get('resolution')!=='1024x1024'||init.body.get('rendering_speed')!=='TURBO'||init.body.get('magic_prompt')!=='ON'||init.body.get('style_type')!=='REALISTIC'||!init.body.get('prompt')||init.body.get('prompt').length>4096||init.body.get('negative_prompt')!=='text, words, letters, numbers, watermark, logo, blurry, low quality, distorted')throw failure();
  const boundary='ytv-'+randomBytes(24).toString('hex');
  const body=Buffer.from(fields.map(([k,v])=>'--'+boundary+'\r\nContent-Disposition: form-data; name="'+k+'"\r\n\r\n'+v+'\r\n').join('')+'--'+boundary+'--\r\n');
  if(body.length>maxRequestBytes)throw failure();
  const signal=AbortSignal.any([init.signal,retirement.signal]),wireHeaders={'Api-Key':headers['Api-Key'],'Content-Type':'multipart/form-data; boundary='+boundary,'Content-Length':String(body.length),accept:'application/json'};
  let rejectAbort;const interrupted=new Promise((_,reject)=>{rejectAbort=reject;});void interrupted.catch(()=>{});
  const abortResolution=()=>rejectAbort(failure());signal.addEventListener('abort',abortResolution,{once:true});
  let address;
  const resolution=observePromise(Promise.resolve().then(()=>{if(signal.aborted)throw failure();return resolveAddress({hostname,signal});}));
  try{address=await Promise.race([resolution,interrupted]);}
  catch{throw failure();}finally{signal.removeEventListener('abort',abortResolution);}
  if(signal.aborted||!publicIPv4(address))throw failure();
  const pathname='/v1/ideogram-v3/generate';
  return new Promise((resolve,reject)=>{
   const nativeClosures=new Set(),rememberClose=(native,kind)=>{const original=observeClose(native,kind);if(original)nativeClosures.add(original);};
   let request,incoming,agent,verified=false,settled=false,streamCreated=false,stopped=false;
   const cleanup=()=>{signal.removeEventListener('abort',abort);try{agent?.destroy();}catch{}};
   const stop=()=>{if(stopped)return;stopped=true;if(!settled){settled=true;reject(failure());}try{incoming?.destroy(streamCreated?failure():undefined);}catch{}try{request?.destroy(failure());}catch{}cleanup();};
   const abort=()=>stop();signal.addEventListener('abort',abort,{once:true});
   try{
    if(signal.aborted){stop();return;}
    agent=new https.Agent({keepAlive:false,maxCachedSessions:0,proxyEnv:{}});
    // Observe a native TLS socket as soon as the Agent creates it, before the
    // ClientRequest's later socket event. A consumer rejection is not closure.
    const createConnection=agent.createConnection;
    if(typeof createConnection==='function')agent.createConnection=function(...args){
     const last=args.length-1,callback=args[last];
     if(typeof callback==='function')args[last]=function(...result){rememberClose(result[1],'socket');return callback.apply(this,result);};
     const socket=createConnection.apply(this,args);rememberClose(socket,'socket');return socket;
    };
    request=https.request({protocol:'https:',hostname,port:443,path:pathname,method:'POST',headers:wireHeaders,agent,
     family:4,autoSelectFamily:false,maxHeaderSize:16*1024,servername:hostname,minVersion:'TLSv1.2',rejectUnauthorized:true,
     ca:[...tls.rootCertificates],checkServerIdentity:tls.checkServerIdentity,
     lookup:(name,options,callback)=>{if(signal.aborted||name!==hostname){callback(failure());return;}if(options?.all)callback(null,[{address,family:4}]);else callback(null,address,4);}},response=>{
      incoming=response;
      rememberClose(response,'response');
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
       settled=true;resolve({url,ok:response.statusCode>=200&&response.statusCode<300,redirected:false,status:response.statusCode,headers:selected,body:bodyStream,nativeClosed:()=>Promise.all([...nativeClosures])});
      }catch{stop();}
     });
    rememberClose(request,'request');
    request.on('error',stop);
    request.once('socket',socket=>{
     rememberClose(socket,'socket');
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
 }
 Object.defineProperty(fetch,'stop',{value:stop,writable:false,configurable:false});
 return fetch;
}
module.exports={createIdeogramHttpsFetch};
