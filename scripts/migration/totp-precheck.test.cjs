'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),{authenticator}=require('otplib');
const root=path.resolve(__dirname,'../..'),epoch=Date.UTC(2026,9,13,0,0,0),secret='JBSWY3DPEHPK3PXP',otp=authenticator.clone({epoch,window:0}),code=otp.generate(secret),email='migration-admin-factor@example.invalid';
const principal=()=>({id:'native-factor-admin',email,isAdmin:true,requiresTotp:true});
const input=()=>({code,expectedUserId:'native-factor-admin',expectedEmail:email});
function harness({actor=principal(),configured=true,allowed=true,rateFailure=false,verifyFailure=false,authFailure=false}={}){
 const calls={limits:[],factors:0},cache=new Map();
 function load(name){if(cache.has(name))return cache.get(name);const entry={exports:{}};const compiled=ts.transpileModule(fs.readFileSync(path.join(root,name),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  vm.runInNewContext(compiled,{module:entry,exports:entry.exports,process:{env:configured?{ADMIN_TOTP_SECRET:secret}:{}},console:{error(){throw Error('Private log forbidden');}},require(id){
   if(id==='next/server')return{NextResponse:{json:(body,options)=>new Response(JSON.stringify(body),{status:options?.status??200,headers:{'Content-Type':'application/json'}})}};
   if(id==='@/auth')return{auth:async()=>{if(authFailure)throw Error('private-auth-error');return actor?{user:actor}:null;}};
   if(id==='@/lib/admin-email')return{ADMIN_EMAIL:email};
   if(id==='@/lib/totp-account')return load('lib/totp-account.ts');
   if(id==='@/lib/rate-limit-db')return{rateLimitDb:async(...args)=>{calls.limits.push(args);if(rateFailure)throw Error('private-sql-factor-error');return allowed;}};
   if(id==='otplib')return{authenticator:{verify(args){calls.factors++;if(verifyFailure)throw Error('private-otp-error');return otp.verify(args);}}};
   throw Error('Unexpected precheck effect: '+id);
  }},{filename:name});cache.set(name,entry.exports);return entry.exports;
 }
 return{post:load('app/api/auth/verify-totp/route.ts').POST,calls,actor};
}
async function run(){const results=[];
 async function invoke(data=input(),options={}){const h=harness(options),request=new Request('http://127.0.0.1:4300/api/auth/verify-totp',{method:'POST',headers:{'Content-Type':'application/json','x-real-ip':'127.0.0.1'},body:JSON.stringify(data)});const response=await h.post(request);return{status:response.status,body:await response.json(),...h};}
 async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.stack});}}
 await test('own native principal and native OTP return only preliminary acknowledgement, never clear gate',async()=>{const x=await invoke();assert.equal(x.status,200);assert.deepEqual(x.body,{verified:true});assert.equal(x.actor.requiresTotp,true);assert.equal(x.calls.factors,1);assert.deepEqual(JSON.parse(JSON.stringify(x.calls.limits)),[['verify-totp:127.0.0.1',10,15,true]]);});
 for(const actor of [null,{...principal(),id:''},{...principal(),id:42},{...principal(),isAdmin:false},{...principal(),email:'other@example.invalid'}])await test('native principal precondition denies preliminary factor for '+JSON.stringify(actor),async()=>{const x=await invoke(input(),{actor});assert.equal(x.status,401);assert.equal(x.calls.factors,0);assert.equal(x.calls.limits.length,0);});
 for(const value of [null,[],{}, {...input(),expectedUserId:'other'},{...input(),expectedEmail:'other@example.invalid'},{...input(),expectedUserId:42},{code,owner:principal(),receipt:{verified:true}}])await test('public account selector missing/foreign/serialized is rejected before factor or accounting '+JSON.stringify(value),async()=>{const x=await invoke(value);assert.equal(x.status,409);assert.deepEqual(x.body,{error:'session_changed'});assert.equal(x.calls.factors,0);assert.equal(x.calls.limits.length,0);});
 await test('account changes between capture and actual HTTP principal lookup',async()=>{const x=await invoke(input(),{actor:{...principal(),id:'second-native-admin'}});assert.equal(x.status,409);assert.equal(x.calls.factors,0);});
 for(const value of [123456,'00000','abcdef',null])await test('non-string/malformed credential cannot get a preliminary acknowledgement '+JSON.stringify(value),async()=>{const x=await invoke({...input(),code:value});assert.equal(x.status,400);assert.equal(x.calls.factors,0);assert.equal(x.calls.limits.length,1);});
 await test('previous fixed-epoch OTP stays expired without renewing its date',async()=>{const previous=authenticator.clone({epoch:epoch-30000,window:0}).generate(secret);assert.notEqual(previous,code);const x=await invoke({...input(),code:previous});assert.equal(x.status,400);assert.equal(x.calls.factors,1);});
 for(const options of [{configured:false},{rateFailure:true},{verifyFailure:true},{authFailure:true}])await test('failed configuration/native stage is sanitized and never acknowledged '+JSON.stringify(options),async()=>{const x=await invoke(input(),options);assert.equal(x.status,503);assert(!JSON.stringify(x.body).includes('private'));assert.notDeepEqual(x.body,{verified:true});});
 for(const allowed of [false,'true',null])await test('limiter must explicitly allow, never truthy '+JSON.stringify(allowed),async()=>{const x=await invoke(input(),{allowed});assert.equal(x.status,429);assert.equal(x.calls.factors,0);});
 return{status:results.every(x=>x.status==='PASS')?'PASS':'FAIL',scope:'Actual precheck route and account restriction, native Request/Response and native OTP at fixed synthetic epoch; authentication, principal issuance and SQL accounting are fixtures. This route grants no JWT authority. No real HTTP/CSRF/OAuth/account or operational MFA acceptance.',results};
}
module.exports={run};if(require.main===module)run().then(x=>{console.log(JSON.stringify(x,null,2));if(x.status!=='PASS')process.exitCode=1;}).catch(e=>{console.error(e.message);process.exitCode=1;});
