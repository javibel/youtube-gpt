'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const root=path.resolve(__dirname,'../..');
const cache=new Map();
function load(relative,mocks={},globals={}) {
 const file=path.resolve(root,relative);
 if(!file.startsWith(root+path.sep))throw Error('Test module escapes repository');
 if(!cache.has(file))cache.set(file,ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText);
 const entry={exports:{}};
 const context={module:entry,exports:entry.exports,Request,Response,URL,performance,setTimeout,clearTimeout,console:{log(){},warn(){},error(){}},process:{env:{}},fetch:()=>{throw Error('Unexpected network access in route test');},require(name){if(Object.hasOwn(mocks,name))return mocks[name];if(name==='@/lib/team-creation')return{createTeamOriginal(){throw Error('Team POST must be explicitly bound');}};if(name==='@/lib/optimize-score')return load('lib/optimize-score.ts');if(name==='@/lib/optimize-update')return{beginOptimizeUpdate(){throw Error('PUT admission must be explicitly bound');}};throw Error('Unexpected route dependency: '+name);},...globals};
 vm.runInNewContext(cache.get(file),context,{filename:relative});
 return entry.exports;
}
module.exports={load};
