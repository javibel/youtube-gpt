'use strict';
const {load}=require('./route-harness.cjs');
module.exports=prisma=>load('lib/bulk-generation-request.ts',{'@/lib/prisma':{prisma}});
