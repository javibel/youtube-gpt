'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process'),crypto=require('node:crypto');
const repo=path.resolve(__dirname,'../..'),root=path.dirname(repo),config=JSON.parse(fs.readFileSync(path.join(root,'migration-config.json'),'utf8'));
const checked=require('./isolation.cjs').validate(config,{root,operationalRoots:['C:/Users/jimen/youtube-gpt/youtube-gpt','C:/Users/jimen/youtube-gpt/local-agent'],environment:process.env});
const pool=new(require('pg').Pool)({connectionString:config.databaseUrl});
const target=path.resolve(repo,'../../outputs/inventario-v1.1/extension-seo-schema-2026-10-14.json');
assert.equal(fs.existsSync(target),false,'Never overwrite an earlier schema receipt');
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
(async()=>{try{
 const identity=(await pool.query("SELECT current_database() AS db,current_setting('data_directory') AS directory")).rows[0];
 assert.equal(identity.db,'ytubviral_migration_test');assert.equal(path.resolve(identity.directory).toLowerCase(),path.resolve(checked.paths.database).toLowerCase());
 assert.equal((await pool.query("SELECT to_regclass('public.extension_seo_operations') AS table")).rows[0].table,null,'Additive schema must not be replayed');
 const tables=(await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(x=>x.tablename);
 async function snapshot(){const rows={};for(const table of tables){assert.match(table,/^[a-z_]+$/);const data=(await pool.query('SELECT row_to_json(t) AS row FROM "'+table+'" t ORDER BY row_to_json(t)::text')).rows;rows[table]={count:data.length,sha256:digest(JSON.stringify(data))};}return rows;}
 const before=await snapshot(),sql=fs.readFileSync(path.join(repo,'prisma/extension-seo-operation.sql'),'utf8');
 await pool.query('BEGIN');try{await pool.query(sql);await pool.query('COMMIT');}catch(e){await pool.query('ROLLBACK');throw e;}
 const after=await snapshot();assert.deepEqual(after,before);assert.equal((await pool.query('SELECT count(*)::int AS count FROM extension_seo_operations')).rows[0].count,0);
 const report={status:'schema-applied',observedAt:new Date().toISOString(),identity,before,after,sqlSha256:digest(sql),schemaSha256:digest(fs.readFileSync(path.join(repo,'prisma/schema.prisma'))),scope:'Own identified synthetic PostgreSQL additive schema/client only; inherited rows unchanged, no business recovery or operational email/delivery/recovery authority'};
 fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n');
 const env={};for(const k of ['PATH','Path','SystemRoot','ComSpec','PATHEXT','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA'])if(process.env[k])env[k]=process.env[k];
 Object.assign(env,{DATABASE_URL:config.databaseUrl,DATABASE_URL_DIRECT:config.databaseUrl,PRISMA_HIDE_UPDATE_MESSAGE:'1',CHECKPOINT_DISABLE:'1',PRISMA_GENERATE_SKIP_AUTOINSTALL:'1'});
 const generated=cp.spawnSync(process.execPath,[path.join(repo,'node_modules/prisma/build/index.js'),'generate','--schema',path.join(repo,'prisma/schema.prisma')],{cwd:repo,env,encoding:'utf8',windowsHide:true,timeout:120000});
 report.generation={exitCode:generated.status,stdout:generated.stdout,stderr:generated.stderr,signal:generated.signal,error:generated.error?.message};fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n');
 assert.equal(generated.status,0);assert.equal(generated.signal,null);assert.equal(generated.error,undefined);assert.equal(digest(fs.readFileSync(path.join(repo,'prisma/schema.prisma'))),digest(fs.readFileSync(path.join(repo,'node_modules/.prisma/client/schema.prisma'))));
 report.status='PASS';fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n');console.log('PASS: additive synthetic extension-seo schema; '+tables.length+' inherited tables unchanged; installed local client generated');
 }finally{await pool.end();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
