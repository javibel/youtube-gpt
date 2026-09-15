'use strict';
const assert=require('node:assert/strict');
const {allowsDatabase,allowsListen}=require('./runtime-network-policy.cjs');
assert.equal(allowsDatabase({host:'127.0.0.1',port:55432}),true);
for(const options of [{host:'127.0.0.1',port:5432},{host:'localhost',port:55432},{host:'example.invalid',port:55432},{host:'127.0.0.1',port:55432,path:'pipe'},{host:'127.0.0.1',port:55432,fd:7}])assert.equal(allowsDatabase(options),false);
assert.equal(allowsListen([4300,'127.0.0.1']),true);
assert.equal(allowsListen([{port:4300,host:'127.0.0.1'}]),true);
for(const args of [[4300],[4300,'0.0.0.0'],[3000,'127.0.0.1'],['4300','127.0.0.1'],[{port:4300,host:'127.0.0.1',fd:7}],[{port:4300,host:'127.0.0.1',path:'pipe'}]])assert.equal(allowsListen(args),false);
console.log('PASS: 14 runtime network policy checks; only the designated test database and explicit loopback web listener are allowed');
