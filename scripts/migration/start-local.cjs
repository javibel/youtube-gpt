'use strict';
const fs=require('node:fs'),path=require('node:path');
const {plan:compilePlan}=require('./compile-only.cjs');
const {fixture}=require('../../lib/migration/local-fixture.cjs');
function plan(environment=process.env,args=[]){
 const base=compilePlan(environment,args);
 if(!fs.existsSync(path.join(base.cwd,'.next/BUILD_ID')))throw Error('ISOLATION_BLOCKED: protected local build required');
 const config=JSON.parse(fs.readFileSync(path.join(base.cwd,'../migration-config.json'),'utf8'));
 return {cwd:base.cwd,host:'127.0.0.1',port:4300,env:{...base.env,DATABASE_URL:config.databaseUrl,DATABASE_URL_DIRECT:config.databaseUrl,AUTH_URL:'http://127.0.0.1:4300',AUTH_SECRET:'synthetic-local-server-secret-with-no-real-account',AUTH_TRUST_HOST:'true',ADMIN_EMAIL:fixture.email,YTV_MIGRATION_WEB_TEST:'1',TEMP:path.join(base.cwd,'.migration-tmp'),TMP:path.join(base.cwd,'.migration-tmp')}};
}
async function main(){
 const task=plan(process.env,process.argv.slice(2));
 fs.mkdirSync(task.env.TEMP,{recursive:true});
 for(const key of Object.keys(process.env))delete process.env[key];Object.assign(process.env,task.env);process.chdir(task.cwd);
 const guard=path.join(__dirname,'runtime-guard.cjs');process.execArgv.push('--require',guard);require(guard);
 const {connectLocalFixture}=require('../../lib/migration/local-fixture.cjs');const prepared=await connectLocalFixture({seed:true});await prepared.close();
 const app=require('next')({dev:false,dir:task.cwd,hostname:task.host,port:task.port});await app.prepare();
 const handler=app.getRequestHandler(),{protectResponse}=require('./runtime-http-policy.cjs');
 const server=require('node:http').createServer(async(request,response)=>{
  protectResponse(response);
  if(request.headers.host!=='127.0.0.1:4300'||!request.url?.startsWith('/')||request.url.startsWith('//')){response.writeHead(400);response.end('Invalid local request');return;}
  delete request.headers['x-forwarded-host'];request.headers['x-forwarded-proto']='http';
  try{await handler(request,response);}catch(error){console.error('Local fixture request failed:',error.message);if(!response.headersSent)response.writeHead(500);response.end('Local test request failed');}
 });
 server.listen(task.port,task.host,()=>console.log('Synthetic local web ready at http://127.0.0.1:4300/admin/ai-configuration'));
 let stopping=false;const stop=()=>{if(stopping)return;stopping=true;server.close(()=>{Promise.resolve(app.close()).finally(()=>process.exit(0));});};process.once('SIGINT',stop);process.once('SIGTERM',stop);
}
module.exports={plan};
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
