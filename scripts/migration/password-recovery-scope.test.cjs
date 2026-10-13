'use strict';
const timer=setTimeout(()=>{console.error('Missing recovery scoped terminal');process.exit(1);},60000);
(async()=>{try{
 const client=await require('./password-recovery-client.test.cjs').run(),shared=await require('./session-cookie-writer.test.cjs').run();
 const results=[...client.results.map(x=>({...x,suite:'recovery-client'})),...shared.results.map(x=>({...x,suite:'shared-writer'}))];
 const status=client.status==='PASS'&&shared.status==='PASS'?'PASS':'FAIL';console.log(JSON.stringify({status,scope:'Changed recovery client/forms/private original and shared admission kind; actual server route composition with closed SQL/provider and native Response. No server SQL suites/PG/full/operational checks repeated.',results},null,2));if(status!=='PASS')process.exitCode=1;
}finally{clearTimeout(timer);}})().catch(e=>{clearTimeout(timer);console.error(e);process.exitCode=1;});
