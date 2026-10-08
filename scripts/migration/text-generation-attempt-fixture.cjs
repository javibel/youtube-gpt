'use strict';
const {load}=require('./route-harness.cjs');
module.exports=(db,plans=load('lib/plans.ts',{'@/lib/prisma':{prisma:db}}))=>load('lib/text-generation-attempt.ts',{
 'node:crypto':require('node:crypto'),'@/lib/prisma':{prisma:db},'@/lib/plans':plans,
 '@/lib/image/thumbnail-quota':load('lib/image/thumbnail-quota.ts'),
});
