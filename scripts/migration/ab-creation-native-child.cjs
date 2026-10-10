'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const repo=path.resolve(__dirname,'../..'),root=path.resolve(repo,'..'),config=JSON.parse(fs.readFileSync(path.join(root,'migration-config.json'),'utf8'));
const checked=require('./isolation.cjs').validate(config,{root,operationalRoots:['C:/Users/jimen/youtube-gpt/youtube-gpt','C:/Users/jimen/youtube-gpt/local-agent'],environment:process.env});
const {PrismaClient}=require('@prisma/client'),prisma=new PrismaClient({datasources:{db:{url:config.databaseUrl}}}),[userId,videoId,mode]=process.argv.slice(2);
const watchdog=setTimeout(()=>{console.error('FAIL: native fresh admission did not terminate');process.exit(1);},20000);
(async()=>{try{
 assert(['fresh','interrupt','cancel','winner','interrupt-cancel','interrupt-winner'].includes(mode));assert.match(videoId,/^synthetic-admission-/);
 const identity=(await prisma.$queryRawUnsafe("SELECT current_database() AS db,current_setting('data_directory') AS directory"))[0];assert.equal(identity.db,'ytubviral_migration_test');assert.equal(path.resolve(identity.directory).toLowerCase(),path.resolve(checked.paths.database).toLowerCase());
 const owner=await prisma.user.findUnique({where:{id:userId}});assert(owner);assert.match(owner.email,/^ab-admission-.*@example\.invalid$/);
 const h=require('./ab-creation-fixture.cjs')(prisma,owner,{expectedTitle:mode.includes('cancel')?'Original synthetic':'A synthetic',onTitle:mode.startsWith('interrupt')?()=>process.exit(72):undefined});
 let result;if(['fresh','interrupt'].includes(mode))result=await h.create(videoId);else{const testId=process.argv[5],row=await prisma.abTest.findFirst({where:{id:testId,userId,videoId}});assert(row);const response=await h.mutate(testId,mode.includes('cancel')?'cancel':'apply_winner');result={status:response.status,...await response.json()};}console.log(JSON.stringify({status:'TERMINAL',result,puts:h.puts.length}));
 }catch(e){console.error(e);process.exitCode=1;}finally{await prisma.$disconnect();clearTimeout(watchdog);}})();
