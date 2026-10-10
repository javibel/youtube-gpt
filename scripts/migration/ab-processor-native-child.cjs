'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const repo=path.resolve(__dirname,'../..'),root=path.dirname(repo),config=JSON.parse(fs.readFileSync(path.join(root,'migration-config.json'),'utf8'));
const checked=require('./isolation.cjs').validate(config,{root,operationalRoots:['C:/Users/jimen/youtube-gpt/youtube-gpt','C:/Users/jimen/youtube-gpt/local-agent'],environment:process.env});
const {PrismaClient}=require('@prisma/client'),prisma=new PrismaClient({datasources:{db:{url:config.databaseUrl}}}),[userId,testId,mode]=process.argv.slice(2);
const watchdog=setTimeout(()=>{console.error('FAIL: native automatic admission did not terminate');process.exit(1);},20000);
(async()=>{try{
 assert(['fresh','interrupt'].includes(mode));const identity=(await prisma.$queryRawUnsafe("SELECT current_database() AS db,current_setting('data_directory') AS directory"))[0];assert.equal(identity.db,'ytubviral_migration_test');assert.equal(path.resolve(identity.directory).toLowerCase(),path.resolve(checked.paths.database).toLowerCase());
 const owner=await prisma.user.findUnique({where:{id:userId}});assert.match(owner.email,/^ab-admission-processor-.*@example\.invalid$/);const test=await prisma.abTest.findFirst({where:{id:testId,userId}});assert(test);assert.match(test.videoId,/^synthetic-admission-processor-/);
 const h=require('./ab-processor-fixture.cjs')(prisma,owner,{onTitle:mode==='interrupt'?()=>process.exit(72):undefined});const result=await h.run();console.log(JSON.stringify({status:'TERMINAL',result,puts:h.puts.length,modelCalls:h.calls.length}));
 }catch(e){console.error(e);process.exitCode=1;}finally{await prisma.$disconnect();clearTimeout(watchdog);}})();
