'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const repo=path.resolve(__dirname,'../..'),root=path.dirname(repo);
const config=JSON.parse(fs.readFileSync(path.join(root,'migration-config.json'),'utf8'));
const checked=require('./isolation.cjs').validate(config,{root,operationalRoots:['C:/Users/jimen/youtube-gpt/youtube-gpt','C:/Users/jimen/youtube-gpt/local-agent'],environment:process.env});
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(hash(path.join(repo,'prisma/schema.prisma')),hash(path.join(repo,'node_modules/.prisma/client/schema.prisma')));
const {PrismaClient}=require('@prisma/client'),prisma=new PrismaClient({datasources:{db:{url:config.databaseUrl}}}),results=[];
const timer=setTimeout(()=>{console.error('Missing signup PostgreSQL terminal');process.exit(1);},45000);
(async()=>{try{
 const identity=(await prisma.$queryRawUnsafe("SELECT current_database() AS db,current_setting('data_directory') AS directory"))[0];
 assert.equal(identity.db,'ytubviral_migration_test');assert.equal(path.resolve(identity.directory).toLowerCase(),path.resolve(checked.paths.database).toLowerCase());
 const columns=await prisma.$queryRawUnsafe("SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND ((table_name='email_verification_tokens' AND column_name='expires') OR (table_name='users' AND column_name='emailVerified'))");
 assert.equal(columns.length,2);assert.ok(columns.every(x=>x.data_type==='timestamp without time zone'));
 await require('./signup-database.cjs')(prisma,results);
 console.log(JSON.stringify({status:'PASS',scope:'Identified synthetic local PostgreSQL only; native atomic signup/notice/original ACK with closed declared Siteverify, closed mocked notice; no operative account/email/authentication acceptance',identity,results},null,2));
}catch(error){console.error(error.stack);process.exitCode=1;}finally{await prisma.$disconnect();clearTimeout(timer);}})();
