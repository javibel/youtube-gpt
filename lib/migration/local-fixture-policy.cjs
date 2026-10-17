'use strict';
const {createTaskFactory}=require('../ai/task-factory.cjs');
const {bestTimeFixture}=require('./best-time-fixture.cjs');
const {messagesFixture}=require('../ai/adapters/local-fixture-configuration.cjs');
const {socialPreviewFixture}=require('./social-preview-fixture.cjs');
const fixture=Object.freeze({userId:'migration-ui-synthetic-admin',email:'migration-admin@example.invalid',password:'migration-only-fixture-password',budgetId:'migration-ui-synthetic-budget',taskType:'youtube.ab-title-suggestions'});
const principals=Object.freeze([fixture,bestTimeFixture]);
const taskCatalog=Object.freeze({...Object.fromEntries(Object.keys(messagesFixture.tasks).map(k=>[k,Object.freeze({executor:'ai',capabilities:Object.freeze(['text']),runtimeIds:Object.freeze(['web'])})])),...Object.fromEntries(principals.map(p=>[p.taskType,Object.freeze({executor:'ai',capabilities:Object.freeze(['text','json']),runtimeIds:Object.freeze(['web'])})])),[socialPreviewFixture.taskType]:Object.freeze({executor:'ai',capabilities:Object.freeze(['text','prompt_cache']),runtimeIds:Object.freeze(['web'])})});
// Trusted synthetic bootstrap only. Each account receives exactly its own task
// and native budget; neither the admin identity nor a service/body widens it.
function createFixtureTaskDependencies(){
 return {policies:{...Object.fromEntries(Object.entries(messagesFixture.tasks).map(([k,v])=>[k,{serviceIds:[messagesFixture.serviceId],maxToolCalls:0,budget:{currency:'EUR',maxCostMicros:10,maxOutputTokens:v.maxOutputTokens,deadlineMs:3000}}])),...Object.fromEntries(principals.map(p=>[p.taskType,{maxToolCalls:0,budget:{currency:'EUR',maxCostMicros:10,maxOutputTokens:200,deadlineMs:3000}}])),[socialPreviewFixture.taskType]:{serviceIds:[socialPreviewFixture.serviceId],maxToolCalls:3,budget:{currency:'EUR',maxCostMicros:10,maxOutputTokens:1200,deadlineMs:3000}}},
  budgetBindings:{...Object.fromEntries(Object.entries(messagesFixture.tasks).map(([k,v])=>[k,[v.budgetId]])),...Object.fromEntries(principals.map(p=>[p.taskType,[p.budgetId]])),[socialPreviewFixture.taskType]:[socialPreviewFixture.budgetId]},
  authorize:async identity=>{const principal=principals.find(p=>identity.userId===p.userId&&identity.taskType===p.taskType);if(principal)return{budgetId:principal.budgetId};if(identity.serviceId===messagesFixture.serviceId&&Object.hasOwn(messagesFixture.tasks,identity.taskType))return{budgetId:messagesFixture.tasks[identity.taskType].budgetId};return identity.serviceId===socialPreviewFixture.serviceId&&identity.taskType===socialPreviewFixture.taskType?{budgetId:socialPreviewFixture.budgetId}:null;}};
}
function createFixtureTaskFactory(runner){const {policies,authorize}=createFixtureTaskDependencies();return createTaskFactory({runner,policies,authorize});}
module.exports={fixture,taskCatalog,createFixtureTaskFactory,createFixtureTaskDependencies};
