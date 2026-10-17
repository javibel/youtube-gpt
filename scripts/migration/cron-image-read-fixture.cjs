'use strict';
const {fixture,drain,reached}=require('./social-post-original-fixture.cjs'),{load}=require('./route-harness.cjs');
function readFixture(o={}){
 const b=fixture(o),date=new Date(b.clock.at).toISOString().slice(0,10),id='01234567-89ab-cdef-0123-456789abcdef';
 b.env.BLOB_READ_WRITE_TOKEN='vercel_blob_rw_closedstore_syntheticsecret';
 b.row=o.absent?null:{date,url:`https://closedstore.public.blob.vercel-storage.com/social-cron/${date}/${id}.jpg`,source:'cron-native-v1:'+id,stamp:'2026-10-17 00:00:00'};
 b.queries=[];
 const prisma={$queryRawUnsafe:(q,...args)=>b.stage('cache-read',async()=>{b.queries.push({q,args});if(o.sql)return o.sql(q,args);return o.rows??(b.row?[{...b.row}]:[]);})};
 b.reader=load('lib/image/cron-brand-image-cache-read.ts',{'@/lib/prisma':{prisma},'@/lib/cron-dispatch-original':b.native},b.globals);
 b.readBegin=(run,slot='morning')=>{b.readRequest=b.make(slot);const p=b.native.runCronDispatch(b.native.authorizeCronDispatch(b.readRequest,slot),async(_s,_t,_i,_e,_p,issue)=>{b.readOriginal=issue();b.readCap=await b.reader.readCachedBrandImage(b.readOriginal);return run?run(b.readCap,issue):b.readCap;});b.pending.push(p);void p.catch(()=>{});return p;};return b;
}
module.exports={readFixture,drain,reached};
