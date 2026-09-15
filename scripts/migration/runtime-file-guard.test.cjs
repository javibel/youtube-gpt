'use strict';
const assert=require('node:assert/strict');
const {installFileGuard}=require('./runtime-file-guard.cjs');
function harness(){const calls=[],checks=[];const fs={constants:{O_WRONLY:1,O_RDWR:2,O_CREAT:64,O_TRUNC:512,O_APPEND:1024},promises:{}};
 for(const target of [fs,fs.promises])for(const name of ['readFile','readFileSync','readdir','writeFile','appendFile','mkdir','unlink','rm','open','openSync','rename','copyFile','symlink','link','cp','ftruncate','createReadStream','createWriteStream'])target[name]=(...args)=>{calls.push({name,args});return 'synthetic-handle';};
 installFileGuard(fs,{read(value){checks.push('read:'+value);if(value==='operational')throw Error('ISOLATION_BLOCKED');},write(value){checks.push('write:'+value);if(value!=='allowed')throw Error('ISOLATION_BLOCKED');}});return {fs,calls,checks};}
let count=0;function test(fn){fn();count++;}
for(const name of ['writeFile','appendFile','mkdir','unlink','rm'])for(const promises of [false,true])test(()=>{const h=harness(),target=promises?h.fs.promises:h.fs;assert.equal(target[name]('allowed'),'synthetic-handle');assert.throws(()=>target[name]('outside'),/ISOLATION_BLOCKED/);assert.equal(h.calls.length,1);});
for(const flags of ['r+','w','a',2,64,512])test(()=>{const h=harness();assert.throws(()=>h.fs.open('outside',flags),/ISOLATION_BLOCKED/);assert.equal(h.calls.length,0);});
test(()=>{const h=harness();h.fs.open('dependency','r');assert.deepEqual(h.checks,['read:dependency']);});
for(const name of ['readFile','readdir','createReadStream'])test(()=>{const h=harness();assert.throws(()=>h.fs[name]('operational'),/ISOLATION_BLOCKED/);assert.equal(h.calls.length,0);});
for(const [name,args]of [['rename',['outside','allowed']],['rename',['allowed','outside']],['copyFile',['operational','allowed']],['copyFile',['dependency','outside']],['symlink',['dependency','allowed']],['link',['dependency','allowed']],['cp',['dependency','allowed']],['createWriteStream',['allowed',{fd:7}]],['ftruncate',[7]]])test(()=>{const h=harness();assert.throws(()=>h.fs[name](...args),/ISOLATION_BLOCKED/);assert.equal(h.calls.length,0);});
console.log('PASS: '+count+' runtime filesystem wrapper checks; callbacks, promises, streams, open flags, two-path operations and alias creation use explicit policies');
