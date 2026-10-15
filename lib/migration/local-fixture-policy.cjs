'use strict';
const {createTaskFactory}=require('../ai/task-factory.cjs');
const {bestTimeFixture}=require('./best-time-fixture.cjs');
const fixture=Object.freeze({userId:'migration-ui-synthetic-admin',email:'migration-admin@example.invalid',password:'migration-only-fixture-password',budgetId:'migration-ui-synthetic-budget',taskType:'youtube.ab-title-suggestions'});
const principals=Object.freeze([fixture,bestTimeFixture]);
const taskCatalog=Object.freeze(Object.fromEntries(principals.map(p=>[p.taskType,Object.freeze({executor:'ai',capabilities:Object.freeze(['text','json']),runtimeIds:Object.freeze(['web'])})])));
// Trusted synthetic bootstrap only. Each account receives exactly its own task
// and native budget; neither the admin identity nor a service/body widens it.
function createFixtureTaskDependencies(){
 return {policies:Object.fromEntries(principals.map(p=>[p.taskType,{maxToolCalls:0,budget:{currency:'EUR',maxCostMicros:10,maxOutputTokens:200,deadlineMs:3000}}])),
  budgetBindings:Object.fromEntries(principals.map(p=>[p.taskType,[p.budgetId]])),
  authorize:async identity=>{const principal=principals.find(p=>identity.userId===p.userId&&identity.taskType===p.taskType);return principal?{budgetId:principal.budgetId}:null;}};
}
function createFixtureTaskFactory(runner){const {policies,authorize}=createFixtureTaskDependencies();return createTaskFactory({runner,policies,authorize});}
module.exports={fixture,taskCatalog,createFixtureTaskFactory,createFixtureTaskDependencies};
