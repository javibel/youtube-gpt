'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const repo=path.resolve(__dirname,'../..'),root=path.dirname(repo),config=JSON.parse(fs.readFileSync(path.join(root,'migration-config.json'),'utf8'));
const checked=require('./isolation.cjs').validate(config,{root,operationalRoots:['C:/Users/jimen/youtube-gpt/youtube-gpt','C:/Users/jimen/youtube-gpt/local-agent'],environment:process.env});
const pool=new(require('pg').Pool)({connectionString:config.databaseUrl}),target=path.resolve(repo,'../../outputs/inventario-v1.1/ab-processor-schema-2026-10-10.json');
const sql=path.join(repo,'prisma/ab-test-transition-attempt.sql'),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
(async()=>{try{
 const identity=(await pool.query("SELECT current_database() AS db,current_setting('data_directory') AS directory")).rows[0];assert.equal(identity.db,'ytubviral_migration_test');assert.equal(path.resolve(identity.directory).toLowerCase(),path.resolve(checked.paths.database).toLowerCase());
 const definition=async()=>(await pool.query("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='public.ab_test_mutation_attempts'::regclass AND conname='ab_test_mutation_attempts_action_check'")).rows[0].definition;
 const previousConstraint=await definition();assert(previousConstraint.includes('cancel')&&previousConstraint.includes('apply_winner'));assert(!previousConstraint.includes('switch_variant')&&!previousConstraint.includes('complete_test'),'Additive extension must not be replayed');
 const snapshot=async()=>({counts:(await pool.query('SELECT (SELECT count(*)::int FROM users) AS users,(SELECT count(*)::int FROM ab_tests) AS tests')).rows[0],attempts:(await pool.query('SELECT * FROM ab_test_mutation_attempts ORDER BY id')).rows});
 const before=await snapshot();await pool.query('BEGIN');try{await pool.query(fs.readFileSync(sql,'utf8'));await pool.query('COMMIT');}catch(e){await pool.query('ROLLBACK');throw e;}
 const after=await snapshot();assert.deepEqual(after,before);const currentConstraint=await definition();assert(currentConstraint.includes('switch_variant')&&currentConstraint.includes('complete_test'));
 const report={status:'PASS',observedAt:new Date().toISOString(),identity,before,after,previousConstraint,currentConstraint,sqlSha256:hash(sql),schemaSha256:hash(path.join(repo,'prisma/schema.prisma')),prismaSchemaChanged:false,purpose:'Local additive constraint extension only; preserves all business/reservation rows and grants no recovery authority'};fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
 }finally{await pool.end();}})().catch(e=>{console.error(e);process.exitCode=1;});
