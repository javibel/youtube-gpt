'use strict';
const {load}=require('./route-harness.cjs');
module.exports=db=>load('lib/generation-quota.ts',{'@/lib/prisma':{prisma:db},'@/lib/image/thumbnail-quota':load('lib/image/thumbnail-quota.ts')});
