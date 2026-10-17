import {validateCronImageReadSource,type NativeCronSocialPost,type NativeCronBrandImageRead} from '@/lib/cron-dispatch-original';
import {validateCronSocialImageSource,generateCronSocialImagePrompt,completeCronBrandImageCache,consumeCronBrandImageCache,validateCronBrandImageCache,type NativeCronBrandImageCache} from './content-generator';
import {generateCronBrandImage,uploadCronBrandImage} from './cron-brand-image';
import {readCachedBrandImage,consumeCachedBrandImageRead,validateCachedBrandImageRead,type CachedBrandImageRead} from '@/lib/image/cron-brand-image-cache-read';

export type NativeDailyBrandImage=NativeCronBrandImageCache|CachedBrandImageRead;
const originals=new WeakMap<object,{read:NativeCronBrandImageRead|undefined;promise:Promise<NativeDailyBrandImage>}>();
const images=new WeakMap<object,{original:NativeCronSocialPost;kind:'generated'|'read';validate:()=>Promise<void>}>();
// The new read purpose is a sibling of the current content source. A hit supplies
// data only;it does not confirm/resume the old producer. Only an acknowledged
// miss may enter the existing guarded generation/PUT/cache producer.
export function getOrCreateDailyBrandImage(original?:NativeCronSocialPost,read?:NativeCronBrandImageRead):Promise<NativeDailyBrandImage>{
 if(!original||typeof original!=='object')return Promise.reject(Error('daily_brand_image_unconfirmed'));
 const previous=originals.get(original);if(previous)return previous.read===read?previous.promise:Promise.reject(Error('daily_brand_image_unconfirmed'));
 const pending=Promise.resolve().then(async()=>{
  const validate=async()=>{if(read!==undefined)validateCronImageReadSource(original,read);await validateCronSocialImageSource(original);if(read!==undefined)validateCronImageReadSource(original,read);};
  await validate();
  if(read!==undefined){
   const resource=await readCachedBrandImage(read);await validate();
   if(resource){const previous=images.get(resource);if(previous&&previous.original!==original)throw Error('daily_brand_image_unconfirmed');images.set(resource,{original,kind:'read',validate});return resource;}
  }
  const prompt=await generateCronSocialImagePrompt(original);
  const image=await generateCronBrandImage(prompt);
  const uploaded=await uploadCronBrandImage(image);
  const cache=await completeCronBrandImageCache(uploaded);await validate();
  const previous=images.get(cache);if(previous&&previous.original!==original)throw Error('daily_brand_image_unconfirmed');images.set(cache,{original,kind:'generated',validate});return cache;
 });
 originals.set(original,{read,promise:pending});return pending;
}
// A publication must use the exact live source that prepared this helper view.
// Equal dates/URLs,another sibling or a copied DTO cannot bind a resource.
export async function validateDailyBrandImageSource(original:NativeCronSocialPost|undefined,receipt:NativeDailyBrandImage|undefined):Promise<void>{
 const own=receipt&&images.get(receipt);if(!original||!own||own.original!==original)throw Error('daily_brand_image_unconfirmed');await own.validate();
 if(own.kind==='read')await validateCachedBrandImageRead(receipt as CachedBrandImageRead);else await validateCronBrandImageCache(receipt as NativeCronBrandImageCache);
 await own.validate();
}
export function consumeDailyBrandImage<T>(receipt:NativeDailyBrandImage|undefined,run:(image:Readonly<{date:string;url:string;source:string;producerAcknowledged:boolean}>)=>Promise<T>):Promise<T>{
 const own=receipt&&images.get(receipt);if(!own)return Promise.reject(Error('daily_brand_image_unconfirmed'));
 const consume=async(image:Readonly<{date:string;url:string;source:string;producerAcknowledged:boolean}>)=>{await own.validate();const result=await run(image);await own.validate();return result;};
 return own.kind==='read'?consumeCachedBrandImageRead(receipt as CachedBrandImageRead,consume):consumeCronBrandImageCache(receipt as NativeCronBrandImageCache,async image=>consume(Object.freeze({...image,producerAcknowledged:true})));
}
