'use strict';
const origin='http://127.0.0.1:4300';
const csp="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'";
function header(name,value){
 if(name.toLowerCase()==='content-security-policy')return csp;
 if(name.toLowerCase()==='location'){
  const target=Array.isArray(value)&&value.length===1?value[0]:value;
  // NextURL normalizes loopback addresses to localhost. Keep one browser origin.
  if(typeof target==='string'){
   const local=new URL(target,origin);
   if(local.origin==='http://localhost:4300'&&!local.username&&!local.password){local.hostname='127.0.0.1';return Array.isArray(value)?[local.href]:local.href;}
  }
  if(typeof target!=='string'||new URL(target,origin).origin!==origin)throw Error('ISOLATION_BLOCKED: external runtime navigation ('+(typeof target==='string'?new URL(target,origin).origin:'invalid header')+')');
 }
 return value;
}
function restrictHeaders(headers){
 if(Array.isArray(headers)){const result=[...headers];for(let i=0;i<result.length;i+=2)result[i+1]=header(result[i],result[i+1]);return [...result,'Content-Security-Policy',csp];}
 return {...Object.fromEntries(Object.entries(headers??{}).map(([name,value])=>[name,header(name,value)])),'Content-Security-Policy':csp};
}
function protectResponse(response){
 const setHeader=response.setHeader,writeHead=response.writeHead;
 response.setHeader=function(name,value){return setHeader.call(this,name,header(name,value));};
 response.writeHead=function(...args){if(args[1]&&typeof args[1]==='object')args[1]=restrictHeaders(args[1]);else if(args[2])args[2]=restrictHeaders(args[2]);this.setHeader('Content-Security-Policy',csp);return writeHead.apply(this,args);};
 response.setHeader('Content-Security-Policy',csp);
}
module.exports={origin,csp,protectResponse};
