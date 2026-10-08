'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process');
const repo=path.resolve(__dirname,'../..'),root=path.dirname(repo),config=JSON.parse(fs.readFileSync(path.join(root,'migration-config.json'),'utf8'));
const checked=require('./isolation.cjs').validate(config,{root,operationalRoots:['C:/Users/jimen/youtube-gpt/youtube-gpt','C:/Users/jimen/youtube-gpt/local-agent'],environment:process.env});
const pool=new(require('pg').Pool)({connectionString:config.databaseUrl});
(async()=>{try{
const row=(await pool.query("SELECT current_database() AS db,current_setting('data_directory') AS directory")).rows[0];assert.equal(row.db,'ytubviral_migration_test');assert.equal(path.resolve(row.directory).toLowerCase(),path.resolve(checked.paths.database).toLowerCase());
await pool.query(fs.readFileSync(path.join(repo,'prisma/removal-attempt.sql'),'utf8'));
const cols=(await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='removal_attempts' AND table_schema='public' ORDER BY column_name")).rows.map(r=>r.column_name);assert.deepEqual(cols,['createdAt','digest','id','output','state','userId']);
const env={};for(const key of ['PATH','SystemRoot','ComSpec','PATHEXT','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA'])if(process.env[key])env[key]=process.env[key];Object.assign(env,{DATABASE_URL:config.databaseUrl,DATABASE_URL_DIRECT:config.databaseUrl,PRISMA_HIDE_UPDATE_MESSAGE:'1',CHECKPOINT_DISABLE:'1'});
const generated=cp.spawnSync(process.execPath,[path.join(repo,'node_modules/prisma/build/index.js'),'generate','--schema',path.join(repo,'prisma/schema.prisma')],{cwd:repo,env,encoding:'utf8',windowsHide:true});assert.equal(generated.status,0,generated.stderr);assert.equal(fs.readFileSync(path.join(repo,'prisma/schema.prisma'),'utf8'),fs.readFileSync(path.join(repo,'node_modules/.prisma/client/schema.prisma'),'utf8'));
console.log(JSON.stringify({status:'PASS',scope:'Additive removal_attempts table and installed Prisma client; only designated synthetic PostgreSQL',generation:generated.stdout}));
}finally{await pool.end();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
