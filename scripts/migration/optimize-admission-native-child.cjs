'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{response,settle,draft}=require('./optimize-put-server.test.cjs');
const repo=path.resolve(__dirname,'../..'),root=path.dirname(repo),config=JSON.parse(fs.readFileSync(path.join(root,'migration-config.json'),'utf8')),checked=require('./isolation.cjs').validate(config,{root,operationalRoots:['C:/Users/jimen/youtube-gpt/youtube-gpt','C:/Users/jimen/youtube-gpt/local-agent'],environment:process.env});
const {PrismaClient}=require('@prisma/client'),prisma=new PrismaClient({datasources:{db:{url:config.databaseUrl}}}),[id,videoId,key,mode]=process.argv.slice(2),timer=setTimeout(()=>{console.error('Missing native original terminal');process.exit(1);},20000);
(async()=>{try{
 assert(['fresh','interrupt'].includes(mode));assert.match(videoId,/^synthetic-admission-opt-/);assert.match(key,/^synthetic-/);
 const identity=(await prisma.$queryRawUnsafe("SELECT current_database() AS db,current_setting('data_directory') AS directory"))[0];assert.equal(identity.db,'ytubviral_migration_test');assert.equal(path.resolve(identity.directory).toLowerCase(),path.resolve(checked.paths.database).toLowerCase());
 const owner=await prisma.user.findUnique({where:{id}});assert(owner);assert.match(owner.email,/^optimize-admission-.*@example\.invalid$/);
 const h=require('./optimize-admission-fixture.cjs')(prisma,owner,{input:{...draft(),videoId},key,beforePublication:mode==='interrupt'?()=>process.exit(72):undefined}),body=await response(h,503);await settle(h);console.log(JSON.stringify({status:'TERMINAL',httpStatus:503,body,puts:h.transports.filter(t=>t.init.method==='PUT').length,tokenCalls:h.tokens.length,historyCalls:h.queries.length}));
 }catch(e){console.error(e.stack);process.exitCode=1;}finally{await prisma.$disconnect();clearTimeout(timer);}})();
