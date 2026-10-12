'use strict';
// Explicit offline diagnostic, never application startup or recovery authority.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const repo=path.resolve(__dirname,'../..'),root=path.dirname(repo);
const config=JSON.parse(fs.readFileSync(path.join(root,'migration-config.json'),'utf8'));
const checked=require('./isolation.cjs').validate(config,{root,operationalRoots:['C:/Users/jimen/youtube-gpt/youtube-gpt','C:/Users/jimen/youtube-gpt/local-agent'],environment:process.env});
assert.equal(fs.readFileSync(path.join(repo,'prisma/schema.prisma'),'utf8'),fs.readFileSync(path.join(repo,'node_modules/.prisma/client/schema.prisma'),'utf8'));
const prisma=new(require('@prisma/client').PrismaClient)({datasources:{db:{url:config.databaseUrl}}}),results=[];
const watchdog=setTimeout(()=>{console.error('Missing terminal diagnostic report');process.exit(1);},90000);
(async()=>{try{
 const identity=(await prisma.$queryRawUnsafe("SELECT current_database() AS db,current_setting('data_directory') AS directory"))[0];
 assert.equal(identity.db,'ytubviral_migration_test');assert.equal(path.resolve(identity.directory).toLowerCase(),path.resolve(checked.paths.database).toLowerCase());
 const users=await prisma.user.findMany({where:{email:{startsWith:'calendar-suggest-wait-'}},select:{id:true,email:true}}),ids=users.map(u=>u.id);
 const residue={users:users.length,subscriptions:await prisma.subscription.count({where:{userId:{in:ids}}}),entries:await prisma.calendarEntry.count({where:{userId:{in:ids}}}),creationReceipts:await prisma.calendarCreationReceipt.count({where:{userId:{in:ids}}}),mutationReceipts:await prisma.calendarMutationReceipt.count({where:{userId:{in:ids}}}),generations:await prisma.generation.count({where:{userId:{in:ids}}})};
 console.log(JSON.stringify({status:'OBSERVED',observedAt:new Date().toISOString(),identity,residue,users,scope:'Read-only designated synthetic rows after original40201 watchdog; no cleanup, recovery, provenance, freshness or authority inferred'},null,2));
}finally{await prisma.$disconnect();clearTimeout(watchdog);}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
