'use strict';
// Explicit legacy business fixtures only. This auth double never establishes
// native cookie, operative identity, consent, freshness or recovery authority.
module.exports=(auth,changePasswordOriginal)=>{
 const originals=new WeakMap();
 const retained=original=>{const own=original&&typeof original==='object'?originals.get(original):undefined;if(!own)throw Error('Synthetic password original unavailable');return own;};
 return{
  async authorizeNativePasswordChange(){
   if(typeof auth!=='function')throw Error('Password synthetic auth must be explicitly bound');
   const session=await auth(),user=session?.user;
   if(typeof user?.id!=='string'||!user.id||typeof user.email!=='string'||!user.email)return null;
   const original=Object.freeze({});originals.set(original,{owner:Object.freeze({userId:user.id,email:user.email}),used:false});return original;
  },
  checkNativePasswordChange:original=>{retained(original);},
  async dispatchNativePasswordChange(original,input,key,check){
   const own=retained(original);if(own.used)throw Error('Synthetic password original already consumed');own.used=true;check();
   if(typeof changePasswordOriginal!=='function')throw Error('Password synthetic business helper must be explicitly bound');
   return changePasswordOriginal(own.owner,input,key,check);
  }
 };
};
