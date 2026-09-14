'use strict';
const runtime=require('../../lib/migration-payments.cjs');
const {validate}=require('./isolation.cjs');
function configureOffline({config,context,paymentFixtures=[]}) {
  runtime.reset();
  validate(config,{...context,environment:process.env});
  runtime.installFixtures(paymentFixtures);
}
module.exports={stripe:runtime.stripe,configureOffline,reset:runtime.reset};
