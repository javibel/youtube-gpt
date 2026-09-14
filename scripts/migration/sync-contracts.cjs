'use strict';
const fs=require('node:fs');const path=require('node:path');const {createHash}=require('node:crypto');
const {validate}=require('./isolation.cjs');
const FILES=Object.freeze(['core.cjs','core.d.cts','core.test.cjs','coding.cjs','coding.d.cts','coding.test.cjs','control-store.cjs','control-store.d.cts','control-test.sql','task-runner.cjs','task-runner.d.cts','task-runner.test.cjs','build-schemas.cjs','request.schema.json','result.schema.json','configuration.schema.json','coding-request.schema.json','coding-result.schema.json','output-schema.schema.json','README.md']);
const digest=text=>createHash('sha256').update(text.replace(/\r\n/g,'\n')).digest('hex');
function manifestFor(contents){return {contractVersion:'1.0',normalization:'utf8-lf',files:Object.fromEntries(FILES.map(name=>[name,digest(contents[name])]))};}
function verify(contents,manifest){
 if(manifest.contractVersion!=='1.0'||manifest.normalization!=='utf8-lf'||JSON.stringify(Object.keys(manifest.files).sort())!==JSON.stringify([...FILES].sort()))throw Error('Invalid contract manifest');
 if(JSON.stringify(Object.keys(contents).sort())!==JSON.stringify([...FILES].sort()))throw Error('Missing or unexpected contract files');
 for(const name of FILES)if(digest(contents[name])!==manifest.files[name])throw Error('Contract content differs: '+name);
}
function directory(repo,create){
 let current=repo;
 for(const part of ['contracts','ai','v1']){current=path.join(current,part);if(!fs.existsSync(current)){if(!create)throw Error('Contract directory missing');fs.mkdirSync(current);}if(fs.lstatSync(current).isSymbolicLink()||!fs.statSync(current).isDirectory())throw Error('Redirected contract directory is forbidden');}
 return current;
}
function read(directory,allowMissing=false){
 const contents={};
 for(const entry of fs.readdirSync(directory))if(![...FILES,'manifest.json'].includes(entry))throw Error('Unexpected contract file: '+entry);
 for(const name of FILES){const file=path.join(directory,name);if(!fs.existsSync(file)){if(allowMissing)continue;throw Error('Missing contract file: '+name);}if(fs.lstatSync(file).isSymbolicLink()||!fs.statSync(file).isFile())throw Error('Contract entry is not a regular file');contents[name]=fs.readFileSync(file,'utf8');}
 return contents;
}
function readManifest(dir){const file=path.join(dir,'manifest.json');if(!fs.existsSync(file))return null;if(fs.lstatSync(file).isSymbolicLink())throw Error('Redirected manifest is forbidden');return JSON.parse(fs.readFileSync(file,'utf8'));}
function main(args){
 if(args.length!==1||!['--check','--write'].includes(args[0]))throw Error('Specify exactly --check or --write');
 const repo=path.resolve(__dirname,'../..'),root=path.dirname(repo);
 const config=JSON.parse(fs.readFileSync(path.join(root,'migration-config.json'),'utf8'));
 const isolation=validate(config,{root,operationalRoots:['C:/Users/jimen/youtube-gpt/youtube-gpt','C:/Users/jimen/youtube-gpt/local-agent'],environment:process.env});
 const write=args[0]==='--write';
 if(write&&repo.toLowerCase()!==isolation.paths.web.toLowerCase())throw Error('Only the canonical web copy may publish local contract changes');
 const sourceDir=directory(isolation.paths.web,false),source=read(sourceDir),candidate=manifestFor(source);
 const targetDir=directory(isolation.paths.agent,write);
 if(write){
  const existing=read(targetDir,true),previous=readManifest(targetDir);
  if(previous){
   if(previous.contractVersion!=='1.0'||previous.normalization!=='utf8-lf'||!previous.files||Object.keys(previous.files).some(name=>!FILES.includes(name)))throw Error('Invalid previous manifest');
   for(const [name,hash]of Object.entries(previous.files))if(typeof existing[name]!=='string'||digest(existing[name])!==hash)throw Error('Target contract has local changes: '+name);
   for(const [name,value]of Object.entries(existing))if(!Object.hasOwn(previous.files,name)&&digest(value)!==candidate.files[name])throw Error('Untracked target changes require review: '+name);
  }
  else for(const [name,value]of Object.entries(existing))if(digest(value)!==candidate.files[name])throw Error('Untracked target changes require review: '+name);
  const sourceManifest=path.join(sourceDir,'manifest.json');if(fs.existsSync(sourceManifest)&&fs.lstatSync(sourceManifest).isSymbolicLink())throw Error('Redirected source manifest is forbidden');
  // Explicit allowlist and one-way copy: no private agent material is read into web.
  for(const name of FILES)fs.writeFileSync(path.join(targetDir,name),source[name]);
  const serialized=JSON.stringify(candidate,null,2)+'\n';
  fs.writeFileSync(sourceManifest,serialized);fs.writeFileSync(path.join(targetDir,'manifest.json'),serialized);
 }
 const canonical=readManifest(sourceDir);if(!canonical)throw Error('Canonical contract manifest missing');
 verify(source,canonical);verify(read(targetDir),canonical);
 if(JSON.stringify(readManifest(targetDir))!==JSON.stringify(canonical))throw Error('Contract manifests differ');
 console.log(JSON.stringify({status:'PASS',contractVersion:'1.0',files:FILES.length,mode:write?'one-way local synchronization':'read-only comparison',normalization:'utf8-lf'}));
}
if(require.main===module){try{main(process.argv.slice(2));}catch(error){console.error(error.message);process.exitCode=1;}}
module.exports={FILES,manifestFor,verify};
