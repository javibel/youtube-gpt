'use strict';
const native=require('./analytics-native.test.cjs');module.exports=native;if(require.main===module)native.run().then(r=>{console.log(JSON.stringify(r,null,2));if(r.status!=='PASS')process.exitCode=1;}).catch(e=>{console.error(e.stack);process.exitCode=1;});
