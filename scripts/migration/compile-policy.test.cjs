'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const entry=path.join(__dirname,'compile-only.cjs'),repo=path.resolve(__dirname,'../..');
const policy=JSON.parse(fs.readFileSync(path.join(__dirname,'compile-policy.json'),'utf8'));
let passed=0;
function test(name,fn){fn();passed++;console.log('PASS '+name);}
function planner({version='16.3.6',tamper=null,redirect=false}={}){
 const module={exports:{}};
 const fakeFs={...fs,readFileSync(file,...args){
   if(tamper&&file===path.join(repo,tamper))return Buffer.from('changed compiler/configuration');
   return fs.readFileSync(file,...args);
 },existsSync(file){return file===path.join(repo,'.next')?redirect:fs.existsSync(file);},lstatSync(file){return file===path.join(repo,'.next')?{isSymbolicLink:()=>redirect}:fs.lstatSync(file);}};
 const imports=[];
 function importLocal(name){
  imports.push(name);
  if(name==='node:fs')return fakeFs;
  if(name==='node:path'||name==='node:crypto')return require(name);
  if(name==='./isolation.cjs')return require(name);
  if(name===path.join(repo,'node_modules/next/package.json'))return {version};
  throw Error('Unexpected compiler execution/import: '+name);
 }
 vm.runInNewContext(fs.readFileSync(entry,'utf8'),{module,exports:module.exports,require:importLocal,__dirname,process:{env:{}}},{filename:entry});
 return {plan:module.exports.plan,imports};
}
test('reviewed compiler plan keeps compile-only mode and sanitized environment',()=>{
 const {plan,imports}=planner();const p=plan({PATH:'synthetic-path',HTTP_PROXY:'synthetic-proxy',YTV_MIGRATION_WEB_TEST:'1'});
 assert.equal(p.cwd,repo);assert.equal(p.entry,path.join(repo,'node_modules/next/dist/bin/next'));
 assert.deepEqual(Array.from(p.argv),['build','--experimental-build-mode','compile']);
 assert.equal(p.env.HTTP_PROXY,undefined);assert.equal(p.env.YTV_MIGRATION_WEB_TEST,undefined);
 assert.equal(p.env.NEXT_TELEMETRY_DISABLED,'1');assert.equal(p.env.YTV_MIGRATION_COMPILE,'1');
 assert.ok(!imports.includes(p.entry));
});
for(const version of ['16.3.3','16.3.7','16.3.6-canary.1'])test('unreviewed compiler version blocked '+version,()=>assert.throws(()=>planner({version}).plan({}),/needs review after version change/));
for(const file of Object.keys(policy.files))test('tampered pinned configuration/compiler blocked '+file,()=>assert.throws(()=>planner({tamper:file}).plan({}),/compile configuration changed/));
for(const args of [['--experimental-build-mode','generate'],['--webpack'],['--help']])test('mode override blocked '+args.join(' '),()=>assert.throws(()=>planner().plan({},args),/accepts no mode overrides/));
test('redirected build output is blocked',()=>assert.throws(()=>planner({redirect:true}).plan({}),/redirected build output/));
test('only the isolated compiler selects the guarded PostCSS worker backend',()=>{
 const ts=require('typescript');
 const javascript=ts.transpileModule(fs.readFileSync(path.join(repo,'next.config.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 for(const value of [undefined,'0','true','1']){
  const module={exports:{}},environment=value===undefined?{}:{YTV_MIGRATION_COMPILE:value};
  vm.runInNewContext(javascript,{module,exports:module.exports,process:{env:environment}},{filename:'next.config.ts'});
  const config=module.exports.default;
  if(value==='1'){
   assert.equal(config.experimental.workerThreads,true);
   assert.equal(config.experimental.useTypeScriptCli,false);
   assert.equal(config.experimental.turbopackPluginRuntimeStrategy,'workerThreads');
  }else assert.equal(config.experimental,undefined);
 }
});
console.log('PASS: '+passed+' compile policy checks; no compiler, network or application execution');
