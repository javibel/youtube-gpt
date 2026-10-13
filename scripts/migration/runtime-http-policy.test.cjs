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

const {fixtureAuthRedirect}=require('../../lib/migration/local-auth-redirect.cjs');
test(()=>{
 for(const baseUrl of ['http://localhost:4300','http://127.0.0.1:4300']){
  assert.equal(fixtureAuthRedirect({baseUrl,url:'/'}),'http://127.0.0.1:4300/');
  assert.equal(fixtureAuthRedirect({baseUrl,url:'/login?error=test#access'}),'http://127.0.0.1:4300/login?error=test#access');
 }
});
test(()=>{
 for(const host of ['localhost','127.0.0.1'])
  assert.equal(fixtureAuthRedirect({baseUrl:'http://localhost:4300',url:`http://${host}:4300/dashboard?from=login`}),
   'http://127.0.0.1:4300/dashboard?from=login');
});
test(()=>{
 for(const url of ['https://example.invalid','//example.invalid','javascript:alert(1)',
  'http://localhost:3000','https://localhost:4300','http://localhost.evil.invalid:4300',
  'http://user:pass@localhost:4300','http://user@127.0.0.1:4300','http://[::1]:4300'])
  assert.equal(fixtureAuthRedirect({baseUrl:'http://localhost:4300',url}),'http://127.0.0.1:4300');
});
test(()=>{
 for(const baseUrl of ['https://ytubviral.com','http://localhost:3000','https://localhost:4300'])
  assert.throws(()=>fixtureAuthRedirect({baseUrl,url:'/'}),/ISOLATION_BLOCKED/);
});

// Load the actual Auth.js composition with inert dependencies. This checks that
// ordinary auth keeps its installed defaults and the fixture callback needs both guards.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function composition(marker,guard){
 const repo=path.resolve(__dirname,'../..');let options;
 const compile=file=>ts.transpileModule(fs.readFileSync(path.join(repo,file),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}
 }).outputText;
 const config={exports:{}};vm.runInNewContext(compile('auth.config.ts'),config);
 const sandbox={exports:{},process:{env:marker===undefined?{}:{YTV_MIGRATION_WEB_TEST:marker}},__ytvRuntimeGuard:guard,
  require(name){
   if(name==='next-auth')return value=>{options=value;return {handlers:{}};};
   if(name==='./auth.config')return config.exports;
   if(name==='./lib/migration/local-auth-redirect.cjs')return {fixtureAuthRedirect};
   if(name==='next-auth/providers/google'||name==='next-auth/providers/credentials')return value=>value;
   if(name==='@/lib/admin-email')return {ADMIN_EMAIL:'migration-admin@example.invalid'};
   if(name==='@/lib/features')return {AFFILIATES_DORMANT:true};
   if(name==='@/lib/totp-account'){const module={exports:{}};vm.runInNewContext(compile('lib/totp-account.ts'),{module,exports:module.exports});return module.exports;}
   if(['@/lib/prisma','bcryptjs','next/headers','otplib','@/lib/rate-limit-db','@/lib/admin-totp-consumption'].includes(name))return {};
   throw Error('Unexpected auth dependency in inert composition: '+name);
  }};
 vm.runInNewContext(compile('auth.ts'),sandbox);return options;
}
test(()=>{
 for(const [marker,guard]of [[undefined,undefined],['1',undefined],[undefined,true],['0',true],['1','true']])
  assert.equal(Object.hasOwn(composition(marker,guard).callbacks,'redirect'),false);
});
test(()=>{
 const callback=composition('1',true).callbacks.redirect;assert.equal(callback,fixtureAuthRedirect);
 assert.equal(callback({baseUrl:'http://localhost:4300',url:'/'}),'http://127.0.0.1:4300/');
});
console.log('PASS: '+count+' runtime policy checks including actual guarded Auth.js JSON redirect composition');
