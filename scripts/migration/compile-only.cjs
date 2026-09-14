'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {validate}=require('./isolation.cjs');
const repo=path.resolve(__dirname,'../..');
function plan(environment=process.env,args=[]){
 if(args.length)throw Error('ISOLATION_BLOCKED: compile check accepts no mode overrides');
 const root=path.dirname(repo);
 const config=JSON.parse(fs.readFileSync(path.join(root,'migration-config.json'),'utf8'));
 validate(config,{root,operationalRoots:['C:/Users/jimen/youtube-gpt/youtube-gpt','C:/Users/jimen/youtube-gpt/local-agent'],environment});
 const policy=JSON.parse(fs.readFileSync(path.join(__dirname,'compile-policy.json'),'utf8'));
 if(require(path.join(repo,'node_modules/next/package.json')).version!==policy.nextVersion)throw Error('ISOLATION_BLOCKED: Next compile behavior needs review after version change');
 for(const [name,expected] of Object.entries(policy.files)){
  const actual=createHash('sha256').update(fs.readFileSync(path.join(repo,name))).digest('hex');
  if(actual!==expected)throw Error('ISOLATION_BLOCKED: compile configuration changed: '+name);
 }
 const output=path.join(repo,'.next');
 if(fs.existsSync(output)&&fs.lstatSync(output).isSymbolicLink())throw Error('ISOLATION_BLOCKED: redirected build output');
 const env={};
 for(const key of ['PATH','Path','SystemRoot','SYSTEMROOT','ComSpec','COMSPEC','PATHEXT','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA'])if(environment[key])env[key]=environment[key];
 Object.assign(env,{NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',NEXT_TURBOPACK_USE_WORKER:'1',YTV_MIGRATION_COMPILE:'1'});
 return {cwd:repo,entry:path.join(repo,'node_modules/next/dist/bin/next'),argv:['build','--experimental-build-mode','compile'],env};
}
if(require.main===module){
 const task=plan(process.env,process.argv.slice(2));
 for(const key of Object.keys(process.env))delete process.env[key];
 Object.assign(process.env,task.env);process.chdir(task.cwd);
 process.argv=[process.execPath,task.entry,...task.argv];
 require(task.entry);
}
module.exports={plan};
