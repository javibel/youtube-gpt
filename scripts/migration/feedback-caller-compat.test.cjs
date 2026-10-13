'use strict';
require('./shared-email.test.cjs').run({onlyAffected:true}).then(r=>{console.log(JSON.stringify(r,null,2));if(r.status!=='PASS')process.exitCode=1;});
