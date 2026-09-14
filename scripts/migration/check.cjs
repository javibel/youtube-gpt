'use strict';
const path=require('node:path');
const fs=require('node:fs');
const {validate}=require('./isolation.cjs');
const repo=path.resolve(__dirname,'../..');
const root=path.dirname(repo);
try {
 const config=JSON.parse(fs.readFileSync(path.join(root,'migration-config.json'),'utf8'));
 const result=validate(config,{root,operationalRoots:['C:/Users/jimen/youtube-gpt/youtube-gpt','C:/Users/jimen/youtube-gpt/local-agent'],environment:process.env});
 for(const repository of [result.paths.web,result.paths.agent]) {
  if(fs.existsSync(path.join(repository,'.git/objects/info/alternates')))throw Error('ISOLATION_BLOCKED: shared Git objects');
 }
 // A valid map is not evidence that legacy modules route effects through simulators.
 // Keep startup closed until that integration has its own end-to-end tests.
 if(process.argv.includes('--startup'))throw Error('ISOLATION_BLOCKED: legacy application adapters are not yet isolated; only offline tests may run');
 console.log(JSON.stringify(result,null,2));
} catch(error) {console.error(error.message.startsWith('ISOLATION_BLOCKED:')?error.message:'ISOLATION_BLOCKED: missing or unreadable test configuration');process.exitCode=1;}
