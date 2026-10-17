'use strict';
const fs=require('node:fs'),path=require('node:path');
const {createControlStore}=require('../../contracts/ai/v1/control-store.cjs');
const {fixture,taskCatalog,createFixtureTaskDependencies}=require('./local-fixture-policy.cjs');
const {createFixtureAdapters,createFixtureRegistry,initialConfiguration:makeInitialConfiguration}=require('../ai/adapters/local-fixture.cjs');
const {bestTimeFixture,seedBestTimeFixture}=require('./best-time-fixture.cjs');
const {seedAbFixture}=require('./ab-fixture.cjs');
const {messagesFixture,prepareMessagesFixture}=require('./messages-runtime-fixture.cjs');
const {socialPreviewFixture,prepareSocialPreviewFixture}=require('./social-preview-fixture.cjs');
const initialConfiguration=()=>makeInitialConfiguration(fixture.taskType);
const cancellationFixture={userId:'migration-ui-synthetic-cancel',email:'migration-cancel@example.invalid',password:'migration-only-cancel-fixture-password',subscriptionId:'migration-ui-synthetic-cancel-subscription',customerId:'cus_synthetic_cancel'};


async function connectLocalFixture({seed=false}={}){
 if(process.env.YTV_MIGRATION_WEB_TEST!=='1'||global.__ytvRuntimeGuard!==true)throw Error('ISOLATION_BLOCKED: guarded fixture runtime required');
 const repo=process.cwd(),root=path.dirname(repo),config=JSON.parse(fs.readFileSync(path.join(root,'migration-config.json'),'utf8'));
 const {validate}=require('../../scripts/migration/isolation.cjs');
 const checked=validate(config,{root,operationalRoots:['C:/Users/jimen/youtube-gpt/youtube-gpt','C:/Users/jimen/youtube-gpt/local-agent'],environment:{}});
 if(path.resolve(repo)!==path.resolve(checked.paths.web)||process.env.DATABASE_URL!==config.databaseUrl||process.env.ADMIN_EMAIL!==fixture.email)throw Error('ISOLATION_BLOCKED: fixture configuration mismatch');
 const {Pool}=require('pg');const pool=new Pool({connectionString:config.databaseUrl,ssl:false,max:5,connectionTimeoutMillis:3000,application_name:'ytv-synthetic-web'});
 try{
  const identity=(await pool.query("SELECT current_database() AS name,current_setting('data_directory') AS directory")).rows[0];
  if(identity.name!=='ytubviral_migration_test'||path.resolve(identity.directory).toLowerCase()!==path.resolve(checked.paths.database).toLowerCase())throw Error('ISOLATION_BLOCKED: fixture database identity mismatch');
  if(!(await pool.query("SELECT to_regclass('ytv_ai_test_v1.budgets') AS name")).rows[0].name)throw Error('Local control schema has not passed its preparation');
  const adapters=createFixtureAdapters(),registry=createFixtureRegistry(adapters),roles={reader:'ytv_ai_test_reader',activator:'ytv_ai_test_activator',executor:'ytv_ai_test_executor'};
  const database=role=>({role,async transaction(work){if(!Object.hasOwn(roles,role))throw Error('Unknown fixture role');const client=await pool.connect();try{await client.query('BEGIN');await client.query('SET LOCAL ROLE '+roles[role]);const result=await work({query:async(sql,args)=>(await client.query(sql,args)).rows});await client.query('COMMIT');return result;}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}}});
  const store=role=>createControlStore(database(role),registry);
  const reader=store('reader'),activator=store('activator');
  let socialPreviewPreparation,messagesPreparation;
  if(seed){
   const bcrypt=require('bcryptjs'),password=await bcrypt.hash(fixture.password,10);
   const client=await pool.connect();
   try{
    await client.query('BEGIN');await client.query("SELECT pg_advisory_xact_lock(hashtext('ytv-local-fixture-seed'))");
    const existing=(await client.query('SELECT id,email FROM users WHERE id=$1 OR email=$2',[fixture.userId,fixture.email])).rows;
    if(existing.some(row=>row.id!==fixture.userId||row.email!==fixture.email))throw Error('Fixture identity conflicts with an existing row');
    await client.query('INSERT INTO users(id,email,name,password,"emailVerified","marketingOptOut","createdAt","updatedAt") VALUES($1,$2,$3,$4,now(),true,now(),now()) ON CONFLICT(id) DO NOTHING',[fixture.userId,fixture.email,'Cuenta ficticia de pruebas locales',password]);
    const subscription=(await client.query('SELECT id FROM subscriptions WHERE "userId"=$1',[fixture.userId])).rows[0];
    if(subscription&&subscription.id!=='migration-ui-synthetic-subscription')throw Error('Fixture subscription conflicts with an existing row');
    await client.query('INSERT INTO subscriptions(id,"userId",plan,status,"createdAt","updatedAt") VALUES($1,$2,\'pro\',\'active\',now(),now()) ON CONFLICT("userId") DO NOTHING',['migration-ui-synthetic-subscription',fixture.userId]);
    const cancelUser=(await client.query('SELECT id,email FROM users WHERE id=$1 OR email=$2',[cancellationFixture.userId,cancellationFixture.email])).rows;
    if(cancelUser.some(row=>row.id!==cancellationFixture.userId||row.email!==cancellationFixture.email))throw Error('Cancellation fixture identity conflicts with an existing row');
    const cancelPassword=await bcrypt.hash(cancellationFixture.password,10);
    await client.query('INSERT INTO users(id,email,name,password,"emailVerified","marketingOptOut","createdAt","updatedAt") VALUES($1,$2,$3,$4,now(),true,now(),now()) ON CONFLICT(id) DO NOTHING',[cancellationFixture.userId,cancellationFixture.email,'Cuenta ficticia para cancelación',cancelPassword]);
    const cancelSubscription=(await client.query('SELECT id,"stripeCustomerId","stripePriceId" FROM subscriptions WHERE "userId"=$1',[cancellationFixture.userId])).rows[0];
    if(cancelSubscription&&(cancelSubscription.id!==cancellationFixture.subscriptionId||cancelSubscription.stripeCustomerId!==cancellationFixture.customerId||cancelSubscription.stripePriceId!=='price_synthetic_monthly'))throw Error('Cancellation fixture subscription conflicts with an existing row');
    await client.query('INSERT INTO subscriptions(id,"userId",plan,status,"stripeCustomerId","stripePriceId","createdAt","updatedAt") VALUES($1,$2,\'pro\',\'active\',$3,\'price_synthetic_monthly\',now(),now()) ON CONFLICT("userId") DO NOTHING',[cancellationFixture.subscriptionId,cancellationFixture.userId,cancellationFixture.customerId]);
    // Existing synthetic billing state may be uncertain. Seeding never resets it.
    await seedBestTimeFixture(client);
    await seedAbFixture(client);
    await client.query('INSERT INTO ytv_ai_test_v1.budgets(budget_id,currency,limit_micros) VALUES($1,\'EUR\',1000000) ON CONFLICT(budget_id) DO NOTHING',[fixture.budgetId]);
    await client.query('INSERT INTO ytv_ai_test_v1.budgets(budget_id,currency,limit_micros) VALUES($1,\'EUR\',1000000) ON CONFLICT(budget_id) DO NOTHING',[bestTimeFixture.budgetId]);
    await client.query('INSERT INTO ytv_ai_test_v1.budgets(budget_id,currency,limit_micros) VALUES($1,\'EUR\',1000000) ON CONFLICT(budget_id) DO NOTHING',[socialPreviewFixture.budgetId]);
    for(const v of Object.values(messagesFixture.tasks)){await client.query('INSERT INTO ytv_ai_test_v1.budgets(budget_id,currency,limit_micros) VALUES($1,\'EUR\',1000000) ON CONFLICT(budget_id) DO NOTHING',[v.budgetId]);const rows=(await client.query('SELECT currency,limit_micros::text AS amount FROM ytv_ai_test_v1.budgets WHERE budget_id=$1',[v.budgetId])).rows;if(rows.length!==1||rows[0].currency!=='EUR'||rows[0].amount!=='1000000')throw Error('Message fixture budget differs;never replenish/reset');}
    const previewBudget=(await client.query('SELECT currency,limit_micros::text AS amount FROM ytv_ai_test_v1.budgets WHERE budget_id=$1',[socialPreviewFixture.budgetId])).rows;
    if(previewBudget.length!==1||previewBudget[0].currency!=='EUR'||previewBudget[0].amount!=='1000000')throw Error('Fixture preview budget differs;never reset or replenish');
    await client.query('COMMIT');
   }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
   if(!await reader.active()){
    const initial=initialConfiguration(),stored=await reader.revision(initial.revision);
    if(stored)require('node:assert/strict').deepEqual(stored,initial,'Stored fixture revision differs from the reviewed seed');
    else await activator.publish(initial,{actor:'synthetic-fixture-seed'});
    await activator.activate(initial.revision,{expectedRevision:null,actor:'synthetic-fixture-seed',reason:'Explicit isolated browser test setup'});
   }
   socialPreviewPreparation=await prepareSocialPreviewFixture({reader,activator,registry,taskCatalog:Object.fromEntries(Object.entries(taskCatalog).filter(([k])=>!Object.hasOwn(messagesFixture.tasks,k)))});
   messagesPreparation=await prepareMessagesFixture({reader,activator,registry,taskCatalog});
  }
  const current=await reader.active();for(const [taskType,definition]of Object.entries(taskCatalog))registry.resolve(current,{taskType,requiredCapabilities:definition.capabilities});
  return {socialPreviewPreparation,messagesPreparation,runtimeDependencies:{adapters,readerDatabase:database('reader'),activatorDatabase:database('activator'),executorDatabase:database('executor'),storageIdentity:{databaseName:identity.name,readerRole:roles.reader,activatorRole:roles.activator,executorRole:roles.executor},taskCatalog,...createFixtureTaskDependencies(),getRuntimes:async()=>[{id:'web',contractVersions:['1.0'],adapters:{anthropic:'messages-v1',openai:'responses-v1'}}],checkCredential:async({credentialRef})=>credentialRef==='test:local-fixture',timeoutMs:10000},close:()=>pool.end()};
 }catch(error){await pool.end();throw error;}
}
module.exports={fixture,cancellationFixture,createFixtureRegistry,initialConfiguration,connectLocalFixture};
