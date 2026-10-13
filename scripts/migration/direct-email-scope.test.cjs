'use strict';
const timer=setTimeout(()=>{console.error('Direct mail scope lacks native terminal');process.exit(1);},60000);
(async()=>{try{
 const reports=[];for(const [name,file,options]of [['direct','direct-email.test.cjs'],['shared','shared-email.test.cjs'],['prior-transport','email-verification-server.test.cjs',{onlyTransport:true}],['password-server','password-change-server.test.cjs'],['team-server','team-invite-server.test.cjs']]){
  const r=await require('./'+file).run(options);reports.push({name,...r});
 }
 const results=reports.flatMap(r=>r.results.map(x=>({...x,suite:r.name}))),status=reports.every(r=>r.status==='PASS')?'PASS':'FAIL';
 console.log(JSON.stringify({status,scope:'Changed direct password/team adapters with shared native transport and affected business server integration. Offline only, PG fixtures adapted but not run; no full/operational acceptance.',results},null,2));if(status!=='PASS')process.exitCode=1;
}finally{clearTimeout(timer);}})().catch(e=>{clearTimeout(timer);console.error(e);process.exitCode=1;});
