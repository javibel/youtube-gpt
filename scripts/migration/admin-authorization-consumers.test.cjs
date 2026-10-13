'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),ts=require('typescript');
const {load}=require('./route-harness.cjs'),{fixture}=require('./admin-native-authorization.test.cjs');
const root=path.resolve(__dirname,'../..');
function consumers(){
 const files=cp.execFileSync('git',['grep','-l','requireAdmin','--','app/api'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/);
 return files.flatMap(file=>{
 const source=ts.createSourceFile(file,fs.readFileSync(path.join(root,file),'utf8'),ts.ScriptTarget.Latest,true),imports=[];
 for(const node of source.statements)if(ts.isImportDeclaration(node)){
  const clause=node.importClause;if(!clause||clause.isTypeOnly)continue;
  const names=clause.namedBindings&&ts.isNamedImports(clause.namedBindings)?clause.namedBindings.elements.filter(x=>!x.isTypeOnly).map(x=>x.propertyName?.text??x.name.text):[];
  imports.push({name:node.moduleSpecifier.text,names,default:!!clause.name});
 }
 return source.statements.filter(node=>ts.isFunctionDeclaration(node)&&node.modifiers?.some(x=>x.kind===ts.SyntaxKind.ExportKeyword)&&['GET','POST','PATCH','DELETE','PUT'].includes(node.name?.text)).map(node=>({file,method:node.name.text,imports}));
 });
}
async function run(){
 const results=[];async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.stack});}}
 const found=consumers();assert.equal(found.length,18);assert.equal(new Set(found.map(x=>x.file)).size,14);
 const f=await fixture(),issued=await f.login();assert.equal(issued.decoded.isAdmin,true);
 for(const variant of ['pendingTotp','pendingVerification','noRole','bearerOnly'])for(const entry of found)
 await test(entry.method+' '+entry.file+' denies '+variant+' before native business/body/data/provider access',async()=>{
  if(variant==='bearerOnly')f.setHeaders({authorization:'Bearer '+issued.cookies[0].split('=')[1],'x-admin-proof':JSON.stringify(issued.decoded)});
  else await f.negativeCookie({...issued.decoded,...(variant==='pendingTotp'?{requiresTotp:true}:variant==='pendingVerification'?{requiresVerification:true}:{isAdmin:false})});
  const before={...f.calls};let business=0,body=0;
  const effect=()=>{business++;throw Error('Administrative action must never run before eligibility');};
  const forbiddenObject=new Proxy({},{get:effect});
  const mocks={'@/lib/auth-guards':f.guard,'next/server':{NextResponse:Response,NextRequest:Request}};
  for(const dependency of entry.imports){
   if(Object.hasOwn(mocks,dependency.name))continue;
   const module={};for(const name of dependency.names)module[name]=name==='prisma'||name==='stripe'?forbiddenObject:effect;
   if(dependency.default)module.default=forbiddenObject;
   if(dependency.default)module.__esModule=true;
   mocks[dependency.name]=module;
  }
  const route=load(entry.file,mocks);
  const nativeRequest=new Request('http://127.0.0.1:4300/'+entry.file.replace(/^app\//,'').replace(/\/route.ts$/,''),{method:entry.method,headers:{'content-type':'application/json','origin':'http://127.0.0.1:4300','x-admin-proof':JSON.stringify(issued.decoded)},...(entry.method==='GET'?{}:{body:JSON.stringify({actor:issued.decoded,email:issued.decoded.email,verified:true,totpVerified:true,action:'activate'})})});
  const request=new Proxy(nativeRequest,{get(target,key){
   if(['body','json','text','arrayBuffer','formData'].includes(key)){body++;throw Error('Denied request body must not be consumed');}
   const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }});
  const response=await route[entry.method](request);
  assert.equal(response.status,403);assert.deepEqual(await response.json(),{error:'No autorizado'});
  assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(response.headers.getSetCookie().length,0);
  assert.equal(body,0);assert.equal(business,0);assert.equal(f.calls.accountReads,before.accountReads);assert.equal(f.calls.native,before.native);assert.equal(f.calls.refresh,before.refresh);
 });
 return{status:results.every(x=>x.status==='PASS')?'PASS':'FAIL',scope:'Every currently tracked requireAdmin consumer (14 route modules, 18 HTTP handlers), actual shared guard/native JWE reader and installed Auth.js issuer; business dependencies/body explicitly blocked. Synthetic negative cookies and bearer proof only, no operational admin action, SQL/provider/mail/payment/model call or acceptance.',consumerInventory:found.map(({file,method})=>({file,method})),results};
}
module.exports={run};if(require.main===module)run().then(x=>{console.log(JSON.stringify(x,null,2));if(x.status!=='PASS')process.exitCode=1;}).catch(e=>{console.error(e.stack);process.exitCode=1;});
