'use strict';
function installFileGuard(fs,policy){
 const block=()=>{throw Error('ISOLATION_BLOCKED: unsupported runtime filesystem mutation');};
 const wrap=(target,name,check)=>{if(typeof target[name]!=='function')return;const original=target[name];target[name]=function(...args){check(args);return original.apply(this,args);};};
 const reading=args=>policy.read(args[0]);
 const writing=args=>policy.write(args[0]);
 const opening=args=>{policy.read(args[0]);const flags=args[1];const mask=fs.constants.O_WRONLY|fs.constants.O_RDWR|fs.constants.O_CREAT|fs.constants.O_TRUNC|fs.constants.O_APPEND;if(typeof flags==='number'?(flags&mask)!==0:typeof flags==='string'&&/[wa+]/.test(flags))policy.write(args[0]);};
 for(const target of [fs,fs.promises]){
  for(const name of ['readFile','readFileSync','readdir','readdirSync','openAsBlob'])wrap(target,name,reading);
  for(const name of ['writeFile','writeFileSync','appendFile','appendFileSync','mkdir','mkdirSync','unlink','unlinkSync','rm','rmSync','rmdir','rmdirSync','truncate','truncateSync','chmod','chmodSync','chown','chownSync','utimes','utimesSync','mkdtemp','mkdtempSync'])wrap(target,name,writing);
  for(const name of ['open','openSync'])wrap(target,name,opening);
  for(const name of ['rename','renameSync'])wrap(target,name,args=>{policy.write(args[0]);policy.write(args[1]);});
  for(const name of ['copyFile','copyFileSync'])wrap(target,name,args=>{policy.read(args[0]);policy.write(args[1]);});
  for(const name of ['symlink','symlinkSync','link','linkSync','cp','cpSync','fchmod','fchmodSync','fchown','fchownSync','ftruncate','ftruncateSync','futimes','futimesSync'])if(typeof target[name]==='function')target[name]=block;
 }
 wrap(fs,'createReadStream',reading);
 wrap(fs,'createWriteStream',args=>{if(args[1]?.fd!==undefined)block();writing(args);});
}
module.exports={installFileGuard};
