'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createFilePolicy}=require('./runtime-file-policy.cjs');
const parent=path.resolve(__dirname,'../../../migration-file-fixtures');fs.mkdirSync(parent,{recursive:true});
const root=path.join(parent,randomUUID()),writable=path.join(root,'writable'),blocked=path.join(root,'operational-fixture');
fs.mkdirSync(root);fs.mkdirSync(writable);fs.mkdirSync(blocked);
let count=0;function test(fn){fn();count++;}
try{
 const policy=createFilePolicy({writableRoots:[writable],blockedReadRoots:[blocked]});
 test(()=>policy.write(path.join(writable,'new','file.json')));
 test(()=>policy.read(path.join(writable,'file.json')));
 for(const target of [path.join(root,'outside.json'),path.join(writable,'..','outside.json'),path.join(writable+'.suffix','file.json'),path.join(blocked,'file.json'),path.join(writable,'.git','config')])test(()=>assert.throws(()=>policy.write(target),/ISOLATION_BLOCKED/));
 test(()=>assert.throws(()=>policy.read(path.join(blocked,'secret-fixture.json')),/ISOLATION_BLOCKED/));
 test(()=>assert.throws(()=>policy.write(7),/ISOLATION_BLOCKED/));
 const link=path.join(writable,'linked');fs.symlinkSync(blocked,link,'junction');
 try{test(()=>assert.throws(()=>policy.write(path.join(link,'file.json')),/ISOLATION_BLOCKED/));test(()=>assert.throws(()=>policy.read(path.join(link,'file.json')),/ISOLATION_BLOCKED/));}finally{fs.unlinkSync(link);}
 console.log('PASS: '+count+' runtime file boundary checks with isolated fixture folders; no operational file read or written');
}finally{assert.equal(path.dirname(root),parent);fs.rmdirSync(writable);fs.rmdirSync(blocked);fs.rmdirSync(root);}
