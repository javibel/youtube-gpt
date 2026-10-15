'use strict';
// Audience coverage now uses the actual retained native issuer/client, never a public session DTO.
require('./subscribers-route.test.cjs').run().then(r=>{console.log(JSON.stringify(r,null,2));if(r.status!=='PASS')process.exitCode=1;}).catch(e=>{console.error(e.stack);process.exitCode=1;});
