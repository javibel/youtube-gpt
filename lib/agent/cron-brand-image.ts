import {getMessagesTask} from '@/lib/ai/task-runtime';
import {schema,valid} from '@/lib/ai/brand-image-reference.cjs';
import {consumeCronSocialImagePrompt,type CronSocialImagePrompt} from './content-generator';
import {prepareCronBrandImageDownload} from '@/lib/image/cron-brand-image-download';
import {prepareCronBrandImageUpload} from '@/lib/image/cron-brand-image-upload';
import {decodeCronBrandImage} from '@/lib/image/cron-brand-image-codec';
declare const nativeCronBrandImage:unique symbol;
export type NativeCronBrandImage={readonly[nativeCronBrandImage]:true};
type Context=Parameters<Parameters<typeof consumeCronSocialImagePrompt>[1]>[0];
type Prepared={context:Context;promptReceipt:CronSocialImagePrompt;bytes:Buffer;use?:Promise<unknown>};
const originals=new WeakMap<object,Promise<NativeCronBrandImage>>(),images=new WeakMap<object,Prepared>();
export function generateCronBrandImage(prompt?:CronSocialImagePrompt):Promise<NativeCronBrandImage>{
 if(!prompt||typeof prompt!=='object')return Promise.reject(Error('daily_brand_image_unconfirmed'));
 const previous=originals.get(prompt);if(previous)return previous;
 const pending=consumeCronSocialImagePrompt(prompt,async own=>{
  await own.validateBeforeDispatch();const downloader=prepareCronBrandImageDownload(),validate=async()=>{await own.validateBeforeDispatch();downloader.check();};await validate();
  const signal=AbortSignal.timeout(Math.min(30000,own.remainingBeforeDispatch()));
  const task=await getMessagesTask({serviceId:'brand-agent',taskType:'brand.image-generation',operationKey:own.imageAttemptId+':image',language:'en',instructionsVersion:'brand-image-generation-v1',outputSchema:schema,requiredCapabilities:['image_generation']},{signal});
  await validate();const result=await task.create({max_tokens:2048,messages:[{role:'user',content:own.prompt}]},{signal});
  await validate();if(result.incomplete||!Array.isArray(result.content)||result.content.length!==1||result.content[0]?.type!=='text'||typeof result.content[0].text!=='string')throw Error('daily_brand_image_unconfirmed');
  const reference:unknown=JSON.parse(result.content[0].text);if(!valid(reference))throw Error('daily_brand_image_unconfirmed');
  const downloaded=await downloader.download(reference.url,own.remainingBeforeDispatch,validate);await validate();
  const bytes=await decodeCronBrandImage(downloaded);await validate();
  const cap=Object.freeze({})as NativeCronBrandImage;images.set(cap,{promptReceipt:prompt,context:Object.freeze({...own,validateBeforeDispatch:validate}),bytes:Buffer.from(bytes)});return cap;
 }).then(cap=>{if(!cap||typeof cap!=='object'||!images.has(cap))throw Error('daily_brand_image_unconfirmed');return cap;});
 originals.set(prompt,pending);return pending;
}
export function consumeCronBrandImage<T>(receipt:NativeCronBrandImage|undefined,run:(image:Readonly<Context&{promptReceipt:CronSocialImagePrompt;bytes:Buffer;contentType:'image/jpeg';width:1024;height:1024}>)=>Promise<T>):Promise<T>{
 const own=receipt&&images.get(receipt);if(!own)return Promise.reject(Error('daily_brand_image_unconfirmed'));
 return(own.use??=Promise.resolve().then(async()=>{await own.context.validateBeforeDispatch();const result=await run(Object.freeze({...own.context,promptReceipt:own.promptReceipt,bytes:Buffer.from(own.bytes),contentType:'image/jpeg' as const,width:1024 as const,height:1024 as const}));await own.context.validateBeforeDispatch();return result;}))as Promise<T>;
}

declare const nativeUploadedCronBrandImage:unique symbol;
export type NativeUploadedCronBrandImage={readonly[nativeUploadedCronBrandImage]:true};
type Uploaded={context:Context;promptReceipt:CronSocialImagePrompt;url:string;use?:Promise<unknown>};
const uploads=new WeakMap<object,Promise<NativeUploadedCronBrandImage>>(),uploadedImages=new WeakMap<object,Uploaded>();
export function uploadCronBrandImage(image?:NativeCronBrandImage):Promise<NativeUploadedCronBrandImage>{
 if(!image||typeof image!=='object')return Promise.reject(Error('daily_brand_image_unconfirmed'));
 const previous=uploads.get(image);if(previous)return previous;
 const pending=consumeCronBrandImage(image,async own=>{
  await own.validateBeforeDispatch();const uploader=prepareCronBrandImageUpload(),validate=async()=>{await own.validateBeforeDispatch();uploader.check();};await validate();
  const result=await uploader.upload(own.bytes,own.date,own.imageAttemptId,own.remainingBeforeDispatch,validate);await validate();
  const cap=Object.freeze({})as NativeUploadedCronBrandImage;
  // Keep no image bytes in the upload ACK;only the exact original resource.
  const {bytes:_bytes,contentType:_mime,width:_width,height:_height,promptReceipt,...context}=own;
  uploadedImages.set(cap,{context:Object.freeze({...context,validateBeforeDispatch:validate}),promptReceipt,url:result.url});return cap;
 }).then(cap=>{if(!cap||typeof cap!=='object'||!uploadedImages.has(cap))throw Error('daily_brand_image_unconfirmed');return cap;});
 uploads.set(image,pending);return pending;
}
export function consumeUploadedCronBrandImage<T>(receipt:NativeUploadedCronBrandImage|undefined,run:(image:Readonly<Context&{promptReceipt:CronSocialImagePrompt;url:string}>)=>Promise<T>):Promise<T>{
 const own=receipt&&uploadedImages.get(receipt);if(!own)return Promise.reject(Error('daily_brand_image_unconfirmed'));
 return(own.use??=Promise.resolve().then(async()=>{await own.context.validateBeforeDispatch();const result=await run(Object.freeze({...own.context,promptReceipt:own.promptReceipt,url:own.url}));await own.context.validateBeforeDispatch();return result;}))as Promise<T>;
}
