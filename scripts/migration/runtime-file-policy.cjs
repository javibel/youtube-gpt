'use strict';
const fs=require('node:fs'),path=require('node:path'),{fileURLToPath}=require('node:url');
const blocked=()=>{throw Error('ISOLATION_BLOCKED: runtime file destination is outside the approved test storage');};
const inside=(root,target)=>{const relative=path.relative(root,target);return relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));};
function absolute(value){if(value instanceof URL)value=fileURLToPath(value);if(Buffer.isBuffer(value))value=value.toString();if(typeof value!=='string')blocked();return path.resolve(value);}
function physical(candidate){
 const resolved=absolute(candidate);let current=path.parse(resolved).root;
 for(const segment of resolved.slice(current.length).split(path.sep).filter(Boolean)){current=path.join(current,segment);try{if(fs.lstatSync(current).isSymbolicLink())blocked();}catch(error){if(error.code==='ENOENT')break;throw error;}}
 return resolved;
}
function createFilePolicy({writableRoots,blockedReadRoots}={}){
 if(!Array.isArray(writableRoots)||!writableRoots.length||!Array.isArray(blockedReadRoots)||!blockedReadRoots.length)blocked();
 const writable=writableRoots.map(physical),unreadable=blockedReadRoots.map(physical);
 return {
  read(target){if(typeof target==='number')return;const resolved=physical(target);if(unreadable.some(root=>inside(root,resolved)))blocked();},
  write(target){const resolved=physical(target);if(!writable.some(root=>inside(root,resolved))||resolved.split(path.sep).some(segment=>['.git','.codex','.agents'].includes(segment.toLowerCase())))blocked();},
 };
}
module.exports={createFilePolicy};
