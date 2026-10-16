'use strict';
// Current audit coverage uses the native issuer and typed sources;the old public-DTO scoring fixtures are historical.
require('./audit-native.test.cjs').run().then(r=>{console.log(JSON.stringify(r,null,2));if(r.status!=='PASS')process.exitCode=1;}).catch(e=>{console.error(e.stack);process.exitCode=1;});
