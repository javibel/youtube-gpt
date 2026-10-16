'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {plan}=require('./compile-only.cjs');
(async()=>{
 const task=plan(process.env,process.argv.slice(2));
 const config=JSON.parse(fs.readFileSync(path.join(task.cwd,'../migration-config.json'),'utf8'));
 const {PrismaClient}=require('@prisma/client');
 const prisma=new PrismaClient({datasources:{db:{url:config.databaseUrl}}});
 try {
  const row=(await prisma.$queryRawUnsafe("SELECT current_database() AS db,current_setting('data_directory') AS directory"))[0];
  assert.equal(row.db,'ytubviral_migration_test');
  assert.equal(path.resolve(row.directory).toLowerCase(),path.resolve(task.cwd,'../migration-runtime/database').toLowerCase());
 } finally {await prisma.$disconnect();}
 for(const key of Object.keys(process.env))delete process.env[key];
 Object.assign(process.env,task.env,{DATABASE_URL:config.databaseUrl,DATABASE_URL_DIRECT:config.databaseUrl,ANTHROPIC_API_KEY:'synthetic-build-not-a-key',YOUTUBE_API_KEY:'synthetic-build-not-a-youtube-key',AUTH_SECRET:'synthetic-build-secret-with-no-real-account',AUTH_TRUST_HOST:'true'});
 // A worker/CLI exit must not leave only the last progress line as evidence.
 // Diagnostic flags also follow the already guarded worker execArgv; they do
 // not change build mode, credentials, permissions or any transport policy.
 for(const flag of ['--trace-exit','--trace-uncaught','--unhandled-rejections=strict'])if(!process.execArgv.includes(flag))process.execArgv.push(flag);
 process.once('exit',code=>{
  if(code===0)return;
  let stage='unknown';try{stage=JSON.parse(fs.readFileSync(path.join(task.cwd,'.next/diagnostics/build-diagnostics.json'),'utf8')).buildStage??stage;}catch{}
  console.error('Protected migration build terminal: '+JSON.stringify({exitCode:code,stage}));
 });
 const guard=path.join(__dirname,'build-egress-guard.cjs');
 process.execArgv.push('--require',guard);
 require(guard);
 process.chdir(task.cwd);
 process.argv=[process.execPath,task.entry,'build'];
 require(task.entry);
})().catch(error=>{console.error(error.stack??error.message);process.exitCode=1;});
