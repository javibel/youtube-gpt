'use strict';
const {run}=require('./extension-generate-client.test.cjs');
const timer=setTimeout(()=>{console.error('No original generation client terminal');process.exit(1);},180000);
run().then(r=>{console.log(JSON.stringify(r,null,2));if(r.status!=='PASS')process.exitCode=1;}).catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(()=>clearTimeout(timer));
