'use strict';
const assert=require('node:assert/strict');
const {protectResponse,csp}=require('./runtime-http-policy.cjs');
function response(){const headers={};const result={headers,setHeader(name,value){headers[name.toLowerCase()]=value;return this;},writeHead(...args){this.args=args;return this;}};protectResponse(result);return result;}
let count=0;function test(fn){fn();count++;}
test(()=>{const r=response();r.setHeader('content-security-policy','default-src *');assert.equal(r.headers['content-security-policy'],csp);});
test(()=>{const r=response();r.writeHead(200,{'Content-Security-Policy':'default-src *','Set-Cookie':['first=synthetic','second=synthetic']});assert.equal(r.args[1]['Content-Security-Policy'],csp);assert.deepEqual(r.args[1]['Set-Cookie'],['first=synthetic','second=synthetic']);});
test(()=>{const r=response();r.writeHead(200,'OK',['Set-Cookie','first=synthetic','Set-Cookie','second=synthetic']);assert.equal(r.args[2].filter(value=>value==='Set-Cookie').length,2);});
for(const value of ['/admin/ai-configuration','http://127.0.0.1:4300/login',['/login']])test(()=>response().setHeader('Location',value));
for(const value of ['https://example.invalid','//example.invalid','javascript:alert(1)','http://127.0.0.1:3099'])test(()=>assert.throws(()=>response().setHeader('Location',value),/ISOLATION_BLOCKED/));
test(()=>assert.throws(()=>response().writeHead(302,{Location:'https://example.invalid'}),/ISOLATION_BLOCKED/));
for(const value of [['https://example.invalid'],['/login','https://example.invalid'],[]])test(()=>assert.throws(()=>response().setHeader('Location',value),/ISOLATION_BLOCKED/));
console.log('PASS: '+count+' runtime browser policy checks; external resources and redirects restricted while local session cookies are retained');
test(()=>{const r=response();r.setHeader('Location','http://localhost:4300/login?error=test');assert.equal(r.headers.location,'http://127.0.0.1:4300/login?error=test');});
for(const value of ['http://localhost:3000/login','https://localhost:4300/login','http://user@localhost:4300/login'])test(()=>assert.throws(()=>response().setHeader('Location',value),/ISOLATION_BLOCKED/));
console.log('PASS: '+count+' checks including framework loopback canonicalization');
