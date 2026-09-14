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
const results=[];
(async()=>{try{
 const identity=(await prisma.$queryRawUnsafe("SELECT current_database() AS db,current_setting('data_directory') AS directory"))[0];
 assert.equal(identity.db,'ytubviral_migration_test');
 assert.equal(path.resolve(identity.directory).toLowerCase(),path.resolve(checked.paths.database).toLowerCase());
 results.push('isolated database identity');
 const email='contract-'+randomUUID()+'@example.invalid';
 const user=await prisma.user.create({data:{email,name:'Synthetic contract test'}});
 try {
  assert.equal((await prisma.user.findUnique({where:{id:user.id}})).lang,'es');results.push('user create/read/defaults');
  await assert.rejects(prisma.user.create({data:{email}}),error=>error.code==='P2002');results.push('unique email constraint');
  const token='synthetic-'+randomUUID();
  await prisma.session.create({data:{userId:user.id,sessionToken:token,expires:new Date('2030-01-01')}});
  await prisma.user.delete({where:{id:user.id}});
  assert.equal(await prisma.session.count({where:{sessionToken:token}}),0);results.push('session cascade');
  await assert.rejects(prisma.$transaction(async tx=>{await tx.user.create({data:{email}});throw Error('synthetic rollback');}),/synthetic rollback/);
  assert.equal(await prisma.user.count({where:{email}}),0);results.push('transaction rollback');
 } finally { await prisma.user.deleteMany({where:{id:user.id,email}}); }
 console.log(JSON.stringify({status:'PASS',scope:'explicit isolated PostgreSQL data contracts',results},null,2));
}finally{await prisma.$disconnect();}})().catch(error=>{console.error(error.message);process.exitCode=1;});
