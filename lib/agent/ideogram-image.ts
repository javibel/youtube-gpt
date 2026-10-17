import type {NativeCronSocialPost} from '@/lib/cron-dispatch-original';
import {generateCronSocialImagePrompt,completeCronBrandImageCache,type NativeCronBrandImageCache} from './content-generator';
import {generateCronBrandImage,uploadCronBrandImage} from './cron-brand-image';
export {consumeCronBrandImageCache as consumeDailyBrandImage} from './content-generator';

// The live native source and its own SQL ACK own this entire producer promise.
// Text,dates,existing cache rows and URLs never issue or restore that source.
// Persisted cache reuse needs a separate native read purpose;it is not recovery.
const originals=new WeakMap<object,Promise<NativeCronBrandImageCache>>();
export function getOrCreateDailyBrandImage(original?:NativeCronSocialPost):Promise<NativeCronBrandImageCache>{
 if(!original||typeof original!=='object')return Promise.reject(Error('daily_brand_image_unconfirmed'));
 const previous=originals.get(original);if(previous)return previous;
 const pending=Promise.resolve().then(async()=>{
  const prompt=await generateCronSocialImagePrompt(original);
  const image=await generateCronBrandImage(prompt);
  const uploaded=await uploadCronBrandImage(image);
  return completeCronBrandImageCache(uploaded);
 });
 originals.set(original,pending);return pending;
}
