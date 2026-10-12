'use strict';
// Opt-in local PostgreSQL contract test; never run as part of application startup.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {randomUUID,createHash}=require('node:crypto');
const {validate}=require('./isolation.cjs');
const repo=path.resolve(__dirname,'../..');
const root=path.dirname(repo);
const config=JSON.parse(fs.readFileSync(path.join(root,'migration-config.json'),'utf8'));
const checked=validate(config,{root,operationalRoots:['C:/Users/jimen/youtube-gpt/youtube-gpt','C:/Users/jimen/youtube-gpt/local-agent'],environment:process.env});
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(hash(path.join(repo,'prisma/schema.prisma')),hash(path.join(repo,'node_modules/.prisma/client/schema.prisma')));
const {PrismaClient}=require('@prisma/client');
const prisma=new PrismaClient({datasources:{db:{url:config.databaseUrl}}});
const results=[],contractTimings=[];
let activeContract=null;
async function runContract(file,...args){activeContract=file;const began=performance.now();await require(file)(...args);contractTimings.push({file,elapsedMs:Math.round(performance.now()-began)});activeContract=null;}
// A pending Promise alone does not keep Node alive. Fail rather than let an
// unfinished database contract exit zero without its terminal report.
const completionWatchdog=setTimeout(()=>{console.error('FAIL: database contracts did not produce a terminal report within 120 seconds; active contract: ' + activeContract);process.exit(1);},120_000);
(async()=>{try{
 const identity=(await prisma.$queryRawUnsafe("SELECT current_database() AS db,current_setting('data_directory') AS directory"))[0];
 assert.equal(identity.db,'ytubviral_migration_test');
 assert.equal(path.resolve(identity.directory).toLowerCase(),path.resolve(checked.paths.database).toLowerCase());
 await runContract('./best-time-post-database.cjs',prisma,results);
 console.log(JSON.stringify({status:'PASS',identity,contractTimings,results},null,2));
 }finally{clearTimeout(completionWatchdog);await prisma.$disconnect();}})().catch(e=>{console.error(e);process.exitCode=1;});
